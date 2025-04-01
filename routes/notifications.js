const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// Send notification (Admin only)
router.post('/send', auth(['admin']), async (req, res) => {
  const { title, message, targetType, targetId } = req.body;
  const senderId = req.user.id;

  try {
    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert notification
      const notificationResult = await client.query(
        `INSERT INTO notifications (title, message, sender_id, target_type, target_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [title, message, senderId, targetType, targetId]
      );
      const notificationId = notificationResult.rows[0].id;

      // Determine recipients based on target type
      let recipientsQuery = '';
      let recipientsParams = [];

      switch (targetType) {
        case 'all':
          recipientsQuery = 'SELECT id FROM employees';
          break;
        case 'role':
          recipientsQuery = 'SELECT id FROM employees WHERE role = $1';
          recipientsParams = [targetId];
          break;
        case 'branch':
          recipientsQuery = 'SELECT id FROM employees WHERE branch_id = $1';
          recipientsParams = [targetId];
          break;
        case 'role_in_branch':
          recipientsQuery = 'SELECT id FROM employees WHERE role = $1 AND branch_id = $2';
          recipientsParams = [targetId.role, targetId.branch_id];
          break;
        case 'employee':
          recipientsQuery = 'SELECT id FROM employees WHERE id = $1';
          recipientsParams = [targetId];
          break;
        default:
          throw new Error('Invalid target type');
      }

      const recipientsResult = await client.query(recipientsQuery, recipientsParams);
      const recipients = recipientsResult.rows;

      // Insert notification reads for each recipient
      for (const recipient of recipients) {
        await client.query(
          `INSERT INTO notification_reads (notification_id, employee_id)
           VALUES ($1, $2)`,
          [notificationId, recipient.id]
        );
      }

      await client.query('COMMIT');

      res.json({
        message: 'Notification sent successfully',
        notificationId,
        recipientCount: recipients.length
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error sending notification:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Get notifications for an employee
router.get('/employee/:employeeId', auth(['admin', 'sales', 'accounts', 'rto', 'service']), async (req, res) => {
  const { employeeId } = req.params;
  const userId = req.user.id;

  // Only allow users to view their own notifications unless they're admin
  if (req.user.role !== 'admin' && parseInt(employeeId) !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const result = await pool.query(
      `SELECT n.*, nr.read_at, e.name as sender_name
       FROM notifications n
       JOIN notification_reads nr ON n.id = nr.notification_id
       LEFT JOIN employees e ON n.sender_id = e.id
       WHERE nr.employee_id = $1
       ORDER BY n.created_at DESC`,
      [employeeId]
    );

    res.json({ notifications: result.rows });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.put('/:notificationId/read', auth(['admin', 'sales', 'accounts', 'rto']), async (req, res) => {
  const { notificationId } = req.params;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `UPDATE notification_reads
       SET read_at = CURRENT_TIMESTAMP
       WHERE notification_id = $1 AND employee_id = $2
       RETURNING *`,
      [notificationId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Get unread notification count
router.get('/unread-count/:employeeId', auth(['admin', 'sales', 'accounts', 'rto', 'service']), async (req, res) => {
  const { employeeId } = req.params;
  const userId = req.user.id;

  // Only allow users to view their own unread count unless they're admin
  if (req.user.role !== 'admin' && parseInt(employeeId) !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM notification_reads nr
       WHERE nr.employee_id = $1 AND nr.read_at IS NULL`,
      [employeeId]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

module.exports = router; 
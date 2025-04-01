const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const auth = require('../middleware/auth');

const saltRounds = 10;

// Create a branch (Admin only)
router.post('/branches', auth(['admin']), async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Branch name is required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO branches (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json({ message: 'Branch created', branch: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

// Get all branches (Admin only)
router.get('/branches', auth(['admin']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM branches ORDER BY name ASC');
    res.json({ branches: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// Get all employees with their branch details and performance metrics (Admin only)
router.get('/employees', auth(['admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.*,
        b.name as branch_name,
        (SELECT COUNT(*) FROM customers WHERE created_by = e.id) as total_customers,
        (SELECT COUNT(*) FROM customers WHERE created_by = e.id AND rto_verified = true) as verified_customers,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM customers WHERE created_by = e.id) as total_revenue
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      ORDER BY e.created_at DESC
    `);
    res.json({ employees: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Get employee by ID with detailed information (Admin only)
router.get('/employees/:id', auth(['admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        e.*,
        b.name as branch_name,
        (SELECT COUNT(*) FROM customers WHERE created_by = e.id) as total_customers,
        (SELECT COUNT(*) FROM customers WHERE created_by = e.id AND rto_verified = true) as verified_customers,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM customers WHERE created_by = e.id) as total_revenue,
        (SELECT COUNT(*) FROM customers WHERE created_by = e.id AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)) as current_month_customers,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM customers WHERE created_by = e.id AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)) as current_month_revenue
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ employee: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employee details' });
  }
});

// Create a new employee (Admin only)
router.post('/employees', auth(['admin']), async (req, res) => {
  const { name, email, phone, branch_id, role, password } = req.body;

  if (!name || !email || !phone || !branch_id || !role || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!['sales', 'accounts', 'rto', 'admin', 'service'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    // Check if email already exists
    const emailCheck = await pool.query('SELECT id FROM employees WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = await pool.query(
      'INSERT INTO employees (name, email, phone, branch_id, role, password) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, email, phone, branch_id, role, hashedPassword]
    );
    res.status(201).json({ message: 'Employee created', employee: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// Update employee details (Admin only)
router.put('/employees/:id', auth(['admin']), async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, branch_id, role, status, password } = req.body;

  try {
    let query = 'UPDATE employees SET ';
    const values = [];
    let paramCount = 1;

    if (name) {
      query += `name = $${paramCount}, `;
      values.push(name);
      paramCount++;
    }

    if (email) {
      query += `email = $${paramCount}, `;
      values.push(email);
      paramCount++;
    }

    if (phone) {
      query += `phone = $${paramCount}, `;
      values.push(phone);
      paramCount++;
    }

    if (branch_id) {
      query += `branch_id = $${paramCount}, `;
      values.push(branch_id);
      paramCount++;
    }

    if (role) {
      if (!['sales', 'accounts', 'rto', 'admin', 'service'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      query += `role = $${paramCount}, `;
      values.push(role);
      paramCount++;
    }

    if (status) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      query += `status = $${paramCount}, `;
      values.push(status);
      paramCount++;
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      query += `password = $${paramCount}, `;
      values.push(hashedPassword);
      paramCount++;
    }

    query = query.slice(0, -2) + ` WHERE id = $${paramCount} RETURNING *`;
    values.push(id);

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee updated successfully', employee: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// Delete employee (Admin only)
router.delete('/employees/:id', auth(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    // Check if employee has any customers
    const customerCheck = await pool.query('SELECT COUNT(*) FROM customers WHERE created_by = $1', [id]);
    if (customerCheck.rows[0].count > 0) {
      return res.status(400).json({ error: 'Cannot delete employee with existing customers' });
    }

    const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ message: 'Employee deleted successfully', employee: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// Get employee performance metrics (Admin only)
router.get('/employees/:id/performance', auth(['admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as total_customers,
        COUNT(CASE WHEN rto_verified = true THEN 1 END) as verified_customers,
        COALESCE(SUM(amount_paid), 0) as revenue
      FROM customers
      WHERE created_by = $1
      AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `, [id]);

    res.json({ performance: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employee performance' });
  }
});

module.exports = router;
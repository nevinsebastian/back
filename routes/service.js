const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// Get all service bookings for a service employee
router.get('/bookings', auth(['service']), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT sb.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
             FROM service_bookings sb
             JOIN customers c ON sb.customer_id = c.id
             WHERE sb.service_employee_id = $1
             ORDER BY sb.booking_date DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update service booking status
router.put('/bookings/:id/status', auth(['service']), async (req, res) => {
    const { status, notes } = req.body;
    const bookingId = req.params.id;
    
    try {
        await db.query('BEGIN');
        
        // Update booking status
        await db.query(
            `UPDATE service_bookings 
             SET status = $1, notes = $2
             WHERE id = $3 AND service_employee_id = $4`,
            [status, notes, bookingId, req.user.id]
        );
        
        // Add to history
        await db.query(
            `INSERT INTO service_booking_status_history 
             (service_booking_id, status, notes, created_by)
             VALUES ($1, $2, $3, $4)`,
            [bookingId, status, notes, req.user.id]
        );
        
        await db.query('COMMIT');
        res.json({ message: 'Status updated successfully' });
    } catch (error) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    }
});

// Admin routes for managing service employees
router.post('/employees', auth(['admin']), async (req, res) => {
    const { name, email, phone, password } = req.body;
    
    try {
        const result = await db.query(
            `INSERT INTO employees (name, email, phone, password, role)
             VALUES ($1, $2, $3, $4, 'service')
             RETURNING id, name, email, phone, role`,
            [name, email, phone, password] // Note: In production, password should be hashed
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/employees', auth(['admin']), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, name, email, phone, role
             FROM employees
             WHERE role = 'service'`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 
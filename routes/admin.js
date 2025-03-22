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

// Create an employee (Admin only)
router.post('/employees', auth(['admin']), async (req, res) => {
  const { name, email, phone, branch_id, role, password } = req.body;

  if (!name || !email || !phone || !branch_id || !role || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!['sales', 'accounts', 'rto', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
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

// Get all employees (Admin only)
router.get('/employees', auth(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, branch_id, role, created_at FROM employees ORDER BY created_at DESC'
    );
    res.json({ employees: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

module.exports = router;
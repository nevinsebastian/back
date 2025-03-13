const express = require('express');
const app = express();
const pool = require('./db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const cors = require('cors');
const auth = require('./middleware/auth');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3001', 'http://192.168.29.199:3001'],
  credentials: true,
}));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => {
  res.send('DealerSync Backend is Running!');
});

// Create a new customer (Sales only)
app.post('/customers', auth(['sales']), async (req, res) => {
  const { customer_name, phone_number, vehicle, variant, color, price } = req.body;
  const created_by = req.user.id;

  if (!customer_name || !phone_number || !vehicle) {
    return res.status(400).json({ error: 'Customer name, phone number, and vehicle are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO customers (customer_name, phone_number, vehicle, variant, color, price, created_by, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending') RETURNING *`,
      [customer_name, phone_number, vehicle, variant || null, color || null, price || null, created_by]
    );

    const customerId = result.rows[0].id;
    const uniqueLink = `http://localhost:3000/customer-details/${customerId}`;

    res.status(201).json({
      message: 'Customer added successfully',
      customer: result.rows[0],
      uniqueLink,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add customer' });
  }
});

// Fetch customers (filtered for sales, all for admin)
app.get('/customers', auth(['sales', 'admin']), async (req, res) => {
  const userRole = req.user.role;
  const userId = req.user.id;

  try {
    let result;
    if (userRole === 'sales') {
      result = await pool.query(
        'SELECT * FROM customers WHERE created_by = $1 ORDER BY created_at DESC',
        [userId]
      );
    } else if (userRole === 'admin') {
      result = await pool.query(
        'SELECT c.*, e.name AS created_by_name FROM customers c LEFT JOIN employees e ON c.created_by = e.id ORDER BY c.created_at DESC'
      );
    }

    res.json({
      message: 'Customers fetched successfully',
      customers: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Update customer status (Sales can verify, Customer can submit via link)
app.put('/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!['Submitted', 'Verified'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Use Submitted or Verified.' });
  }

  try {
    // Check if the request is from a sales employee (for verification)
    if (token) {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      const userRole = decoded.role;
      const userId = decoded.id;

      if (userRole === 'sales' && status === 'Verified') {
        const result = await pool.query(
          'UPDATE customers SET status = $1 WHERE id = $2 AND created_by = $3 RETURNING *',
          [status, id, userId]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Customer not found or not owned by this sales employee' });
        }
        return res.json({ message: 'Customer verified successfully', customer: result.rows[0] });
      } else if (userRole && status === 'Submitted') {
        return res.status(403).json({ error: 'Only customers can submit details' });
      }
    }

    // No token: Assume customer is submitting via link
    if (status === 'Submitted') {
      const result = await pool.query(
        'UPDATE customers SET status = $1 WHERE id = $2 AND status = $3 RETURNING *',
        [status, id, 'Pending']
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Customer not found or already submitted' });
      }
      return res.json({ message: 'Customer details submitted successfully', customer: result.rows[0] });
    }

    return res.status(403).json({ error: 'Unauthorized action' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update customer status' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
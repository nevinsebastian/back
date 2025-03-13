const express = require('express');
const app = express();
const pool = require('./db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const cors = require('cors');
const auth = require('./middleware/auth');
const multer = require('multer'); // For file uploads
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

// Multer configuration for file uploads
const storage = multer.memoryStorage(); // Store files in memory as buffers
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per file
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG/PNG images are allowed'));
    }
  },
}).fields([
  { name: 'aadhar_front', maxCount: 1 },
  { name: 'aadhar_back', maxCount: 1 },
  { name: 'passport_photo', maxCount: 1 },
]);

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

// Fetch all customers (Sales see own, Admin see all)
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

// Fetch single customer details (Public, no auth required)
app.get('/customers/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT id, customer_name, phone_number, vehicle, variant, color, price, created_at, status FROM customers WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({
      message: 'Customer details fetched successfully',
      customer: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
});

// Update customer details and status (Customer submits, Sales verifies)
app.put('/customers/:id', upload, async (req, res) => {
  const { id } = req.params;
  const { status, dob, address, mobile_1, mobile_2, email, nominee, nominee_relation, payment_mode, finance_company, finance_amount } = req.body;
  const token = req.header('Authorization')?.replace('Bearer ', '');
  const files = req.files || {};

  if (status && !['Submitted', 'Verified'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Use Submitted or Verified.' });
  }

  try {
    if (token) {
      // Sales verifying
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

    // Customer submitting details (no token required)
    if (status === 'Submitted') {
      const queryParams = [
        status,
        dob || null,
        address || null,
        mobile_1 || null,
        mobile_2 || null,
        email || null,
        nominee || null,
        nominee_relation || null,
        payment_mode || null,
        finance_company || null,
        finance_amount ? parseFloat(finance_amount) : null,
        files.aadhar_front ? files.aadhar_front[0].buffer : null,
        files.aadhar_back ? files.aadhar_back[0].buffer : null,
        files.passport_photo ? files.passport_photo[0].buffer : null,
        id,
      ];

      const result = await pool.query(
        `UPDATE customers 
         SET status = $1, dob = $2, address = $3, mobile_1 = $4, mobile_2 = $5, email = $6, 
             nominee = $7, nominee_relation = $8, payment_mode = $9, finance_company = $10, 
             finance_amount = $11, aadhar_front = $12, aadhar_back = $13, passport_photo = $14
         WHERE id = $15 AND status = 'Pending' RETURNING *`,
        queryParams
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Customer not found or already submitted' });
      }

      return res.json({ message: 'Customer details submitted successfully', customer: result.rows[0] });
    }

    return res.status(403).json({ error: 'Unauthorized action' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update customer status or details' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
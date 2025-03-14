const express = require('express');
const app = express();
const pool = require('./db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const cors = require('cors');
const auth = require('./middleware/auth');
const multer = require('multer');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
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
  { name: 'front_delivery_photo', maxCount: 1 },
  { name: 'back_delivery_photo', maxCount: 1 },
  { name: 'delivery_photo', maxCount: 1 },
]);

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3001', 'http://192.168.29.199:3001'],
  credentials: true,
}));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

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

// Fetch single customer details (Public)
app.get('/customers/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, customer_name, phone_number, vehicle, variant, color, price, created_at, status, 
              dob, address, mobile_1, mobile_2, email, nominee, nominee_relation, payment_mode, 
              finance_company, finance_amount, amount_paid, ex_showroom, tax, insurance, booking_fee, 
              accessories, total_price, sales_verified, accounts_verified, manager_verified, rto_verified,
              front_delivery_photo, back_delivery_photo, delivery_photo
       FROM customers WHERE id = $1`,
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

// Serve customer images (Sales/Admin only)
app.get('/customers/:id/:imageType', auth(['sales', 'admin']), async (req, res) => {
  const { id, imageType } = req.params;
  const validImageTypes = [
    'aadhar_front', 'aadhar_back', 'passport_photo',
    'front_delivery_photo', 'back_delivery_photo', 'delivery_photo'
  ];

  if (!validImageTypes.includes(imageType)) {
    return res.status(400).json({ error: 'Invalid image type' });
  }

  try {
    const result = await pool.query(
      `SELECT ${imageType} FROM customers WHERE id = $1 AND created_by = $2`,
      [id, req.user.id]
    );

    if (result.rowCount === 0 || !result.rows[0][imageType]) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.set('Content-Type', 'image/png');
    res.send(result.rows[0][imageType]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

// Update customer details and status (Customer submits partially, Sales updates price)
app.put('/customers/:id', upload, async (req, res) => {
  const { id } = req.params;
  const {
    status, dob, address, mobile_1, mobile_2, email, nominee, nominee_relation, payment_mode,
    finance_company, finance_amount, ex_showroom, tax, insurance, booking_fee, accessories
  } = req.body;
  const token = req.header('Authorization')?.replace('Bearer ', '');
  const files = req.files || {};

  try {
    if (token) {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      const userRole = decoded.role;
      const userId = decoded.id;

      if (userRole === 'sales') {
        const queryParams = [
          status || null,
          ex_showroom ? parseFloat(ex_showroom) : null,
          tax ? parseFloat(tax) : null,
          insurance ? parseFloat(insurance) : null,
          booking_fee ? parseFloat(booking_fee) : null,
          accessories ? parseFloat(accessories) : null,
          id,
          userId
        ];

        const result = await pool.query(
          `UPDATE customers 
           SET status = COALESCE($1, status), 
               ex_showroom = COALESCE($2, ex_showroom), 
               tax = COALESCE($3, tax), 
               insurance = COALESCE($4, insurance), 
               booking_fee = COALESCE($5, booking_fee), 
               accessories = COALESCE($6, accessories),
               total_price = COALESCE($2, ex_showroom, 0) + COALESCE($3, tax, 0) + COALESCE($4, insurance, 0) + COALESCE($5, booking_fee, 0) + COALESCE($6, accessories, 0)
           WHERE id = $7 AND created_by = $8 RETURNING *`,
          queryParams
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Customer not found or not owned by this sales employee' });
        }
        return res.json({ message: 'Customer updated successfully', customer: result.rows[0] });
      }
    }

    const queryParams = [
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
       SET dob = COALESCE($1, dob), address = COALESCE($2, address), mobile_1 = COALESCE($3, mobile_1), 
           mobile_2 = COALESCE($4, mobile_2), email = COALESCE($5, email), nominee = COALESCE($6, nominee), 
           nominee_relation = COALESCE($7, nominee_relation), payment_mode = COALESCE($8, payment_mode), 
           finance_company = COALESCE($9, finance_company), finance_amount = COALESCE($10, finance_amount), 
           aadhar_front = COALESCE($11, aadhar_front), aadhar_back = COALESCE($12, aadhar_back), 
           passport_photo = COALESCE($13, passport_photo)
       WHERE id = $14 AND status = 'Pending' RETURNING *`,
      queryParams
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found or already submitted' });
    }

    const customer = result.rows[0];
    const requiredFields = ['dob', 'address', 'mobile_1', 'email', 'nominee', 'nominee_relation', 'payment_mode', 'aadhar_front', 'aadhar_back', 'passport_photo'];
    const isFullySubmitted = requiredFields.every(field => customer[field] !== null && customer[field] !== '');
    if (isFullySubmitted && (!customer.payment_mode || customer.payment_mode !== 'Finance' || (customer.finance_company && customer.finance_amount))) {
      await pool.query(`UPDATE customers SET status = 'Submitted' WHERE id = $1`, [id]);
      customer.status = 'Submitted';
    }

    return res.json({ message: 'Customer details updated successfully', customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update customer details' });
  }
});

// Update payment amount (Sales only)
app.put('/customers/:id/payments', auth(['sales']), async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  const userId = req.user.id;

  if (!amount || isNaN(amount) || amount < 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  try {
    const result = await pool.query(
      `UPDATE customers 
       SET amount_paid = COALESCE(amount_paid, 0) + $1
       WHERE id = $2 AND created_by = $3 RETURNING *`,
      [parseFloat(amount), id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found or not owned by this sales employee' });
    }

    res.json({ message: 'Payment updated successfully', customer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// Verify customer (Sales only)
app.put('/customers/:id/verify', auth(['sales']), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `UPDATE customers 
       SET status = 'Verified', sales_verified = TRUE
       WHERE id = $1 AND created_by = $2 RETURNING *`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found or not owned by this sales employee' });
    }

    res.json({ message: 'Customer verified successfully', customer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify customer' });
  }
});

// Delete customer (Sales only)
app.delete('/customers/:id', auth(['sales']), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `DELETE FROM customers WHERE id = $1 AND created_by = $2 RETURNING *`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found or not owned by this sales employee' });
    }

    res.json({ message: 'Customer deleted successfully', customer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Mark customer as delivered and upload delivery photos (Sales only)
app.put('/customers/:id/delivered', auth(['sales']), upload, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const files = req.files || {};

  try {
    const queryParams = [
      files.front_delivery_photo ? files.front_delivery_photo[0].buffer : null,
      files.back_delivery_photo ? files.back_delivery_photo[0].buffer : null,
      files.delivery_photo ? files.delivery_photo[0].buffer : null,
      id,
      userId
    ];

    const result = await pool.query(
      `UPDATE customers 
       SET status = 'Delivered',
           front_delivery_photo = COALESCE($1, front_delivery_photo),
           back_delivery_photo = COALESCE($2, back_delivery_photo),
           delivery_photo = COALESCE($3, delivery_photo)
       WHERE id = $4 AND created_by = $5 RETURNING *`,
      queryParams
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found or not owned by this sales employee' });
    }

    res.json({ message: 'Customer marked as delivered successfully', customer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark customer as delivered' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
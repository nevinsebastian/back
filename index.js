const express = require('express');
const app = express();
const pool = require('./db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const rtoRoutes = require('./routes/rto');
const notificationRoutes = require('./routes/notifications');
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
  origin: ['http://localhost:3001', 'http://192.168.29.199:3001', 'http://172.20.10.8:3001',],
  credentials: true,
}));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/rto', rtoRoutes);
app.use('/notifications', notificationRoutes);

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
    const uniqueLink = `http://172.20.10.8:3001/customer-details/${customerId}`;

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

// Get analytics data
app.get('/analytics', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM analytics WHERE id = 1');
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analytics data not found' });
    }

    const analytics = result.rows[0];

    // Get monthly trends (last 6 months)
    const trendsResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as total_customers,
        SUM(CASE WHEN status = 'Verified' THEN 1 ELSE 0 END) as verified_customers,
        SUM(COALESCE(amount_paid, 0)) as revenue
      FROM customers
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `);

    // Get top performing sales executives
    const topSalesResult = await pool.query(`
      SELECT 
        sales_executive_id,
        COUNT(*) as total_customers,
        COUNT(CASE WHEN status = 'Verified' THEN 1 END) as verified_customers,
        SUM(COALESCE(amount_paid, 0)) as total_revenue
      FROM customers
      GROUP BY sales_executive_id
      ORDER BY verified_customers DESC
      LIMIT 5
    `);

    res.json({
      current: analytics,
      trends: trendsResult.rows,
      topSales: topSalesResult.rows
    });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Get verified customers for accounts
app.get('/accounts/customers', auth(['accounts']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        c.*,
        CASE 
          WHEN c.aadhar_front IS NOT NULL THEN encode(c.aadhar_front, 'base64')
          ELSE NULL 
        END as aadhar_front_base64,
        CASE 
          WHEN c.aadhar_back IS NOT NULL THEN encode(c.aadhar_back, 'base64')
          ELSE NULL 
        END as aadhar_back_base64,
        CASE 
          WHEN c.passport_photo IS NOT NULL THEN encode(c.passport_photo, 'base64')
          ELSE NULL 
        END as passport_photo_base64,
        CASE 
          WHEN c.front_delivery_photo IS NOT NULL THEN encode(c.front_delivery_photo, 'base64')
          ELSE NULL 
        END as front_delivery_photo_base64,
        CASE 
          WHEN c.back_delivery_photo IS NOT NULL THEN encode(c.back_delivery_photo, 'base64')
          ELSE NULL 
        END as back_delivery_photo_base64,
        CASE 
          WHEN c.delivery_photo IS NOT NULL THEN encode(c.delivery_photo, 'base64')
          ELSE NULL 
        END as delivery_photo_base64
      FROM customers c 
      WHERE c.sales_verified = true
      ORDER BY c.created_at DESC`
    );

    const customers = result.rows.map(customer => ({
      ...customer,
      created_at: customer.created_at.toISOString(),
      updated_at: customer.updated_at?.toISOString()
    }));

    res.json({ customers });
  } catch (err) {
    console.error('Error in /accounts/customers:', err);
    res.status(500).json({ 
      error: 'Failed to fetch customers',
      details: err.message 
    });
  }
});

// Get single customer details for accounts
app.get('/accounts/customers/:id', auth(['accounts']), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
        c.*,
        CASE 
          WHEN c.aadhar_front IS NOT NULL THEN encode(c.aadhar_front, 'base64')
          ELSE NULL 
        END as aadhar_front_base64,
        CASE 
          WHEN c.aadhar_back IS NOT NULL THEN encode(c.aadhar_back, 'base64')
          ELSE NULL 
        END as aadhar_back_base64,
        CASE 
          WHEN c.passport_photo IS NOT NULL THEN encode(c.passport_photo, 'base64')
          ELSE NULL 
        END as passport_photo_base64,
        CASE 
          WHEN c.front_delivery_photo IS NOT NULL THEN encode(c.front_delivery_photo, 'base64')
          ELSE NULL 
        END as front_delivery_photo_base64,
        CASE 
          WHEN c.back_delivery_photo IS NOT NULL THEN encode(c.back_delivery_photo, 'base64')
          ELSE NULL 
        END as back_delivery_photo_base64,
        CASE 
          WHEN c.delivery_photo IS NOT NULL THEN encode(c.delivery_photo, 'base64')
          ELSE NULL 
        END as delivery_photo_base64
      FROM customers c 
      WHERE c.id = $1 AND c.sales_verified = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = {
      ...result.rows[0],
      created_at: result.rows[0].created_at.toISOString(),
      updated_at: result.rows[0].updated_at?.toISOString()
    };

    res.json({ customer });
  } catch (err) {
    console.error('Error in /accounts/customers/:id:', err);
    res.status(500).json({ 
      error: 'Failed to fetch customer details',
      details: err.message 
    });
  }
});

// Update customer accounts verification status
app.put('/accounts/customers/:id/verify', auth(['accounts']), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE customers 
       SET 
        accounts_verified = true,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'Verified'
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = {
      ...result.rows[0],
      created_at: result.rows[0].created_at.toISOString(),
      updated_at: result.rows[0].updated_at.toISOString()
    };

    res.json({ message: 'Customer verified by accounts', customer });
  } catch (err) {
    console.error('Error in /accounts/customers/:id/verify:', err);
    res.status(500).json({ error: 'Failed to verify customer' });
  }
});

// Update customer finance details (Accounts only)
app.put('/accounts/customers/:id/finance', auth(['accounts']), async (req, res) => {
  const { id } = req.params;
  const { 
    payment_mode,
    finance_company,
    finance_amount,
    emi,
    tenure,
    amount_paid
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE customers 
       SET 
        payment_mode = COALESCE($1, payment_mode),
        finance_company = COALESCE($2, finance_company),
        finance_amount = COALESCE($3, finance_amount),
        emi = COALESCE($4, emi),
        tenure = COALESCE($5, tenure),
        amount_paid = COALESCE($6, amount_paid),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND sales_verified = true
       RETURNING *`,
      [payment_mode, finance_company, finance_amount, emi, tenure, amount_paid, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found or not verified by sales' });
    }

    const customer = {
      ...result.rows[0],
      created_at: result.rows[0].created_at.toISOString(),
      updated_at: result.rows[0].updated_at.toISOString()
    };

    res.json({ 
      message: 'Finance details updated successfully', 
      customer 
    });
  } catch (err) {
    console.error('Error in /accounts/customers/:id/finance:', err);
    res.status(500).json({ 
      error: 'Failed to update finance details',
      details: err.message 
    });
  }
});

// Remove finance details (Accounts only)
app.delete('/accounts/customers/:id/finance', auth(['accounts']), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE customers 
       SET 
        payment_mode = 'Cash',
        finance_company = NULL,
        finance_amount = NULL,
        emi = NULL,
        tenure = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND sales_verified = true
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found or not verified by sales' });
    }

    const customer = {
      ...result.rows[0],
      created_at: result.rows[0].created_at.toISOString(),
      updated_at: result.rows[0].updated_at.toISOString()
    };

    res.json({ 
      message: 'Finance details removed successfully', 
      customer 
    });
  } catch (err) {
    console.error('Error in /accounts/customers/:id/finance:', err);
    res.status(500).json({ 
      error: 'Failed to remove finance details',
      details: err.message 
    });
  }
});

// Update payment amount (Accounts only)
app.put('/accounts/customers/:id/payment', auth(['accounts']), async (req, res) => {
  const { id } = req.params;
  const { amount_paid } = req.body;

  if (amount_paid === undefined || isNaN(amount_paid) || amount_paid < 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  try {
    const result = await pool.query(
      `UPDATE customers 
       SET 
        amount_paid = $1,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND sales_verified = true
       RETURNING *`,
      [parseFloat(amount_paid), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found or not verified by sales' });
    }

    const customer = {
      ...result.rows[0],
      created_at: result.rows[0].created_at.toISOString(),
      updated_at: result.rows[0].updated_at.toISOString()
    };

    res.json({ 
      message: 'Payment amount updated successfully', 
      customer 
    });
  } catch (err) {
    console.error('Error in /accounts/customers/:id/payment:', err);
    res.status(500).json({ 
      error: 'Failed to update payment amount',
      details: err.message 
    });
  }
});

// Get admin analytics data with month-over-month comparison
app.get('/admin/analytics', auth(['admin']), async (req, res) => {
  try {
    // Get current month's data
    const currentMonthResult = await pool.query(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(*) FILTER (WHERE NOT rto_verified) as pending_deliveries,
        COUNT(*) FILTER (WHERE NOT rto_verified AND sales_verified AND accounts_verified) as rto_pending,
        COALESCE(SUM(amount_paid), 0) as total_revenue
      FROM customers 
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
    `);

    // Get previous month's data
    const previousMonthResult = await pool.query(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(*) FILTER (WHERE NOT rto_verified) as pending_deliveries,
        COUNT(*) FILTER (WHERE NOT rto_verified AND sales_verified AND accounts_verified) as rto_pending,
        COALESCE(SUM(amount_paid), 0) as total_revenue
      FROM customers 
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    `);

    const current = currentMonthResult.rows[0];
    const previous = previousMonthResult.rows[0];

    // Calculate percentage changes
    const calculatePercentageChange = (current, previous) => {
      if (previous === 0) return 100;
      return ((current - previous) / previous) * 100;
    };

    const analytics = {
      total_bookings: {
        current: parseInt(current.total_bookings),
        previous: parseInt(previous.total_bookings),
        percentage_change: calculatePercentageChange(current.total_bookings, previous.total_bookings)
      },
      pending_deliveries: {
        current: parseInt(current.pending_deliveries),
        previous: parseInt(previous.pending_deliveries),
        percentage_change: calculatePercentageChange(current.pending_deliveries, previous.pending_deliveries)
      },
      rto_pending: {
        current: parseInt(current.rto_pending),
        previous: parseInt(previous.rto_pending),
        percentage_change: calculatePercentageChange(current.rto_pending, previous.rto_pending)
      },
      total_revenue: {
        current: parseFloat(current.total_revenue),
        previous: parseFloat(previous.total_revenue),
        percentage_change: calculatePercentageChange(current.total_revenue, previous.total_revenue)
      }
    };

    res.json({ analytics });
  } catch (err) {
    console.error('Error fetching admin analytics:', err);
    res.status(500).json({ error: 'Failed to fetch admin analytics' });
  }
});

const PORT = process.env.PORT || 80;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the server at:`);
  console.log(`- Local: http://localhost:${PORT}`);
  console.log(`- Network: http://172.20.10.8:${PORT}`);
});
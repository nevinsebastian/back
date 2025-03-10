const express = require('express');
const app = express();
const pool = require('./db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => {
  res.send('DealerSync Backend is Running!');
});

// Existing customer endpoint (protect it later if needed)
app.post('/customers', async (req, res) => {
  const { name, phone, vehicle_details } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO customers (name, phone, vehicle_details) VALUES ($1, $2, $3) RETURNING *',
      [name, phone, vehicle_details]
    );
    const customerId = result.rows[0].id;
    const uniqueLink = `http://localhost:3000/customer/${customerId}`;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
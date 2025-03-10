const express = require('express');
const app = express();
const pool = require('./db');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

app.use(express.json());

// Serve Swagger UI at /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/', (req, res) => {
  res.send('DealerSync Backend is Running!');
});

// Test database connection
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connected!', time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database connection failed');
  }
});

// Add a new customer
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
      uniqueLink: uniqueLink,
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
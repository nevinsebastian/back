const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// Get pending customers for RTO (verified by sales and accounts but not by RTO)
router.get('/customers/pending', auth(['rto']), async (req, res) => {
  try {
    console.log('Fetching pending customers for RTO...');
    const result = await pool.query(
      `SELECT 
        c.*,
        e.name as created_by_name,
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
        c.ex_showroom,
        c.tax,
        c.insurance,
        c.booking_fee,
        c.accessories,
        c.total_price,
        c.amount_paid,
        c.payment_mode,
        c.finance_company,
        c.finance_amount,
        c.emi,
        c.tenure
       FROM customers c 
       LEFT JOIN employees e ON c.created_by = e.id 
       WHERE c.sales_verified = true 
       AND c.accounts_verified = true
       AND c.rto_verified = false
       ORDER BY c.created_at DESC`
    );

    console.log(`Found ${result.rows.length} pending customers`);
    res.json({
      message: 'Pending customers fetched successfully',
      customers: result.rows,
    });
  } catch (err) {
    console.error('Error in /rto/customers/pending:', err);
    res.status(500).json({ 
      error: 'Failed to fetch pending customers',
      details: err.message 
    });
  }
});

// Get verified customers for RTO (verified by sales, accounts, and RTO)
router.get('/customers/verified', auth(['rto']), async (req, res) => {
  try {
    console.log('Fetching verified customers for RTO...');
    const result = await pool.query(
      `SELECT 
        c.*,
        e.name as created_by_name,
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
        c.ex_showroom,
        c.tax,
        c.insurance,
        c.booking_fee,
        c.accessories,
        c.total_price,
        c.amount_paid,
        c.payment_mode,
        c.finance_company,
        c.finance_amount,
        c.emi,
        c.tenure
       FROM customers c 
       LEFT JOIN employees e ON c.created_by = e.id 
       WHERE c.sales_verified = true 
       AND c.accounts_verified = true
       AND c.rto_verified = true
       ORDER BY c.created_at DESC`
    );

    console.log(`Found ${result.rows.length} verified customers`);
    res.json({
      message: 'Verified customers fetched successfully',
      customers: result.rows,
    });
  } catch (err) {
    console.error('Error in /rto/customers/verified:', err);
    res.status(500).json({ 
      error: 'Failed to fetch verified customers',
      details: err.message 
    });
  }
});

// Get customer by chassis number
router.get('/customers/chassis/:chassisNumber', auth(['rto']), async (req, res) => {
  const { chassisNumber } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
        c.*,
        e.name as created_by_name,
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
        c.ex_showroom,
        c.tax,
        c.insurance,
        c.booking_fee,
        c.accessories,
        c.total_price,
        c.amount_paid,
        c.payment_mode,
        c.finance_company,
        c.finance_amount,
        c.emi,
        c.tenure
       FROM customers c 
       LEFT JOIN employees e ON c.created_by = e.id 
       WHERE c.chassis_number = $1 
       AND c.sales_verified = true 
       AND c.accounts_verified = true`,
      [chassisNumber]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found or not verified by sales and accounts' });
    }

    res.json({
      message: 'Customer found',
      customer: result.rows[0],
    });
  } catch (err) {
    console.error('Error in /rto/customers/chassis/:chassisNumber:', err);
    res.status(500).json({ 
      error: 'Failed to fetch customer',
      details: err.message 
    });
  }
});

// Update customer status
router.put('/customers/:id/status', auth(['rto']), async (req, res) => {
  const { id } = req.params;
  
  try {
    // Cast id to integer
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }

    const result = await pool.query(
      `UPDATE customers 
       SET 
        rto_verified = true,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       AND sales_verified = true 
       AND accounts_verified = true
       AND rto_verified = false
       RETURNING *`,
      [customerId]
    );

    console.log(`Update result: ${result.rows.length} rows affected`);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found or not verified by sales and accounts' });
    }

    res.json({
      message: 'Customer marked as RTO verified successfully',
      customer: result.rows[0],
    });
  } catch (err) {
    console.error('Error in /rto/customers/:id/status:', err);
    res.status(500).json({ 
      error: 'Failed to update customer status',
      details: err.message 
    });
  }
});

// Get chassis image
router.get('/customers/:id/chassis-image', auth(['rto']), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT chassis_image 
       FROM customers 
       WHERE id = $1 
       AND sales_verified = true 
       AND accounts_verified = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found or not verified by sales and accounts' });
    }

    const chassisImage = result.rows[0].chassis_image;
    if (!chassisImage) {
      return res.status(404).json({ error: 'Chassis image not found' });
    }

    res.json({
      message: 'Chassis image fetched successfully',
      image: chassisImage.toString('base64'),
    });
  } catch (err) {
    console.error('Error in /rto/customers/:id/chassis-image:', err);
    res.status(500).json({ 
      error: 'Failed to fetch chassis image',
      details: err.message 
    });
  }
});

module.exports = router; 
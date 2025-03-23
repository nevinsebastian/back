const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function runMigration(fileName) {
  try {
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', fileName),
      'utf8'
    );
    await pool.query(migrationSQL);
    console.log(`Migration ${fileName} completed successfully`);
  } catch (err) {
    console.error(`Migration ${fileName} failed:`, err);
  }
}

async function runMigrations() {
  const migrationFiles = [
    'create_branches_table.sql',
    'create_customers_table.sql',
    'create_employees_table.sql',
    '20240321_add_verification_status.sql',
    'add_accounts_columns.sql',
    'add_accounts_verified.sql',
    'add_delivered_status.sql',
    'add_notifications_tables.sql'
  ];

  for (const file of migrationFiles) {
    await runMigration(file);
  }

  await pool.end();
}

runMigrations();

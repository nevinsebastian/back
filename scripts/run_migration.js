const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    // Run first migration
    const enumMigrationPath = path.join(__dirname, '../migrations/20240402_add_service_role_enum.sql');
    const enumMigrationSQL = fs.readFileSync(enumMigrationPath, 'utf8');
    await pool.query(enumMigrationSQL);
    console.log('Enum migration completed successfully');

    // Run second migration
    const constraintMigrationPath = path.join(__dirname, '../migrations/20240402_update_role_constraint.sql');
    const constraintMigrationSQL = fs.readFileSync(constraintMigrationPath, 'utf8');
    await pool.query(constraintMigrationSQL);
    console.log('Constraint migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit();
  }
}

runMigration(); 
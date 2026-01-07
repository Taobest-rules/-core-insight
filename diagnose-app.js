// diagnose-app.js - Test your app's database connection
const mysql = require('mysql2/promise');
require('dotenv').config();

async function diagnose() {
  console.log('🔍 Diagnosing website database connection...\n');
  
  // Test 1: Check what's in your Railway database
  console.log('1. Checking Railway database contents...');
  const railwayDb = await mysql.createConnection({
    host: process.env.DB_HOST || 'trolley.proxy.rlwy.net',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'YOUR_PASSWORD',
    database: process.env.DB_NAME || 'railway',
    port: Number(process.env.DB_PORT) || 59121,
    ssl: { rejectUnauthorized: false }
  });
  
  console.log('✅ Connected to Railway\n');
  
  // Get all tables
  const [tables] = await railwayDb.query(`
    SELECT table_name, table_rows 
    FROM information_schema.tables 
    WHERE table_schema = DATABASE()
    ORDER BY table_name
  `);
  
  console.log('📋 Tables in Railway:');
  console.log('─'.repeat(40));
  tables.forEach(table => {
    console.log(`  ${table.TABLE_NAME.padEnd(25)}: ${table.TABLE_ROWS} rows`);
  });
  
  // Test 2: Check if your app's db.js is connecting correctly
  console.log('\n2. Testing your app\'s db.js connection...');
  
  // Try to load your actual db.js
  try {
    const pool = require('./db');
    
    // Test a query using your app's pool
    const [products] = await pool.query('SELECT COUNT(*) as count FROM products');
    console.log(`✅ Your app's db.js can query products: ${products[0].count} rows`);
    
  } catch (error) {
    console.log(`❌ Your app's db.js error: ${error.message}`);
    console.log('\n💡 Problem: Your app is not connecting to Railway!');
    console.log('   Check your db.js configuration.');
  }
  
  // Test 3: Check environment variables
  console.log('\n3. Checking environment...');
  console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
  console.log('   Using DB_HOST:', process.env.DB_HOST || 'not set');
  
  await railwayDb.end();
  
  console.log('\n' + '='.repeat(50));
  console.log('📝 RECOMMENDED FIX:');
  console.log('='.repeat(50));
  console.log('Your app is likely still trying to connect to localhost.');
  console.log('Update your db.js file to use Railway in production.\n');
  
  // Show the fix
  console.log('💡 Add this to your db.js:');
  console.log(`
// At the top of db.js
const isProduction = process.env.NODE_ENV === 'production';

const poolConfig = {
  host: isProduction ? process.env.DB_HOST : 'localhost',
  user: isProduction ? process.env.DB_USER : 'root',
  password: isProduction ? process.env.DB_PASSWORD : '',
  database: isProduction ? process.env.DB_NAME : 'core_insight',
  port: isProduction ? (Number(process.env.DB_PORT) || 59121) : 3306
};

if (isProduction) {
  poolConfig.ssl = { rejectUnauthorized: false };
}
  `);
}

diagnose().catch(console.error);
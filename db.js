// db.js - WORKING VERSION FOR BOTH LOCAL AND PRODUCTION
const mysql = require("mysql2/promise");

// Load environment variables
require("dotenv").config();

// Determine environment
const isProduction = process.env.NODE_ENV === 'production';
const isRender = process.env.RENDER === 'true'; // Render sets this

console.log(`🚀 Starting database in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);

// Database configuration
const dbConfig = {
  // In production (Render), use Railway. Otherwise use localhost
  host: isProduction ? (process.env.DB_HOST || 'trolley.proxy.rlwy.net') : 'localhost',
  user: isProduction ? (process.env.DB_USER || 'root') : 'root',
  password: isProduction ? process.env.DB_PASSWORD : '',
  database: isProduction ? (process.env.DB_NAME || 'railway') : 'core_insight',
  port: isProduction ? (Number(process.env.DB_PORT) || 59121) : 3306,
  
  // Connection pool settings
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 30000,
  
  // Enable keep alive
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

// Add SSL for Railway (production)
if (isProduction) {
  dbConfig.ssl = {
    rejectUnauthorized: false
  };
  console.log('🔐 SSL enabled for Railway connection');
}

// Debug output
console.log('📊 Database Configuration:');
console.log(`   Host: ${dbConfig.host}`);
console.log(`   Database: ${dbConfig.database}`);
console.log(`   Port: ${dbConfig.port}`);
console.log(`   User: ${dbConfig.user}`);

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test connection on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`✅ SUCCESS: Connected to ${dbConfig.database} at ${dbConfig.host}:${dbConfig.port}`);
    
    // Test query
    const [rows] = await connection.query('SELECT 1 as connection_test');
    console.log('✅ Database test query successful:', rows[0]);
    
    // Count products to verify data exists
    try {
      const [products] = await connection.query('SELECT COUNT(*) as count FROM products');
      console.log(`📦 Products in database: ${products[0].count}`);
    } catch (e) {
      console.log('⚠️  Products table not found yet');
    }
    
    connection.release();
  } catch (error) {
    console.error('❌ DATABASE CONNECTION FAILED:', error.message);
    console.error('Error code:', error.code);
    console.error('Error number:', error.errno);
    
    // Helpful troubleshooting
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('1. Check if NODE_ENV is set to "production" on Render');
    console.log('2. Verify Railway credentials in Render environment variables');
    console.log('3. Ensure Railway database is running');
    console.log('4. Check firewall/network connectivity');
    
    // Show current config
    console.log('\n📝 Current configuration:');
    console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
    console.log('   DB_HOST:', process.env.DB_HOST || 'not set');
    console.log('   DB_NAME:', process.env.DB_NAME || 'not set');
    console.log('   DB_PORT:', process.env.DB_PORT || 'not set');
  }
})();

module.exports = pool;
// db.js - FIXED VERSION
const mysql = require("mysql2/promise");

// Always load environment variables
require("dotenv").config();

// Check if we're in production (Render) or development (localhost)
const isProduction = process.env.NODE_ENV === 'production';

console.log(`🔧 Database configuration: ${isProduction ? 'Production (Railway)' : 'Development (localhost)'}`);

const poolConfig = {
  host: isProduction ? process.env.DB_HOST : 'localhost',
  user: isProduction ? process.env.DB_USER : 'root',
  password: isProduction ? process.env.DB_PASSWORD : '',
  database: isProduction ? process.env.DB_NAME : 'core_insight',
  port: isProduction ? (Number(process.env.DB_PORT) || 59121) : 3306,
  
  // Connection pool settings
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000
};

// SSL is required for Railway in production
if (isProduction) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
  console.log('✅ SSL enabled for Railway connection');
}

const pool = mysql.createPool(poolConfig);

// Test connection on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`✅ Connected to database: ${poolConfig.database}`);
    
    // Quick test query
    const [result] = await connection.query('SELECT 1 as test');
    console.log('✅ Database test query successful');
    
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Full error:', error);
    
    // Helpful debug info
    console.log('\n🔧 Debug info:');
    console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
    console.log('DB_HOST:', process.env.DB_HOST || 'not set');
    console.log('DB_NAME:', process.env.DB_NAME || 'not set');
  }
})();

module.exports = pool;
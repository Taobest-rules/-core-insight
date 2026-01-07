// db.js - WITH CONNECTION STABILITY FIXES
const mysql = require("mysql2/promise");
require("dotenv").config({ path: '.env.railway' });

console.log("🔧 Initializing STABLE Railway MySQL connection...");

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'railway',
  
  // CRITICAL STABILITY SETTINGS:
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 30000, // 30 seconds
  acquireTimeout: 30000, // 30 seconds to get a connection
  timeout: 60000, // 60 seconds query timeout
  
  // Enable keepalive
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  
  // No SSL for Railway
  ssl: false,
  
  // Debug
  debug: false,
  
  // Multiple statements (if needed)
  multipleStatements: false
};

const pool = mysql.createPool(config);

// Add connection error handling
pool.on('connection', (connection) => {
  console.log('🔌 New MySQL connection established');
});

pool.on('error', (err) => {
  console.error('🚨 MySQL pool error:', err.message);
});

// Test with retry logic
async function testConnectionWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await pool.getConnection();
      console.log(`✅ Railway MySQL Connected (attempt ${i+1}/${retries})`);
      const [result] = await connection.query('SELECT 1 as test');
      connection.release();
      return true;
    } catch (error) {
      console.warn(`⚠️ Connection attempt ${i+1} failed:`, error.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      }
    }
  }
  return false;
}

// Test on startup
testConnectionWithRetry().then(success => {
  if (success) {
    console.log('🎉 Database connection stable!');
  } else {
    console.error('❌ Failed to establish stable database connection');
  }
});

// Export with retry wrapper
module.exports = {
  pool,
  
  // Enhanced query function with retry
  query: async (sql, params, retries = 2) => {
    for (let i = 0; i < retries; i++) {
      try {
        const [results] = await pool.query(sql, params);
        return results;
      } catch (error) {
        if (i === retries - 1) throw error;
        console.warn(`Query failed, retrying (${i+1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  },
  
  getConnection: () => pool.getConnection()
};
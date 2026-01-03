// db.js - MySQL2 version (CORRECTED)
const mysql = require("mysql2/promise");  // Changed from mariadb to mysql2

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const pool = mysql.createPool({  // Changed from mariadb.createPool to mysql.createPool
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  
  // Fix for MySQL 8+ authentication
  authPlugins: {
    caching_sha2_password: () => require('mysql2/lib/auth/caching_sha2_password'),
    mysql_native_password: () => require('mysql2/lib/auth/mysql_native_password')
  },
  
  // Connection settings
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  
  // Enable keep alive
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  
  // SSL for production
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : undefined
});

// Test connection
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL database connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
  }
})();

module.exports = pool;
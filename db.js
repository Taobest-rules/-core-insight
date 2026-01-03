// db.js
const mysql = require("mysql2/promise");

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  
  // MySQL2 specific options
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  
  // For RSA key issue (MySQL 8+ with caching_sha2_password)
  authPlugins: {
    mysql_clear_password: () => () => Buffer.from(password + '\0')
  },
  
  // SSL options - adjust based on your provider
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
  } : undefined,
  
  // Enable for MySQL 8+ with caching_sha2_password
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

// Test connection function
pool.testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connection successful!');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

module.exports = pool;
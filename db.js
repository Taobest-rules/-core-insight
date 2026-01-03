// db.js - FOR RAILWAY MYSQL
const mysql = require("mysql2/promise");

// Always load environment variables
require("dotenv").config();

console.log('🔧 Connecting to Railway MySQL...');
console.log('Host:', process.env.DB_HOST);
console.log('Port:', process.env.DB_PORT);
console.log('Database:', process.env.DB_NAME);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 59121, // Railway uses custom port
  
  // Railway requires SSL
  ssl: {
    rejectUnauthorized: false
  },
  
  // Connection settings
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 30000,  // 30 seconds
  
  // For Railway/MySQL 8+ authentication
  authPlugins: {
    mysql_native_password: () => require('mysql2/lib/auth/mysql_native_password')
  },
  
  // Additional settings
  charset: 'utf8mb4',
  timezone: 'Z'
});

// Test connection
(async () => {
  let connection;
  try {
    console.log('Attempting connection to Railway MySQL...');
    connection = await pool.getConnection();
    console.log('✅ Connected to Railway MySQL successfully!');
    
    // Show database info
    const [rows] = await connection.query('SELECT DATABASE() as db, USER() as user');
    console.log('Connected to database:', rows[0].db);
    console.log('Connected as user:', rows[0].user);
    
  } catch (error) {
    console.error('❌ Railway MySQL connection failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Error number:', error.errno);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check DB_HOST is: trolley.proxy.rlwy.net');
    console.log('2. Check DB_PORT is: 59121');
    console.log('3. Verify credentials in Railway dashboard');
    console.log('4. Ensure Railway allows external connections');
    
  } finally {
    if (connection) connection.release();
  }
})();

module.exports = pool;
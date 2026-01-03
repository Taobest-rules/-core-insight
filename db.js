// db.js - UPDATED FOR MYSQL2 v3+
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
  
  // Connection settings - REMOVE the authPlugins for mysql2 v3+
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  
  // Enable keep alive
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  
  // For MySQL 8+ with caching_sha2_password, use this:
  authSwitchHandler: function ({pluginName, pluginData}, cb) {
    if (pluginName === 'caching_sha2_password') {
      const password = this.password;
      const challenge = require('crypto').createHash('sha256')
        .update(password + pluginData.toString('hex'))
        .digest();
      cb(null, challenge);
    }
  },
  
  // OR simpler - just add this for MySQL 8+:
  // supportBigNumbers: true,
  // bigNumberStrings: true,
  
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
    
    // Test a simple query
    const [rows] = await connection.query('SELECT 1 as connection_test');
    console.log('✅ Test query successful:', rows[0]);
    
    connection.release();
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Error number:', error.errno);
    
    // Debug info
    console.log('\n🔧 Debug info:');
    console.log('DB_HOST:', process.env.DB_HOST ? 'Set' : 'Not set');
    console.log('DB_USER:', process.env.DB_USER ? 'Set' : 'Not set');
    console.log('DB_NAME:', process.env.DB_NAME ? 'Set' : 'Not set');
  }
})();

module.exports = pool;
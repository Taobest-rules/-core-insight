// db.js
const mysql = require("mysql2/promise");

// Load .env ONLY in development
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD?.trim(),
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  ssl: false,
  authPlugins: {
    mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD)
  }
});

// Test connection ONLY in development
if (process.env.NODE_ENV !== "production") {
  (async () => {
    try {
      const conn = await pool.getConnection();
      console.log("✅ Connected to MySQL successfully!");
      conn.release();
    } catch (err) {
      console.error("❌ MySQL connection failed:", err.message);
    }
  })();
}

module.exports = pool;

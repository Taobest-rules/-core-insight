// db.js
const mariadb = require("mariadb");
require("dotenv").config();

const pool = mariadb.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: (process.env.DB_PASSWORD || "").trim(),
  database: process.env.DB_NAME || "core_insight",
  port: process.env.DB_PORT || 3306,
  connectionLimit: 10,       // up to 10 simultaneous connections
  connectTimeout: 10000,     // 10 seconds to connect
  acquireTimeout: 10000,     // 10 seconds to acquire a connection
  idleTimeout: 30000         // closes idle connections after 30s
});

// Test the pool connection once at startup
pool.getConnection()
  .then(conn => {
    console.log("✅ Connected to MariaDB successfully!");
    conn.release();
  })
  .catch(err => {
    console.error("❌ Failed to connect to MariaDB:", err.message);
  });

// Handle pool-level errors
pool.on("error", (err) => {
  console.error("❌ MariaDB pool error:", err);
  if (err.code === "ECONNRESET") {
    console.warn("⚠️ Connection reset by server. The pool will recover automatically.");
  }
});

module.exports = pool;

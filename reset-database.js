// reset-database.js
require('dotenv').config();
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: 5
});

async function reset() {
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Drop and recreate database
    console.log('🔄 Resetting database...');
    await conn.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
    await conn.query(`CREATE DATABASE ${process.env.DB_NAME}`);
    await conn.query(`USE ${process.env.DB_NAME}`);
    
    // Create tables
    console.log('📊 Creating tables...');
    
    await conn.query(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255),
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await conn.query(`
      CREATE TABLE courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_path VARCHAR(500),
        price DECIMAL(10,2) DEFAULT 0.00,
        type ENUM('free', 'paid') DEFAULT 'free',
        user_id INT NOT NULL,
        author VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create admin user
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('Password$01', 10);
    
    await conn.query(
      "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
      ['admin', 'admin@coreinsight.com', hashedPassword, 'admin']
    );
    
    console.log('✅ Database reset successfully!');
    console.log('👤 Admin user created: admin / Password$01');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

reset();
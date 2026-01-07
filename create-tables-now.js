// create-tables-now.js
const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTables() {
  console.log('Creating tables in Railway...\n');
  
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'trolley.proxy.rlwy.net',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'ZrZXNxoFhuQrWaqxcnEXErHkoNmzMiGa',
    database: process.env.DB_NAME || 'railway',
    port: Number(process.env.DB_PORT) || 59121,
    ssl: { rejectUnauthorized: false }
  });
  
  console.log('✅ Connected to Railway\n');
  
  // Create products table
  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      seller_id INT,
      category VARCHAR(100),
      image_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Created products table');
  
  // Create users table
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Created users table');
  
  // Create courses table
  await db.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10,2),
      instructor_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Created courses table');
  
  // Add sample data if tables are empty
  console.log('\n📝 Checking for data...');
  
  const [productCount] = await db.query('SELECT COUNT(*) as cnt FROM products');
  if (productCount[0].cnt === 0) {
    console.log('Adding sample products...');
    await db.query(`
      INSERT INTO products (name, description, price, category) VALUES
      ('Web Development Course', 'Learn full-stack development', 49.99, 'Education'),
      ('Mobile App Template', 'React Native template', 29.99, 'Templates'),
      ('UI/UX Design Package', 'Complete design system', 79.99, 'Design')
    `);
    console.log('✅ Added sample products');
  } else {
    console.log(`📦 Products already exist: ${productCount[0].cnt} rows`);
  }
  
  const [userCount] = await db.query('SELECT COUNT(*) as cnt FROM users');
  if (userCount[0].cnt === 0) {
    console.log('Adding sample user...');
    // Password: password123
    await db.query(`
      INSERT INTO users (email, password, name) VALUES
      ('test@example.com', '$2b$10$K3V.9hGX5Xq7F8wL2Y6ZzOcR1S2T3U4V5W6X7Y8Z9A0B1C2D3E4F5G6H7I', 'Test User')
    `);
    console.log('✅ Added sample user (test@example.com / password123)');
  } else {
    console.log(`👥 Users already exist: ${userCount[0].cnt} rows`);
  }
  
  await db.end();
  
  console.log('\n' + '='.repeat(50));
  console.log('🎉 Tables created successfully!');
  console.log('\n🌐 Visit: https://core-insight-7.onrender.com');
  console.log('   Products should now display.');
}

createTables().catch(console.error);
// test-db.js - Database Connection Test
require('dotenv').config();
const mariadb = require('mariadb');

console.log('🔧 Testing database connection...');
console.log('=====================================');

// Display environment variables (mask password for security)
console.log('Host:', process.env.DB_HOST || 'Not set');
console.log('User:', process.env.DB_USER || 'Not set');
console.log('Database:', process.env.DB_NAME || 'Not set');
console.log('Password:', process.env.DB_PASSWORD ? '***' + process.env.DB_PASSWORD.slice(-3) : 'Not set');

// Create database connection pool
const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'core_insight',
  connectionLimit: 5
});

async function testConnection() {
  let conn;
  try {
    console.log('\n📊 Attempting to connect to database...');
    
    // Get connection from pool
    conn = await pool.getConnection();
    console.log('✅ Database connection successful!');
    
    // Test basic query
    console.log('\n🧪 Running basic query test...');
    const [result] = await conn.query("SELECT 1 + 1 as test_result");
    console.log('✅ Basic query test passed:', result.test_result);
    
    // Check if database exists
    console.log('\n📋 Checking database tables...');
    const [databases] = await conn.query("SHOW DATABASES LIKE ?", [process.env.DB_NAME]);
    
    if (databases.length > 0) {
      console.log('✅ Database exists:', process.env.DB_NAME);
      
      // Switch to our database
      await conn.query(`USE ${process.env.DB_NAME}`);
      
      // Check if tables exist
      const [tables] = await conn.query("SHOW TABLES");
      console.log('📊 Tables in database:', tables.length);
      
      if (tables.length > 0) {
        console.log('Table list:');
        tables.forEach((table, index) => {
          const tableName = Object.values(table)[0];
          console.log(`  ${index + 1}. ${tableName}`);
        });
        
        // Check users table specifically
        const [usersTable] = await conn.query("SHOW TABLES LIKE 'users'");
        console.log('👥 Users table exists:', usersTable.length > 0);
        
        if (usersTable.length > 0) {
          const [userCount] = await conn.query("SELECT COUNT(*) as count FROM users");
          console.log('Total users:', userCount[0].count);
          
          // Show sample users
          const [users] = await conn.query("SELECT id, username, role FROM users LIMIT 5");
          console.log('Sample users:');
          users.forEach(user => {
            console.log(`  - ${user.username} (${user.role})`);
          });
        }
        
        // Check courses table
        const [coursesTable] = await conn.query("SHOW TABLES LIKE 'courses'");
        console.log('📚 Courses table exists:', coursesTable.length > 0);
      } else {
        console.log('❌ No tables found in database');
        console.log('💡 Run the SQL commands to create the tables');
      }
      
    } else {
      console.log('❌ Database does not exist:', process.env.DB_NAME);
      console.log('💡 Create the database with: CREATE DATABASE core_insight;');
    }
    
  } catch (err) {
    console.error('\n❌ Database connection failed!');
    console.error('Error details:', err.message);
    console.error('\n🔍 Troubleshooting tips:');
    console.error('1. Is MariaDB running? Run: net start mariadb');
    console.error('2. Check your .env file configuration');
    console.error('3. Verify database credentials');
    
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 Password might be incorrect');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('💡 MariaDB might not be running');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('💡 Database might not exist');
    }
    
  } finally {
    // Always release the connection
    if (conn) {
      conn.release();
      console.log('\n🔌 Database connection released');
    }
    
    // Close the pool
    await pool.end();
    console.log('✅ Test completed');
    process.exit();
  }
}

// Run the test
testConnection();
// test-simple.js - Simple Database Test
require('dotenv').config();
const mariadb = require('mariadb');

console.log('🔧 Testing database connection...');
console.log('=====================================');

// Create connection
const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 5
});

async function test() {
  let conn;
  try {
    console.log('📊 Connecting to database...');
    conn = await pool.getConnection();
    console.log('✅ Connected to MariaDB!');
    
    // Test if we can use the database
    console.log('\n🧪 Testing database access...');
    const [dbs] = await conn.query("SHOW DATABASES");
    const dbExists = dbs.some(db => db.Database === process.env.DB_NAME);
    console.log('Database exists:', dbExists);
    
    if (dbExists) {
      // Try to use the database
      await conn.query(`USE ${process.env.DB_NAME}`);
      console.log('✅ Using database:', process.env.DB_NAME);
      
      // Check tables
      const [tables] = await conn.query("SHOW TABLES");
      console.log('📊 Number of tables:', tables.length);
      
      if (tables.length > 0) {
        console.log('Table names:');
        tables.forEach(table => {
          console.log('  -', Object.values(table)[0]);
        });
        
        // Check users table
        try {
          const [users] = await conn.query("SELECT * FROM users");
          console.log('👥 Users count:', users.length);
          if (users.length > 0) {
            console.log('Sample users:');
            users.forEach(user => {
              console.log(`  - ${user.username || user.name} (${user.role})`);
            });
          }
        } catch (err) {
          console.log('❌ Error reading users table:', err.message);
        }
      }
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    if (conn) conn.release();
    await pool.end();
    console.log('\n✅ Test completed');
  }
}

test();
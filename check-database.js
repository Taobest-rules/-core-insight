// check-database.js
require('dotenv').config();
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: 5
});

async function check() {
  let conn;
  try {
    conn = await pool.getConnection();
    
    // List all databases
    console.log('📊 All databases on server:');
    const [databases] = await conn.query("SHOW DATABASES");
    databases.forEach(db => {
      console.log('  -', db.Database);
    });
    
    // Check if our database exists
    const ourDb = databases.find(db => 
      db.Database.toLowerCase() === process.env.DB_NAME.toLowerCase()
    );
    
    console.log('\n🔍 Looking for our database:');
    console.log('Database name in .env:', process.env.DB_NAME);
    console.log('Exists on server:', !!ourDb);
    
    if (ourDb) {
      console.log('\n📋 Tables in our database:');
      await conn.query(`USE ${ourDb.Database}`);
      const [tables] = await conn.query("SHOW TABLES");
      
      if (tables.length > 0) {
        tables.forEach(table => {
          const tableName = Object.values(table)[0];
          console.log('  -', tableName);
          
          // Show table structure
          conn.query(`DESCRIBE ${tableName}`).then(([columns]) => {
            console.log(`    Columns in ${tableName}:`);
            columns.forEach(col => {
              console.log(`      ${col.Field} (${col.Type})`);
            });
          });
        });
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

check();
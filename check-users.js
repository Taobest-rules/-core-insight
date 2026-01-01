// check-users.js
require('dotenv').config();
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

async function checkUsers() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('📊 Checking existing users...');
    
    const [users] = await conn.query("SELECT * FROM users");
    console.log('Total users:', users.length);
    
    users.forEach(user => {
      console.log(`👤 ${user.username} (${user.role}) - ID: ${user.id}`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

checkUsers();
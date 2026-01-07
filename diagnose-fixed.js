// diagnose-fixed.js
const mysql = require('mysql2/promise');

async function diagnose() {
  console.log('🔍 Diagnosing local database with auth fix...\n');
  
  try {
    // Try with mysql_native_password authentication
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Password$01',
      database: 'mysql',  // Connect to mysql system database first
      
      // Force mysql_native_password authentication
      authPlugins: {
        mysql_native_password: () => require('mysql2/lib/auth/mysql_native_password')
      }
    });
    
    console.log('✅ Connected to MySQL system database!\n');
    
    // Show databases
    const [databases] = await connection.query('SHOW DATABASES');
    console.log(`Found ${databases.length} databases:`);
    
    databases.forEach(db => {
      const dbName = db[Object.keys(db)[0]];
      console.log(`  - ${dbName}`);
    });
    
    // Check for your database
    const yourDb = databases.find(db => {
      const name = db[Object.keys(db)[0]];
      return name.toLowerCase().includes('core') || 
             name.toLowerCase().includes('insight') ||
             name === 'core_insight';
    });
    
    if (yourDb) {
      const dbName = yourDb[Object.keys(yourDb)[0]];
      console.log(`\n🔍 Found your database: ${dbName}`);
      
      // Switch to your database
      await connection.query(`USE ${dbName}`);
      
      // Show tables
      const [tables] = await connection.query('SHOW TABLES');
      console.log(`\n📋 Tables in ${dbName}:`);
      
      if (tables.length === 0) {
        console.log('  No tables found.');
      } else {
        tables.forEach((table, i) => {
          const tableName = table[Object.keys(table)[0]];
          console.log(`${i+1}. ${tableName}`);
        });
      }
    }
    
    await connection.end();
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('\n💡 Trying alternative solutions...');
    
    // Try without specifying database
    try {
      const conn2 = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        authPlugins: {
          mysql_native_password: () => require('mysql2/lib/auth/mysql_native_password')
        }
      });
      
      console.log('\n✅ Connected without specifying database!');
      const [dbs] = await conn2.query('SHOW DATABASES');
      console.log('\n📊 Available databases:');
      dbs.forEach(db => {
        const name = db[Object.keys(db)[0]];
        console.log(`  - ${name}`);
      });
      
      await conn2.end();
    } catch (err2) {
      console.log('❌ Also failed:', err2.message);
    }
  }
}

diagnose();
// diagnose-tables.js
const mysql = require('mysql2/promise');

async function diagnose() {
  console.log('🔍 Diagnosing local database...\n');
  
  try {
    // Try different connection configurations
    const configs = [
      { host: 'localhost', user: 'root', password: '', database: 'core_insight' },
      { host: 'localhost', user: 'root', password: 'root', database: 'core_insight' },
      { host: 'localhost', user: 'root', password: '', database: 'test' },
      { host: '127.0.0.1', user: 'root', password: '', database: 'mysql' }
    ];
    
    let connection = null;
    
    for (const config of configs) {
      try {
        console.log(`Trying: ${config.user}@${config.host}/${config.database}`);
        connection = await mysql.createConnection(config);
        console.log(`✅ Connected successfully!`);
        break;
      } catch (err) {
        console.log(`  ❌ Failed: ${err.message}`);
      }
    }
    
    if (!connection) {
      console.log('\n❌ Could not connect to any database configuration.');
      console.log('\n💡 Solutions:');
      console.log('1. Make sure MySQL/MariaDB is running');
      console.log('2. Check if you have XAMPP/WAMP running');
      console.log('3. Try: mysql -u root -p (in command line)');
      return;
    }
    
    console.log('\n📊 Checking databases...');
    const [databases] = await connection.query('SHOW DATABASES');
    console.log(`Found ${databases.length} databases:`);
    databases.forEach(db => {
      console.log(`  - ${db[Object.keys(db)[0]]}`);
    });
    
    // Check which database we're connected to
    const [currentDb] = await connection.query('SELECT DATABASE() as db');
    console.log(`\nCurrently using database: ${currentDb[0].db}`);
    
    // Show tables in current database
    console.log('\n📋 Tables in current database:');
    const [tables] = await connection.query('SHOW TABLES');
    
    if (tables.length === 0) {
      console.log('  No tables found in this database.');
      
      // Let user choose a database
      console.log('\n🔍 Let me check other databases for tables...');
      for (const dbInfo of databases) {
        const dbName = dbInfo[Object.keys(dbInfo)[0]];
        if (dbName !== 'information_schema' && dbName !== 'mysql' && dbName !== 'performance_schema') {
          await connection.query(`USE ${dbName}`);
          const [dbTables] = await connection.query('SHOW TABLES');
          console.log(`  ${dbName}: ${dbTables.length} tables`);
          if (dbTables.length > 0) {
            dbTables.forEach(table => {
              console.log(`    - ${table[Object.keys(table)[0]]}`);
            });
          }
        }
      }
    } else {
      console.log(`Found ${tables.length} tables:`);
      tables.forEach((table, i) => {
        const tableName = table[Object.keys(table)[0]];
        console.log(`${i+1}. ${tableName}`);
      });
      
      // Show row counts for first few tables
      console.log('\n📈 Sample row counts:');
      const sampleTables = tables.slice(0, 5);
      for (const tableInfo of sampleTables) {
        const tableName = tableInfo[Object.keys(tableInfo)[0]];
        try {
          const [count] = await connection.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
          console.log(`  ${tableName}: ${count[0].cnt} rows`);
        } catch (e) {
          console.log(`  ${tableName}: Error counting`);
        }
      }
    }
    
    await connection.end();
    
    console.log('\n✅ Diagnosis complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Note down your database name and tables');
    console.log('2. Update the migration script with correct database name');
    console.log('3. Run: node migrate-fixed.js');
    
  } catch (error) {
    console.error('❌ Diagnosis failed:', error.message);
  }
}

diagnose();
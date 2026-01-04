// migrate.js
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateDatabase() {
  console.log('🚀 Starting database migration...\n');
  
  // Step 1: Connect to local MariaDB
  console.log('1. Connecting to local MariaDB...');
  const localDb = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Password$01',  // Your local MariaDB password (leave empty if none)
    database: 'core_insight'  // Your local database name
  });
  
  // Step 2: Get all tables from local
  console.log('2. Getting tables from local database...');
  const [localTables] = await localDb.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = DATABASE()
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  
  console.log(`Found ${localTables.length} tables:`);
  localTables.forEach((t, i) => console.log(`  ${i+1}. ${t.TABLE_NAME}`));
  
  // Step 3: Connect to Railway MySQL
  console.log('\n3. Connecting to Railway MySQL...');
  const railwayDb = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false },
    multipleStatements: true
  });
  
  console.log('Connected to Railway MySQL successfully!\n');
  
  // Step 4: Migrate each table
  console.log('4. Starting table migration...');
  
  for (const tableInfo of localTables) {
    const tableName = tableInfo.TABLE_NAME;
    
    try {
      console.log(`\n📦 Migrating: ${tableName}`);
      
      // 4a. Get table structure from local
      const [createTable] = await localDb.query(`SHOW CREATE TABLE \`${tableName}\``);
      let createSQL = createTable[0]['Create Table'];
      
      // 4b. Clean for MySQL compatibility
      createSQL = createSQL.replace(/ENGINE=InnoDB AUTO_INCREMENT=\d+ /, '');
      createSQL = createSQL.replace(/DEFAULT CHARSET=utf8mb4 /, '');
      createSQL = createSQL.replace(/COLLATE=utf8mb4_general_ci /, '');
      
      console.log(`  ✅ Got table structure`);
      
      // 4c. Create table in Railway
      await railwayDb.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      await railwayDb.query(createSQL);
      console.log(`  ✅ Table created in Railway`);
      
      // 4d. Get data from local
      const [rows] = await localDb.query(`SELECT * FROM \`${tableName}\``);
      
      if (rows.length > 0) {
        console.log(`  📊 Found ${rows.length} rows to transfer`);
        
        // Insert data in batches of 50
        const batchSize = 50;
        let insertedCount = 0;
        
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          
          // Build INSERT statement for batch
          const columns = Object.keys(batch[0]).map(col => `\`${col}\``).join(', ');
          
          const values = batch.map(row => {
            return '(' + Object.values(row).map(val => {
              if (val === null) return 'NULL';
              if (typeof val === 'string') {
                // Escape single quotes and special characters
                return railwayDb.escape(val);
              }
              if (val instanceof Date) {
                return railwayDb.escape(val.toISOString().slice(0, 19).replace('T', ' '));
              }
              return val;
            }).join(', ') + ')';
          }).join(', ');
          
          await railwayDb.query(`INSERT INTO \`${tableName}\` (${columns}) VALUES ${values}`);
          insertedCount += batch.length;
          console.log(`    ➤ Inserted ${insertedCount}/${rows.length} rows`);
        }
        
        console.log(`  ✅ Successfully transferred ${rows.length} rows`);
      } else {
        console.log(`  ℹ️  Table is empty, no data to transfer`);
      }
      
    } catch (error) {
      console.log(`  ❌ Error migrating ${tableName}: ${error.message}`);
      console.log(`  ⚠️  Continuing with next table...`);
    }
  }
  
  // Step 5: Cleanup and verification
  console.log('\n5. Verifying migration...');
  
  // Get counts from both databases
  console.log('\n📊 Migration Summary:');
  console.log('=' .repeat(40));
  
  for (const tableInfo of localTables) {
    const tableName = tableInfo.TABLE_NAME;
    
    try {
      const [localCount] = await localDb.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
      const [railwayCount] = await railwayDb.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
      
      const status = localCount[0].count === railwayCount[0].count ? '✅' : '❌';
      console.log(`${status} ${tableName}: Local=${localCount[0].count} | Railway=${railwayCount[0].count}`);
      
    } catch (error) {
      console.log(`❌ ${tableName}: Error - ${error.message}`);
    }
  }
  
  // Step 6: Close connections
  await localDb.end();
  await railwayDb.end();
  
  console.log('\n' + '=' .repeat(40));
  console.log('🎉 Migration complete!');
  console.log('Your data is now available at: https://core-insight-7.onrender.com');
  console.log('\n⚠️  IMPORTANT: Delete or secure your .env file after migration!');
}

// Run the migration
migrateDatabase().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
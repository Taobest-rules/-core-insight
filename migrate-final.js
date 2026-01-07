// migrate-final.js
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateDatabase() {
  console.log('🚀 Starting database migration from local to Railway...\n');
  
  // Step 1: Connect to local MariaDB
  console.log('1. Connecting to local MariaDB...');
  const localDb = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'core_insight',
    authPlugins: {
      mysql_native_password: () => require('mysql2/lib/auth/mysql_native_password')
    }
  });
  
  console.log('✅ Connected to local MariaDB\n');
  
  // Step 2: Get all tables
  console.log('2. Getting tables...');
  const [tables] = await localDb.query('SHOW TABLES');
  const tableNames = tables.map(table => table[Object.keys(table)[0]]);
  
  console.log(`Found ${tableNames.length} tables to migrate\n`);
  
  // Step 3: Connect to Railway MySQL
  console.log('3. Connecting to Railway MySQL...');
  const railwayDb = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false },
    multipleStatements: true
  });
  
  console.log('✅ Connected to Railway MySQL\n');
  
  // Step 4: Create a log file
  const fs = require('fs');
  const logStream = fs.createWriteStream('migration-log.txt', { flags: 'a' });
  logStream.write(`Migration started: ${new Date().toISOString()}\n`);
  logStream.write(`Tables to migrate: ${tableNames.length}\n\n`);
  
  // Step 5: Migrate tables
  console.log('4. Starting table migration...\n');
  console.log('=' .repeat(60));
  
  let migratedCount = 0;
  let errorCount = 0;
  
  for (const tableName of tableNames) {
    try {
      console.log(`📦 ${tableName}`);
      logStream.write(`Table: ${tableName} - `);
      
      // Get table structure
      const [createTable] = await localDb.query(`SHOW CREATE TABLE \`${tableName}\``);
      let createSQL = createTable[0]['Create Table'];
      
      // Clean for MySQL compatibility
      createSQL = createSQL.replace(/ENGINE=InnoDB AUTO_INCREMENT=\d+\s*/, '');
      createSQL = createSQL.replace(/DEFAULT CHARSET=\w+\s*/, '');
      createSQL = createSQL.replace(/COLLATE=\w+\s*/, '');
      
      // Drop existing table in Railway
      await railwayDb.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      
      // Create table in Railway
      await railwayDb.query(createSQL);
      console.log(`  ✅ Structure created`);
      
      // Get data
      const [rows] = await localDb.query(`SELECT * FROM \`${tableName}\``);
      
      if (rows.length > 0) {
        console.log(`  📊 Rows: ${rows.length}`);
        
        // Get column names
        const columns = Object.keys(rows[0]).map(col => `\`${col}\``).join(', ');
        
        // Insert in batches of 50
        const batchSize = 50;
        let inserted = 0;
        
        while (inserted < rows.length) {
          const batch = rows.slice(inserted, inserted + batchSize);
          
          const values = batch.map(row => {
            return '(' + Object.values(row).map(val => {
              if (val === null) return 'NULL';
              if (typeof val === 'string') return railwayDb.escape(val);
              if (val instanceof Date) {
                return railwayDb.escape(val.toISOString().slice(0, 19).replace('T', ' '));
              }
              return val;
            }).join(', ') + ')';
          }).join(', ');
          
          await railwayDb.query(`INSERT INTO \`${tableName}\` (${columns}) VALUES ${values}`);
          inserted += batch.length;
          
          // Show progress every 10%
          if (Math.floor(inserted / rows.length * 10) !== Math.floor((inserted - batch.length) / rows.length * 10)) {
            const percent = Math.floor(inserted / rows.length * 100);
            console.log(`    ${percent}% complete (${inserted}/${rows.length})`);
          }
        }
        
        console.log(`  ✅ Data migrated: ${rows.length} rows`);
        logStream.write(`Migrated ${rows.length} rows\n`);
        migratedCount++;
      } else {
        console.log(`  ℹ️  Empty table`);
        logStream.write(`Empty table\n`);
        migratedCount++;
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      logStream.write(`ERROR: ${error.message}\n`);
      errorCount++;
    }
    
    console.log('');
  }
  
  // Step 6: Close connections and log
  await localDb.end();
  await railwayDb.end();
  logStream.write(`\nMigration completed: ${new Date().toISOString()}\n`);
  logStream.write(`Successfully migrated: ${migratedCount} tables\n`);
  logStream.write(`Failed: ${errorCount} tables\n`);
  logStream.end();
  
  // Step 7: Show summary
  console.log('=' .repeat(60));
  console.log('\n📊 MIGRATION COMPLETE!');
  console.log('=' .repeat(60));
  console.log(`✅ Successfully migrated: ${migratedCount} tables`);
  console.log(`❌ Failed: ${errorCount} tables`);
  console.log(`📈 Total attempted: ${tableNames.length} tables`);
  
  // Check essential tables
  console.log('\n🔍 Verifying essential tables...');
  
  const railwayDb2 = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false }
  });
  
  const essentialTables = ['products', 'users', 'courses', 'services', 'orders'];
  
  for (const table of essentialTables) {
    try {
      const [count] = await railwayDb2.query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
      console.log(`  ${table}: ${count[0].cnt} rows`);
    } catch (error) {
      console.log(`  ${table}: ❌ Not found - ${error.message}`);
    }
  }
  
  await railwayDb2.end();
  
  console.log('\n' + '=' .repeat(60));
  console.log('🎉 MIGRATION SUCCESSFUL!');
  console.log('\n💡 Next steps:');
  console.log('1. Visit: https://core-insight-7.onrender.com');
  console.log('2. Check if all data displays correctly');
  console.log('3. Test login with existing users');
  console.log('4. Check products, courses, and services');
  console.log('\n📝 Log saved to: migration-log.txt');
  console.log('⚠️  Remember to delete .env file after migration!');
}

// Run migration
migrateDatabase().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
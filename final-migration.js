// final-migration.js - Direct migration (no export/import files needed)
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  console.log('🚀 DIRECT MIGRATION: Local MariaDB → Railway MySQL\n');
  
  // ========== STEP 1: CONNECT TO LOCAL ==========
  console.log('1. 📍 Connecting to LOCAL MariaDB (your computer)...');
  const localDb = await mysql.createConnection({
    host: 'localhost',           // Your computer
    user: 'root',                // Local username
    password: '',                // Local password (empty)
    database: 'core_insight',    // Your local database
    port: 3306
  });
  console.log('   ✅ Connected to localhost\n');
  
  // ========== STEP 2: CONNECT TO RAILWAY ==========
  console.log('2. ☁️  Connecting to RAILWAY MySQL...');
  console.log('   Host:', process.env.DB_HOST || 'trolley.proxy.rlwy.net');
  console.log('   Port:', process.env.DB_PORT || '59121');
  
  const railwayDb = await mysql.createConnection({
    host: process.env.DB_HOST || 'trolley.proxy.rlwy.net',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'ZrZXNxoFhuQrWaqxcnEXErHkoNmzMiGa', // ← REPLACE
    database: process.env.DB_NAME || 'railway',
    port: Number(process.env.DB_PORT) || 59121,
    ssl: { rejectUnauthorized: false },
    multipleStatements: true
  });
  console.log('   ✅ Connected to Railway\n');
  
  // ========== STEP 3: GET LOCAL TABLES ==========
  console.log('3. 📋 Getting tables from local database...');
  const [tables] = await localDb.query('SHOW TABLES');
  const tableNames = tables.map(row => row[Object.keys(row)[0]]);
  
  console.log(`   Found ${tableNames.length} tables:\n`);
  
  // Show table list with row counts
  const essentialTables = ['products', 'users', 'courses', 'services', 'orders'];
  
  for (const tableName of essentialTables) {
    if (tableNames.includes(tableName)) {
      const [count] = await localDb.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      console.log(`   ${tableName.padEnd(20)}: ${count[0].cnt} rows`);
    }
  }
  
  // ========== STEP 4: MIGRATE TABLES ==========
  console.log('\n4. 🚀 Starting migration...\n');
  console.log('='.repeat(60));
  
  let migrated = 0;
  let errors = 0;
  
  // Migrate essential tables first
  for (const tableName of essentialTables) {
    if (tableNames.includes(tableName)) {
      const success = await copyTable(localDb, railwayDb, tableName);
      if (success) migrated++;
      else errors++;
    }
  }
  
  // ========== STEP 5: VERIFY ==========
  console.log('\n' + '='.repeat(60));
  console.log('5. 🔍 Verifying migration...\n');
  
  for (const tableName of essentialTables) {
    try {
      const [railwayCount] = await railwayDb.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      const [localCount] = await localDb.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      
      if (railwayCount[0].cnt === localCount[0].cnt) {
        console.log(`   ${tableName.padEnd(15)}: ✅ ${railwayCount[0].cnt} rows (Match!)`);
      } else {
        console.log(`   ${tableName.padEnd(15)}: ⚠️  Local:${localCount[0].cnt} Railway:${railwayCount[0].cnt}`);
      }
    } catch (error) {
      console.log(`   ${tableName.padEnd(15)}: ❌ Not found in Railway`);
    }
  }
  
  // ========== STEP 6: CLEANUP ==========
  await localDb.end();
  await railwayDb.end();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully migrated: ${migrated} tables`);
  console.log(`❌ Failed: ${errors} tables`);
  console.log(`📈 Total essential tables: ${essentialTables.length}`);
  
  console.log('\n🎉 MIGRATION COMPLETE!');
  console.log('\n💡 Next steps:');
  console.log('1. Visit: https://core-insight-7.onrender.com');
  console.log('2. Products should now display');
  console.log('3. Test user login');
  console.log('4. Check all features');
  
  if (errors > 0) {
    console.log('\n⚠️  Some tables failed. Your app should still work');
    console.log('   with the essential tables that migrated successfully.');
  }
}

async function copyTable(localDb, railwayDb, tableName) {
  console.log(`📦 ${tableName}`);
  
  try {
    // Get table structure from local
    const [createResult] = await localDb.query(`SHOW CREATE TABLE \`${tableName}\``);
    let sql = createResult[0]['Create Table'];
    
    // Clean SQL for Railway
    sql = sql.replace(/AUTO_INCREMENT=\d+/g, 'AUTO_INCREMENT=1');
    sql = sql.replace(/DEFINER=`[^`]+`@`[^`]+`/g, '');
    sql = sql.replace(/\/\*!.*?\*\//g, '');
    
    // Drop existing table in Railway
    await railwayDb.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    
    // Create table in Railway
    await railwayDb.query(sql);
    console.log(`   ✅ Table created`);
    
    // Get data from local
    const [rows] = await localDb.query(`SELECT * FROM \`${tableName}\``);
    
    if (rows.length > 0) {
      console.log(`   📊 Rows: ${rows.length}`);
      
      // Get column names
      const columns = Object.keys(rows[0]).map(col => `\`${col}\``).join(', ');
      
      // Insert in batches of 100
      const batchSize = 100;
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
        
        // Show progress
        if (Math.floor(inserted / rows.length * 4) !== Math.floor((inserted - batchSize) / rows.length * 4)) {
          const percent = Math.floor(inserted / rows.length * 100);
          console.log(`      ${percent}% complete (${inserted}/${rows.length})`);
        }
      }
      
      console.log(`   ✅ Data transferred`);
    } else {
      console.log(`   ℹ️  Empty table`);
    }
    
    return true;
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

// Run migration
migrate().catch(error => {
  console.error('❌ Migration failed:', error.message);
  console.log('\n💡 Common fixes:');
  console.log('1. Check Railway password in the script');
  console.log('2. Make sure Railway database is running');
  console.log('3. Check if port 59121 is correct');
});
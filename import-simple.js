// import-simple.js - Simple import without local DB connection
const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

async function importToRailway() {
  console.log('🚀 Importing SQL to Railway...\n');
  
  // Connect to RAILWAY only (no local connection needed!)
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'trolley.proxy.rlwy.net',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'ZrZXNxoFhuQrWaqxcnEXErHkoNmzMiGa', // ← REPLACE THIS
    database: process.env.DB_NAME || 'railway',
    port: Number(process.env.DB_PORT) || 59121,
    ssl: { rejectUnauthorized: false },
    multipleStatements: true
  });
  
  console.log('✅ Connected to Railway MySQL\n');
  
  // Read the cleaned SQL file
  console.log('Reading SQL file...');
  const sql = fs.readFileSync('cleaned.sql', 'utf8');
  
  console.log('Executing SQL (this may take a minute)...\n');
  
  // Split into statements and execute one by one
  const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
  
  let success = 0;
  let errors = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i].trim() + ';';
    
    try {
      await connection.query(statement);
      success++;
      
      // Show progress
      if (i % 20 === 0) {
        const percent = Math.floor((i / statements.length) * 100);
        console.log(`Progress: ${percent}% (${i}/${statements.length} statements)`);
      }
    } catch (error) {
      errors++;
      
      // Skip common errors (duplicate tables, etc.)
      if (!error.message.includes('already exists') && 
          !error.message.includes('Duplicate')) {
        console.log(`Error in statement ${i}: ${error.message.substring(0, 100)}...`);
      }
    }
  }
  
  await connection.end();
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 IMPORT COMPLETE');
  console.log('='.repeat(50));
  console.log(`✅ Successful: ${success} statements`);
  console.log(`❌ Errors: ${errors} statements`);
  console.log(`📈 Total: ${statements.length} statements`);
  
  // Verify
  console.log('\n🔍 Verifying import...');
  await verifyImport();
}

async function verifyImport() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'trolley.proxy.rlwy.net',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'ZrZXNxoFhuQrWaqxcnEXErHkoNmzMiGa', // ← SAME PASSWORD
    database: process.env.DB_NAME || 'railway',
    port: Number(process.env.DB_PORT) || 59121,
    ssl: { rejectUnauthorized: false }
  });
  
  const tables = ['products', 'users', 'courses'];
  
  console.log('\n📊 Table counts:');
  for (const table of tables) {
    try {
      const [result] = await connection.query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
      console.log(`  ${table}: ${result[0].cnt} rows`);
    } catch (error) {
      console.log(`  ${table}: ❌ Not found`);
    }
  }
  
  await connection.end();
  
  console.log('\n🎉 Import complete!');
  console.log('Visit: https://core-insight-7.onrender.com');
}

importToRailway().catch(console.error);
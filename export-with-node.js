// export-with-node.js
const mysql = require('mysql2');
const fs = require('fs');

console.log('📦 Exporting database using Node.js...\n');

// Create connection (non-promise version worked in diagnostic)
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Password$01',  // Empty password (worked in diagnostic)
  database: 'core_insight'
});

connection.connect(async (err) => {
  if (err) {
    console.error('❌ Connection failed:', err.message);
    
    // Try with different configurations
    console.log('\n💡 Trying alternative connections...');
    
    const configs = [
      { host: 'localhost', user: 'root', password: 'root' },
      { host: '127.0.0.1', user: 'root', password: '' },
      { host: 'localhost', user: 'root', password: undefined }
    ];
    
    for (const config of configs) {
      console.log(`Trying: ${config.user}@${config.host} (password: ${config.password || 'empty'})`);
      
      const testConn = mysql.createConnection({ ...config, database: 'core_insight' });
      
      testConn.connect((testErr) => {
        if (!testErr) {
          console.log(`✅ Success with: ${config.user}@${config.host}`);
          exportDatabase(testConn);
          return;
        }
        testConn.end();
      });
    }
    
    return;
  }
  
  console.log('✅ Connected to local database');
  exportDatabase(connection);
});

function exportDatabase(conn) {
  console.log('\n1. Getting table list...');
  
  conn.query('SHOW TABLES', (err, tables) => {
    if (err) {
      console.error('❌ Error getting tables:', err.message);
      conn.end();
      return;
    }
    
    const tableNames = tables.map(row => row[Object.keys(row)[0]]);
    console.log(`✅ Found ${tableNames.length} tables\n`);
    
    let exportSQL = '';
    let processedTables = 0;
    
    // Process each table
    tableNames.forEach(tableName => {
      console.log(`Exporting: ${tableName}`);
      
      // Get table structure
      conn.query(`SHOW CREATE TABLE \`${tableName}\``, (err, results) => {
        if (err) {
          console.log(`  ❌ Error getting structure: ${err.message}`);
          checkComplete();
          return;
        }
        
        const createSQL = results[0]['Create Table'];
        
        // Clean the SQL
        let cleanedSQL = createSQL
          .replace(/AUTO_INCREMENT=\d+/g, 'AUTO_INCREMENT=1')
          .replace(/DEFINER=`[^`]+`@`[^`]+`/g, '')
          .replace(/\/\*!.*?\*\//g, '');
        
        exportSQL += `\n-- Table structure for ${tableName}\n`;
        exportSQL += `${cleanedSQL};\n\n`;
        exportSQL += `-- Data for ${tableName}\n`;
        
        // Get table data
        conn.query(`SELECT * FROM \`${tableName}\``, (err, rows) => {
          if (err) {
            console.log(`  ❌ Error getting data: ${err.message}`);
            exportSQL += `-- No data or error\n\n`;
            checkComplete();
            return;
          }
          
          console.log(`  📊 Rows: ${rows.length}`);
          
          if (rows.length > 0) {
            // Build INSERT statements
            const columns = Object.keys(rows[0]).map(col => `\`${col}\``).join(', ');
            
            rows.forEach(row => {
              const values = Object.values(row).map(val => {
                if (val === null) return 'NULL';
                if (typeof val === 'string') return conn.escape(val);
                if (val instanceof Date) {
                  return conn.escape(val.toISOString().slice(0, 19).replace('T', ' '));
                }
                return val;
              }).join(', ');
              
              exportSQL += `INSERT INTO \`${tableName}\` (${columns}) VALUES (${values});\n`;
            });
          } else {
            exportSQL += `-- Table is empty\n`;
          }
          
          exportSQL += '\n';
          checkComplete();
        });
      });
    });
    
    function checkComplete() {
      processedTables++;
      if (processedTables === tableNames.length) {
        // All tables processed, save to file
        fs.writeFileSync('local_dump.sql', exportSQL);
        console.log('\n' + '=' .repeat(50));
        console.log('✅ EXPORT COMPLETE!');
        console.log(`📁 File saved: local_dump.sql`);
        console.log(`📊 Size: ${Math.round(exportSQL.length / 1024)} KB`);
        console.log(`📋 Tables exported: ${tableNames.length}`);
        console.log('\n💡 Next: Run: node clean-sql.js');
        
        conn.end();
      }
    }
  });
}
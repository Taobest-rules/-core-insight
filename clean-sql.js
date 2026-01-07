// clean-sql.js
const fs = require('fs');

console.log('Cleaning SQL dump for Railway...');

try {
  let sql = fs.readFileSync('local_dump.sql', 'utf8');
  
  console.log('Original size:', Math.round(sql.length / 1024), 'KB');
  
  // Fixes for Railway compatibility:
  
  // 1. Remove DEFINER clauses
  sql = sql.replace(/DEFINER=`[^`]+`@`[^`]+`/g, '');
  
  // 2. Remove AUTO_INCREMENT values
  sql = sql.replace(/AUTO_INCREMENT=\d+/g, '');
  
  // 3. Remove MySQL specific comments
  sql = sql.replace(/\/\*!.*?\*\//g, '');
  
  // 4. Remove ENGINE clauses
  sql = sql.replace(/ENGINE=\w+/g, '');
  
  // 5. Remove CHARACTER SET and COLLATE
  sql = sql.replace(/CHARACTER SET \w+/g, '');
  sql = sql.replace(/COLLATE \w+/g, '');
  
  // 6. Remove row format
  sql = sql.replace(/ROW_FORMAT=\w+/g, '');
  
  // 7. Remove extra spaces and newlines
  sql = sql.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Write cleaned file
  fs.writeFileSync('cleaned_for_railway.sql', sql);
  
  console.log('✅ SQL cleaned successfully!');
  console.log('Cleaned file: cleaned_for_railway.sql');
  console.log('Cleaned size:', Math.round(sql.length / 1024), 'KB');
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
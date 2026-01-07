// clean-sql-simple.js
const fs = require('fs');

console.log('Cleaning SQL for Railway import...\n');

try {
  // Read the SQL file you already exported
  let sql = fs.readFileSync('local_dump.sql', 'utf8');
  
  console.log('Original size:', Math.round(sql.length / 1024), 'KB');
  
  // Simple cleaning - just fix the most critical issues
  let cleaned = '';
  const lines = sql.split('\n');
  
  for (let line of lines) {
    // Skip problematic lines
    if (line.includes('DEFINER=')) continue;
    if (line.includes('/*!')) continue;
    if (line.includes('AUTO_INCREMENT=')) {
      line = line.replace(/AUTO_INCREMENT=\d+/, '');
    }
    if (line.includes('ENGINE=')) {
      line = line.replace(/ENGINE=\w+/, '');
    }
    if (line.includes('CHARACTER SET')) {
      line = line.replace(/CHARACTER SET \w+/, '');
    }
    if (line.includes('COLLATE')) {
      line = line.replace(/COLLATE \w+/, '');
    }
    
    cleaned += line + '\n';
  }
  
  // Write cleaned file
  fs.writeFileSync('cleaned.sql', cleaned);
  
  console.log('✅ Cleaned SQL saved: cleaned.sql');
  console.log('Cleaned size:', Math.round(cleaned.length / 1024), 'KB');
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
// fix-all-db.js - Fix all db.query to pool.query
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing all db.query to pool.query...\n');

// Read index.js
const filePath = path.join(__dirname, 'index.js');
let content = fs.readFileSync(filePath, 'utf8');

// Count current usage
const dbCount = (content.match(/db\.query/g) || []).length;
const poolCount = (content.match(/pool\.query/g) || []).length;
console.log(`Current: db.query = ${dbCount}, pool.query = ${poolCount}\n`);

// Fix 1: Change the import line
if (content.includes('const pool = require(\'./db\')')) {
  content = content.replace('const pool = require(\'./db\')', 'const db = require(\'./db\')');
  console.log('✅ Fixed import: changed pool to db');
} else if (content.includes('const pool = require("./db")')) {
  content = content.replace('const pool = require("./db")', 'const db = require("./db")');
  console.log('✅ Fixed import: changed pool to db');
}

// Fix 2: Change all db.query to pool.query? NO! Keep as db.query
// Actually, we need to check what's at the top and be consistent

// Check what import we have now
const hasDbImport = content.includes('const db = require');
const hasPoolImport = content.includes('const pool = require');

if (hasDbImport && !hasPoolImport) {
  console.log('✅ Using db consistently - no changes needed to queries');
} else if (hasPoolImport && !hasDbImport) {
  // Change all db.query to pool.query
  content = content.replace(/db\.query/g, 'pool.query');
  console.log('✅ Changed all db.query to pool.query');
} else {
  // We have both or neither - standardize to db
  console.log('⚠️  Found mixed imports, standardizing to db...');
  
  // Remove any pool import
  content = content.replace(/const pool = require\([^)]+db[^)]*\);/g, '');
  
  // Add db import if missing
  if (!content.includes('const db = require')) {
    // Add after other requires
    const requireIndex = content.indexOf('require(');
    if (requireIndex > -1) {
      content = content.substring(0, requireIndex) + 'const db = require(\'./db\');\n' + content.substring(requireIndex);
    }
  }
  
  console.log('✅ Standardized to db import');
}

// Write back
fs.writeFileSync(filePath, content);

// Verify
const newContent = fs.readFileSync(filePath, 'utf8');
const newDbCount = (newContent.match(/db\.query/g) || []).length;
const newPoolCount = (newContent.match(/pool\.query/g) || []).length;

console.log(`\n✅ Fixed!`);
console.log(`New counts: db.query = ${newDbCount}, pool.query = ${newPoolCount}`);

if (newPoolCount > 0 && newDbCount > 0) {
  console.log('\n⚠️  WARNING: You still have mixed usage!');
  console.log('   Check lines containing .query:');
  const lines = newContent.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('.query')) {
      console.log(`   Line ${i+1}: ${line.trim().substring(0, 80)}...`);
    }
  });
} else if (newDbCount > 0) {
  console.log('🎉 All queries now use db.query() consistently!');
} else if (newPoolCount > 0) {
  console.log('🎉 All queries now use pool.query() consistently!');
}

console.log('\n💡 Next steps:');
console.log('1. Commit: git add index.js');
console.log('2. Commit: git commit -m "Fix database variable consistency"');
console.log('3. Push: git push origin main');
console.log('4. Wait for Render to redeploy');
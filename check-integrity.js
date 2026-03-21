// scripts/check-integrity.js
const fs = require('fs');
const path = require('path');
const db = require('../db');

async function checkIntegrity() {
  console.log('🔍 Running integrity check...', new Date().toISOString());
  
  try {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'courses');
    const courses = await db.query('SELECT id, title, file_path FROM courses');
    
    const missing = [];
    
    for (const course of courses) {
      if (course.file_path) {
        const filename = path.basename(course.file_path);
        const filePath = path.join(uploadDir, filename);
        
        if (!fs.existsSync(filePath)) {
          missing.push({
            id: course.id,
            title: course.title,
            expected_path: course.file_path
          });
          console.log(`❌ Missing: ${course.title} (${course.id})`);
        }
      }
    }
    
    if (missing.length > 0) {
      console.log(`⚠️ Found ${missing.length} missing files`);
      
      // Optional: Send alert email
      // await sendAlertEmail(missing);
    } else {
      console.log('✅ All files verified');
    }
    
    return { missing, timestamp: new Date().toISOString() };
    
  } catch (error) {
    console.error('Integrity check failed:', error);
    return { error: error.message };
  }
}

// Run if called directly
if (require.main === module) {
  checkIntegrity().then(result => {
    console.log('Check complete:', result);
    process.exit(0);
  });
}

module.exports = checkIntegrity;
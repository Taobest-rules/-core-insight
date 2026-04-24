const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const mysql = require('mysql2/promise');
const axios = require('axios');
const fs = require('fs');
const path = require('path');


const RCLONE_PATH = 'C:\\Windows\\rclone.exe';
const MEGA_REMOTE = 'mega';

async function migrateLiveCourses() {
  console.log('🔄 Starting LIVE courses migration to MEGA...\n');
  
  let connection;
  try {
    console.log('🔌 Connecting to production database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to production database');
    
    // Get all courses
    const [courses] = await connection.execute(
      'SELECT id, title, file_url, file_path FROM courses WHERE file_url IS NOT NULL'
    );
    
    console.log(`📚 Found ${courses.length} courses to migrate\n`);
    
    let migrated = 0;
    let failed = 0;
    
    for (const course of courses) {
      console.log(`\n📖 Processing course #${course.id}: ${course.title || 'Untitled'}`);
      
      if (course.file_url && course.file_url.includes('mega:')) {
        console.log(`   ⏭️ Already on MEGA, skipping`);
        continue;
      }
      
      const currentUrl = course.file_url;
      console.log(`   🔗 Current URL: ${currentUrl}`);
      
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFile = path.join(tempDir, `course_${course.id}_${Date.now()}.tmp`);
      
      try {
        // Download file
        console.log(`   📥 Downloading...`);
        const response = await axios({
          method: 'GET',
          url: currentUrl,
          responseType: 'stream',
          timeout: 60000
        });
        
        const writer = fs.createWriteStream(tempFile);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        
        console.log(`   ✅ Downloaded`);
        
        // Upload to MEGA
        const folderName = `/courses/${course.id}_${course.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}`;
        const filename = `course_${course.id}_material.pdf`;
        const remotePath = `${MEGA_REMOTE}:${folderName}/${filename}`;
        
        console.log(`   📤 Uploading to MEGA...`);
        await execPromise(`"${RCLONE_PATH}" mkdir "${MEGA_REMOTE}:${folderName}"`);
        await execPromise(`"${RCLONE_PATH}" copy "${tempFile}" "${remotePath}"`);
        
        // Update database
        await connection.execute(
          'UPDATE courses SET file_url = ? WHERE id = ?',
          [remotePath, course.id]
        );
        
        console.log(`   ✅ Migrated successfully!`);
        migrated++;
        
        // Cleanup
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
        failed++;
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Migrated: ${migrated}`);
    console.log(`❌ Failed: ${failed}`);
    
  } catch (error) {
    console.error('❌ Migration error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

migrateLiveCourses();
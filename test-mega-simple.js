require('dotenv').config();
const { Mega } = require('mega');
const fs = require('fs');

async function testMega() {
  console.log('🔍 Testing MEGA connection...');
  
  try {
    // Create Mega instance
    const mega = new Mega({
      email: process.env.MEGA_EMAIL,
      password: process.env.MEGA_PASSWORD
    });
    
    // Login
    await mega.login();
    console.log('✅ Logged in successfully!');
    
    // Create test buffer
    const testContent = `MEGA Test
Time: ${new Date().toISOString()}
This is a test file.`;
    
    const buffer = Buffer.from(testContent, 'utf-8');
    
    // Upload file
    console.log('📤 Uploading test file...');
    const uploadedFile = await mega.upload(buffer, 'test.txt');
    
    // Get link
    const link = await uploadedFile.link();
    console.log('✅ Upload successful!');
    console.log('🔗 File URL:', link);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

testMega();
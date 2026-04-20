require('dotenv').config();

console.log('📋 Checking environment variables...');
console.log('MEGA_EMAIL:', process.env.MEGA_EMAIL ? '✅ Set' : '❌ Missing');
console.log('MEGA_PASSWORD:', process.env.MEGA_PASSWORD ? '✅ Set' : '❌ Missing');

if (!process.env.MEGA_EMAIL || !process.env.MEGA_PASSWORD) {
  console.error('\n❌ Please add MEGA_EMAIL and MEGA_PASSWORD to your .env file');
  process.exit(1);
}

const megaService = require('./services/mega.service');

async function testMega() {
  console.log('\n🔍 Testing MEGA connection...');
  
  const connected = await megaService.testConnection();
  
  if (!connected) {
    console.log('❌ Please check your MEGA credentials');
    return;
  }
  
  const testContent = `MEGA Test File
Uploaded at: ${new Date().toISOString()}
This is a test to verify MEGA integration.`;
  
  const testBuffer = Buffer.from(testContent, 'utf-8');
  
  try {
    console.log('\n📤 Uploading test file...');
    const url = await megaService.uploadBuffer(testBuffer, 'test.txt', '/test');
    console.log('\n✅ Upload successful!');
    console.log('🔗 File URL:', url);
  } catch (error) {
    console.error('\n❌ Upload failed:', error.message);
  }
}

testMega();

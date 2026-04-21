require('dotenv').config();
const megaService = require('./services/mega.service');
const fs = require('fs');

async function test() {
  console.log('🔍 Testing MEGA with Node.js...\n');
  
  await megaService.testConnection();
  
  const testPath = './node-test.txt';
  fs.writeFileSync(testPath, `Node.js MEGA Test
Time: ${new Date().toISOString()}
This is uploaded from your Node.js application!`);
  
  try {
    console.log('\n📤 Uploading via Node.js...');
    const url = await megaService.uploadFile(testPath, 'node-test.txt', '/test');
    console.log('\n✅ Upload successful!');
    console.log('🔗 File URL:', url);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
  }
}

test();
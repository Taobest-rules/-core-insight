require('dotenv').config();
const megaService = require('./services/mega.service');
const fs = require('fs');

async function test() {
  console.log('🔍 Testing MEGA storage...');
  
  // Test connection
  await megaService.testConnection();
  
  // Create test file
  const testContent = `Test upload from Core Insight
Time: ${new Date().toISOString()}
This is a test.`;
  
  const testPath = './test-file.txt';
  fs.writeFileSync(testPath, testContent);
  
  // Upload to MEGA
  const url = await megaService.uploadFile(testPath, 'test.txt', '/test');
  console.log('✅ Upload successful!');
  console.log('🔗 File URL:', url);
  
  // Cleanup
  fs.unlinkSync(testPath);
}

test(); 
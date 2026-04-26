require('dotenv').config();
const imgbbService = require('./services/imgbb-simple.service');
const fs = require('fs');

async function test() {
  console.log('🔍 Testing ImgBB upload...');
  
  // Create a simple test image (1x1 pixel PNG)
  const imageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  
  try {
    const result = await imgbbService.uploadBuffer(imageBuffer, 'test.png');
    console.log('✅ Upload successful!');
    console.log('🔗 Image URL:', result.url);
    console.log('📷 Display URL:', result.display_url);
    console.log('🗑️ Delete URL:', result.delete_url);
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
  }
}

test();
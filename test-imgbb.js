// test-imgbb.js - Run with: node test-imgbb.js
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

// Your ImgBB API key from .env
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || 'YOUR_API_KEY_HERE';

async function testImgBB() {
  console.log('🧪 Testing ImgBB upload...');
  console.log('API Key present:', !!IMGBB_API_KEY);
  console.log('API Key length:', IMGBB_API_KEY?.length);
  
  // Create a simple test image (1x1 pixel PNG)
  const testImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  
  try {
    const formData = new FormData();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', testImage.toString('base64'));
    formData.append('name', 'test.png');
    
    const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });
    
    console.log('✅ ImgBB Test Successful!');
    console.log('Response:', response.data);
    console.log('Image URL:', response.data.data?.url);
    
  } catch (error) {
    console.error('❌ ImgBB Test Failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testImgBB();
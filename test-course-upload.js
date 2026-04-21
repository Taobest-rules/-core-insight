const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function testCourseUpload() {
  const form = new FormData();
  form.append('title', 'Test MEGA Course');
  form.append('description', 'This is a test course uploaded to MEGA');
  form.append('price', '0');
  form.append('content_type', 'book');
  form.append('file', fs.createReadStream('./test.txt'));
  form.append('thumbnail', fs.createReadStream('./test.txt')); // Use any image file
  
  try {
    const response = await axios.post('http://localhost:3000/api/courses', form, {
      headers: {
        ...form.getHeaders()
      },
      withCredentials: true
    });
    
    console.log('Upload response:', response.data);
  } catch (error) {
    console.error('Upload failed:', error.response?.data || error.message);
  }
}

testCourseUpload();
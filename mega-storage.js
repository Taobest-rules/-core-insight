const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

// ImgBB API Key - MUST be set in environment variables
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// Create temp directory with absolute path
const tempDir = path.join(__dirname, 'uploads/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure temporary storage
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '-')
      .substring(0, 50);
    cb(null, `${timestamp}-${random}-${baseName}${ext}`);
  }
});

const upload = multer({ 
  storage: tempStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// ============ UNIVERSAL UPLOAD TO IMGBB ============
const uploadToImgbb = async (filePath, filename) => {
  // Check if API key is configured
  if (!IMGBB_API_KEY) {
    console.error('❌ IMGBB_API_KEY is not set in environment variables');
    throw new Error('ImgBB API key is not configured. Please set IMGBB_API_KEY in your .env file');
  }
  
  // Validate API key format (ImgBB keys are typically 14-16 characters)
  if (IMGBB_API_KEY.length < 10 || IMGBB_API_KEY.length > 50) {
    console.warn('⚠️ IMGBB_API_KEY length seems unusual. Please verify your API key.');
  }
  
  console.log(`📤 Uploading to ImgBB: ${filename}`);
  console.log(`📊 File size: ${fs.statSync(filePath).size} bytes`);
  
  try {
    // Read file as buffer for better compatibility
    const fileBuffer = fs.readFileSync(filePath);
    
    const formData = new FormData();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', fileBuffer.toString('base64'));
    formData.append('name', filename);
    
    const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
      headers: {
        ...formData.getHeaders(),
        'Content-Type': 'multipart/form-data'
      },
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    // Check response structure
    if (response.data && response.data.status === 200 && response.data.data && response.data.data.url) {
      // Clean up temp file after successful upload
      try { 
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath); 
        }
      } catch (err) {
        console.warn('Could not delete temp file:', err.message);
      }
      
      console.log(`✅ Uploaded to ImgBB: ${response.data.data.url}`);
      return response.data.data.url;
    }
    
    // If response has error message
    if (response.data && response.data.error) {
      throw new Error(`ImgBB API error: ${response.data.error.message || JSON.stringify(response.data.error)}`);
    }
    
    throw new Error('Invalid ImgBB response structure');
    
  } catch (error) {
    // Clean up temp file on error
    try { 
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath); 
      }
    } catch (err) {}
    
    // Better error logging
    if (error.response) {
      console.error('ImgBB API Response:', error.response.data);
      throw new Error(`ImgBB upload failed: ${error.response.data?.error?.message || error.response.statusText}`);
    } else if (error.request) {
      console.error('No response from ImgBB');
      throw new Error('ImgBB server not responding. Please check your internet connection.');
    } else {
      console.error('Upload error:', error.message);
      throw error;
    }
  }
};

// Upload multiple images
const uploadMultipleImagesToImgbb = async (files) => {
  const urls = [];
  for (const file of files) {
    const url = await uploadToImgbb(file.path, file.originalname);
    urls.push(url);
  }
  return urls;
};

// Alias for backward compatibility
const uploadFileToMega = uploadToImgbb;
const uploadImageToImgbb = uploadToImgbb;

// ============ MULTER CONFIGURATIONS ============

const uploadCourse = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

const uploadProduct = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'images[]', maxCount: 10 }
]);

const uploadProductImages = upload.array('images[]', 10);
const uploadThumbnail = upload.single('thumbnail');
const uploadProfilePicture = upload.single('profile_picture');
const uploadChatImage = upload.single('image');
const uploadCertificate = upload.array('certificate_images', 5);
const uploadCourseFile = upload.single('file');
const uploadProductFile = upload.single('file');
const uploadMultipleProducts = upload.array('images[]', 10);

// Export all modules
module.exports = {
  upload,
  uploadCourse,
  uploadProduct,
  uploadProductImages,
  uploadThumbnail,
  uploadProfilePicture,
  uploadChatImage,
  uploadCertificate,
  uploadCourseFile,
  uploadProductFile,
  uploadMultipleProducts,
  uploadToImgbb,
  uploadImageToImgbb,
  uploadMultipleImagesToImgbb,
  uploadFileToMega
};
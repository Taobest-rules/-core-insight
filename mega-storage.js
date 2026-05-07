const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

// ImgBB API Key - Make sure this is in your .env file
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '6c5c6e2c4b8c3a9f6e5d4c3b2a1f0e9d8c7b6a5';

// Ensure temp directory exists
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
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    cb(null, `${timestamp}-${random}-${baseName}${ext}`);
  }
});

const upload = multer({ 
  storage: tempStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// ============ UNIVERSAL UPLOAD TO IMGBB (Images + Files) ============
const uploadToImgbb = async (filePath, filename) => {
  try {
    console.log(`📤 Uploading to ImgBB: ${filename}`);
    
    const formData = new FormData();
    formData.append('image', fs.createReadStream(filePath));
    formData.append('name', filename);
    
    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      formData,
      { 
        headers: { ...formData.getHeaders() },
        timeout: 120000 // 2 minute timeout for larger files
      }
    );
    
    if (response.data && response.data.data && response.data.data.url) {
      // Clean up temp file after successful upload
      try { fs.unlinkSync(filePath); } catch (err) {}
      
      console.log(`✅ Uploaded to ImgBB: ${response.data.data.url}`);
      return response.data.data.url;
    }
    throw new Error('Invalid ImgBB response');
  } catch (error) {
    console.error('ImgBB upload error:', error.message);
    throw new Error(`Upload failed: ${error.message}`);
  }
};

// Upload multiple images to ImgBB
const uploadMultipleImagesToImgbb = async (files) => {
  const urls = [];
  for (const file of files) {
    const url = await uploadToImgbb(file.path, file.originalname);
    urls.push(url);
  }
  return urls;
};

// ============ FILE UPLOAD FUNCTION (NOW USES IMGBB) ============
const uploadFileToMega = async (filePath, filename, folder = '/') => {
  // Just use ImgBB for everything - it's faster and more reliable
  return await uploadToImgbb(filePath, filename);
};

// ============ MULTER CONFIGURATIONS ============

// Course upload (file + thumbnail)
const uploadCourse = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Product upload (file + multiple images)
const uploadProduct = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'images[]', maxCount: 10 }
]);

// Product images only
const uploadProductImages = upload.array('images[]', 10);

// Thumbnail only
const uploadThumbnail = upload.single('thumbnail');

// Profile picture
const uploadProfilePicture = upload.single('profile_picture');

// Chat image
const uploadChatImage = upload.single('image');

// Certificate images (multiple)
const uploadCertificate = upload.array('certificate_images', 5);

// Course file only
const uploadCourseFile = upload.single('file');

// Product file only
const uploadProductFile = upload.single('file');

// Multiple product images
const uploadMultipleProducts = upload.array('images[]', 10);

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
  uploadToImgbb,                    // Main function
  uploadImageToImgbb: uploadToImgbb, // Alias for backward compatibility
  uploadMultipleImagesToImgbb,
  uploadFileToMega                  // Now uses ImgBB
};
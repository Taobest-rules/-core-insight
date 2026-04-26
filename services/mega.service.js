const multer = require('multer');
const path = require('path');
const fs = require('fs');
const megaService = require('./services/mega.service');
const imgbbService = require('./services/imgbb.service');

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

// ============ IMAGE UPLOAD FUNCTIONS (ImgBB) ============
const uploadImageToImgbb = async (filePath, filename) => {
  try {
    const result = await imgbbService.uploadFile(filePath);
    // Clean up temp file after successful upload
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.log('Could not delete temp file:', err.message);
    }
    return result.url;
  } catch (error) {
    console.error('ImgBB upload failed:', error);
    throw error;
  }
};

const uploadMultipleImagesToImgbb = async (files) => {
  const urls = [];
  for (const file of files) {
    const url = await uploadImageToImgbb(file.path, file.originalname);
    urls.push(url);
  }
  return urls;
};

// ============ FILE UPLOAD FUNCTIONS (MEGA) ============
const uploadFileToMega = async (filePath, filename, folder = '/') => {
  try {
    const result = await megaService.uploadFile(filePath, filename, folder);
    // Clean up temp file after successful upload
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.log('Could not delete temp file:', err.message);
    }
    return result.url;
  } catch (error) {
    console.error('MEGA upload failed:', error);
    throw error;
  }
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
  uploadImageToImgbb,
  uploadMultipleImagesToImgbb,
  uploadFileToMega
};
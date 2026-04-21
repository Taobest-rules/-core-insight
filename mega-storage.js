const multer = require('multer');
const path = require('path');
const fs = require('fs');
const megaService = require('./services/mega.service');

// Create temp upload directories
const tempDirs = [
  path.join(__dirname, 'uploads/temp/courses'),
  path.join(__dirname, 'uploads/temp/products'),
  path.join(__dirname, 'uploads/temp/profiles'),
  path.join(__dirname, 'uploads/temp/chat'),
  path.join(__dirname, 'uploads/temp/certificates')
];

tempDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Temporary local storage (files will be uploaded to MEGA then deleted)
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = path.join(__dirname, 'uploads/temp');
    
    if (file.fieldname === 'thumbnail' || file.fieldname === 'thumbnails') {
      uploadPath = path.join(__dirname, 'uploads/temp/courses');
    } else if (file.fieldname === 'file') {
      uploadPath = path.join(__dirname, 'uploads/temp/courses');
    } else if (file.fieldname === 'images[]' || file.fieldname === 'images') {
      uploadPath = path.join(__dirname, 'uploads/temp/products');
    } else if (file.fieldname === 'profile_picture') {
      uploadPath = path.join(__dirname, 'uploads/temp/profiles');
    } else if (file.fieldname === 'certificate_images') {
      uploadPath = path.join(__dirname, 'uploads/temp/certificates');
    } else if (file.fieldname === 'image') {
      uploadPath = path.join(__dirname, 'uploads/temp/chat');
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    cb(null, `${timestamp}-${random}-${baseName}${ext}`);
  }
});

// Create multer instances for different upload types
const upload = multer({ storage: tempStorage });

// Course upload (thumbnail + file)
const uploadCourse = multer({ storage: tempStorage }).fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Product upload (images + file)
const uploadProduct = multer({ storage: tempStorage }).fields([
  { name: 'file', maxCount: 1 },
  { name: 'images[]', maxCount: 10 }
]);

// Product images only
const uploadProductImages = multer({ storage: tempStorage }).array('images[]', 10);

// Thumbnail only
const uploadThumbnail = multer({ storage: tempStorage }).single('thumbnail');

// Profile picture
const uploadProfilePicture = multer({ storage: tempStorage }).single('profile_picture');

// Chat image
const uploadChatImage = multer({ storage: tempStorage }).single('image');

// Certificate images
const uploadCertificate = multer({ storage: tempStorage }).array('certificate_images', 5);

// Multiple product images
const uploadMultipleProducts = multer({ storage: tempStorage }).array('images[]', 10);

// Course file only
const uploadCourseFile = multer({ storage: tempStorage }).single('file');

// Product file only
const uploadProductFile = multer({ storage: tempStorage }).single('file');

// Helper function to upload to MEGA and cleanup
const uploadToMegaAndCleanup = async (filePath, filename, folder = '/') => {
  try {
    // Upload to MEGA
    const megaUrl = await megaService.uploadFile(filePath, filename, folder);
    
    // Delete local temp file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.log('Could not delete temp file:', err.message);
    }
    
    return megaUrl;
  } catch (error) {
    console.error('MEGA upload failed:', error);
    throw error;
  }
};

// Helper function to upload multiple files to MEGA
const uploadMultipleToMega = async (files, folder = '/') => {
  const uploads = [];
  for (const file of files) {
    const url = await uploadToMegaAndCleanup(file.path, file.originalname, folder);
    uploads.push(url);
  }
  return uploads;
};

module.exports = {
  // Multer instances
  upload,
  uploadCourse,
  uploadProduct,
  uploadProductImages,
  uploadThumbnail,
  uploadProfilePicture,
  uploadChatImage,
  uploadCertificate,
  uploadMultipleProducts,
  uploadCourseFile,
  uploadProductFile,
  
  // Helper functions
  uploadToMegaAndCleanup,
  uploadMultipleToMega
};
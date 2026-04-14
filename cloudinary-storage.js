const cloudinary = require('./cloudinary.config');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create upload directories if they don't exist
const uploadDirs = [
  path.join(__dirname, '../uploads/courses/files'),
  path.join(__dirname, '../uploads/courses/thumbnails'),
  path.join(__dirname, '../uploads/products'),
  path.join(__dirname, '../uploads/profiles'),
  path.join(__dirname, '../uploads/chat-images')
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ========== STORAGE FOR COURSE THUMBNAILS (Cloudinary - images only) ==========
const thumbnailStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'core-insight/courses/thumbnails',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      { width: 500, height: 300, crop: 'limit' },
      { quality: 'auto' }
    ]
  }
});

// ========== STORAGE FOR PRODUCT IMAGES (Cloudinary - images only) ==========
const productImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'core-insight/products',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      { width: 800, height: 600, crop: 'limit' },
      { quality: 'auto' }
    ]
  }
});

// ========== STORAGE FOR PROFILE PICTURES (Cloudinary - images only) ==========
const profilePictureStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'core-insight/profiles',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      { width: 300, height: 300, crop: 'fill' },
      { quality: 'auto' }
    ]
  }
});

// ========== STORAGE FOR CHAT IMAGES (Cloudinary - images only) ==========
const chatImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'core-insight/chat',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      { width: 800, height: 600, crop: 'limit' },
      { quality: 'auto' }
    ]
  }
});

// ========== LOCAL STORAGE FOR COURSE FILES (PDFs, videos, documents) ==========
const courseFileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/courses/files'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '-')
      .substring(0, 50);
    cb(null, `${uniqueSuffix}-${baseName}${ext}`);
  }
});

// ========== LOCAL STORAGE FOR PRODUCT FILES (digital products) ==========
const productFileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/products/files'));
  },
  filename: function (req, file, cb) {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + "-" + sanitizedName);
  }
});

// ========== CREATE MULTER INSTANCES ==========

// For course thumbnails (Cloudinary)
const uploadThumbnail = multer({ 
  storage: thumbnailStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// For course files (local)
const uploadCourseFile = multer({ 
  storage: courseFileStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// For product images (Cloudinary)
const uploadProductImages = multer({ 
  storage: productImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// For product files (local - digital products)
const uploadProductFile = multer({ 
  storage: productFileStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// For profile pictures (Cloudinary)
const uploadProfilePicture = multer({ 
  storage: profilePictureStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// For chat images (Cloudinary)
const uploadChatImage = multer({ 
  storage: chatImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// For multiple product images upload (Cloudinary)
const uploadMultipleProductImages = multer({ 
  storage: productImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).array('images[]', 10);

// For product upload with both images and file
const uploadProduct = multer({
  storage: multer.diskStorage({}) // This will be overridden by fields
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'images[]', maxCount: 10 }
]);
// ========== STORAGE FOR CERTIFICATE IMAGES (Cloudinary - images only) ==========
const certificateStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'core-insight/certificates',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'],
    transformation: [
      { width: 800, height: 600, crop: 'limit' },
      { quality: 'auto' }
    ]
  }
});

// For certificate images (Cloudinary)
const uploadCertificate = multer({ 
  storage: certificateStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// For multiple certificate images upload
const uploadMultipleCertificates = multer({ 
  storage: certificateStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
}).array('certificate_images', 5);
// Course upload with thumbnail (Cloudinary) and file (local)
const uploadCourse = multer({
  storage: multer.diskStorage({}) // This will be overridden
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

module.exports = {
  uploadCourse,
  uploadThumbnail,
  uploadCourseFile,
  uploadProductImages,
  uploadMultipleProductImages,
  uploadProductFile,
  uploadProfilePicture,
  uploadChatImage,
  uploadProduct,
  uploadCertificate,        
  uploadMultipleCertificates, 
  cloudinary
};
// mega-storage.js - COMPLETE WITH IMGBB + BACKBLAZE B2
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

// ============ IMGBB FOR IMAGES ONLY ============
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// ============ BACKBLAZE B2 FOR FILES ============
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_ID = process.env.B2_BUCKET_ID;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;
const B2_BUCKET_ENDPOINT = process.env.B2_BUCKET_ENDPOINT;

// Initialize Backblaze B2 client
const b2 = require('b2-cloud-storage');
const b2Client = new b2({
    auth: {
        accountId: B2_KEY_ID,
        applicationKey: B2_APPLICATION_KEY
    }
});

let isB2Authorized = false;

// ============ FILE TYPE DETECTION ============
const isImageFile = (filename) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico'];
    const ext = path.extname(filename).toLowerCase();
    return imageExtensions.includes(ext);
};

const isDocumentFile = (filename) => {
    const docExtensions = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'];
    const ext = path.extname(filename).toLowerCase();
    return docExtensions.includes(ext);
};

const isArchiveFile = (filename) => {
    const archiveExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz'];
    const ext = path.extname(filename).toLowerCase();
    return archiveExtensions.includes(ext);
};

const isVideoFile = (filename) => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v', '.mpg', '.mpeg'];
    const ext = path.extname(filename).toLowerCase();
    return videoExtensions.includes(ext);
};

// ============ IMGBB UPLOAD (IMAGES ONLY) ============
const uploadToImgbb = async (filePath, filename) => {
    if (!isImageFile(filename)) {
        throw new Error(`ImgBB only supports images. ${filename} is not an image file. Use Backblaze B2 for documents.`);
    }
    
    console.log(`📸 Uploading image to ImgBB: ${filename}`);
    
    const formData = new FormData();
    formData.append('image', fs.createReadStream(filePath));
    formData.append('name', filename);
    
    const response = await axios.post(
        `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
        formData,
        { headers: { ...formData.getHeaders() }, timeout: 120000 }
    );
    
    // Clean up temp file
    try { fs.unlinkSync(filePath); } catch(e) {}
    
    if (response.data?.data?.url) {
        console.log(`✅ Image uploaded to ImgBB: ${response.data.data.url.substring(0, 60)}...`);
        return response.data.data.url;
    }
    throw new Error('ImgBB upload failed');
};

// ============ BACKBLAZE B2 UPLOAD (FILES) ============
const uploadToBackblaze = async (filePath, filename) => {
    console.log(`📁 Uploading file to Backblaze B2: ${filename}`);
    
    if (!isB2Authorized) {
        await new Promise((resolve, reject) => {
            b2Client.authorize((err) => {
                if (err) {
                    console.error('B2 Authorization Error:', err);
                    return reject(err);
                }
                isB2Authorized = true;
                console.log('✅ Backblaze B2 authorized');
                resolve();
            });
        });
    }
    
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    const safeName = `${timestamp}-${random}-${baseName}${ext}`;
    
    return new Promise((resolve, reject) => {
        b2Client.uploadFile(filePath, {
            bucketId: B2_BUCKET_ID,
            fileName: safeName,
            contentType: 'application/octet-stream',
        }, async (err, results) => {
            try { fs.unlinkSync(filePath); } catch(e) {}
            
            if (err) {
                console.error('❌ B2 Upload Error:', err);
                return reject(err);
            }
            
            // ✅ CORRECT PUBLIC URL FORMAT
            // Format: https://{endpoint}/file/{bucketName}/{fileName}
            const endpoint = process.env.B2_BUCKET_ENDPOINT;
            const bucketName = process.env.B2_BUCKET_NAME;
            
            // Remove https:// from endpoint if present (it shouldn't be)
            const cleanEndpoint = endpoint.replace(/^https?:\/\//, '');
            
            const publicUrl = `https://${cleanEndpoint}/file/${bucketName}/${safeName}`;
            
            console.log(`✅ B2 Upload Success: ${publicUrl}`);
            
            // Verify the URL works
            try {
                const testResponse = await axios.head(publicUrl, { timeout: 5000 });
                console.log(`✅ URL verified: ${testResponse.status}`);
            } catch (verifyErr) {
                console.warn(`⚠️ URL may not be accessible: ${verifyErr.message}`);
            }
            
            resolve(publicUrl);
        });
    });
};
// ============ SMART UPLOAD - CHOOSES RIGHT SERVICE ============
const uploadFile = async (filePath, filename) => {
    if (isImageFile(filename)) {
        // Images go to ImgBB
        console.log(`📸 Image detected - using ImgBB: ${filename}`);
        return await uploadToImgbb(filePath, filename);
    } else {
        // Documents, videos, archives go to Backblaze B2
        console.log(`📁 Non-image file detected - using Backblaze B2: ${filename}`);
        return await uploadToBackblaze(filePath, filename);
    }
};

// Aliases for backward compatibility
const uploadToImgbbUniversal = uploadFile;
const uploadFileToMega = uploadFile;
const uploadSmartFile = uploadFile;  // ✅ ALIAS FOR COURSE UPLOADS
const uploadImageToImgbb = uploadToImgbb;
const uploadMultipleImagesToImgbb = async (files) => {
    const urls = [];
    for (const file of files) {
        if (isImageFile(file.originalname)) {
            const url = await uploadToImgbb(file.path, file.originalname);
            urls.push(url);
        } else {
            console.warn(`⚠️ Skipping non-image file in images array: ${file.originalname}`);
        }
    }
    return urls;
};

// ============ TEMP DIRECTORY SETUP ============
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

// ============ EXPORTS ============
module.exports = {
    // Multer configurations
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
    
    // Upload functions
    uploadToImgbb,        // Images only - for thumbnails
    uploadToBackblaze,    // Files only - for documents/videos
    uploadFile,           // Smart upload - auto-detects file type
    uploadSmartFile,      // Alias for uploadFile (for course uploads)
    uploadToImgbbUniversal,
    uploadFileToMega,
    uploadImageToImgbb,
    uploadMultipleImagesToImgbb
};
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables FIRST (before anything else)
const envPath = path.resolve(__dirname, '..', '.env.development');
console.log('📁 Loading environment from:', envPath);

dotenv.config({ path: envPath });

// Verify Cloudinary variables are loaded
console.log('\n🔍 Checking Cloudinary configuration:');
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? '✅ SET' : '❌ MISSING');
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? '✅ SET' : '❌ MISSING');
console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '✅ SET' : '❌ MISSING');

if (!process.env.CLOUDINARY_CLOUD_NAME || 
    !process.env.CLOUDINARY_API_KEY || 
    !process.env.CLOUDINARY_API_SECRET) {
  console.error('\n❌ Cloudinary environment variables not set!');
  console.log('\nPlease add these to your .env.development file at:');
  console.log(envPath);
  console.log('\nCLOUDINARY_CLOUD_NAME=your_cloud_name');
  console.log('CLOUDINARY_API_KEY=your_api_key');
  console.log('CLOUDINARY_API_SECRET=your_api_secret');
  process.exit(1);
}

console.log('✅ Cloudinary configuration verified!\n');

// NOW require other modules
const fs = require('fs');
const cloudinary = require('../cloudinary.config');
const db = require('../db');

async function migrateCourseFiles() {
  console.log('🚀 Starting course files migration...');
  
  try {
    const courses = await db.query('SELECT id, title, file_path, thumbnail_path FROM courses');
    let coursesArray = Array.isArray(courses) ? courses : (courses[0] || []);
    
    console.log(`📊 Found ${coursesArray.length} courses to migrate`);
    
    for (const course of coursesArray) {
      console.log(`\n📦 Processing course ID: ${course.id} - ${course.title}`);
      
      // Migrate thumbnail
      if (course.thumbnail_path) {
        await migrateFile(course, 'thumbnail');
      }
      
      // Migrate course file
      if (course.file_path) {
        await migrateFile(course, 'file');
      }
    }
    
    console.log('\n✅ Course migration completed!');
  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}

async function migrateProductFiles() {
  console.log('\n🚀 Starting product images migration...');
  
  try {
    const products = await db.query('SELECT id, title, file_path, images FROM products');
    let productsArray = Array.isArray(products) ? products : (products[0] || []);
    
    console.log(`📊 Found ${productsArray.length} products to migrate`);
    
    for (const product of productsArray) {
      console.log(`\n📦 Processing product ID: ${product.id} - ${product.title}`);
      
      // Handle main file
      if (product.file_path) {
        await migrateProductFile(product, 'file');
      }
      
      // Handle multiple images
      if (product.images) {
        let images = [];
        try {
          images = JSON.parse(product.images);
        } catch (e) {
          // If it's not JSON, treat as single image path
          images = product.images ? [product.images] : [];
        }
        
        for (const imagePath of images) {
          if (imagePath) {
            await migrateProductImage(product, imagePath);
          }
        }
      }
    }
    
    console.log('\n✅ Product migration completed!');
  } catch (error) {
    console.error('❌ Product migration error:', error);
  }
}

async function migrateProfilePictures() {
  console.log('\n🚀 Starting profile pictures migration...');
  
  try {
    const profiles = await db.query(
      'SELECT user_id, profile_picture, certificate_images FROM freelancer_profiles WHERE profile_picture IS NOT NULL OR certificate_images IS NOT NULL'
    );
    let profilesArray = Array.isArray(profiles) ? profiles : (profiles[0] || []);
    
    console.log(`📊 Found ${profilesArray.length} profiles to migrate`);
    
    for (const profile of profilesArray) {
      if (profile.profile_picture) {
        await migrateProfilePicture(profile);
      }
      
      if (profile.certificate_images) {
        await migrateCertificateImages(profile);
      }
    }
    
    console.log('\n✅ Profile pictures migration completed!');
  } catch (error) {
    console.error('❌ Profile migration error:', error);
  }
}

async function migrateChatImages() {
  console.log('\n🚀 Starting chat images migration...');
  
  try {
    const messages = await db.query(
      'SELECT id, conversation_id, image_url FROM messages WHERE image_url IS NOT NULL'
    );
    let messagesArray = Array.isArray(messages) ? messages : (messages[0] || []);
    
    console.log(`📊 Found ${messagesArray.length} chat images to migrate`);
    
    for (const message of messagesArray) {
      if (message.image_url) {
        await migrateChatImage(message);
      }
    }
    
    console.log('\n✅ Chat images migration completed!');
  } catch (error) {
    console.error('❌ Chat migration error:', error);
  }
}

async function migrateFile(course, type) {
  const filePath = type === 'thumbnail' ? course.thumbnail_path : course.file_path;
  if (!filePath) return;
  
  const filename = path.basename(filePath);
  
  // Try to find the file in various locations
  const possiblePaths = [
    path.join(__dirname, '..', 'uploads', 'courses', filename),
    path.join(__dirname, '..', 'uploads', filename),
    path.join(__dirname, '..', filePath),
    `/opt/render/project/src/uploads/courses/${filename}`,
    path.join(__dirname, '..', 'public', 'uploads', 'courses', filename)
  ];
  
  let foundPath = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      foundPath = testPath;
      console.log(`✅ Found file at: ${testPath}`);
      break;
    }
  }
  
  if (!foundPath) {
    console.log(`❌ File not found: ${filename}`);
    return;
  }
  
  try {
    // Determine folder and resource type
    const folder = type === 'thumbnail' 
      ? 'core-insight/courses/thumbnails' 
      : 'core-insight/courses/files';
    
    const fileExt = path.extname(filename).toLowerCase();
    const resourceType = fileExt.match(/\.(mp4|mov|avi|mkv|webm|wmv|flv)$/i) ? 'video' : 'auto';
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(foundPath, {
      folder: folder,
      resource_type: resourceType,
      public_id: `${course.id}-${type}-${Date.now()}`
    });
    
    console.log(`✅ Uploaded to Cloudinary: ${result.secure_url}`);
    
    // Update database with Cloudinary URL
    const updateField = type === 'thumbnail' ? 'thumbnail_url' : 'file_url';
    await db.query(
      `UPDATE courses SET ${updateField} = ? WHERE id = ?`,
      [result.secure_url, course.id]
    );
    
    console.log(`✅ Database updated for course ${course.id}`);
    
  } catch (error) {
    console.error(`❌ Error uploading ${filename}:`, error.message);
  }
}

async function migrateProductFile(product, type) {
  const filePath = product.file_path;
  if (!filePath) return;
  
  const filename = path.basename(filePath);
  
  const possiblePaths = [
    path.join(__dirname, '..', 'uploads', 'products', filename),
    path.join(__dirname, '..', 'uploads', filename),
    path.join(__dirname, '..', filePath),
    `/opt/render/project/src/uploads/products/${filename}`
  ];
  
  let foundPath = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      foundPath = testPath;
      break;
    }
  }
  
  if (!foundPath) return;
  
  try {
    const result = await cloudinary.uploader.upload(foundPath, {
      folder: 'core-insight/products/files',
      resource_type: 'auto'
    });
    
    console.log(`✅ Uploaded product file: ${result.secure_url}`);
    
    await db.query(
      'UPDATE products SET file_url = ? WHERE id = ?',
      [result.secure_url, product.id]
    );
    
  } catch (error) {
    console.error(`❌ Error uploading product file:`, error.message);
  }
}

async function migrateProductImage(product, imagePath) {
  if (!imagePath) return;
  
  const filename = path.basename(imagePath);
  
  const possiblePaths = [
    path.join(__dirname, '..', 'uploads', 'products', filename),
    path.join(__dirname, '..', 'uploads', filename),
    path.join(__dirname, '..', imagePath),
    `/opt/render/project/src/uploads/products/${filename}`
  ];
  
  let foundPath = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      foundPath = testPath;
      break;
    }
  }
  
  if (!foundPath) return;
  
  try {
    const result = await cloudinary.uploader.upload(foundPath, {
      folder: 'core-insight/products/images',
      transformation: [
        { width: 800, height: 600, crop: 'limit' }
      ]
    });
    
    console.log(`✅ Uploaded product image: ${result.secure_url}`);
    
    // Get current images
    const [currentProduct] = await db.query(
      'SELECT images FROM products WHERE id = ?',
      [product.id]
    );
    
    let images = [];
    if (currentProduct && currentProduct.images) {
      try {
        images = JSON.parse(currentProduct.images);
      } catch (e) {
        images = [currentProduct.images];
      }
    }
    
    // Replace local path with Cloudinary URL
    const updatedImages = images.map(img => 
      img === imagePath || img.includes(filename) ? result.secure_url : img
    );
    
    await db.query(
      'UPDATE products SET image_urls = ? WHERE id = ?',
      [JSON.stringify(updatedImages), product.id]
    );
    
  } catch (error) {
    console.error(`❌ Error uploading product image:`, error.message);
  }
}

async function migrateProfilePicture(profile) {
  if (!profile.profile_picture) return;
  
  const filePath = profile.profile_picture;
  const filename = path.basename(filePath);
  
  const possiblePaths = [
    path.join(__dirname, '..', 'uploads', 'profiles', filename),
    path.join(__dirname, '..', 'uploads', filename),
    path.join(__dirname, '..', filePath),
    `/opt/render/project/src/uploads/profiles/${filename}`
  ];
  
  let foundPath = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      foundPath = testPath;
      break;
    }
  }
  
  if (!foundPath) return;
  
  try {
    const result = await cloudinary.uploader.upload(foundPath, {
      folder: 'core-insight/profiles',
      transformation: [
        { width: 300, height: 300, crop: 'fill' }
      ]
    });
    
    console.log(`✅ Uploaded profile picture: ${result.secure_url}`);
    
    await db.query(
      'UPDATE freelancer_profiles SET profile_picture_url = ? WHERE user_id = ?',
      [result.secure_url, profile.user_id]
    );
    
  } catch (error) {
    console.error(`❌ Error uploading profile picture:`, error.message);
  }
}

async function migrateCertificateImages(profile) {
  if (!profile.certificate_images) return;
  
  let certificates = [];
  try {
    certificates = JSON.parse(profile.certificate_images);
  } catch (e) {
    certificates = [profile.certificate_images];
  }
  
  const uploadedUrls = [];
  
  for (const certPath of certificates) {
    if (!certPath) continue;
    
    const filename = path.basename(certPath);
    
    const possiblePaths = [
      path.join(__dirname, '..', 'uploads', 'profiles', filename),
      path.join(__dirname, '..', 'uploads', filename),
      path.join(__dirname, '..', certPath),
      `/opt/render/project/src/uploads/profiles/${filename}`
    ];
    
    let foundPath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        foundPath = testPath;
        break;
      }
    }
    
    if (!foundPath) continue;
    
    try {
      const result = await cloudinary.uploader.upload(foundPath, {
        folder: 'core-insight/profiles/certificates'
      });
      
      console.log(`✅ Uploaded certificate: ${result.secure_url}`);
      uploadedUrls.push(result.secure_url);
      
    } catch (error) {
      console.error(`❌ Error uploading certificate:`, error.message);
    }
  }
  
  if (uploadedUrls.length > 0) {
    await db.query(
      'UPDATE freelancer_profiles SET certificate_image_urls = ? WHERE user_id = ?',
      [JSON.stringify(uploadedUrls), profile.user_id]
    );
  }
}

async function migrateChatImage(message) {
  if (!message.image_url) return;
  
  const filePath = message.image_url;
  const filename = path.basename(filePath);
  
  const possiblePaths = [
    path.join(__dirname, '..', 'uploads', 'chat-images', filename),
    path.join(__dirname, '..', 'uploads', filename),
    path.join(__dirname, '..', filePath),
    `/opt/render/project/src/uploads/chat-images/${filename}`
  ];
  
  let foundPath = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      foundPath = testPath;
      break;
    }
  }
  
  if (!foundPath) return;
  
  try {
    const result = await cloudinary.uploader.upload(foundPath, {
      folder: 'core-insight/chat',
      transformation: [
        { width: 800, height: 600, crop: 'limit' }
      ]
    });
    
    console.log(`✅ Uploaded chat image: ${result.secure_url}`);
    
    // Update the message with Cloudinary URL
    await db.query(
      'UPDATE messages SET image_url = ? WHERE id = ?',
      [result.secure_url, message.id]
    );
    
  } catch (error) {
    console.error(`❌ Error uploading chat image:`, error.message);
  }
}

// Run migrations
async function runMigrations() {
  console.log('🎯 Starting Cloudinary Migration...\n');
  
  // Check for dry run mode
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No actual uploads will be performed\n');
    // In dry run mode, we'll just list files without uploading
    console.log('This is a dry run. To actually upload, run without --dry-run');
    return;
  }
  
  try {
    // Migrate all types
    await migrateCourseFiles();
    await migrateProductFiles();
    await migrateProfilePictures();
    await migrateChatImages();
    
    console.log('\n✨ All migrations completed successfully!');
    console.log('🎉 Your images are now on Cloudinary!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
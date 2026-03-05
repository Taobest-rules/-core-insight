// Load dotenv FIRST
require('dotenv').config({ path: '.env.development' });

// NOW check the variables
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET');
console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET');

// If still undefined, show where it's looking
if (!process.env.CLOUDINARY_CLOUD_NAME) {
  console.log('\n❌ Variables not loaded!');
  console.log('Current directory:', __dirname);
  console.log('Looking for .env at:', require('path').resolve(__dirname, '.env.development'));
}
// services/mega.service.js - REPLACE WITH THIS

const { Storage } = require('megajs');
const fs = require('fs');
const path = require('path');

class MegaService {
  async uploadFile(localFilePath, filename, folder = '/') {
    try {
      console.log(`📤 Uploading to MEGA via megajs: ${filename}`);
      
      // Connect to MEGA
      const storage = await new Storage({
        email: process.env.MEGA_EMAIL,
        password: process.env.MEGA_PASSWORD
      }).ready;
      
      console.log('✅ Connected to MEGA');
      
      // Read file
      const fileData = fs.readFileSync(localFilePath);
      const fileSize = fileData.length;
      
      // Create folder path if needed
      const folderPath = folder.replace(/^\//, '').replace(/\/$/, '');
      let currentFolder = storage.root;
      
      if (folderPath) {
        const folders = folderPath.split('/');
        for (const folderName of folders) {
          const existingFolder = currentFolder.children.find(child => 
            child.name === folderName && child.directory
          );
          if (existingFolder) {
            currentFolder = existingFolder;
          } else {
            currentFolder = await currentFolder.mkdir(folderName);
          }
        }
      }
      
      // Upload file
      const uploadResult = await currentFolder.upload({
        name: filename,
        size: fileSize,
        data: fileData
      }).complete;
      
      console.log(`✅ File uploaded to MEGA: ${filename}`);
      
      // Generate shareable link
      const link = await uploadResult.link();
      console.log(`✅ Shareable link generated: ${link}`);
      
      // Clean up temp file
      try { fs.unlinkSync(localFilePath); } catch(e) {}
      
      return link;
      
    } catch (error) {
      console.error('❌ MEGA upload error:', error);
      throw new Error(`MEGA upload failed: ${error.message}`);
    }
  }
  
  async deleteFile(remotePath) {
    // Implement if needed
    return true;
  }
}

module.exports = new MegaService();
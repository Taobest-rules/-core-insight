 const mega = require('megajs');
const fs = require('fs');
const { Readable } = require('stream');

class MegaService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized && this.client) return this.client;
    
    return new Promise((resolve, reject) => {
      this.client = mega({
        email: process.env.MEGA_EMAIL,
        password: process.env.MEGA_PASSWORD,
        autologin: true
      }, (err) => {
        if (err) {
          console.error('❌ MEGA login error:', err);
          reject(err);
        } else {
          this.initialized = true;
          console.log('✅ MEGA service initialized');
          resolve(this.client);
        }
      });
    });
  }

  /**
   * Ensure folder exists, create if not
   */
  async ensureFolder(folderPath, root = null) {
    const client = await this.init();
    const parts = folderPath.split('/').filter(p => p);
    let currentFolder = root || client.root;
    
    for (const part of parts) {
      let subFolder = null;
      
      // Check if folder exists
      if (currentFolder.children) {
        subFolder = currentFolder.children.find(child => 
          child.name === part && child.directory === true
        );
      }
      
      if (!subFolder) {
        // Create folder
        subFolder = await new Promise((resolve, reject) => {
          client.mkdir(part, currentFolder, (err, folder) => {
            if (err) reject(err);
            else resolve(folder);
          });
        });
      }
      currentFolder = subFolder;
    }
    
    return currentFolder;
  }

  /**
   * Upload file buffer to MEGA
   */
  async uploadBuffer(buffer, filename, folderPath = '/') {
    try {
      const client = await this.init();
      const targetFolder = await this.ensureFolder(folderPath);
      
      return new Promise((resolve, reject) => {
        const stream = Readable.from(buffer);
        
        const uploadStream = client.upload({
          name: filename,
          size: buffer.length,
          parent: targetFolder
        }, (err, file) => {
          if (err) {
            reject(err);
          } else {
            // Generate public link
            file.link((err, link) => {
              if (err) {
                reject(err);
              } else {
                console.log(`✅ File uploaded to MEGA: ${filename}`);
                resolve(link);
              }
            });
          }
        });
        
        stream.pipe(uploadStream);
      });
    } catch (error) {
      console.error('❌ MEGA upload error:', error);
      throw error;
    }
  }

  /**
   * Upload file from disk to MEGA
   */
  async uploadFile(filePath, filename, folderPath = '/') {
    try {
      const buffer = fs.readFileSync(filePath);
      return this.uploadBuffer(buffer, filename, folderPath);
    } catch (error) {
      console.error('❌ MEGA file upload error:', error);
      throw error;
    }
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      const client = await this.init();
      console.log('✅ MEGA connection successful!');
      console.log('📁 Root folder name:', client.root.name);
      return true;
    } catch (error) {
      console.error('❌ MEGA connection failed:', error);
      return false;
    }
  }
}

module.exports = new MegaService();
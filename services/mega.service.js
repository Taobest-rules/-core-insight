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
    
    if (!process.env.MEGA_EMAIL || !process.env.MEGA_PASSWORD) {
      console.error('❌ MEGA credentials missing!');
      throw new Error('MEGA credentials missing');
    }
    
    return new Promise((resolve, reject) => {
      console.log('🔐 Logging into MEGA...');
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

  async ensureFolder(folderPath, root = null) {
    const client = await this.init();
    const parts = folderPath.split('/').filter(p => p);
    let currentFolder = root || client.root;
    
    for (const part of parts) {
      let subFolder = null;
      
      if (currentFolder.children) {
        subFolder = currentFolder.children.find(child => 
          child.name === part && child.directory === true
        );
      }
      
      if (!subFolder) {
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

  async uploadFile(filePath, filename, folderPath = '/') {
    try {
      const buffer = fs.readFileSync(filePath);
      return this.uploadBuffer(buffer, filename, folderPath);
    } catch (error) {
      console.error('❌ MEGA file upload error:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      const client = await this.init();
      console.log('✅ MEGA connection successful!');
      return true;
    } catch (error) {
      console.error('❌ MEGA connection failed:', error);
      return false;
    }
  }
}

module.exports = new MegaService();

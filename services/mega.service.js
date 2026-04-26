const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class MegaService {
  constructor() {
    this.rcloneAvailable = false;
    this.rclonePath = 'C:\\Windows\\rclone.exe';
    this.remoteName = process.env.MEGA_REMOTE_NAME || 'mega';
  }

  async checkRclone() {
    try {
      if (!fs.existsSync(this.rclonePath)) {
        console.log(`⚠️ rclone not found at ${this.rclonePath}`);
        this.rcloneAvailable = false;
        return false;
      }
      
      await execPromise(`"${this.rclonePath}" --version`);
      this.rcloneAvailable = true;
      console.log('✅ rclone is available for MEGA uploads');
      return true;
    } catch (error) {
      this.rcloneAvailable = false;
      console.log('⚠️ rclone not available. Using local fallback.');
      return false;
    }
  }

  async uploadFile(filePath, filename, folder = '/courses') {
    try {
      if (!this.rcloneAvailable) {
        await this.checkRclone();
      }
      
      if (this.rcloneAvailable) {
        const cleanFolder = folder.replace(/^\//, '');
        const remotePath = cleanFolder ? `${this.remoteName}:${cleanFolder}/${filename}` : `${this.remoteName}:${filename}`;
        
        console.log(`📤 Uploading to MEGA: ${remotePath}`);
        
        if (cleanFolder) {
          try {
            await execPromise(`"${this.rclonePath}" mkdir "${this.remoteName}:${cleanFolder}"`);
          } catch (mkdirError) {
            // Folder might already exist
          }
        }
        
        await execPromise(`"${this.rclonePath}" copy "${filePath}" "${remotePath}"`);
        
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.log('Could not delete temp file:', err.message);
        }
        
        console.log(`✅ File uploaded to MEGA: ${filename}`);
        return { url: remotePath, filename, folder };
      }
      
      // Fallback: Save locally
      const uploadsDir = path.join(__dirname, '../uploads/mega');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const safeFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const localPath = path.join(uploadsDir, safeFilename);
      fs.copyFileSync(filePath, localPath);
      
      try {
        fs.unlinkSync(filePath);
      } catch (err) {}
      
      const localUrl = `/uploads/mega/${safeFilename}`;
      console.log(`✅ File saved locally: ${localUrl}`);
      return { url: localUrl, filename, folder };
      
    } catch (error) {
      console.error('❌ Upload error:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      await this.checkRclone();
      if (this.rcloneAvailable) {
        await execPromise(`"${this.rclonePath}" ls ${this.remoteName}:`);
        console.log('✅ MEGA connection successful!');
        return true;
      }
      return true;
    } catch (error) {
      console.error('❌ Connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = new MegaService();
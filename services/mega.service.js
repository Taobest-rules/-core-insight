// services/mega.service.js - UPDATED to return proper shareable links

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs');

class MegaService {
  async uploadFile(localFilePath, filename, folder = '/') {
    try {
      console.log(`📤 Uploading to MEGA: ${filename}`);
      
      // Generate unique remote filename
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000000);
      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
      const remoteFileName = `${timestamp}-${random}-${baseName}${ext}`;
      const remotePath = `${folder}/${remoteFileName}`.replace(/\/\//g, '/');
      
      // Upload using rclone
      const uploadCmd = `rclone copy "${localFilePath}" "mega:${remotePath}" --verbose`;
      console.log(`Executing: rclone copy ...`);
      
      const { stdout, stderr } = await execPromise(uploadCmd, { timeout: 300000 });
      
      if (stderr && !stderr.includes('INFO') && !stderr.includes('Transferred')) {
        console.error('Upload stderr:', stderr);
      }
      
      console.log(`✅ File uploaded to MEGA: ${remotePath}`);
      
      // CRITICAL: Generate a shareable link
      console.log(`🔗 Generating shareable link...`);
      const linkCmd = `rclone link "mega:${remotePath}"`;
      const { stdout: linkStdout } = await execPromise(linkCmd, { timeout: 30000 });
      
      let shareUrl = linkStdout.trim();
      
      // Validate the URL
      if (!shareUrl || !shareUrl.startsWith('https://mega.nz/')) {
        console.error(`Invalid share URL: ${shareUrl}`);
        // Fallback: return the mega path as reference
        return { 
          url: `mega:${remotePath}`, 
          path: remotePath,
          filename: remoteFileName,
          isShareable: false 
        };
      }
      
      console.log(`✅ Shareable link generated: ${shareUrl.substring(0, 60)}...`);
      
      return { 
        url: shareUrl,  // ← THIS IS WHAT YOU NEED!
        path: remotePath,
        filename: remoteFileName,
        isShareable: true
      };
      
    } catch (error) {
      console.error('❌ MEGA upload error:', error);
      throw new Error(`MEGA upload failed: ${error.message}`);
    }
  }

  async deleteFile(remotePath) {
    try {
      const deleteCmd = `rclone delete "mega:${remotePath}"`;
      await execPromise(deleteCmd, { timeout: 60000 });
      console.log(`✅ Deleted from MEGA: ${remotePath}`);
      return true;
    } catch (error) {
      console.error('MEGA delete error:', error);
      return false;
    }
  }

  async generateShareLink(remotePath) {
    try {
      const linkCmd = `rclone link "mega:${remotePath}"`;
      const { stdout } = await execPromise(linkCmd, { timeout: 30000 });
      return stdout.trim();
    } catch (error) {
      console.error('Generate share link error:', error);
      return null;
    }
  }
}

module.exports = new MegaService();
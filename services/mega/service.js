const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const crypto = require('crypto');

class MegaService {
  constructor() {
    this.apiUrl = 'https://mega.nz/api';
    this.sessionId = null;
    this.sequenceId = 1;
  }

  /**
   * Generate random string for MEGA requests
   */
  generateRandomString(length = 16) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Login to MEGA
   */
  async login() {
    try {
      const email = process.env.MEGA_EMAIL;
      const password = process.env.MEGA_PASSWORD;
      
      if (!email || !password) {
        throw new Error('MEGA credentials missing in .env file');
      }
      
      console.log('🔐 Logging into MEGA via API...');
      
      // Prepare login request
      const requestData = {
        a: 'us',
        user: email,
        uh: this.generateRandomString()
      };
      
      const response = await axios.post(`${this.apiUrl}/cs`, requestData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data && response.data[0]) {
        this.sessionId = response.data[0];
        console.log('✅ MEGA login successful');
        return true;
      } else {
        throw new Error('Login failed');
      }
    } catch (error) {
      console.error('❌ MEGA login error:', error.message);
      return false;
    }
  }

  /**
   * Upload file to MEGA using direct API
   */
  async uploadFile(filePath, filename) {
    try {
      await this.login();
      
      const fileBuffer = fs.readFileSync(filePath);
      const formData = new FormData();
      
      // Prepare upload
      const uploadUrl = 'https://mega.nz/upload';
      
      formData.append('file', fileBuffer, {
        filename: filename,
        contentType: 'application/octet-stream'
      });
      
      const response = await axios.post(uploadUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'Content-Type': 'multipart/form-data'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      console.log(`✅ File uploaded: ${filename}`);
      return response.data;
    } catch (error) {
      console.error('❌ Upload error:', error.message);
      throw error;
    }
  }
}

module.exports = new MegaService();
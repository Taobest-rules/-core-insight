const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class ImgbbService {
  constructor() {
    this.apiKey = process.env.IMGBB_API_KEY;
    this.apiUrl = 'https://api.imgbb.com/1/upload';
  }

  /**
   * Upload image from buffer
   */
  async uploadBuffer(imageBuffer, filename = 'image.jpg', expiration = null) {
    try {
      if (!this.apiKey) {
        throw new Error('IMGBB_API_KEY is not set in environment variables');
      }
      
      const base64 = imageBuffer.toString('base64');
      const name = filename.replace(/\.[^/.]+$/, '');
      
      const formData = new FormData();
      formData.append('key', this.apiKey);
      formData.append('image', base64);
      formData.append('name', name);
      
      if (expiration) {
        formData.append('expiration', expiration);
      }
      
      const response = await axios.post(this.apiUrl, formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });
      
      if (response.data && response.data.success) {
        return {
          success: true,
          url: response.data.data.url,
          display_url: response.data.data.display_url,
          delete_url: response.data.data.delete_url,
          thumb_url: response.data.data.thumb?.url,
          width: response.data.data.width,
          height: response.data.data.height,
          size: response.data.data.size,
          filename: response.data.data.image?.filename
        };
      }
      
      throw new Error(response.data?.error?.message || 'Upload failed');
      
    } catch (error) {
      console.error('❌ ImgBB upload error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Upload image from file path
   */
  async uploadFile(filePath, expiration = null) {
    try {
      const imageBuffer = fs.readFileSync(filePath);
      const filename = path.basename(filePath);
      return this.uploadBuffer(imageBuffer, filename, expiration);
    } catch (error) {
      console.error('❌ ImgBB file upload error:', error);
      throw error;
    }
  }

  /**
   * Upload multiple images
   */
  async uploadMultiple(images, expiration = null) {
    const results = [];
    for (const img of images) {
      let result;
      if (img.buffer) {
        result = await this.uploadBuffer(img.buffer, img.filename, expiration);
      } else if (img.path) {
        result = await this.uploadFile(img.path, expiration);
      }
      results.push(result);
    }
    return results;
  }
}

module.exports = new ImgbbService();
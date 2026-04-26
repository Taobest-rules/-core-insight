const axios = require('axios');
const FormData = require('form-data');

class ImgbbSimpleService {
  constructor() {
    this.apiKey = process.env.IMGBB_API_KEY;
    this.apiUrl = 'https://api.imgbb.com/1/upload';
  }

  /**
   * Upload image using base64 string
   */
  async uploadBase64(imageBase64, name = 'image', expiration = null) {
    try {
      const formData = new FormData();
      formData.append('key', this.apiKey);
      formData.append('image', imageBase64);
      formData.append('name', name);
      
      if (expiration) {
        formData.append('expiration', expiration);
      }
      
      const response = await axios.post(this.apiUrl, formData, {
        headers: formData.getHeaders()
      });
      
      if (response.data.success) {
        return {
          success: true,
          url: response.data.data.url,
          display_url: response.data.data.display_url,
          delete_url: response.data.data.delete_url,
          thumb_url: response.data.data.thumb?.url,
          width: response.data.data.width,
          height: response.data.data.height,
          size: response.data.data.size
        };
      }
      
      throw new Error('Upload failed');
      
    } catch (error) {
      console.error('❌ ImgBB upload error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Upload image from buffer
   */
  async uploadBuffer(imageBuffer, filename = 'image.jpg', expiration = null) {
    const base64 = imageBuffer.toString('base64');
    const name = filename.replace(/\.[^/.]+$/, '');
    return this.uploadBase64(base64, name, expiration);
  }

  /**
   * Upload image from file path
   */
  async uploadFile(filePath, expiration = null) {
    const fs = require('fs');
    const path = require('path');
    const imageBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    return this.uploadBuffer(imageBuffer, filename, expiration);
  }
}

module.exports = new ImgbbSimpleService();
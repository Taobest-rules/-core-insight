// aliexpress-importer.js
const axios = require('axios');
const db = require('./db');
const cheerio = require('cheerio'); // For scraping if needed

class AliExpressImporter {
  constructor() {
    // If you have AliExpress affiliate API credentials
    this.apiKey = process.env.ALIEXPRESS_API_KEY;
    this.trackingId = process.env.ALIEXPRESS_TRACKING_ID;
  }

  // Method 1: Using AliExpress Affiliate API (if you have access)
  async fetchProductsViaAPI(category, limit = 100) {
    try {
      const response = await axios.get('https://api.aliexpress.com/affiliate/product/list', {
        params: {
          app_key: this.apiKey,
          tracking_id: this.trackingId,
          category_id: category,
          limit: limit,
          fields: 'product_title,product_price,sale_price,product_image,product_detail_url'
        }
      });
      
      return response.data.products || [];
    } catch (error) {
      console.error('API Error:', error);
      return [];
    }
  }

  // Method 2: Web Scraping (alternative)
  async scrapeProducts(category, pages = 5) {
    const products = [];
    
    for (let page = 1; page <= pages; page++) {
      try {
        const url = `https://www.aliexpress.com/category/${category}/items.html?page=${page}`;
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const $ = cheerio.load(response.data);
        
        $('.list-item').each((i, element) => {
          const product = {
            title: $(element).find('.product-title').text().trim(),
            price: $(element).find('.product-price').text().trim(),
            image: $(element).find('img').attr('src'),
            affiliate_link: $(element).find('a').attr('href'),
            description: $(element).find('.description').text().trim(),
            category: category
          };
          
          products.push(product);
        });
        
        // Be nice to the server
        await this.sleep(2000);
        
      } catch (error) {
        console.error(`Error scraping page ${page}:`, error);
      }
    }
    
    return products;
  }

  // Method 3: Using third-party API service (recommended)
  async fetchFromThirdParty(category, limit = 1000) {
    try {
      // Using AliExpress DropShipping API (example - you'd need to sign up)
      const response = await axios.get('https://api.dropship.io/aliexpress/products', {
        headers: {
          'Authorization': `Bearer ${process.env.DROPSHIP_API_KEY}`
        },
        params: {
          category: category,
          limit: limit,
          include_affiliate: true
        }
      });
      
      return response.data.products || [];
    } catch (error) {
      console.error('Third-party API Error:', error);
      return [];
    }
  }

  // Method 4: Import from CSV/Excel file
  async importFromFile(filePath) {
    const fs = require('fs');
    const csv = require('csv-parser');
    const products = [];
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          products.push({
            title: row.title || row.name,
            price: parseFloat(row.price) || 0,
            affiliate_link: row.link || row.url || row.affiliate_link,
            image: row.image || row.image_url,
            description: row.description,
            category: row.category || 'General'
          });
        })
        .on('end', async () => {
          console.log(`Loaded ${products.length} products from CSV`);
          resolve(products);
        })
        .on('error', reject);
    });
  }

  // Import products to your database
  async importToDatabase(products, userId) {
    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    for (const product of products) {
      try {
        // Check if product already exists
        const existing = await db.query(
          'SELECT id FROM products WHERE affiliate_link = ?',
          [product.affiliate_link]
        );

        if (existing.length > 0) {
          results.skipped.push({
            title: product.title,
            reason: 'Already exists'
          });
          continue;
        }

        // Convert price to USD if needed
        const priceInUSD = product.price ? this.convertToUSD(product.price) : 0;

        // Insert product as affiliate type
        const result = await db.query(
          `INSERT INTO products (
            user_id, title, description, price, category, type,
            affiliate_link, image_urls, created_at
          ) VALUES (?, ?, ?, ?, ?, 'affiliate', ?, ?, NOW())`,
          [
            userId,
            product.title || 'Untitled Product',
            product.description || 'Imported from AliExpress',
            priceInUSD,
            product.category || 'General',
            product.affiliate_link,
            product.image ? JSON.stringify([product.image]) : null
          ]
        );

        results.success.push({
          id: result.insertId,
          title: product.title
        });

        console.log(`✅ Imported: ${product.title}`);

      } catch (error) {
        console.error(`❌ Failed to import ${product.title}:`, error);
        results.failed.push({
          title: product.title,
          error: error.message
        });
      }
    }

    return results;
  }

  convertToUSD(price) {
    // If price is in string format like "$12.99" or "12.99"
    if (typeof price === 'string') {
      price = parseFloat(price.replace(/[^0-9.-]/g, ''));
    }
    
    // If price is in another currency, convert to USD
    // This is a simplified version - you'd want real exchange rates
    return price || 0;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AliExpressImporter();
// index.js - PRODUCTION VERSION (COMPLETE WITH PHYSICAL ORDER SYSTEM)
// ============================================
// DEPENDENCIES & CONFIGURATION
// ============================================
const dotenv = require("dotenv");
dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env.production" : ".env.development"
});

// Core dependencies
const express = require("express");
const path = require("path");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const MySQLStore = require("express-mysql-session")(session);
const Flutterwave = require('flutterwave-node-v3');
const csv = require('csv-parser');

// Cloudinary
const cloudinary = require('./cloudinary.config');
const {
  uploadCourse,
  uploadThumbnail,
  uploadProductImages,
  uploadProfilePicture,
  uploadChatImage,
  uploadMultipleProducts,
  uploadCourseFile
} = require('./cloudinary-storage');

// Database & Email
const db = require("./db");

// ============================================
// APP INITIALIZATION
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ============================================
// MIDDLEWARE CONFIGURATION
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// Session store
let sessionStore = null;
if (isProduction) {
  sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 86400000,
    createDatabaseTable: true,
    schema: {
      tableName: 'sessions',
      columnNames: {
        session_id: 'session_id',
        expires: 'expires',
        data: 'data'
      }
    }
  });
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'chat_secret',
  store: isProduction ? sessionStore : undefined,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(express.static("public"));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// PAYMENT GATEWAYS INITIALIZATION
// ============================================
let flw = null;
try {
  if (!process.env.FLW_PUBLIC_KEY || !process.env.FLW_SECRET_KEY) {
    throw new Error("Flutterwave API keys are required");
  }
  flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);
} catch (error) {
  console.error("Flutterwave initialization failed:", error.message);
}

let paystackInitialized = false;
try {
  if (process.env.PAYSTACK_SECRET_KEY) paystackInitialized = true;
} catch (error) {
  console.error("Paystack initialization failed:", error.message);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
BigInt.prototype.toJSON = function() {
  return this.toString();
};

const safeJSON = (data) => {
  return JSON.parse(JSON.stringify(data, (key, value) => {
    return typeof value === 'bigint' ? value.toString() : value;
  }));
};

const extractRows = (result) => {
  if (!result) return [];
  if (Array.isArray(result) && result.length === 2) return result[0] || [];
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object') return [result];
  return [];
};

const extractInsertId = (result) => {
  if (!result) return null;
  if (result.insertId) return result.insertId;
  if (Array.isArray(result) && result[0] && result[0].insertId) return result[0].insertId;
  return null;
};

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ============================================
// EMAIL CONFIGURATION - BREVO
// ============================================
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'suppourtcoreinsight@gmail.com';

// Create email transporter
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: { rejectUnauthorized: false }
  });
}

async function sendVerificationEmail(to, subject, html) {
  if (!BREVO_API_KEY && !transporter) {
    console.error('❌ No email service configured');
    return { success: true, fallback: true, message: 'Email service not configured, but account created' };
  }

  try {
    if (BREVO_API_KEY) {
      const response = await axios({
        method: 'POST',
        url: 'https://api.brevo.com/v3/smtp/email',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        data: {
          sender: { email: "coreinsightmail@gmail.com", name: "Core Insight" },
          to: [{ email: to }],
          subject: subject,
          htmlContent: html,
          headers: { 'X-Mailin-custom': 'verification-email' }
        },
        timeout: 15000
      });
      console.log(`✅ Verification email sent to ${to}`);
      return { success: true };
    } else if (transporter) {
      await transporter.sendMail({
        from: `"Core Insight" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: subject,
        html: html
      });
      return { success: true };
    }
    return { success: true, fallback: true };
  } catch (error) {
    console.error("❌ Email error:", error.response?.data || error.message);
    return { success: true, fallback: true, error: error.response?.data?.message || error.message };
  }
}

// ============================================
// ORDER CONFIRMATION EMAIL
// ============================================

async function sendOrderConfirmationEmail(orderData) {
  try {
    const { email, name, orderId, productName, quantity, totalAmount, deliveryAddress, estimatedDays } = orderData;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order Confirmation #${orderId} - Core Insight</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          h1 { color: #3b82f6; margin-top: 0; }
          .order-details { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; }
          .status-badge { background: #f59e0b; color: white; padding: 4px 12px; border-radius: 20px; display: inline-block; font-size: 12px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #94a3b8; text-align: center; }
          .btn { background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎉 Order Received!</h1>
          <p>Hello ${escapeHtml(name)},</p>
          <p>Thank you for your order! We've received your order and it's now pending seller approval.</p>
          
          <div class="order-details">
            <h3>Order Details</h3>
            <p><strong>Order ID:</strong> #${orderId}</p>
            <p><strong>Product:</strong> ${escapeHtml(productName)}</p>
            <p><strong>Quantity:</strong> ${quantity}</p>
            <p><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>
            <p><strong>Status:</strong> <span class="status-badge">Pending Seller Approval</span></p>
          </div>
          
          <div class="order-details">
            <h3>Shipping Information</h3>
            <p><strong>Address:</strong> ${escapeHtml(deliveryAddress)}</p>
            <p><strong>Estimated Delivery:</strong> ${estimatedDays} ${estimatedDays === 1 ? 'day' : 'days'} after seller approval</p>
          </div>
          
          <p>You will receive another email when the seller accepts your order.</p>
          
          <a href="https://core-insight-7.onrender.com/order-tracking.html?orderId=${orderId}" class="btn">Track Your Order</a>
          
          <div class="footer">
            <p>Core Insight Marketplace<br>Need help? Contact us at suppourtcoreinsight@gmail.com</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    await sendVerificationEmail(email, `Order Confirmation #${orderId} - Core Insight`, emailHtml);
    
    console.log(`✅ Order confirmation email sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Order confirmation email error:', error.message);
    return { success: false, error: error.message };
  }
}

async function sendSellerNotificationEmail(sellerData) {
  try {
    const { email, name, orderId, productName, quantity, totalAmount } = sellerData;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>New Order Notification - Core Insight</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          h1 { color: #3b82f6; margin-top: 0; }
          .order-details { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; }
          .btn { background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📦 New Order Received!</h1>
          <p>Hello ${escapeHtml(name)},</p>
          <p>You have received a new order that requires your approval.</p>
          
          <div class="order-details">
            <h3>Order Details</h3>
            <p><strong>Order ID:</strong> #${orderId}</p>
            <p><strong>Product:</strong> ${escapeHtml(productName)}</p>
            <p><strong>Quantity:</strong> ${quantity}</p>
            <p><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>
          </div>
          
          <p>Please log in to your dashboard to approve or reject this order.</p>
          
          <a href="https://core-insight-7.onrender.com/dashboard.html" class="btn">Go to Dashboard</a>
          
          <div class="footer">
            <p>Core Insight Marketplace<br>Funds will be held in escrow for 5 days after payment.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    await sendVerificationEmail(email, `New Order #${orderId} - Requires Approval`, emailHtml);
    
    console.log(`✅ Seller notification email sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Seller notification email error:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// ROUTES - AUTHENTICATION (keep existing)
// ============================================
// ============================================
// ROUTES - AUTHENTICATION
// ============================================
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    if (!username || !password || !email) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    const userRole = ['client', 'freelancer', 'admin'].includes(role) ? role : 'client';
    const existingUsers = await db.query("SELECT id FROM users WHERE username = ? OR email = ?", [username, email]);
    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({ error: "Username or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await db.query(
      `INSERT INTO users (username, email, password, role, verified, verify_token, verify_token_expiry, created_at) 
       VALUES (?, ?, ?, ?, 0, ?, ?, NOW())`,
      [username, email, hashedPassword, userRole, verifyToken, tokenExpiry]
    );

    const verifyLink = `https://core-insight-7.onrender.com/verify.html?token=${verifyToken}`;
    const emailHtml = `
      <!DOCTYPE html><html><head><title>Verify Your Email - Core Insight</title></head>
      <body style="font-family:Arial,sans-serif;background:#0a192f;color:#e6f1ff;">
        <div style="max-width:600px;margin:0 auto;padding:20px;">
          <h1 style="color:#64ffda;">🎓 Core Insight</h1><h2>Welcome ${username}!</h2>
          <p>Please verify your email address to activate your account:</p>
          <a href="${verifyLink}" style="background:#64ffda;color:#0a192f;padding:12px 24px;text-decoration:none;border-radius:5px;">Verify My Email</a>
          <p><strong>⚠️ This link expires in 24 hours.</strong></p>
        </div>
      </body></html>
    `;

    const emailResult = await sendVerificationEmail(email, "Verify Your Email - Core Insight", emailHtml);
    if (!emailResult.success) {
      return res.status(202).json({
        message: "Account created! However, we couldn't send the verification email. Please contact support.",
        requiresManualVerification: true,
        token: verifyToken,
        userId: result.insertId
      });
    }

    res.json({ message: "Account created! Please check your email to verify your account.", requiresVerification: true });
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if ((!username && !email) || !password) {
      return res.status(400).json({ error: "Username/email and password are required" });
    }

    let user = null;
    const identifier = username ? { query: "SELECT * FROM users WHERE username = ?", params: [username] }
                                 : { query: "SELECT * FROM users WHERE email = ?", params: [email] };

    const users = await db.query(identifier.query, identifier.params);
    if (users && users.length > 0) user = users[0];

    if (!user) {
      return res.status(400).json({ error: `User with ${username ? 'username' : 'email'} "${identifier.params[0]}" not found` });
    }

    if (!user.verified) {
      return res.status(403).json({ error: "Please verify your email before logging in.", unverified: true, email: user.email });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) return res.status(400).json({ error: "Invalid password" });

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'client',
      verified: user.verified
    };

    res.json({ message: "Login successful!", user: req.session.user, verified: true });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ message: "Logged out" });
});

app.get("/api/me", (req, res) => {
  res.json(req.session.user || null);
});

app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email is required" });

  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000);

    const result = await db.query(
      "UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?",
      [token, expires, email]
    );

    const responseMessage = "If that email address exists in our system, we've sent a password reset link to it.";

    if (result.affectedRows > 0 && transporter) {
      const resetLink = `https://core-insight-7.onrender.com/reset-password.html?token=${token}`;
      await transporter.sendMail({
        from: `"Core Insight" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Reset your Core Insight password",
        html: `<div><h2>Reset Password</h2><a href="${resetLink}">Click here to reset your password</a><p>This link expires in 1 hour.</p></div>`
      });
    }

    res.json({ success: true, message: responseMessage });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, message: "An error occurred. Please try again later." });
  }
});

app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ success: false, error: "Token and password are required" });

  try {
    const users = await db.query(
      "SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()",
      [token]
    );

    if (!users || users.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid or expired reset token" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      "UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE reset_token = ?",
      [hashedPassword, token]
    );

    res.json({ success: true, message: "Password reset successfully!" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, error: "Error resetting password" });
  }
});


// ============================================
// ROUTES - PRODUCTS
// ============================================
app.get("/api/products", async (req, res) => {
  try {
    console.log('📦 Fetching products...');
    
    const products = await db.query(`
      SELECT 
        p.*,
        u.username as seller_name,
        p.rating,
        p.review_count,
        p.delivery_locations,
        p.estimated_delivery_days
      FROM products p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE (p.is_deleted = 0 OR p.is_deleted IS NULL)
      ORDER BY p.created_at DESC
    `);
    
    const processedProducts = extractRows(products).map(product => {
      product.price = parseFloat(product.price || 0);
      product.original_price = parseFloat(product.original_price) || product.price;
      product.platform_fee = parseFloat(product.platform_fee) || (product.type === 'physical' ? product.original_price * 0.1 : 0);
      product.seller_price = product.type === 'physical' ? product.original_price - product.platform_fee : product.price;
      product.rating = parseFloat(product.rating) || 0;
      product.review_count = parseInt(product.review_count) || 0;
      product.delivery_locations = product.delivery_locations || 'Worldwide';
      product.estimated_delivery_days = product.estimated_delivery_days || 7;

      let imageUrls = [];
      if (product.image_urls) {
        try {
          if (typeof product.image_urls === 'string') {
            if (product.image_urls.startsWith('[')) {
              imageUrls = JSON.parse(product.image_urls);
            } else if (product.image_urls.startsWith('http')) {
              imageUrls = [product.image_urls];
            } else {
              imageUrls = [product.image_urls];
            }
          } else if (Array.isArray(product.image_urls)) {
            imageUrls = product.image_urls;
          }
        } catch (e) {
          console.error(`Error parsing image_urls for product ${product.id}:`, e.message);
          imageUrls = [product.image_urls];
        }
      }
      
      if (imageUrls.length === 0 && product.images) {
        try {
          if (typeof product.images === 'string') {
            if (product.images.startsWith('[')) {
              imageUrls = JSON.parse(product.images);
            } else {
              imageUrls = [product.images];
            }
          } else if (Array.isArray(product.images)) {
            imageUrls = product.images;
          }
        } catch (e) {}
      }
      
      if (!imageUrls || imageUrls.length === 0) {
        imageUrls = ['https://placehold.co/400x250/1e293b/3b82f6/png?text=Product'];
      }
      
      product._imageList = imageUrls;
      product.images = imageUrls;
      
      if (!product.type) product.type = product.affiliate_link ? 'affiliate' : 'digital';
      
      return product;
    });
    
    res.setHeader('Content-Type', 'application/json');
    res.json(processedProducts);
    
  } catch (err) {
    console.error('❌ Error fetching products:', err);
    res.status(500).json({ 
      error: "Error fetching products",
      details: err.message 
    });
  }
});

// ============================================
// SELLER NOTIFICATIONS ENDPOINT - FIXED
// ============================================

app.get("/api/seller/notifications", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const userId = req.session.user.id;
    
    // Get seller notifications
    const notifications = await db.query(`
      SELECT n.*, o.product_name, o.total_amount, o.quantity, o.order_status
      FROM seller_notifications n
      LEFT JOIN physical_orders o ON n.order_id = o.id
      WHERE n.seller_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [userId]);
    
    const unreadCount = await db.query(`
      SELECT COUNT(*) as count
      FROM seller_notifications
      WHERE seller_id = ? AND is_read = 0
    `, [userId]);
    
    const count = (unreadCount && unreadCount.length > 0) ? unreadCount[0].count : 0;
    
    res.json({
      success: true,
      notifications: extractRows(notifications),
      unreadCount: count
    });
    
  } catch (err) {
    console.error("❌ Error loading seller notifications:", err);
    res.status(500).json({ error: err.message });
  }
});

// Mark notification as read
app.post("/api/seller/notifications/:id/read", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    await db.query(
      "UPDATE seller_notifications SET is_read = 1 WHERE id = ? AND seller_id = ?",
      [req.params.id, req.session.user.id]
    );
    
    res.json({ success: true });
    
  } catch (err) {
    console.error("❌ Error marking notification read:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SELLER ORDERS ENDPOINT - FIXED
// ============================================

app.get("/api/orders/seller/:sellerId", async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    
    // If user is not logged in or not the seller, return 401
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    if (parseInt(sellerId) !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    const orders = await db.query(`
      SELECT o.*, p.title as product_name, p.images, p.type
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      WHERE o.seller_id = ?
      ORDER BY o.created_at DESC
    `, [sellerId]);
    
    // Process orders
    const processedOrders = extractRows(orders).map(order => {
      order.total_amount = parseFloat(order.total_amount);
      order.platform_fee = parseFloat(order.platform_fee) || 0;
      order.seller_earnings = parseFloat(order.seller_earnings) || 0;
      
      if (order.images) {
        try {
          if (typeof order.images === 'string') {
            if (order.images.startsWith('[')) {
              order.images = JSON.parse(order.images);
            } else {
              order.images = [order.images];
            }
          }
        } catch (e) {
          order.images = [];
        }
      }
      
      return order;
    });
    
    res.json(processedOrders);
    
  } catch (err) {
    console.error("❌ Error loading seller orders:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SELLER PRODUCTS ENDPOINT - FIXED
// ============================================

app.get("/api/products/seller/:sellerId", async (req, res) => {
  try {
    const sellerId = req.params.sellerId;
    
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    if (parseInt(sellerId) !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    const products = await db.query(`
      SELECT * FROM products 
      WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY created_at DESC
    `, [sellerId]);
    
    const processedProducts = extractRows(products).map(product => {
      product.price = parseFloat(product.price);
      product.original_price = parseFloat(product.original_price) || product.price;
      
      if (product.image_urls) {
        try {
          if (typeof product.image_urls === 'string') {
            if (product.image_urls.startsWith('[')) {
              product.images = JSON.parse(product.image_urls);
            } else {
              product.images = [product.image_urls];
            }
          } else if (Array.isArray(product.image_urls)) {
            product.images = product.image_urls;
          }
        } catch (e) {
          product.images = [];
        }
      }
      
      return product;
    });
    
    res.json(processedProducts);
    
  } catch (err) {
    console.error("❌ Error loading seller products:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PHYSICAL ORDER SYSTEM
// ============================================

// 1. Create physical order (WITHOUT payment first) - UPDATED
app.post("/api/physical-orders/create", async (req, res) => {
  try {
    console.log("📦 Creating physical order...");
    
    if (!req.session.user) return res.status(401).json({ error: "Please log in to place an order" });

    const { productId, quantity = 1, deliveryAddress, city, state, country, deliveryPhone, notes = '' } = req.body;
    if (!productId) return res.status(400).json({ error: "Product ID is required" });
    if (!deliveryAddress) return res.status(400).json({ error: "Delivery address is required" });
    if (!deliveryPhone) return res.status(400).json({ error: "Delivery phone is required" });
    
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 100) {
      return res.status(400).json({ error: "Quantity must be between 1 and 100" });
    }

    // Get product with seller info
    const productResult = await db.query(
      `SELECT p.*, u.email as seller_email, u.username as seller_name
       FROM products p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = ? AND (p.is_deleted = 0 OR p.is_deleted IS NULL)`,
      [productId]
    );

    if (!productResult || productResult.length === 0) return res.status(404).json({ error: "Product not found" });

    const product = productResult[0];
    const sellerId = product.user_id;
    const buyerId = req.session.user.id;
    const productPrice = parseFloat(product.original_price || product.price);
    const totalAmount = qty * productPrice;

    // Calculate fees for internal tracking (customer doesn't see these)
    const baseFee = productPrice * 0.10;
    const basePlatformFeeTotal = baseFee * qty;
    let bulkOrderFee = 0;
    let platformFee = basePlatformFeeTotal;
    
    if (qty >= 6) {
      bulkOrderFee = totalAmount * 0.10;
      platformFee = basePlatformFeeTotal + bulkOrderFee;
    }
    
    const sellerEarnings = totalAmount - (product.product_cost || 0) * qty;
    
    const feeBreakdown = {
      type: qty >= 6 ? 'bulk' : 'standard',
      quantity: qty,
      product_price: productPrice,
      total_amount: totalAmount,
      base_fee: basePlatformFeeTotal,
      bulk_fee: bulkOrderFee,
      total_platform_fee: platformFee,
      seller_earnings: sellerEarnings,
      note: qty >= 6 ? 'Bulk order: Base fee + 10% of total' : 'Standard order: 10% of product price per unit'
    };

    // Insert order with correct status
    const result = await db.query(
      `INSERT INTO physical_orders (
        product_id, seller_id, buyer_id,
        product_name, product_type, quantity, 
        price, total_amount,
        customer_name, customer_email, customer_phone,
        shipping_address, city, state, country,
        payment_method, payment_status, order_status,
        notes, estimated_delivery_days,
        platform_fee, base_platform_fee, bulk_order_fee, seller_earnings,
        fee_breakdown, payment_provider,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        productId, sellerId, buyerId,
        product.title,
        'physical', qty,
        productPrice,
        totalAmount,
        req.session.user.username || 'Buyer',
        req.session.user.email,
        deliveryPhone,
        deliveryAddress,
        city || '',
        state || '',
        country || '',
        'pay_after_approval',
        'pending',
        'pending_seller_approval',  // This is the correct status value
        notes || '',
        product.estimated_delivery_days || 7,
        platformFee,
        basePlatformFeeTotal,
        bulkOrderFee,
        sellerEarnings,
        JSON.stringify(feeBreakdown),
        'flutterwave'
      ]
    );

    const orderId = result.insertId;
    console.log(`✅ Order #${orderId} created, awaiting seller approval`);

    // Create seller notification
    await db.query(
      `INSERT INTO seller_notifications 
       (seller_id, order_id, notification_type, title, message, created_at, is_read)
       VALUES (?, ?, 'new_order', 'New Order Requires Approval', 
               CONCAT('Order #', ?, ' for ', ?, ' (x', ?, ') needs your approval before payment'), NOW(), 0)`,
      [sellerId, orderId, orderId, product.title, qty]
    );

    // Send email confirmation to buyer
    try {
      await sendOrderConfirmationEmail({
        email: req.session.user.email,
        name: req.session.user.username,
        orderId: orderId,
        productName: product.title,
        quantity: qty,
        totalAmount: totalAmount,
        deliveryAddress: deliveryAddress,
        estimatedDays: product.estimated_delivery_days || 7
      });
    } catch (emailError) {
      console.error('❌ Order confirmation email failed:', emailError.message);
    }

    // Send email notification to seller
    try {
      await sendSellerNotificationEmail({
        email: product.seller_email,
        name: product.seller_name,
        orderId: orderId,
        productName: product.title,
        quantity: qty,
        totalAmount: totalAmount
      });
    } catch (emailError) {
      console.error('❌ Seller notification email failed:', emailError.message);
    }

    res.json({
      success: true,
      message: "Order created! The seller will review and confirm availability.",
      orderId: orderId,
      status: "pending_seller_approval",
      totalAmount: totalAmount
    });

  } catch (err) {
    console.error("❌ Order creation error:", err);
    res.status(500).json({ error: "Failed to create order: " + err.message });
  }
});

// 2. Seller accepts or rejects order
app.post("/api/physical-orders/:orderId/respond", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });

    const orderId = req.params.orderId;
    const { action, message } = req.body;

    // Get order details
    const orderResult = await db.query(
      `SELECT o.*, p.title as product_name, p.user_id as product_seller_id, u.email as buyer_email, u.username as buyer_name
       FROM physical_orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN users u ON o.buyer_id = u.id
       WHERE o.id = ?`,
      [orderId]
    );

    if (!orderResult || orderResult.length === 0) return res.status(404).json({ error: "Order not found" });

    const order = orderResult[0];

    // Check if user is the seller or admin
    if (order.seller_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Only the seller can respond to this order" });
    }

    // Check if order is in correct state
    if (order.order_status !== 'pending_seller_approval') {
      return res.status(400).json({ error: "Order has already been responded to" });
    }

    if (action === 'accept') {
      // Calculate fees for the order
      const productPrice = parseFloat(order.price);
      const qty = order.quantity;
      const totalAmount = parseFloat(order.total_amount);
      
      let platformFee = 0;
      let sellerEarnings = 0;
      let feeBreakdown = {};
      
      if (qty <= 5) {
        // Standard order (1-5 units): Only base fee (10% of single product price)
        platformFee = productPrice * 0.10;
        sellerEarnings = totalAmount - platformFee;
        feeBreakdown = {
          type: "standard",
          baseFee: platformFee,
          totalFee: platformFee,
          formula: `${totalAmount} - ${platformFee} = ${sellerEarnings}`,
          sellerNote: `Standard order (${qty} unit${qty > 1 ? 's' : ''}): Platform fee is $${platformFee.toFixed(2)} (10% of single product price)`
        };
      } else {
        // Bulk order (6+ units): Base fee + 10% of total order
        const baseFee = productPrice * 0.10;
        const bulkFee = totalAmount * 0.10;
        platformFee = baseFee + bulkFee;
        sellerEarnings = totalAmount - platformFee;
        feeBreakdown = {
          type: "bulk",
          baseFee: baseFee,
          bulkFee: bulkFee,
          totalFee: platformFee,
          formula: `${totalAmount} - (${baseFee} + ${bulkFee}) = ${sellerEarnings}`,
          sellerNote: `BULK order (${qty} units): Platform fee = Base fee ($${baseFee.toFixed(2)}) + 10% of total ($${bulkFee.toFixed(2)}) = $${platformFee.toFixed(2)}`
        };
      }
      
      // Update order status
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'seller_accepted',
             seller_accepted_at = NOW(),
             platform_fee = ?,
             seller_earnings = ?,
             fee_breakdown = ?
         WHERE id = ?`,
        [platformFee, sellerEarnings, JSON.stringify(feeBreakdown), orderId]
      );

      // Record acceptance
      await db.query(
        `INSERT INTO order_acceptances (order_id, seller_id, status, response_message, responded_at)
         VALUES (?, ?, 'accepted', ?, NOW())`,
        [orderId, req.session.user.id, message || null]
      );

      // Create buyer notification for payment required
      await db.query(
        `INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message, created_at)
         VALUES (?, ?, 'payment_required', 'Payment Required', 
                 CONCAT('Seller has accepted your order for ', ?, '. Please complete payment to confirm your order.'), NOW())`,
        [order.buyer_id, orderId, order.product_name]
      );

      // Send payment link email to buyer
      try {
        const paymentLink = `https://core-insight-7.onrender.com/pay-order.html?orderId=${orderId}`;
        
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head><title>Payment Required - Core Insight</title></head>
          <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
            <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
              <h1 style="color:#3b82f6;">💰 Payment Required</h1>
              <p>Hello ${escapeHtml(order.buyer_name)},</p>
              <p>The seller has accepted your order! Please complete payment to confirm.</p>
              <div style="background:#0f172a;padding:20px;border-radius:12px;margin:20px 0;">
                <p><strong>Order #${orderId}</strong></p>
                <p>${order.product_name} (x${order.quantity})</p>
                <p><strong>Total: $${order.total_amount}</strong></p>
                ${feeBreakdown.type === 'bulk' ? `
                  <p style="font-size:12px;color:#f59e0b;">Bulk order discount applied!</p>
                ` : ''}
              </div>
              <a href="${paymentLink}" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin:20px 0;">Pay Now</a>
              <p style="font-size:12px;color:#94a3b8;">Funds will be held in escrow for 5 days after payment.</p>
            </div>
          </body>
          </html>
        `;
        
        await sendVerificationEmail(order.buyer_email, `Payment Required for Order #${orderId}`, emailHtml);
      } catch (emailError) {
        console.error('❌ Payment link email failed:', emailError.message);
      }

      res.json({
        success: true,
        message: "Order accepted! The buyer will now be prompted to complete payment.",
        requiresPayment: true,
        orderId: orderId,
        platformFee: platformFee,
        sellerEarnings: sellerEarnings,
        feeBreakdown: feeBreakdown
      });

    } else if (action === 'reject') {
      // Update order status to rejected/cancelled
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'cancelled',
             order_status = 'cancelled'
         WHERE id = ?`,
        [orderId]
      );

      // Record rejection
      await db.query(
        `INSERT INTO order_acceptances (order_id, seller_id, status, response_message, responded_at)
         VALUES (?, ?, 'rejected', ?, NOW())`,
        [orderId, req.session.user.id, message || 'Seller unable to fulfill order']
      );

      // Create buyer notification
      await db.query(
        `INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message, created_at)
         VALUES (?, ?, 'order_rejected', 'Order Declined', 
                 CONCAT('Seller was unable to fulfill your order for ', ?, '. Reason: ', ?), NOW())`,
        [order.buyer_id, orderId, order.product_name, message || 'No reason provided']
      );

      res.json({
        success: true,
        message: "Order rejected and cancelled. Buyer has been notified."
      });
    }

  } catch (err) {
    console.error("❌ Order response error:", err);
    res.status(500).json({ error: "Failed to process order response" });
  }
});

// 3. Get order details (for buyer/seller)
app.get("/api/orders/:orderId", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    
    const order = await db.query(`
      SELECT o.*, p.title as product_name, p.images, 
             u_seller.username as seller_name, u_seller.email as seller_email,
             u_buyer.username as buyer_name, u_buyer.email as buyer_email
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u_seller ON o.seller_id = u_seller.id
      LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
      WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)
    `, [orderId, req.session.user.id, req.session.user.id]);
    
    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const orderData = order[0];
    orderData.total_amount = parseFloat(orderData.total_amount);
    orderData.platform_fee = parseFloat(orderData.platform_fee) || 0;
    orderData.seller_earnings = parseFloat(orderData.seller_earnings) || 0;
    
    if (orderData.fee_breakdown) {
      try {
        orderData.fee_breakdown = JSON.parse(orderData.fee_breakdown);
      } catch (e) {}
    }
    
    res.json({ success: true, order: orderData });
    
  } catch (err) {
    console.error("❌ Error loading order details:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Get payment link for order (after seller accepts)
app.post("/api/physical-orders/:orderId/get-payment-link", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });

    const orderId = req.params.orderId;

    // Get order details
    const orderResult = await db.query(
      `SELECT o.*, p.title as product_name, p.original_price, p.product_cost
       FROM physical_orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.id = ? AND o.buyer_id = ?`,
      [orderId, req.session.user.id]
    );

    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult[0];

    // Check if order is in correct state for payment
    if (order.order_status !== 'seller_accepted') {
      return res.status(400).json({ 
        error: `Payment can only be made after seller approval. Current status: ${order.order_status}` 
      });
    }

    const totalAmount = parseFloat(order.total_amount);
    const platformFee = parseFloat(order.platform_fee) || (totalAmount * 0.10);
    const sellerEarnings = parseFloat(order.seller_earnings) || (totalAmount - platformFee);
    
    // Parse fee breakdown
    let feeBreakdown = {};
    try {
      if (order.fee_breakdown) {
        feeBreakdown = typeof order.fee_breakdown === 'string' ? 
          JSON.parse(order.fee_breakdown) : order.fee_breakdown;
      }
    } catch (e) {
      feeBreakdown = { type: "standard", totalFee: platformFee };
    }

    // Generate transaction reference
    const transactionRef = `physical_${orderId}_${Date.now()}`;

    // Initialize Flutterwave payment
    if (!process.env.FLW_SECRET_KEY) {
      return res.status(500).json({ error: "Payment system not configured" });
    }

    const payload = {
      tx_ref: transactionRef,
      amount: totalAmount,
      currency: "USD",
      redirect_url: "https://core-insight-7.onrender.com/physical-payment-callback.html",
      customer: {
        email: req.session.user.email,
        name: req.session.user.username,
      },
      customizations: {
        title: "Core Insight - Physical Product",
        description: `Order #${orderId}: ${order.product_name} (x${order.quantity})`,
      },
      meta: {
        order_id: orderId,
        product_id: order.product_id,
        buyer_id: req.session.user.id,
        seller_id: order.seller_id,
        type: 'physical_order',
        is_escrow: true,
        escrow_days: 5,
        quantity: order.quantity,
        platform_fee: platformFee,
        seller_earnings: sellerEarnings,
        fee_breakdown: JSON.stringify(feeBreakdown)
      }
    };

    console.log(`📤 Sending to Flutterwave for order #${orderId}:`, JSON.stringify(payload, null, 2));

    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data.status === "success" && response.data.data && response.data.data.link) {
      // Update order with transaction reference
      await db.query(
        `UPDATE physical_orders SET transaction_ref = ?, payment_method = 'pay_online' WHERE id = ?`,
        [transactionRef, orderId]
      );

      res.json({
        success: true,
        paymentLink: response.data.data.link,
        transactionRef: transactionRef,
        orderId: orderId,
        totalAmount: totalAmount,
        platformFee: platformFee,
        sellerEarnings: sellerEarnings,
        feeBreakdown: feeBreakdown
      });
    } else {
      throw new Error(response.data.message || "Payment initialization failed");
    }

  } catch (err) {
    console.error("❌ Payment link error:", err);
    res.status(500).json({ error: "Failed to create payment link: " + err.message });
  }
});

// 5. Verify payment (webhook/callback)
app.get("/api/verify-physical-payment/:transaction_ref", async (req, res) => {
  try {
    const { transaction_ref } = req.params;
    
    console.log(`🔍 Verifying payment for transaction: ${transaction_ref}`);

    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${transaction_ref}`,
      {
        headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
      }
    );

    if (response.data.status === "success" && response.data.data.status === "successful") {
      const transaction = response.data.data;
      const orderId = transaction.meta?.order_id;
      const amount = transaction.amount;
      const platformFee = parseFloat(transaction.meta?.platform_fee) || (amount * 0.10);
      const sellerAmount = parseFloat(transaction.meta?.seller_earnings) || (amount - platformFee);

      const escrowReleaseDate = new Date();
      escrowReleaseDate.setDate(escrowReleaseDate.getDate() + 5);

      await db.query(
        `UPDATE physical_orders 
         SET payment_status = 'paid',
             order_status = 'paid',
             payment_collected_at = NOW(),
             payment_held_until = ?,
             platform_fee = ?,
             seller_earnings = ?,
             transaction_ref = ?
         WHERE id = ?`,
        [escrowReleaseDate, platformFee, sellerAmount, transaction_ref, orderId]
      );

      await db.query(
        `INSERT INTO escrow_accounts 
         (order_id, buyer_id, seller_id, amount, platform_fee, seller_amount, 
          payment_reference, status, held_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'held', NOW(), NOW())`,
        [orderId, transaction.meta?.buyer_id, transaction.meta?.seller_id, 
         amount, platformFee, sellerAmount, transaction_ref]
      );

      await db.query(
        `INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message, created_at)
         VALUES (?, ?, 'payment_confirmed', 'Payment Confirmed', 
                 CONCAT('Your payment of $', ?, ' has been confirmed. Seller will process your order.'), NOW())`,
        [transaction.meta?.buyer_id, orderId, amount]
      );

      await db.query(
        `INSERT INTO seller_notifications (seller_id, order_id, notification_type, title, message, created_at)
         VALUES (?, ?, 'payment_received', 'Payment Received', 
                 CONCAT('Buyer has paid $', ?, ' for order #', ?, '. Funds will be released to you after 5 days.'), NOW())`,
        [transaction.meta?.seller_id, orderId, amount, orderId]
      );

      res.json({
        status: "success",
        message: "Payment verified and held in escrow",
        orderId: orderId,
        amount: amount,
        platformFee: platformFee,
        sellerAmount: sellerAmount,
        escrowReleaseDate: escrowReleaseDate
      });
    } else {
      res.status(400).json({ status: "failed", message: "Payment not successful" });
    }

  } catch (err) {
    console.error('❌ Verification error:', err);
    res.status(500).json({ error: "Error verifying payment", details: err.message });
  }
});

// 6. Get seller's physical orders (dashboard)
app.get("/api/seller/physical-orders", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });

    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT o.*, p.title as product_name, u.username as buyer_name, u.email as buyer_email
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.buyer_id = u.id
      WHERE o.seller_id = ?
    `;
    const params = [req.session.user.id];

    if (status && status !== 'all') {
      query += " AND o.order_status = ?";
      params.push(status);
    }

    query += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const orders = await db.query(query, params);

    // Get counts for dashboard
    const counts = await db.query(
      `SELECT 
        COUNT(CASE WHEN order_status = 'pending_seller_approval' THEN 1 END) as pending_approval,
        COUNT(CASE WHEN order_status = 'seller_accepted' THEN 1 END) as accepted,
        COUNT(CASE WHEN order_status = 'paid' THEN 1 END) as paid,
        COUNT(CASE WHEN order_status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN order_status = 'refund_requested' THEN 1 END) as refund_requests
       FROM physical_orders
       WHERE seller_id = ?`,
      [req.session.user.id]
    );

    const processedOrders = extractRows(orders).map(order => {
      order.total_amount = parseFloat(order.total_amount);
      order.platform_fee = parseFloat(order.platform_fee) || 0;
      order.seller_earnings = parseFloat(order.seller_earnings) || 0;
      
      if (order.fee_breakdown) {
        try {
          order.fee_breakdown = JSON.parse(order.fee_breakdown);
        } catch (e) {}
      }
      
      return order;
    });

    res.json({
      success: true,
      orders: processedOrders,
      counts: counts[0] || {},
      pagination: { page: parseInt(page), limit: parseInt(limit) }
    });

  } catch (err) {
    console.error("❌ Error fetching seller orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// 7. Get buyer's physical orders
app.get("/api/buyer/physical-orders", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });

    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT o.*, p.title as product_name, u.username as seller_name, u.email as seller_email
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.seller_id = u.id
      WHERE o.buyer_id = ?
    `;
    const params = [req.session.user.id];

    if (status && status !== 'all') {
      query += " AND o.order_status = ?";
      params.push(status);
    }

    query += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const orders = await db.query(query, params);

    const processedOrders = extractRows(orders).map(order => {
      order.total_amount = parseFloat(order.total_amount);
      return order;
    });

    res.json({
      success: true,
      orders: processedOrders,
      pagination: { page: parseInt(page), limit: parseInt(limit) }
    });

  } catch (err) {
    console.error("❌ Error fetching buyer orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// 8. Request refund
app.post("/api/physical-orders/:orderId/refund", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });

    const orderId = req.params.orderId;
    const { reason } = req.body;

    if (!reason || reason.length < 10) {
      return res.status(400).json({ error: "Please provide a detailed reason for refund (min 10 characters)" });
    }

    const orderResult = await db.query(
      `SELECT o.*, p.title as product_name 
       FROM physical_orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.id = ? AND o.buyer_id = ?`,
      [orderId, req.session.user.id]
    );

    if (!orderResult || orderResult.length === 0) return res.status(404).json({ error: "Order not found" });

    const order = orderResult[0];

    // Check if refund is within 5-day window
    const paymentDate = new Date(order.payment_collected_at);
    const now = new Date();
    const daysSincePayment = (now - paymentDate) / (1000 * 60 * 60 * 24);

    if (daysSincePayment > 5) {
      return res.status(400).json({ 
        error: "Refund window has closed (5 days after payment). Please contact support for assistance." 
      });
    }

    if (order.order_status === 'refunded') {
      return res.status(400).json({ error: "Order has already been refunded" });
    }

    await db.query(
      `UPDATE physical_orders 
       SET order_status = 'refund_requested',
           refund_requested_at = NOW(),
           refund_reason = ?
       WHERE id = ?`,
      [reason, orderId]
    );

    // Notify seller
    await db.query(
      `INSERT INTO seller_notifications (seller_id, order_id, notification_type, title, message, created_at)
       VALUES (?, ?, 'refund_request', 'Refund Requested', 
               CONCAT('Buyer requested refund for order #', ?, '. Reason: ', ?), NOW())`,
      [order.seller_id, orderId, orderId, reason.substring(0, 100)]
    );

    res.json({
      success: true,
      message: "Refund request submitted. Seller will review and process within 48 hours."
    });

  } catch (err) {
    console.error("❌ Refund request error:", err);
    res.status(500).json({ error: "Failed to submit refund request" });
  }
});

// 9. Check refund status
app.get("/api/orders/:orderId/refund-status", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    
    const order = await db.query(
      `SELECT o.order_status, o.refund_reason, o.refund_requested_at, 
              o.refund_processed_at, o.refund_notes,
              u.username as processed_by_name
       FROM physical_orders o
       LEFT JOIN users u ON o.refund_approved_by = u.id
       WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)`,
      [orderId, req.session.user.id, req.session.user.id]
    );
    
    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const orderData = order[0];
    let refundStatus = 'none';
    let message = '';
    
    if (orderData.order_status === 'refund_requested') {
      refundStatus = 'pending';
      message = 'Your refund request is pending review. The seller has 48 hours to respond.';
    } else if (orderData.order_status === 'refunded') {
      refundStatus = 'approved';
      message = `Refund approved and processed on ${new Date(orderData.refund_processed_at).toLocaleDateString()}. Please allow 5-10 business days for the refund to appear.`;
    } else if (orderData.order_status === 'completed') {
      refundStatus = 'denied';
      message = orderData.refund_notes || 'Refund request was denied.';
    }
    
    res.json({
      success: true,
      refundStatus: refundStatus,
      refundReason: orderData.refund_reason,
      requestedAt: orderData.refund_requested_at,
      processedAt: orderData.refund_processed_at,
      message: message,
      notes: orderData.refund_notes
    });
    
  } catch (err) {
    console.error("❌ Error checking refund status:", err);
    res.status(500).json({ error: err.message });
  }
});

// 10. Process refund (seller/admin)
app.post("/api/refunds/:orderId/process", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    const { action, admin_notes } = req.body;
    
    // Get order details with payment info
    const orderResult = await db.query(
      `SELECT o.*, p.type, p.title, s.flutterwave_subaccount_id, s.paystack_subaccount_code
       FROM physical_orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN sellers s ON o.seller_id = s.user_id
       WHERE o.id = ?`,
      [orderId]
    );
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    const paymentProvider = order.payment_provider || 'flutterwave';
    
    // Check if user is admin or the seller
    const isAdmin = req.session.user.role === 'admin';
    const isSeller = order.seller_id === req.session.user.id;
    
    if (!isAdmin && !isSeller) {
      return res.status(403).json({ error: "Only the seller or admin can process refunds" });
    }
    
    if (action === 'approve') {
      // Process refund based on payment provider
      let refundSuccess = false;
      let refundError = null;
      
      if (paymentProvider === 'flutterwave' && order.transaction_ref) {
        try {
          const refundResponse = await axios.post(
            'https://api.flutterwave.com/v3/transactions/refund',
            {
              transaction_id: order.transaction_ref,
              amount: order.total_amount,
              full_refund: true,
              narration: `Refund for order #${orderId} - ${order.product_name}`
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                'Content-Type': 'application/json'
              },
              timeout: 15000
            }
          );
          
          if (refundResponse.data.status === 'success') {
            refundSuccess = true;
            console.log(`✅ Flutterwave refund processed for order #${orderId}`);
          } else {
            refundError = refundResponse.data.message;
          }
        } catch (err) {
          refundError = err.response?.data?.message || err.message;
          console.error('❌ Flutterwave refund error:', refundError);
        }
      } else if (paymentProvider === 'paystack' && order.transaction_ref) {
        try {
          const refundResponse = await axios.post(
            'https://api.paystack.co/transaction/refund',
            {
              transaction: order.transaction_ref,
              amount: Math.round(order.total_amount * 100)
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
              },
              timeout: 15000
            }
          );
          
          if (refundResponse.data.status === true) {
            refundSuccess = true;
            console.log(`✅ Paystack refund processed for order #${orderId}`);
          } else {
            refundError = refundResponse.data.message;
          }
        } catch (err) {
          refundError = err.response?.data?.message || err.message;
          console.error('❌ Paystack refund error:', refundError);
        }
      }
      
      if (refundSuccess) {
        await db.query(
          `UPDATE physical_orders 
           SET order_status = 'refunded',
               refund_processed_at = NOW(),
               refund_approved_by = ?,
               refund_notes = ?
           WHERE id = ?`,
          [req.session.user.id, admin_notes || 'Refund approved', orderId]
        );
        
        // Update escrow account
        await db.query(
          `UPDATE escrow_accounts 
           SET status = 'refunded', 
               refunded_at = NOW(),
               refund_processed_by = ?
           WHERE order_id = ?`,
          [req.session.user.id, orderId]
        );
        
        // Notify buyer
        await db.query(
          `INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message, created_at)
           VALUES (?, ?, 'refund_approved', 'Refund Approved ✅', 
                   CONCAT('Your refund for order #', ?, ' has been approved. Please allow 5-10 business days for the refund to appear in your account.'), NOW())`,
          [order.buyer_id, orderId, orderId]
        );
        
        res.json({
          success: true,
          message: "Refund approved and processed successfully"
        });
        
      } else {
        res.status(500).json({ 
          success: false, 
          error: `Refund failed: ${refundError || 'Unknown error'}` 
        });
      }
      
    } else if (action === 'deny') {
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'completed',
             refund_denied_at = NOW(),
             refund_denied_by = ?,
             refund_notes = ?
         WHERE id = ?`,
        [req.session.user.id, admin_notes || 'Refund denied', orderId]
      );
      
      await db.query(
        `INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message, created_at)
         VALUES (?, ?, 'refund_denied', 'Refund Denied ❌', 
                 CONCAT('Your refund request for order #', ?, ' was denied. Reason: ', ?), NOW())`,
        [order.buyer_id, orderId, orderId, admin_notes || 'No reason provided']
      );
      
      res.json({
        success: true,
        message: "Refund request denied"
      });
    }
    
  } catch (err) {
    console.error("❌ Refund processing error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 11. Get pending refunds
app.get("/api/refunds/pending", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const isAdmin = req.session.user.role === 'admin';
    let query = `
      SELECT o.id, o.order_number, o.product_name, o.quantity, o.total_amount, 
             o.refund_reason, o.refund_requested_at,
             u_buyer.username as buyer_name, u_buyer.email as buyer_email,
             u_seller.username as seller_name, u_seller.email as seller_email,
             o.payment_provider, o.transaction_ref
      FROM physical_orders o
      LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
      LEFT JOIN users u_seller ON o.seller_id = u_seller.id
      WHERE o.order_status = 'refund_requested'
    `;
    
    const params = [];
    
    if (!isAdmin) {
      query += " AND o.seller_id = ?";
      params.push(req.session.user.id);
    }
    
    query += " ORDER BY o.refund_requested_at DESC";
    
    const refundRequests = await db.query(query, params);
    
    res.json({
      success: true,
      refunds: extractRows(refundRequests)
    });
    
  } catch (err) {
    console.error("❌ Error fetching refund requests:", err);
    res.status(500).json({ error: err.message });
  }
});

// 12. Check escrow status
app.get("/api/orders/:orderId/escrow-status", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    
    const order = await db.query(
      `SELECT id, payment_status, order_status, payment_held_until, total_amount, seller_earnings
       FROM physical_orders
       WHERE id = ? AND (buyer_id = ? OR seller_id = ?)`,
      [orderId, req.session.user.id, req.session.user.id]
    );
    
    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const orderData = order[0];
    const escrowStatus = {
      is_escrow: orderData.payment_status === 'paid' && orderData.order_status === 'paid',
      amount_held: orderData.total_amount,
      seller_earnings: orderData.seller_earnings,
      platform_fee: orderData.total_amount - orderData.seller_earnings,
      payment_held_until: orderData.payment_held_until,
      funds_released: orderData.order_status === 'completed'
    };
    
    res.json({
      success: true,
      ...escrowStatus
    });
    
  } catch (err) {
    console.error("❌ Error checking escrow status:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PRODUCT UPLOAD ENDPOINT (keep existing)
// ============================================
app.post("/api/upload-product", (req, res) => {
  const upload = multer({ storage: productStorage }).fields([
    { name: 'file', maxCount: 1 }, 
    { name: 'images[]', maxCount: 10 }
  ]);

  upload(req, res, async function(err) {
    if (err) return res.status(400).json({ error: 'File upload error: ' + err.message });

    try {
      if (!req.session.user) return res.status(401).json({ error: "Please log in to upload products." });

      const { 
        title, 
        description, 
        price, 
        category, 
        type, 
        affiliate_link, 
        paymentProvider,
        // Physical product fields
        delivery_days,
        product_cost,
        delivery_locations,
        delivery_type,
        payment_option,
        // Business info (stored for future use)
        businessName,
        businessEmail,
        businessPhone,
        country,
        bankName,
        bankCode,
        accountNumber,
        accountName
      } = req.body;

      // Validation
      if (!title || !price || !type || !paymentProvider) {
        return res.status(400).json({ error: "Title, price, type, and payment provider are required." });
      }
      
      if (type === 'affiliate' && !affiliate_link) {
        return res.status(400).json({ error: "Affiliate link is required for affiliate products." });
      }

      // For physical products, validate additional fields
      if (type === 'physical') {
        if (!product_cost) {
          return res.status(400).json({ error: "Product cost is required for physical products." });
        }
        if (!delivery_locations) {
          return res.status(400).json({ error: "Delivery locations are required for physical products." });
        }
      }

      const listedPrice = parseFloat(price);
      const productCostValue = type === 'physical' ? parseFloat(product_cost) || 3.00 : null;
      
      let sellerPrice = listedPrice;
      let platformFee = 0;
      let originalPrice = listedPrice;
      
      if (type === 'physical') {
        // For physical: Customer pays full price, platform fee is calculated at order time
        originalPrice = listedPrice;
        platformFee = 0; // Will be calculated per order based on quantity
        sellerPrice = originalPrice; // Customer pays full price
      } else if (type === 'digital') {
        // For digital: Platform takes 10%, seller gets 90%
        platformFee = listedPrice * 0.10;
        sellerPrice = listedPrice - platformFee;
      }

      // Process images with Cloudinary
      let imageUrls = [];
      if (req.files?.['images[]']?.length) {
        const cloudinary = require('cloudinary').v2;
        for (const imageFile of req.files['images[]']) {
          try {
            const result = await cloudinary.uploader.upload(imageFile.path, { 
              folder: 'core-insight/products',
              transformation: [{ width: 800, height: 600, crop: 'limit' }]
            });
            imageUrls.push(result.secure_url);
          } catch (cloudErr) { 
            console.error('Cloudinary upload error:', cloudErr); 
          }
        }
      }

      // Handle product file for digital products
      let fileUrl = null;
      if (req.files?.file?.[0]) {
        const productFile = req.files.file[0];
        const filesDir = path.join(uploadDirs.products, 'files');
        if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

        const timestamp = Date.now();
        const ext = path.extname(productFile.originalname);
        const baseName = path.basename(productFile.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
        const filename = `${timestamp}-${Math.floor(Math.random() * 1000000)}-${baseName}${ext}`;
        const finalPath = path.join(filesDir, filename);

        try {
          fs.copyFileSync(productFile.path, finalPath);
          fs.unlinkSync(productFile.path);
          fileUrl = `/uploads/products/files/${filename}`;
        } catch (fileError) {
          const data = fs.readFileSync(productFile.path);
          fs.writeFileSync(finalPath, data);
          fs.unlinkSync(productFile.path);
          fileUrl = `/uploads/products/files/${filename}`;
        }
      }

      // Insert product into database
      const result = await db.query(
        `INSERT INTO products (
          user_id, title, description, price, original_price, platform_fee, product_cost,
          category, type, file_url, image_urls, affiliate_link, 
          seller_payment_provider, delivery_type, delivery_locations, 
          payment_option, estimated_delivery_days, rating, review_count, 
          status, sales_count, favorite_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          req.session.user.id, 
          title, 
          description || '', 
          sellerPrice,        // price - what seller gets after fees
          originalPrice,      // original_price - what customer pays
          platformFee,        // platform_fee - our cut
          productCostValue,   // product_cost - seller's fulfillment cost
          category || '',
          type || 'digital', 
          fileUrl, 
          imageUrls.length ? JSON.stringify(imageUrls) : null, 
          affiliate_link || null, 
          paymentProvider,    // seller_payment_provider
          // For physical products, use delivery_type from form, otherwise NULL
          type === 'physical' ? (delivery_type || 'delivery') : null,
          // delivery_locations
          type === 'physical' ? (delivery_locations || 'Worldwide') : null,
          // payment_option
          type === 'physical' ? (payment_option || 'pay_before_delivery') : null,
          // estimated_delivery_days
          type === 'physical' ? (parseInt(delivery_days) || 7) : null,
          // rating, review_count
          0.00,  // rating
          0,     // review_count
          'active',  // status
          0,     // sales_count
          0      // favorite_count
        ]
      );

      const productId = result.insertId;
      
      // ================= CREATE SUBACCOUNT FOR SELLER (Both Flutterwave & Paystack) =================
      let subaccountCreated = false;
      let subaccountId = null;

      if ((type === 'digital' || type === 'physical') && accountNumber && bankName && paymentProvider) {
        try {
          // Check if seller already has a subaccount for this provider
          let existingSub = null;
          if (paymentProvider === 'flutterwave') {
            existingSub = await db.query(
              "SELECT flutterwave_subaccount_id FROM sellers WHERE user_id = ?",
              [req.session.user.id]
            );
            if (existingSub && existingSub.length > 0 && existingSub[0].flutterwave_subaccount_id) {
              console.log(`✅ Seller already has Flutterwave subaccount: ${existingSub[0].flutterwave_subaccount_id}`);
              subaccountCreated = true;
              subaccountId = existingSub[0].flutterwave_subaccount_id;
            }
          } else if (paymentProvider === 'paystack') {
            existingSub = await db.query(
              "SELECT paystack_subaccount_code FROM sellers WHERE user_id = ?",
              [req.session.user.id]
            );
            if (existingSub && existingSub.length > 0 && existingSub[0].paystack_subaccount_code) {
              console.log(`✅ Seller already has Paystack subaccount: ${existingSub[0].paystack_subaccount_code}`);
              subaccountCreated = true;
              subaccountId = existingSub[0].paystack_subaccount_code;
            }
          }
          
          if (!subaccountCreated && businessName && accountNumber) {
            // Prepare seller data
            const sellerData = {
              user_id: req.session.user.id,
              business_name: businessName,
              email: businessEmail || req.session.user.email,
              account_number: accountNumber,
              bank_code: bankCode || (paymentProvider === 'paystack' ? '058' : '044'),
              bank_name: bankName,
              country: country || "NG",
              phone: businessPhone || "",
              percentage_charge: 10
            };
            
            // Create subaccount based on selected provider
            let createdId = null;
            if (paymentProvider === 'flutterwave') {
              createdId = await createFlutterwaveSubaccount(sellerData);
            } else if (paymentProvider === 'paystack') {
              createdId = await createPaystackSubaccount(sellerData);
            }
            
            if (createdId) {
              subaccountCreated = true;
              subaccountId = createdId;
              console.log(`✅ ${paymentProvider} subaccount created for seller ${req.session.user.id}: ${createdId}`);
            }
          }
        } catch (subaccountError) {
          console.error('❌ Subaccount creation error:', subaccountError.message);
          // Don't fail product upload if subaccount creation fails
        }
      }

      // Store business information in sellers table
      if (businessName && accountNumber) {
        try {
          await db.query(
            `INSERT INTO sellers (user_id, provider, account_number, bank_code, bank_name, business_name, business_email, business_phone, country, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE 
             account_number = VALUES(account_number),
             bank_code = VALUES(bank_code),
             bank_name = VALUES(bank_name),
             business_name = VALUES(business_name),
             business_email = VALUES(business_email),
             business_phone = VALUES(business_phone),
             country = VALUES(country)`,
            [req.session.user.id, paymentProvider, accountNumber, bankCode || null, bankName || null, businessName, businessEmail || null, businessPhone || null, country || null]
          );
          console.log(`✅ Business info stored for seller ${req.session.user.id}`);
        } catch (err) {
          console.error('❌ Error storing business info:', err.message);
        }
      }

      console.log(`✅ Product uploaded! ID: ${productId}, Type: ${type}`);
      
      res.json({ 
        message: "✅ Product uploaded successfully!", 
        productId: productId,
        type: type,
        subaccount_created: subaccountCreated,
        payment_provider: paymentProvider,
        pricing: {
          customer_price: originalPrice,      // What customer pays
          platform_fee: platformFee,           // Our 10% (or 10% of profit for physical)
          seller_earnings: sellerPrice,        // What seller gets
          product_cost: productCostValue       // Seller's fulfillment cost (physical only)
        },
        delivery_info: type === 'physical' ? {
          estimated_days: parseInt(delivery_days) || 7,
          locations: delivery_locations || 'Worldwide',
          delivery_type: delivery_type || 'delivery',
          payment_option: payment_option || 'pay_before_delivery'
        } : null
      });
      
    } catch (err) {
      console.error('❌ Product upload error:', err);
      res.status(500).json({ error: "Error uploading product: " + err.message });
    }
  });
});
// Delete product endpoint
app.delete("/api/products/:id", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login first" });
    }

    const productId = req.params.id;
    const { id: userId, role: userRole } = req.session.user;

    const products = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
    let product = null;
    if (products && products.length > 0) product = products[0];

    if (!product) return res.status(404).json({ error: "Product not found" });

    if (userRole !== "admin" && Number(product.user_id) !== Number(userId)) {
      return res.status(403).json({ error: "You are not authorized to delete this product" });
    }

    // Soft delete
    await db.query("UPDATE products SET is_deleted = 1, deleted_at = NOW() WHERE id = ?", [productId]);

    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    console.error('❌ Delete error:', err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});


// ============================================
// CRON ENDPOINT for releasing escrow funds
// ============================================
app.get("/api/cron/release-escrow-funds", async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Find orders where escrow period has ended and no refund requested
    const ordersToRelease = await db.query(
      `SELECT o.*, s.flutterwave_subaccount_id, s.paystack_subaccount_code, s.bank_code, s.account_number, s.recipient_code
       FROM physical_orders o
       LEFT JOIN sellers s ON o.seller_id = s.user_id
       WHERE o.payment_status = 'paid' 
         AND o.order_status = 'paid'
         AND o.payment_held_until <= NOW()
         AND o.funds_released_at IS NULL
         AND o.order_status != 'refund_requested'
         AND o.order_status != 'refunded'`
    );

    let released = 0;
    let failed = 0;

    for (const order of ordersToRelease) {
      try {
        // Mark as completed (funds released)
        await db.query(
          `UPDATE physical_orders 
           SET order_status = 'completed',
               funds_released_at = NOW()
           WHERE id = ?`,
          [order.id]
        );
        
        await db.query(
          `UPDATE escrow_accounts 
           SET status = 'released', 
               released_at = NOW()
           WHERE order_id = ?`,
          [order.id]
        );
        
        // Notify seller
        await db.query(
          `INSERT INTO seller_notifications 
           (seller_id, order_id, notification_type, title, message, created_at)
           VALUES (?, ?, 'funds_released', 'Funds Released 🎉', 
                   CONCAT('$${order.seller_earnings} has been released to your account for order #', ?, 
                          '. Platform fee: $${order.platform_fee}'), NOW())`,
          [order.seller_id, order.id, order.id]
        );
        
        released++;
        
      } catch (err) {
        console.error(`❌ Failed to release order ${order.id}:`, err);
        failed++;
      }
    }

    res.json({ 
      success: true, 
      released: released, 
      failed: failed,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("❌ Escrow release error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SERVER START
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Physical order system ready`);
  console.log(`✅ Seller notifications ready`);
});
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
// FILE UPLOAD CONFIGURATION
// ============================================
const uploadDirs = {
  courses: path.join(__dirname, "uploads", "courses"),
  products: path.join(__dirname, "uploads", "products"),
  services: path.join(__dirname, "uploads", "services"),
  profiles: path.join(__dirname, "uploads", "profiles"),
  chat: path.join(__dirname, "uploads", "chat-images")
};
// Add complaints directory
uploadDirs.complaints = path.join(__dirname, "uploads", "complaints");
if (!fs.existsSync(uploadDirs.complaints)) fs.mkdirSync(uploadDirs.complaints, { recursive: true });
Object.values(uploadDirs).forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Product storage for multer
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDirs.products),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    cb(null, `${timestamp}-${random}-${baseName}${ext}`);
  }
});

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



// ============================================
// ORDER CONFIRMATION EMAIL
// ============================================

// ============================================
// COMPLETE EMAIL SYSTEM - BREVO INTEGRATION
// ============================================

const FROM_EMAIL = 'coreinsightmail@gmail.com';
const FROM_NAME = 'Core Insight Marketplace';

// Universal email sender function
async function sendEmail(to, subject, htmlContent, attachments = []) {
  if (!to || !subject || !htmlContent) {
    console.error('❌ Missing required email parameters');
    return { success: false, error: 'Missing parameters' };
  }

  try {
    // Try Brevo first
    if (BREVO_API_KEY) {
      const emailData = {
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email: to }],
        subject: subject,
        htmlContent: htmlContent,
        headers: { 'X-Mailin-custom': 'core-insight-email' }
      };

      // Add attachments if any
      if (attachments && attachments.length > 0) {
        emailData.attachment = attachments.map(att => ({
          name: att.filename,
          content: att.content // Base64 encoded
        }));
      }

      const response = await axios({
        method: 'POST',
        url: 'https://api.brevo.com/v3/smtp/email',
        headers: { 
          'api-key': BREVO_API_KEY, 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        data: emailData,
        timeout: 15000
      });

      console.log(`✅ Email sent to ${to} via Brevo`);
      return { success: true, provider: 'brevo' };
    }
    
    // Fallback to Gmail SMTP
    else if (transporter) {
      await transporter.sendMail({
        from: `"${FROM_NAME}" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: subject,
        html: htmlContent
      });
      console.log(`✅ Email sent to ${to} via Gmail`);
      return { success: true, provider: 'gmail' };
    }
    
    else {
      console.warn(`⚠️ No email service configured. Would have sent to ${to}`);
      return { success: false, error: 'No email service configured', fallback: true };
    }
  } catch (error) {
    console.error(`❌ Email error to ${to}:`, error.response?.data?.message || error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// EMAIL TEMPLATES
// ============================================

// 1. Verification Email Template
function getVerificationEmailTemplate(username, verifyLink) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verify Your Email</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
        .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; color: white; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
        .footer { background: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
        .warning { background: #f59e0b20; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎓 Core Insight</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">Welcome to the Marketplace!</p>
        </div>
        <div class="content">
          <h2>Hello ${escapeHtml(username)}!</h2>
          <p>Thank you for registering with Core Insight Marketplace. Please verify your email address to activate your account.</p>
          <div style="text-align: center;">
            <a href="${verifyLink}" class="button">Verify My Email</a>
          </div>
          <div class="warning">
            <strong>⚠️ This link expires in 24 hours.</strong><br>
            If you didn't create an account, you can safely ignore this email.
          </div>
          <p>Or copy and paste this link:<br>
          <small style="color: #94a3b8; word-break: break-all;">${verifyLink}</small></p>
        </div>
        <div class="footer">
          <p>Core Insight Marketplace<br>Connecting creators with customers worldwide</p>
          <p>Need help? Contact us at ${SUPPORT_EMAIL}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// 2. Order Confirmation Email Template
function getOrderConfirmationTemplate(orderData) {
  const { email, name, orderId, productName, quantity, totalAmount, deliveryAddress, estimatedDays, orderStatus } = orderData;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Order Confirmation #${orderId}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .order-details { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; }
        .status-badge { background: #f59e0b; color: white; padding: 4px 12px; border-radius: 20px; display: inline-block; font-size: 12px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 10px 0; }
        .footer { background: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Order Received!</h1>
        </div>
        <div class="content">
          <h2>Hello ${escapeHtml(name)}!</h2>
          <p>Thank you for your order! We've received it and it's now pending seller approval.</p>
          
          <div class="order-details">
            <h3>📦 Order Details</h3>
            <div class="detail-row"><strong>Order ID:</strong> <span>#${orderId}</span></div>
            <div class="detail-row"><strong>Product:</strong> <span>${escapeHtml(productName)}</span></div>
            <div class="detail-row"><strong>Quantity:</strong> <span>${quantity}</span></div>
            <div class="detail-row"><strong>Total Amount:</strong> <span>$${totalAmount.toFixed(2)}</span></div>
            <div class="detail-row"><strong>Status:</strong> <span class="status-badge">${orderStatus || 'Pending Seller Approval'}</span></div>
          </div>
          
          <div class="order-details">
            <h3>🚚 Shipping Information</h3>
            <div class="detail-row"><strong>Address:</strong> <span>${escapeHtml(deliveryAddress)}</span></div>
            <div class="detail-row"><strong>Estimated Delivery:</strong> <span>${estimatedDays} ${estimatedDays === 1 ? 'day' : 'days'} after seller approval</span></div>
          </div>
          
          <div style="text-align: center;">
            <a href="https://core-insight-7.onrender.com/order-tracking?orderId=${orderId}" class="button">Track Your Order</a>
          </div>
          
          <p>You'll receive another email when the seller accepts your order.</p>
        </div>
        <div class="footer">
          <p>Core Insight Marketplace<br>Need help? Contact us at ${SUPPORT_EMAIL}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// 3. Seller Notification Template
function getSellerNotificationTemplate(sellerData) {
  const { email, name, orderId, productName, quantity, totalAmount, customerName } = sellerData;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>New Order Notification - Core Insight</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .order-details { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 10px 0; }
        .footer { background: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📦 New Order!</h1>
        </div>
        <div class="content">
          <h2>Hello ${escapeHtml(name)}!</h2>
          <p>You have received a new order that requires your approval.</p>
          
          <div class="order-details">
            <h3>Order Details</h3>
            <div class="detail-row"><strong>Order ID:</strong> <span>#${orderId}</span></div>
            <div class="detail-row"><strong>Customer:</strong> <span>${escapeHtml(customerName)}</span></div>
            <div class="detail-row"><strong>Product:</strong> <span>${escapeHtml(productName)}</span></div>
            <div class="detail-row"><strong>Quantity:</strong> <span>${quantity}</span></div>
            <div class="detail-row"><strong>Total Amount:</strong> <span>$${totalAmount.toFixed(2)}</span></div>
          </div>
          
          <div style="text-align: center;">
            <a href="https://core-insight-7.onrender.com/dashboard" class="button">Go to Dashboard</a>
          </div>
          
          <p>Please log in to approve or reject this order. Funds will be held in escrow for 5 days after payment.</p>
        </div>
        <div class="footer">
          <p>Core Insight Marketplace<br>Need help? Contact support at ${SUPPORT_EMAIL}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// 4. Payment Confirmation Template
function getPaymentConfirmationTemplate(paymentData) {
  const { email, name, orderId, productName, quantity, totalAmount, platformFee, sellerEarnings } = paymentData;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Confirmed - Order #${orderId}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #10b981, #3b82f6); padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .payment-details { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; }
        .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 10px 0; }
        .footer { background: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Payment Confirmed!</h1>
        </div>
        <div class="content">
          <div class="success-icon">💰</div>
          <h2>Hello ${escapeHtml(name)}!</h2>
          <p>Your payment has been successfully processed. Your order is now being prepared.</p>
          
          <div class="payment-details">
            <h3>Payment Details</h3>
            <div class="detail-row"><strong>Order ID:</strong> <span>#${orderId}</span></div>
            <div class="detail-row"><strong>Product:</strong> <span>${escapeHtml(productName)}</span></div>
            <div class="detail-row"><strong>Quantity:</strong> <span>${quantity}</span></div>
            <div class="detail-row"><strong>Amount Paid:</strong> <span>$${totalAmount.toFixed(2)}</span></div>
            <div class="detail-row"><strong>Platform Fee:</strong> <span>$${platformFee.toFixed(2)}</span></div>
            <div class="detail-row"><strong>Seller Receives:</strong> <span>$${sellerEarnings.toFixed(2)} (after 5-day escrow)</span></div>
          </div>
          
          <div style="text-align: center;">
            <a href="https://core-insight-7.onrender.com/order-tracking?orderId=${orderId}" class="button">Track Your Order</a>
          </div>
          
          <p>Your payment is held in escrow for 5 days to ensure product delivery. Funds will be released to the seller after you confirm receipt.</p>
        </div>
        <div class="footer">
          <p>Core Insight Marketplace<br>Questions? Contact support at ${SUPPORT_EMAIL}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// 5. Order Status Update Template
function getOrderStatusUpdateTemplate(orderData) {
  const { name, orderId, productName, orderStatus, message } = orderData;
  
  const statusMessages = {
    'seller_accepted': 'Your order has been accepted by the seller! Please proceed with payment.',
    'paid': 'Payment received! Your order is now being processed.',
    'shipped': 'Your order has been shipped!',
    'completed': 'Order completed! Thank you for shopping with us.',
    'cancelled': 'Your order has been cancelled.',
    'refunded': 'Your refund has been processed.'
  };
  
  const statusMessage = message || statusMessages[orderStatus] || `Your order status has been updated to: ${orderStatus}`;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Order Update #${orderId}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .status-update { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; text-align: center; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 10px 0; }
        .footer { background: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📬 Order Update</h1>
        </div>
        <div class="content">
          <h2>Hello ${escapeHtml(name)}!</h2>
          <div class="status-update">
            <h3>Order #${orderId}</h3>
            <p><strong>${escapeHtml(productName)}</strong></p>
            <p style="margin-top: 15px;">${statusMessage}</p>
          </div>
          <div style="text-align: center;">
            <a href="https://core-insight-7.onrender.com/order-tracking?orderId=${orderId}" class="button">View Order Details</a>
          </div>
        </div>
        <div class="footer">
          <p>Core Insight Marketplace<br>Need help? Contact support at ${SUPPORT_EMAIL}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ============================================
// UPDATE EXISTING FUNCTIONS TO USE NEW EMAIL SYSTEM
// ============================================

// Update verification email function
async function sendVerificationEmail(to, username, verifyToken) {
  const verifyLink = `https://core-insight-7.onrender.com/verify.html?token=${verifyToken}`;
  const htmlContent = getVerificationEmailTemplate(username, verifyLink);
  return await sendEmail(to, "Verify Your Email - Core Insight Marketplace", htmlContent);
}

// Update order confirmation function
async function sendOrderConfirmationEmail(orderData) {
  const htmlContent = getOrderConfirmationTemplate(orderData);
  return await sendEmail(orderData.email, `Order Confirmation #${orderData.orderId} - Core Insight`, htmlContent);
}

// Update seller notification function
async function sendSellerNotificationEmail(sellerData) {
  const htmlContent = getSellerNotificationTemplate(sellerData);
  return await sendEmail(sellerData.email, `New Order #${sellerData.orderId} - Requires Approval`, htmlContent);
}

// New: Payment confirmation function
async function sendPaymentConfirmationEmail(paymentData) {
  const htmlContent = getPaymentConfirmationTemplate(paymentData);
  return await sendEmail(paymentData.email, `Payment Confirmed - Order #${paymentData.orderId}`, htmlContent);
}

// New: Order status update function
async function sendOrderStatusUpdateEmail(orderData) {
  const htmlContent = getOrderStatusUpdateTemplate(orderData);
  return await sendEmail(orderData.email, `Order Update #${orderData.orderId}`, htmlContent);
}


// ============================================
// COMPLAINT/SUPPORT EMAIL ENDPOINT
// ============================================

// Configure multer for file uploads (for complaints)
const complaintUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, "uploads", "complaints");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000000);
      const ext = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
      cb(null, `${timestamp}-${random}-${baseName}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, and Word documents are allowed.'));
    }
  }
});

// Support complaint endpoint with file upload
app.post("/api/send-complaint", complaintUpload.array('attachments', 5), async (req, res) => {
  try {
    console.log("📧 Received complaint submission");
    
    const { name, email, subject, priority, message, orderId } = req.body;
    
    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "Please fill in all required fields" });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    
    // Handle uploaded files
    const attachments = req.files || [];
    const attachmentList = [];
    
    // Prepare email HTML with images embedded
    let emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>New Complaint: ${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
          .container { max-width: 700px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          h1 { color: #3b82f6; margin-top: 0; }
          .priority-high { color: #ef4444; }
          .priority-medium { color: #f59e0b; }
          .priority-low { color: #10b981; }
          .complaint-details { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; }
          .detail-row { margin-bottom: 12px; }
          .detail-label { font-weight: bold; color: #3b82f6; width: 120px; display: inline-block; }
          .message-box { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; white-space: pre-wrap; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #94a3b8; text-align: center; }
          .attachments { margin-top: 20px; padding: 15px; background: #0f172a; border-radius: 12px; }
          .attachment-item { margin: 8px 0; padding: 8px; background: #1e293b; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📧 New Support Complaint</h1>
          <div class="complaint-details">
            <div class="detail-row"><span class="detail-label">From:</span> ${escapeHtml(name)}</div>
            <div class="detail-row"><span class="detail-label">Email:</span> ${escapeHtml(email)}</div>
            <div class="detail-row"><span class="detail-label">Subject:</span> ${escapeHtml(subject)}</div>
            <div class="detail-row"><span class="detail-label">Priority:</span> <span class="priority-${priority.toLowerCase()}">${escapeHtml(priority)}</span></div>
            ${orderId ? `<div class="detail-row"><span class="detail-label">Order ID:</span> ${escapeHtml(orderId)}</div>` : ''}
            <div class="detail-row"><span class="detail-label">Submitted:</span> ${new Date().toLocaleString()}</div>
          </div>
          
          <div class="message-box">
            <strong>Message:</strong><br><br>
            ${escapeHtml(message).replace(/\n/g, '<br>')}
          </div>
    `;
    
    // Add attachments section if files were uploaded
    if (attachments.length > 0) {
      emailHtml += `
        <div class="attachments">
          <strong>📎 Attachments (${attachments.length} files):</strong>
      `;
      
      for (let i = 0; i < attachments.length; i++) {
        const file = attachments[i];
        const fileUrl = `/uploads/complaints/${path.basename(file.path)}`;
        attachmentList.push({
          filename: file.originalname,
          path: file.path,
          cid: `attachment_${i}`
        });
        
        // If it's an image, embed it
        if (file.mimetype.startsWith('image/')) {
          emailHtml += `
            <div class="attachment-item">
              <strong>📷 ${escapeHtml(file.originalname)}</strong><br>
              <img src="cid:attachment_${i}" style="max-width: 100%; max-height: 300px; margin-top: 10px; border-radius: 8px;">
            </div>
          `;
        } else {
          emailHtml += `
            <div class="attachment-item">
              <strong>📄 ${escapeHtml(file.originalname)}</strong><br>
              <small>Type: ${file.mimetype} | Size: ${(file.size / 1024).toFixed(2)} KB</small>
            </div>
          `;
        }
      }
      emailHtml += `</div>`;
    }
    
    emailHtml += `
          <div class="footer">
            <p>Core Insight Support Team<br>
            This complaint was submitted via the contact form.<br>
            Please respond to ${escapeHtml(email)} within 24 hours.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    // Send email to support
    const supportEmail = SUPPORT_EMAIL || 'suppourtcoreinsight@gmail.com';
    
    // Prepare email options
    const mailOptions = {
      from: `"Core Insight Support" <${process.env.EMAIL_USER || 'coreinsightmail@gmail.com'}>`,
      to: supportEmail,
      replyTo: email,
      subject: `[COMPLAINT] ${priority} - ${subject}`,
      html: emailHtml
    };
    
    // Add attachments if any
    if (attachmentList.length > 0) {
      mailOptions.attachments = attachmentList;
    }
    
    // Send email using transporter
    if (transporter) {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Complaint email sent to ${supportEmail}`);
    } else if (BREVO_API_KEY) {
      // Fallback to Brevo
      const brevoData = {
        sender: { email: "coreinsightmail@gmail.com", name: "Core Insight Support" },
        to: [{ email: supportEmail }],
        replyTo: { email: email, name: name },
        subject: `[COMPLAINT] ${priority} - ${subject}`,
        htmlContent: emailHtml
      };
      
      if (attachmentList.length > 0) {
        brevoData.attachment = attachmentList.map(att => ({
          name: att.filename,
          content: fs.readFileSync(att.path).toString('base64')
        }));
      }
      
      await axios({
        method: 'POST',
        url: 'https://api.brevo.com/v3/smtp/email',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        data: brevoData
      });
      console.log(`✅ Complaint sent via Brevo to ${supportEmail}`);
    }
    
    // Send confirmation email to user
    const userEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Complaint Received - Core Insight</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          h1 { color: #3b82f6; }
          .success-icon { font-size: 48px; text-align: center; margin-bottom: 20px; }
          .complaint-summary { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Complaint Received</h1>
          <p>Hello ${escapeHtml(name)},</p>
          <p>Thank you for contacting Core Insight support. We have received your complaint and our team will review it shortly.</p>
          
          <div class="complaint-summary">
            <h3>Complaint Summary</h3>
            <p><strong>Reference #:</strong> CMP-${Date.now()}</p>
            <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
            <p><strong>Priority:</strong> ${escapeHtml(priority)}</p>
            ${orderId ? `<p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>` : ''}
            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <p>We aim to respond to all complaints within 24 hours. If your issue is urgent, please reply to this email.</p>
          
          <div class="footer">
            <p>Core Insight Support Team<br>
            Need immediate assistance? Reply to this email or contact us at ${supportEmail}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    // Send confirmation to user
    if (transporter) {
      await transporter.sendMail({
        from: `"Core Insight Support" <${process.env.EMAIL_USER || 'coreinsightmail@gmail.com'}>`,
        to: email,
        subject: `We received your complaint: ${subject}`,
        html: userEmailHtml
      });
    } else if (BREVO_API_KEY) {
      await axios({
        method: 'POST',
        url: 'https://api.brevo.com/v3/smtp/email',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        data: {
          sender: { email: "coreinsightmail@gmail.com", name: "Core Insight Support" },
          to: [{ email: email }],
          subject: `We received your complaint: ${subject}`,
          htmlContent: userEmailHtml
        }
      });
    }
    
    // Clean up uploaded files after sending
    for (const file of attachments) {
      try {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (err) {
        console.error(`Failed to delete temp file ${file.path}:`, err.message);
      }
    }
    
    res.json({
      success: true,
      message: "Complaint submitted successfully! We'll respond within 24 hours."
    });
    
  } catch (error) {
    console.error("❌ Complaint submission error:", error);
    
    // Clean up files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (err) {}
      }
    }
    
    res.status(500).json({
      error: "Failed to submit complaint. Please try again or contact us directly at suppourtcoreinsight@gmail.com"
    });
  }
});

// Helper function for email validation (add if not exists)
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
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
    
    res.json({
      success: true,
      notifications: extractRows(notifications),
      unreadCount: (unreadCount && unreadCount.length > 0) ? unreadCount[0].count : 0
    });
    
  } catch (err) {
    console.error("❌ Error loading seller notifications:", err);
    // Return empty array instead of error to prevent frontend errors
    res.json({
      success: true,
      notifications: [],
      unreadCount: 0
    });
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
// SELLER PRODUCTS ENDPOINT - FIXED
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
    
    // Check if products exists and is an array
    const productList = Array.isArray(products) ? products : (products && products[0] ? products[0] : []);
    
    const processedProducts = (productList || []).map(product => {
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

// Debug endpoint - check what's in the database
app.get("/api/debug/orders", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Login required" });
    
    const orders = await db.query(`
      SELECT * FROM physical_orders WHERE seller_id = ? LIMIT 5
    `, [req.session.user.id]);
    
    res.json({
      success: true,
      orders: orders,
      count: orders ? orders.length : 0
    });
  } catch (err) {
    console.error("Debug error:", err);
    res.status(500).json({ error: err.message });
  }
});


// TEST DATABASE CONNECTION
app.get("/api/test-db", async (req, res) => {
  try {
    // Test simple query
    const result = await db.query("SELECT 1 as test, NOW() as time");
    
    // Check if user is logged in
    const userId = req.session?.user?.id || null;
    
    // Test orders query for current user
    let ordersCount = 0;
    if (userId) {
      const orders = await db.query(
        "SELECT COUNT(*) as count FROM physical_orders WHERE seller_id = ?",
        [userId]
      );
      ordersCount = orders[0]?.count || 0;
    }
    
    res.json({
      success: true,
      message: "Database connection working",
      timestamp: result[0]?.time,
      userId: userId,
      ordersCount: ordersCount,
      session: req.session?.user ? {
        id: req.session.user.id,
        username: req.session.user.username,
        role: req.session.user.role
      } : null
    });
  } catch (err) {
    console.error("Database test error:", err);
    res.status(500).json({ 
      error: "Database connection failed", 
      details: err.message 
    });
  }
});

// ============================================
// PHYSICAL ORDER SYSTEM
// ============================================
// SIMPLIFIED ORDER CREATION - GUARANTEED TO WORK
// Enhanced order creation with email notifications
app.post("/api/physical-orders/create", async (req, res) => {
  try {
    console.log("📦 Creating physical order...");
    
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: "Please login to place an order" });
    }

    const { productId, quantity = 1, deliveryAddress, deliveryPhone, notes = '' } = req.body;
    
    if (!productId) return res.status(400).json({ error: "Product ID is required" });
    if (!deliveryAddress) return res.status(400).json({ error: "Delivery address is required" });
    if (!deliveryPhone) return res.status(400).json({ error: "Delivery phone is required" });
    
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({ error: "Invalid quantity" });
    }

    // Get product with seller info
    const productResult = await db.query(
      `SELECT p.*, u.email as seller_email, u.username as seller_name
       FROM products p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = ? AND (p.is_deleted = 0 OR p.is_deleted IS NULL)`,
      [productId]
    );

    if (!productResult || productResult.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = productResult[0];
    const sellerId = product.user_id;
    const buyerId = req.session.user.id;
    const productPrice = parseFloat(product.original_price || product.price);
    const totalAmount = qty * productPrice;
    
    const platformFee = productPrice * 0.10 * qty;
    const sellerEarnings = totalAmount - platformFee;
    const estimatedDays = product.estimated_delivery_days || 7;
    
    // Insert order
    const result = await db.query(
      `INSERT INTO physical_orders (
        product_id, seller_id, buyer_id, product_name, quantity, price,
        total_amount, customer_name, customer_email, shipping_address,
        delivery_phone, payment_method, payment_status, order_status,
        notes, platform_fee, seller_earnings, estimated_delivery_days, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        productId, sellerId, buyerId, product.title, qty, productPrice,
        totalAmount, req.session.user.username || 'Buyer', req.session.user.email,
        deliveryAddress, deliveryPhone, 'pay_after_approval', 'pending',
        'pending_seller_approval', notes || '', platformFee, sellerEarnings, estimatedDays
      ]
    );
    
    const orderId = result.insertId;
    console.log(`✅ Order #${orderId} created successfully`);
    
    // Send confirmation email to buyer (async, don't wait)
    const orderData = {
      email: req.session.user.email,
      name: req.session.user.username || 'Valued Customer',
      orderId: orderId,
      productName: product.title,
      quantity: qty,
      totalAmount: totalAmount,
      deliveryAddress: deliveryAddress,
      estimatedDays: estimatedDays,
      orderStatus: 'pending_seller_approval'
    };
    
    // Send email in background
    sendOrderConfirmationEmail(orderData).catch(err => {
      console.error('Order confirmation email failed:', err.message);
    });
    
    // Send notification to seller
    const sellerData = {
      email: product.seller_email,
      name: product.seller_name || 'Seller',
      orderId: orderId,
      productName: product.title,
      quantity: qty,
      totalAmount: totalAmount,
      customerName: req.session.user.username || 'Buyer'
    };
    
    sendSellerNotificationEmail(sellerData).catch(err => {
      console.error('Seller notification email failed:', err.message);
    });
    
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

// 2. Seller accepts or rejects order - UPDATED with correct earnings calculation
app.post("/api/physical-orders/:orderId/respond", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });

    const orderId = req.params.orderId;
    const { action, message } = req.body;

    const orderResult = await db.query(
      `SELECT o.*, p.title as product_name, p.product_cost, p.user_id as product_seller_id, 
              u.email as buyer_email, u.username as buyer_name
       FROM physical_orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN users u ON o.buyer_id = u.id
       WHERE o.id = ?`,
      [orderId]
    );

    if (!orderResult || orderResult.length === 0) return res.status(404).json({ error: "Order not found" });

    const order = orderResult[0];

    if (order.seller_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Only the seller can respond to this order" });
    }

    if (order.order_status !== 'pending_seller_approval') {
      return res.status(400).json({ error: "Order has already been responded to" });
    }

    if (action === 'accept') {
      const productPrice = parseFloat(order.price);
      const qty = order.quantity;
      const totalAmount = parseFloat(order.total_amount);
      
      let platformFee = 0;
      let sellerEarnings = 0;
      let feeBreakdown = {};
      
      if (qty <= 5) {
        // Standard: 10% of single product price
        platformFee = productPrice * 0.10;
        sellerEarnings = totalAmount - platformFee;
        feeBreakdown = {
          type: "standard",
          product_price: productPrice,
          quantity: qty,
          total_amount: totalAmount,
          platform_fee: platformFee,
          seller_earnings: sellerEarnings,
          note: `Standard order: ${qty} units. Platform fee: $${platformFee.toFixed(2)} (10% of single product price)`
        };
      } else {
        // Bulk: Base fee + 10% of total
        const baseFee = productPrice * 0.10;
        const bulkFee = totalAmount * 0.10;
        platformFee = baseFee + bulkFee;
        sellerEarnings = totalAmount - platformFee;
        feeBreakdown = {
          type: "bulk",
          product_price: productPrice,
          quantity: qty,
          total_amount: totalAmount,
          base_fee: baseFee,
          bulk_fee: bulkFee,
          platform_fee: platformFee,
          seller_earnings: sellerEarnings,
          note: `BULK order: ${qty} units. Base fee: $${baseFee.toFixed(2)} + Bulk fee: $${bulkFee.toFixed(2)} = $${platformFee.toFixed(2)}`
        };
      }
      
      console.log(`💰 Order #${orderId} earnings:`, feeBreakdown);
      
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

      await db.query(
        `INSERT INTO order_acceptances (order_id, seller_id, status, response_message, responded_at)
         VALUES (?, ?, 'accepted', ?, NOW())`,
        [orderId, req.session.user.id, message || null]
      );

      await db.query(
        `INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message, created_at)
         VALUES (?, ?, 'payment_required', 'Payment Required', 
                 CONCAT('Seller has accepted your order for ', ?, '. Please complete payment to confirm your order.'), NOW())`,
        [order.buyer_id, orderId, order.product_name]
      );

      // Send payment link email
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
                ${feeBreakdown.type === 'bulk' ? `<p style="font-size:12px;color:#f59e0b;">Bulk order discount applied!</p>` : ''}
              </div>
              <a href="${paymentLink}" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin:20px 0;">Pay Now</a>
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
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'cancelled'
         WHERE id = ?`,
        [orderId]
      );

      await db.query(
        `INSERT INTO order_acceptances (order_id, seller_id, status, response_message, responded_at)
         VALUES (?, ?, 'rejected', ?, NOW())`,
        [orderId, req.session.user.id, message || 'Seller unable to fulfill order']
      );

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

// Get order details - STANDARDIZED
app.get("/api/orders/:orderId", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
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
    
    // Standardize response
    const standardizedOrder = {
      id: orderData.id,
      product_id: orderData.product_id,
      product_name: orderData.product_name,
      product_images: orderData.images ? (typeof orderData.images === 'string' ? JSON.parse(orderData.images) : orderData.images) : [],
      quantity: parseInt(orderData.quantity),
      price: parseFloat(orderData.price),
      total_amount: parseFloat(orderData.total_amount),
      order_status: orderData.order_status,
      payment_status: orderData.payment_status,
      buyer: {
        id: orderData.buyer_id,
        name: orderData.buyer_name,
        email: orderData.buyer_email
      },
      seller: {
        id: orderData.seller_id,
        name: orderData.seller_name,
        email: orderData.seller_email
      },
      shipping_address: orderData.shipping_address,
      delivery_phone: orderData.delivery_phone,
      notes: orderData.notes,
      created_at: orderData.created_at,
      seller_accepted_at: orderData.seller_accepted_at,
      payment_collected_at: orderData.payment_collected_at,
      payment_held_until: orderData.payment_held_until,
      funds_released_at: orderData.funds_released_at,
      platform_fee: parseFloat(orderData.platform_fee) || 0,
      seller_earnings: parseFloat(orderData.seller_earnings) || 0,
      estimated_delivery_days: orderData.estimated_delivery_days || 7,
      fee_breakdown: orderData.fee_breakdown ? 
        (typeof orderData.fee_breakdown === 'string' ? JSON.parse(orderData.fee_breakdown) : orderData.fee_breakdown) : null
    };
    
    res.json({ success: true, order: standardizedOrder });
    
  } catch (err) {
    console.error("❌ Error loading order details:", err);
    res.status(500).json({ error: err.message });
  }
});
// Debug endpoint to test Flutterwave connection
app.get("/api/debug/flutterwave", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    // Check if keys exist
    const hasPublicKey = !!process.env.FLW_PUBLIC_KEY;
    const hasSecretKey = !!process.env.FLW_SECRET_KEY;
    
    console.log("Flutterwave Debug:");
    console.log("- FLW_PUBLIC_KEY exists:", hasPublicKey);
    console.log("- FLW_SECRET_KEY exists:", hasSecretKey);
    console.log("- FLW_PUBLIC_KEY value:", process.env.FLW_PUBLIC_KEY ? process.env.FLW_PUBLIC_KEY.substring(0, 10) + "..." : "missing");
    console.log("- FLW_SECRET_KEY value:", process.env.FLW_SECRET_KEY ? process.env.FLW_SECRET_KEY.substring(0, 10) + "..." : "missing");
    
    // Test API call to Flutterwave
    if (hasSecretKey) {
      try {
        const testResponse = await axios.get('https://api.flutterwave.com/v3/banks/NG', {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log("Flutterwave API test: SUCCESS");
        res.json({
          success: true,
          hasKeys: true,
          apiTest: "success",
          message: "Flutterwave API keys are working!",
          keys: {
            public: hasPublicKey ? "present" : "missing",
            secret: hasSecretKey ? "present" : "missing"
          }
        });
      } catch (apiError) {
        console.error("Flutterwave API test failed:", apiError.response?.data || apiError.message);
        res.json({
          success: false,
          hasKeys: true,
          apiTest: "failed",
          error: apiError.response?.data?.message || apiError.message,
          statusCode: apiError.response?.status,
          keys: {
            public: hasPublicKey ? "present" : "missing",
            secret: hasSecretKey ? "present" : "missing"
          }
        });
      }
    } else {
      res.json({
        success: false,
        hasKeys: false,
        message: "Flutterwave API keys are missing!",
        keys: {
          public: hasPublicKey ? "present" : "missing",
          secret: hasSecretKey ? "present" : "missing"
        }
      });
    }
    
  } catch (err) {
    console.error("Debug error:", err);
    res.status(500).json({ error: err.message });
  }
});
// Get payment link for order (after seller accepts) - FIXED VERSION
app.post("/api/physical-orders/:orderId/get-payment-link", async (req, res) => {
  try {
    console.log("💰 Creating payment link for order:", req.params.orderId);
    
    if (!req.session.user) {
      console.log("❌ No user in session");
      return res.status(401).json({ error: "Please login" });
    }

    const orderId = req.params.orderId;
    const userId = req.session.user.id;

    // Get order details with better error handling
    const orderResult = await db.query(
      `SELECT o.*, p.title as product_name, p.original_price, p.product_cost,
              u.email as buyer_email, u.username as buyer_name
       FROM physical_orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN users u ON o.buyer_id = u.id
       WHERE o.id = ? AND o.buyer_id = ?`,
      [orderId, userId]
    );

    console.log("Order query result:", orderResult ? "found" : "none");

    if (!orderResult || orderResult.length === 0) {
      console.log("❌ Order not found or not owned by user");
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult[0];
    console.log("Order status:", order.order_status);

    // Check if order is in correct state for payment
    if (order.order_status !== 'seller_accepted') {
      console.log(`❌ Invalid order status: ${order.order_status}`);
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

    // Check Flutterwave configuration
    if (!process.env.FLW_SECRET_KEY) {
      console.error("❌ FLW_SECRET_KEY is not set in environment variables");
      return res.status(500).json({ 
        error: "Payment system not configured. Please contact support.",
        details: "Missing Flutterwave API key"
      });
    }

    // Generate transaction reference
    const transactionRef = `physical_${orderId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    console.log("Transaction reference:", transactionRef);
    console.log("Amount:", totalAmount);
    console.log("Buyer email:", order.buyer_email);

    // Prepare Flutterwave payload
    const payload = {
      tx_ref: transactionRef,
      amount: totalAmount,
      currency: "USD",
      redirect_url: "https://core-insight-7.onrender.com/physical-payment-callback.html",
      customer: {
        email: order.buyer_email || req.session.user.email,
        name: order.buyer_name || req.session.user.username,
      },
      customizations: {
        title: "Core Insight - Physical Product",
        description: `Order #${orderId}: ${order.product_name} (x${order.quantity})`,
        logo: "https://core-insight-7.onrender.com/logo.png"
      },
      meta: {
        order_id: orderId,
        product_id: order.product_id,
        buyer_id: userId,
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

    console.log("📤 Sending to Flutterwave...");
    console.log("Payload:", JSON.stringify(payload, null, 2));

    // Make request to Flutterwave
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log("Flutterwave response status:", response.status);
    console.log("Flutterwave response data:", JSON.stringify(response.data, null, 2));

    if (response.data.status === "success" && response.data.data && response.data.data.link) {
      // Update order with transaction reference
      await db.query(
        `UPDATE physical_orders SET transaction_ref = ?, payment_method = 'pay_online' WHERE id = ?`,
        [transactionRef, orderId]
      );

      console.log(`✅ Payment link created for order #${orderId}`);
      
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
      console.error("❌ Flutterwave returned error:", response.data);
      throw new Error(response.data.message || "Payment initialization failed");
    }

  } catch (err) {
    console.error("❌ Payment link error details:");
    console.error("- Error message:", err.message);
    console.error("- Error response:", err.response?.data);
    console.error("- Error status:", err.response?.status);
    console.error("- Error headers:", err.response?.headers);
    
    // Send detailed error for debugging
    res.status(500).json({ 
      error: "Failed to create payment link",
      details: err.response?.data?.message || err.message,
      flutterwaveError: err.response?.data
    });
  }
});

// Update payment verification to send email
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

      // Get order details for email
      const orderResult = await db.query(
        `SELECT o.*, p.title as product_name, u.email as buyer_email, u.username as buyer_name
         FROM physical_orders o
         LEFT JOIN products p ON o.product_id = p.id
         LEFT JOIN users u ON o.buyer_id = u.id
         WHERE o.id = ?`,
        [orderId]
      );
      
      const order = orderResult[0];

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

      // Send payment confirmation email
      if (order) {
        const paymentData = {
          email: order.buyer_email,
          name: order.buyer_name || 'Valued Customer',
          orderId: orderId,
          productName: order.product_name,
          quantity: order.quantity,
          totalAmount: amount,
          platformFee: platformFee,
          sellerEarnings: sellerAmount
        };
        
        sendPaymentConfirmationEmail(paymentData).catch(err => {
          console.error('Payment confirmation email failed:', err.message);
        });
        
        // Also send email to seller
        const sellerResult = await db.query(
          `SELECT u.email, u.username FROM users u WHERE u.id = ?`,
          [order.seller_id]
        );
        
        if (sellerResult && sellerResult[0]) {
          const sellerEmailData = {
            email: sellerResult[0].email,
            name: sellerResult[0].username || 'Seller',
            orderId: orderId,
            productName: order.product_name,
            quantity: order.quantity,
            totalAmount: amount,
            platformFee: platformFee,
            sellerEarnings: sellerAmount
          };
          
          const sellerPaymentHtml = getPaymentConfirmationTemplate({
            ...sellerEmailData,
            name: sellerEmailData.name,
            // Modify message for seller
            additionalNote: `Payment has been received and is being held in escrow for 5 days. Funds will be released after ${escrowReleaseDate.toLocaleDateString()} unless a dispute is raised.`
          });
          
          sendEmail(sellerResult[0].email, `Payment Received - Order #${orderId}`, sellerPaymentHtml).catch(err => {
            console.error('Seller payment notification failed:', err.message);
          });
        }
      }

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

// Simple test endpoint for seller orders
app.get("/api/test/seller-orders", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not logged in" });
    }
    
    const sellerId = req.session.user.id;
    console.log("Testing queries for seller:", sellerId);
    
    // Test 1: Check if table exists
    const tableCheck = await db.query("SHOW TABLES LIKE 'physical_orders'");
    console.log("Table check:", tableCheck);
    
    // Test 2: Simple count of all orders
    const totalCount = await db.query(
      "SELECT COUNT(*) as total FROM physical_orders WHERE seller_id = ?",
      [sellerId]
    );
    console.log("Total orders count:", totalCount);
    
    // Test 3: Get a few orders to see structure
    const sampleOrders = await db.query(
      "SELECT * FROM physical_orders WHERE seller_id = ? LIMIT 3",
      [sellerId]
    );
    console.log("Sample orders count:", sampleOrders ? sampleOrders.length : 0);
    
    res.json({
      success: true,
      tableExists: tableCheck && tableCheck.length > 0,
      totalOrders: totalCount && totalCount[0] ? totalCount[0].total : 0,
      sampleCount: sampleOrders ? sampleOrders.length : 0,
      sampleData: sampleOrders,
      userId: sellerId
    });
    
  } catch (err) {
    console.error("Test endpoint error:", err);
    res.status(500).json({ 
      error: err.message,
      stack: err.stack 
    });
  }
});
// ============================================
// SELLER PHYSICAL ORDERS - FIXED
// ============================================
app.get("/api/seller/physical-orders", async (req, res) => {
  try {
    // ✅ Auth check
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: "Please login first" });
    }

    const sellerId = req.session.user.id;
    console.log("📦 Fetching orders for seller:", sellerId);

    if (!sellerId) {
      return res.status(400).json({ error: "Invalid seller ID" });
    }

    // ✅ IMPORTANT: NO destructuring here
    const orders = await db.query(
      `SELECT 
        o.id,
        o.product_name,
        o.quantity,
        o.price,
        o.total_amount,
        o.order_status,
        o.customer_name,
        o.customer_email,
        o.shipping_address,
        o.delivery_phone,
        o.created_at,
        o.platform_fee,
        o.seller_earnings,
        o.estimated_delivery_days
      FROM physical_orders o
      WHERE o.seller_id = ?
      ORDER BY o.created_at DESC`,
      [sellerId]
    );

    const statusCounts = await db.query(
      `SELECT order_status, COUNT(*) as count
       FROM physical_orders
       WHERE seller_id = ?
       GROUP BY order_status`,
      [sellerId]
    );

    // ✅ Build counts safely
    const counts = {
      pending_approval: 0,
      accepted: 0,
      paid: 0,
      completed: 0,
      refund_requests: 0
    };

    if (Array.isArray(statusCounts)) {
      statusCounts.forEach(item => {
        if (item.order_status === 'pending_seller_approval') {
          counts.pending_approval = Number(item.count);
        } else if (item.order_status === 'seller_accepted') {
          counts.accepted = Number(item.count);
        } else if (item.order_status === 'paid') {
          counts.paid = Number(item.count);
        } else if (item.order_status === 'completed') {
          counts.completed = Number(item.count);
        } else if (item.order_status === 'refund_requested') {
          counts.refund_requests = Number(item.count);
        }
      });
    }

    // ✅ Ensure orders is always an array
    const safeOrders = Array.isArray(orders) ? orders : [];

    const processedOrders = safeOrders.map(order => ({
      id: order.id,
      product_name: order.product_name || 'Product',
      quantity: Number(order.quantity) || 1,
      price: Number(order.price) || 0,
      total_amount: Number(order.total_amount) || 0,
      order_status: order.order_status || 'pending_seller_approval',
      customer_name: order.customer_name || 'Unknown',
      customer_email: order.customer_email || '',
      shipping_address: order.shipping_address || '',
      delivery_phone: order.delivery_phone || '',
      created_at: order.created_at,
      platform_fee: Number(order.platform_fee) || 0,
      seller_earnings: Number(order.seller_earnings) || 0,
      estimated_delivery_days: order.estimated_delivery_days || 7
    }));

    console.log(`✅ Found ${processedOrders.length} orders`);

    res.json({
      success: true,
      orders: processedOrders,
      counts
    });

  } catch (err) {
    console.error("❌ Error in seller orders endpoint:", err);

    res.status(500).json({
      error: "Failed to fetch orders",
      details: err.message,
      orders: [],
      counts: {
        pending_approval: 0,
        accepted: 0,
        paid: 0,
        completed: 0,
        refund_requests: 0
      }
    });
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

// Favorites endpoints
app.post("/api/favorites/toggle", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }

    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "Product ID required" });
    }

    // Check if already favorited
    const existing = await db.query(
      "SELECT id FROM favorites WHERE user_id = ? AND product_id = ?",
      [req.session.user.id, productId]
    );

    if (existing && existing.length > 0) {
      // Remove favorite
      await db.query(
        "DELETE FROM favorites WHERE user_id = ? AND product_id = ?",
        [req.session.user.id, productId]
      );
      
      // Get updated count
      const countResult = await db.query(
        "SELECT COUNT(*) as count FROM favorites WHERE product_id = ?",
        [productId]
      );
      const count = countResult[0]?.count || 0;
      
      // Update product favorite count
      await db.query(
        "UPDATE products SET favorite_count = ? WHERE id = ?",
        [count, productId]
      );
      
      return res.json({ 
        success: true, 
        action: "removed",
        favoriteCount: count
      });
    } else {
      // Add favorite
      await db.query(
        "INSERT INTO favorites (user_id, product_id) VALUES (?, ?)",
        [req.session.user.id, productId]
      );
      
      // Get updated count
      const countResult = await db.query(
        "SELECT COUNT(*) as count FROM favorites WHERE product_id = ?",
        [productId]
      );
      const count = countResult[0]?.count || 0;
      
      // Update product favorite count
      await db.query(
        "UPDATE products SET favorite_count = ? WHERE id = ?",
        [count, productId]
      );
      
      return res.json({ 
        success: true, 
        action: "added",
        favoriteCount: count
      });
    }
  } catch (err) {
    console.error("Favorite toggle error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/favorites", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ favorites: [], favoriteCounts: {} });
    }

    const userFavs = await db.query(
      "SELECT product_id FROM favorites WHERE user_id = ?",
      [req.session.user.id]
    );
    
    const favorites = userFavs.map(row => row.product_id);
    
    const countResults = await db.query(`
      SELECT product_id, COUNT(*) as count 
      FROM favorites 
      GROUP BY product_id
    `);
    
    const favoriteCounts = {};
    countResults.forEach(row => {
      favoriteCounts[row.product_id] = parseInt(row.count);
    });
    
    res.json({ favorites, favoriteCounts });
  } catch (err) {
    console.error("Error loading favorites:", err);
    res.status(500).json({ error: err.message });
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
// ============================================
// DASHBOARD ORDER RESPONSE ENDPOINTS
// ============================================

// Get pending orders for seller dashboard (orders awaiting response)
app.get("/api/dashboard/pending-orders", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const sellerId = req.session.user.id;
    
    // Get orders pending seller approval
    const pendingOrders = await db.query(`
      SELECT o.*, p.title as product_name, p.images,
             u.username as customer_name, u.email as customer_email
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.buyer_id = u.id
      WHERE o.seller_id = ? 
        AND o.order_status = 'pending_seller_approval'
      ORDER BY o.created_at ASC
    `, [sellerId]);
    
    // Process orders
    const processedOrders = extractRows(pendingOrders).map(order => {
      order.total_amount = parseFloat(order.total_amount);
      order.price = parseFloat(order.price);
      order.platform_fee = parseFloat(order.platform_fee) || 0;
      order.seller_earnings = parseFloat(order.seller_earnings) || 0;
      
      if (order.images) {
        try {
          if (typeof order.images === 'string') {
            order.images = order.images.startsWith('[') ? 
              JSON.parse(order.images) : [order.images];
          }
        } catch (e) {
          order.images = [];
        }
      }
      
      return order;
    });
    
    res.json({
      success: true,
      orders: processedOrders,
      count: processedOrders.length
    });
    
  } catch (err) {
    console.error("❌ Error loading pending orders:", err);
    res.status(500).json({ error: err.message, orders: [] });
  }
});

// Get all orders for seller dashboard (with status filter)
app.get("/api/dashboard/orders", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const sellerId = req.session.user.id;
    const { status = 'all' } = req.query;
    
    let query = `
      SELECT o.*, p.title as product_name, p.images,
             u.username as customer_name, u.email as customer_email
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.buyer_id = u.id
      WHERE o.seller_id = ?
    `;
    const params = [sellerId];
    
    if (status !== 'all') {
      query += " AND o.order_status = ?";
      params.push(status);
    }
    
    query += " ORDER BY o.created_at DESC";
    
    const orders = await db.query(query, params);
    
    const processedOrders = extractRows(orders).map(order => {
      order.total_amount = parseFloat(order.total_amount);
      order.price = parseFloat(order.price);
      order.platform_fee = parseFloat(order.platform_fee) || 0;
      order.seller_earnings = parseFloat(order.seller_earnings) || 0;
      
      if (order.images) {
        try {
          if (typeof order.images === 'string') {
            order.images = order.images.startsWith('[') ? 
              JSON.parse(order.images) : [order.images];
          }
        } catch (e) {
          order.images = [];
        }
      }
      
      return order;
    });
    
    res.json({
      success: true,
      orders: processedOrders,
      counts: {
        pending: processedOrders.filter(o => o.order_status === 'pending_seller_approval').length,
        accepted: processedOrders.filter(o => o.order_status === 'seller_accepted').length,
        paid: processedOrders.filter(o => o.order_status === 'paid').length,
        completed: processedOrders.filter(o => o.order_status === 'completed').length,
        total: processedOrders.length
      }
    });
    
  } catch (err) {
    console.error("❌ Error loading dashboard orders:", err);
    res.status(500).json({ error: err.message, orders: [] });
  }
});

// Mark order as responded (accepted/rejected) - ENHANCED VERSION
app.post("/api/dashboard/orders/:orderId/respond", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }

    const orderId = req.params.orderId;
    const { action, message = '' } = req.body;

    // Get order with product details
    const orderResult = await db.query(`
      SELECT o.*, p.title as product_name, p.original_price, p.price as product_price,
             u_buyer.email as buyer_email, u_buyer.username as buyer_name
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
      WHERE o.id = ?
    `, [orderId]);

    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult[0];

    // Verify seller owns this order
    if (order.seller_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Not authorized to respond to this order" });
    }

    // Check if order is still pending
    if (order.order_status !== 'pending_seller_approval') {
      return res.status(400).json({ 
        error: `Cannot respond to this order. Current status: ${order.order_status}` 
      });
    }

    if (action === 'accept') {
      // Calculate fees based on quantity
      const qty = order.quantity;
      const productPrice = parseFloat(order.price);
      const totalAmount = parseFloat(order.total_amount);
      
      let platformFee = 0;
      let sellerEarnings = 0;
      let feeBreakdown = {};
      
      if (qty <= 5) {
        // Standard order: 10% of product price
        platformFee = productPrice * 0.10;
        sellerEarnings = totalAmount - platformFee;
        feeBreakdown = {
          type: "standard",
          product_price: productPrice,
          quantity: qty,
          total_amount: totalAmount,
          platform_fee: platformFee,
          seller_earnings: sellerEarnings,
          note: `Standard order: ${qty} units. Platform fee: $${platformFee.toFixed(2)} (10% of single product price)`
        };
      } else {
        // Bulk order: Base fee + 10% of total
        const baseFee = productPrice * 0.10;
        const bulkFee = totalAmount * 0.10;
        platformFee = baseFee + bulkFee;
        sellerEarnings = totalAmount - platformFee;
        feeBreakdown = {
          type: "bulk",
          product_price: productPrice,
          quantity: qty,
          total_amount: totalAmount,
          base_fee: baseFee,
          bulk_fee: bulkFee,
          platform_fee: platformFee,
          seller_earnings: sellerEarnings,
          note: `BULK order: ${qty} units. Base fee: $${baseFee.toFixed(2)} + Bulk fee: $${bulkFee.toFixed(2)} = $${platformFee.toFixed(2)}`
        };
      }
      
      // Update order with accepted status and fee details
      await db.query(`
        UPDATE physical_orders 
        SET order_status = 'seller_accepted',
            seller_accepted_at = NOW(),
            platform_fee = ?,
            seller_earnings = ?,
            fee_breakdown = ?,
            response_message = ?
        WHERE id = ?
      `, [platformFee, sellerEarnings, JSON.stringify(feeBreakdown), message || null, orderId]);
      
      // Record acceptance
      await db.query(`
        INSERT INTO order_acceptances (order_id, seller_id, status, response_message, responded_at)
        VALUES (?, ?, 'accepted', ?, NOW())
      `, [orderId, req.session.user.id, message || null]);
      
      // Send notification to buyer
      const paymentLink = `https://core-insight-7.onrender.com/pay-order.html?orderId=${orderId}`;
      
      await db.query(`
        INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message, created_at)
        VALUES (?, ?, 'payment_required', 'Payment Required ✅', 
                CONCAT('Your order for ', ?, ' has been accepted! Please complete payment to confirm. Total: $', ?), NOW())
      `, [order.buyer_id, orderId, order.product_name, totalAmount.toFixed(2)]);
      
      // Send email notification
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
              <p><strong>Total: $${totalAmount.toFixed(2)}</strong></p>
              ${feeBreakdown.type === 'bulk' ? `<p style="font-size:12px;color:#f59e0b;">Bulk order discount applied!</p>` : ''}
            </div>
            <a href="${paymentLink}" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin:20px 0;">Pay Now</a>
          </div>
        </body>
        </html>
      `;
      
      // Send email (async, don't await)
      sendEmail(order.buyer_email, `Payment Required for Order #${orderId}`, emailHtml).catch(err => {
        console.error('Payment email failed:', err.message);
      });
      
      res.json({
        success: true,
        message: "Order accepted! The buyer has been notified to complete payment.",
        orderId: orderId,
        platformFee: platformFee,
        sellerEarnings: sellerEarnings,
        feeBreakdown: feeBreakdown
      });
      
    } else if (action === 'reject') {
      // Update order status to cancelled
      await db.query(`
        UPDATE physical_orders 
        SET order_status = 'cancelled',
            response_message = ?
        WHERE id = ?
      `, [message || 'Seller unable to fulfill order', orderId]);
      
      // Record rejection
      await db.query(`
        INSERT INTO order_acceptances (order_id, seller_id, status, response_message, responded_at)
        VALUES (?, ?, 'rejected', ?, NOW())
      `, [orderId, req.session.user.id, message || 'Seller unable to fulfill order']);
      
      // Notify buyer
      await db.query(`
        INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message, created_at)
        VALUES (?, ?, 'order_rejected', 'Order Declined ❌', 
                CONCAT('The seller was unable to fulfill your order for ', ?, '. Reason: ', ?), NOW())
      `, [order.buyer_id, orderId, order.product_name, message || 'No reason provided']);
      
      // Send email notification
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Order Declined - Core Insight</title></head>
        <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
          <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
            <h1 style="color:#ef4444;">❌ Order Declined</h1>
            <p>Hello ${escapeHtml(order.buyer_name)},</p>
            <p>Unfortunately, the seller was unable to fulfill your order.</p>
            <div style="background:#0f172a;padding:20px;border-radius:12px;margin:20px 0;">
              <p><strong>Order #${orderId}</strong></p>
              <p>${order.product_name} (x${order.quantity})</p>
              <p><strong>Reason:</strong> ${escapeHtml(message || 'No reason provided')}</p>
            </div>
            <p>No payment has been taken. You can browse other products on our marketplace.</p>
          </div>
        </body>
        </html>
      `;
      
      sendEmail(order.buyer_email, `Order #${orderId} Declined`, emailHtml).catch(err => {
        console.error('Decline email failed:', err.message);
      });
      
      res.json({
        success: true,
        message: "Order rejected and cancelled. The buyer has been notified."
      });
    } else {
      res.status(400).json({ error: "Invalid action. Must be 'accept' or 'reject'" });
    }
    
  } catch (err) {
    console.error("❌ Order response error:", err);
    res.status(500).json({ error: "Failed to process order response: " + err.message });
  }
});

// Get order counts for dashboard
app.get("/api/dashboard/order-counts", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const sellerId = req.session.user.id;
    
    const counts = await db.query(`
      SELECT 
        COUNT(CASE WHEN order_status = 'pending_seller_approval' THEN 1 END) as pending_approval,
        COUNT(CASE WHEN order_status = 'seller_accepted' THEN 1 END) as accepted,
        COUNT(CASE WHEN order_status = 'paid' THEN 1 END) as paid,
        COUNT(CASE WHEN order_status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN order_status = 'refund_requested' THEN 1 END) as refund_requests,
        COUNT(CASE WHEN order_status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(*) as total
      FROM physical_orders
      WHERE seller_id = ?
    `, [sellerId]);
    
    const result = counts && counts[0] ? counts[0] : {
      pending_approval: 0,
      accepted: 0,
      paid: 0,
      completed: 0,
      refund_requests: 0,
      cancelled: 0,
      total: 0
    };
    
    res.json({
      success: true,
      counts: {
        pending: parseInt(result.pending_approval) || 0,
        accepted: parseInt(result.accepted) || 0,
        paid: parseInt(result.paid) || 0,
        completed: parseInt(result.completed) || 0,
        refundRequests: parseInt(result.refund_requests) || 0,
        cancelled: parseInt(result.cancelled) || 0,
        total: parseInt(result.total) || 0
      }
    });
    
  } catch (err) {
    console.error("❌ Error loading order counts:", err);
    res.json({
      success: false,
      counts: {
        pending: 0,
        accepted: 0,
        paid: 0,
        completed: 0,
        refundRequests: 0,
        cancelled: 0,
        total: 0
      }
    });
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

app.get("/api/refunds/pending", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const isAdmin = req.session.user.role === 'admin';
    let query = `
      SELECT o.id, o.product_name, o.quantity, o.total_amount, 
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
      refunds: extractRows(refundRequests).map(r => ({
        ...r,
        total_amount: parseFloat(r.total_amount || 0)
      }))
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
// REVIEWS ENDPOINTS - FIXED
// ============================================

// Submit a product review
app.post("/api/reviews", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in to submit a review." });
    }

    const { productId, rating, comment } = req.body;
    
    if (!productId || !rating || !comment) {
      return res.status(400).json({ error: "Product ID, rating, and comment are required." });
    }
    
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5." });
    }

    // Check if user has already reviewed this product
    const existingReview = await db.query(
      "SELECT id FROM reviews WHERE user_id = ? AND product_id = ?",
      [req.session.user.id, productId]
    );

    if (existingReview && existingReview.length > 0) {
      return res.status(400).json({ error: "You have already reviewed this product." });
    }

    // Insert review
    await db.query(
      "INSERT INTO reviews (user_id, product_id, rating, comment, created_at) VALUES (?, ?, ?, ?, NOW())",
      [req.session.user.id, productId, rating, comment]
    );

    // Update product rating and review count
    const ratingResult = await db.query(
      `SELECT AVG(rating) as avg_rating, COUNT(*) as review_count 
       FROM reviews WHERE product_id = ?`,
      [productId]
    );

    const avgRating = ratingResult[0]?.avg_rating || 0;
    const reviewCount = ratingResult[0]?.review_count || 0;

    await db.query(
      "UPDATE products SET rating = ?, review_count = ? WHERE id = ?",
      [avgRating, reviewCount, productId]
    );

    res.json({ 
      success: true, 
      message: "Review submitted successfully",
      averageRating: avgRating,
      reviewCount: reviewCount
    });

  } catch (err) {
    console.error("❌ Error submitting review:", err);
    res.status(500).json({ error: "Error submitting review: " + err.message });
  }
});

// Get reviews for a product
app.get("/api/reviews/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    
    const reviews = await db.query(`
      SELECT r.*, u.username 
      FROM reviews r 
      JOIN users u ON r.user_id = u.id 
      WHERE r.product_id = ? 
      ORDER BY r.created_at DESC
    `, [productId]);

    const safeReviews = extractRows(reviews);
    
    // Get average rating
    const ratingResult = await db.query(
      "SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE product_id = ?",
      [productId]
    );
    
    res.json({ 
      reviews: safeReviews,
      count: ratingResult[0]?.count || 0,
      averageRating: ratingResult[0]?.avg_rating || 0
    });

  } catch (err) {
    console.error("❌ Error loading reviews:", err);
    res.status(500).json({ error: "Error loading reviews: " + err.message });
  }
});

// Get user's review for a specific product
app.get("/api/reviews/user/:productId", async (req, res) => {
  if (!req.session.user) {
    return res.json({ hasReviewed: false });
  }

  try {
    const { productId } = req.params;
    
    const review = await db.query(
      "SELECT id, rating, comment FROM reviews WHERE user_id = ? AND product_id = ?",
      [req.session.user.id, productId]
    );

    if (review && review.length > 0) {
      res.json({ hasReviewed: true, review: review[0] });
    } else {
      res.json({ hasReviewed: false });
    }
  } catch (err) {
    console.error("❌ Error checking user review:", err);
    res.json({ hasReviewed: false });
  }
});

// ============================================
// PRODUCT UPLOAD ENDPOINT - COMPLETE FIXED
// ============================================
app.post("/api/upload-product", (req, res) => {
  console.log("📤 Upload request received");
  
  const upload = multer({ 
    storage: productStorage,
    limits: { fileSize: 100 * 1024 * 1024 }
  }).fields([
    { name: 'file', maxCount: 1 }, 
    { name: 'images[]', maxCount: 10 }
  ]);

  upload(req, res, async function(err) {
    if (err) {
      console.error("❌ Multer error:", err);
      return res.status(400).json({ error: 'File upload error: ' + err.message });
    }

    try {
      if (!req.session.user) {
        return res.status(401).json({ error: "Please log in to upload products." });
      }

      const { 
        title, description, price, category, type, affiliate_link, paymentProvider,
        delivery_days, product_cost, delivery_locations, delivery_type, payment_option,
        businessName, businessEmail, businessPhone, country, bankName, bankCode, accountNumber, accountName
      } = req.body;

      if (!title || !price || !type || !paymentProvider) {
        return res.status(400).json({ error: "Title, price, type, and payment provider are required." });
      }

      const listedPrice = parseFloat(price);
      const productCostValue = type === 'physical' ? parseFloat(product_cost) || 3.00 : null;
      
      let sellerPrice = listedPrice;
      let platformFee = 0;
      let originalPrice = listedPrice;
      
      if (type === 'physical') {
        originalPrice = listedPrice;
        platformFee = 0;
        sellerPrice = originalPrice;
      } else if (type === 'digital') {
        platformFee = listedPrice * 0.10;
        sellerPrice = listedPrice - platformFee;
      }

      // Process images
      let imageUrls = [];
      if (req.files?.['images[]']?.length) {
        for (const imageFile of req.files['images[]']) {
          try {
            const cloudinary = require('cloudinary').v2;
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

      // Handle product file
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
        fs.copyFileSync(productFile.path, finalPath);
        fs.unlinkSync(productFile.path);
        fileUrl = `/uploads/products/files/${filename}`;
      }

      // Insert product
      const result = await db.query(
        `INSERT INTO products (
          user_id, title, description, price, original_price, platform_fee, product_cost,
          category, type, file_url, image_urls, affiliate_link, 
          seller_payment_provider, delivery_type, delivery_locations, 
          payment_option, estimated_delivery_days, rating, review_count, 
          status, sales_count, favorite_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          req.session.user.id, title, description || '', sellerPrice, originalPrice, platformFee, productCostValue,
          category || '', type || 'digital', fileUrl, imageUrls.length ? JSON.stringify(imageUrls) : null, 
          affiliate_link || null, paymentProvider,
          type === 'physical' ? (delivery_type || 'delivery') : null,
          type === 'physical' ? (delivery_locations || 'Worldwide') : null,
          type === 'physical' ? (payment_option || 'pay_before_delivery') : null,
          type === 'physical' ? (parseInt(delivery_days) || 7) : null,
          0.00, 0, 'active', 0, 0
        ]
      );

      const productId = result.insertId;
      
      // Store business info - FIXED (provider column removed)
      if (businessName && accountNumber) {
        try {
          await db.query(
            `INSERT INTO sellers (user_id, account_number, bank_code, bank_name, business_name, business_email, business_phone, country, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE 
             account_number = VALUES(account_number),
             bank_code = VALUES(bank_code),
             bank_name = VALUES(bank_name),
             business_name = VALUES(business_name),
             business_email = VALUES(business_email),
             business_phone = VALUES(business_phone),
             country = VALUES(country)`,
            [req.session.user.id, accountNumber, bankCode || null, bankName || null, businessName, businessEmail || null, businessPhone || null, country || null]
          );
          console.log(`✅ Business info stored for seller ${req.session.user.id}`);
        } catch (err) {
          console.error('❌ Error storing business info:', err.message);
        }
      }

      console.log(`✅ Product uploaded! ID: ${productId}`);
      
      res.json({ 
        message: "✅ Product uploaded successfully!", 
        productId: productId,
        type: type,
        pricing: {
          customer_price: originalPrice,
          platform_fee: platformFee,
          seller_earnings: sellerPrice,
          product_cost: productCostValue
        }
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
app.get("/api/cron/release-escrow-funds", async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const orders = await db.query(
      `SELECT o.*, s.flutterwave_subaccount_id
       FROM physical_orders o
       LEFT JOIN sellers s ON o.seller_id = s.user_id
       WHERE o.payment_status = 'paid' 
         AND o.order_status = 'paid'
         AND o.payment_held_until <= NOW()
         AND o.funds_released_at IS NULL`
    );

    let released = 0;
    let failed = 0;

    for (const order of orders) {
      try {
        await db.query(
          `UPDATE physical_orders 
           SET order_status = 'completed',
               funds_released_at = NOW()
           WHERE id = ?`,
          [order.id]
        );
        released++;
      } catch (err) {
        console.error(`Failed to release order ${order.id}:`, err);
        failed++;
      }
    }

    res.json({ success: true, released, failed });
  } catch (err) {
    console.error("❌ Escrow release error:", err);
    res.status(500).json({ error: err.message });
  }
});


// Serve order tracking page
app.get("/order-tracking.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "order-tracking.html"));
});
// Serve dashboard page
app.get("/dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Serve login page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Serve dashboard page
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Serve order tracking page
app.get("/order-tracking", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "order-tracking.html"));
});

app.get("/pay-order.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pay-order.html"));
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
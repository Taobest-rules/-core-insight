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

app.post("/api/verify-paystack-payment", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const { reference, order_id, usd_amount } = req.body;
    
    console.log(`🔍 Verifying Paystack payment for order #${order_id}`);
    
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );
    
    if (response.data.status === true && response.data.data.status === "success") {
      const ngnAmountPaid = response.data.data.amount / 100;
      
      // IMPORTANT: Update BOTH payment_status AND order_status
      await db.query(
        `UPDATE physical_orders 
         SET payment_status = 'paid',
             order_status = 'paid',
             payment_collected_at = NOW(),
             payment_held_until = DATE_ADD(NOW(), INTERVAL 5 DAY),
             transaction_ref = ?,
             amount_paid_currency = 'NGN',
             amount_paid = ?
         WHERE id = ?`,
        [reference, ngnAmountPaid, order_id]
      );
      
      // Add to status history for tracking
      await db.query(
        `INSERT INTO order_status_history (order_id, status, notes, created_at)
         VALUES (?, 'payment_completed', 'Payment received and held in escrow', NOW())`,
        [order_id]
      );
      
      console.log(`✅ Order #${order_id} updated to PAID status`);
      
      res.json({ 
        success: true, 
        message: "Payment verified successfully",
        order_id: order_id,
        order_status: 'paid'
      });
    } else {
      console.log(`❌ Payment verification failed for order #${order_id}`);
      res.status(400).json({ success: false, message: "Payment verification failed" });
    }
  } catch (err) {
    console.error("❌ Paystack verification error:", err);
    res.status(500).json({ error: err.message });
  }
});
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

// TEMPORARY DEBUG - Test Flutterwave payment creation directly
app.post("/api/debug/flutterwave-payment-test", async (req, res) => {
  console.log("\n🔍 ========== FLUTTERWAVE DEBUG TEST ==========");
  
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const testAmount = 16.00;
    const testRef = `debug_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    console.log("Test Parameters:");
    console.log("- Amount:", testAmount);
    console.log("- Reference:", testRef);
    console.log("- User:", req.session.user.email);
    console.log("- API Key (first 10 chars):", process.env.FLW_SECRET_KEY?.substring(0, 10));
    
    const payload = {
      tx_ref: testRef,
      amount: testAmount,
      currency: "USD",
      redirect_url: "https://core-insight-7.onrender.com/payment-callback.html",
      customer: {
        email: req.session.user.email,
        name: req.session.user.username,
      },
      customizations: {
        title: "Core Insight - Debug Test",
        description: "Testing Flutterwave integration",
      }
    };
    
    console.log("\n📤 Sending to Flutterwave:");
    console.log(JSON.stringify(payload, null, 2));
    
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    console.log("\n✅ Flutterwave Response:");
    console.log("- Status:", response.status);
    console.log("- Response status:", response.data.status);
    console.log("- Has link:", !!response.data.data?.link);
    console.log("- Link:", response.data.data?.link);
    
    res.json({
      success: true,
      message: "Flutterwave is working!",
      paymentLink: response.data.data?.link,
      fullResponse: response.data
    });
    
  } catch (err) {
    console.error("\n❌ FLUTTERWAVE ERROR:");
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    
    if (err.response) {
      console.error("\n📡 Flutterwave Error Response:");
      console.error("Status Code:", err.response.status);
      console.error("Status Text:", err.response.statusText);
      console.error("Headers:", JSON.stringify(err.response.headers, null, 2));
      console.error("Data:", JSON.stringify(err.response.data, null, 2));
      
      res.status(500).json({
        error: "Flutterwave API error",
        statusCode: err.response.status,
        flutterwaveError: err.response.data,
        message: err.response.data?.message
      });
    } else if (err.request) {
      console.error("\n📡 No response received from Flutterwave");
      console.error("Request:", err.request);
      res.status(500).json({
        error: "No response from Flutterwave",
        message: err.message
      });
    } else {
      console.error("\n📡 Request setup error:", err.message);
      res.status(500).json({
        error: "Request configuration error",
        message: err.message
      });
    }
  }
});

// Debug endpoint to test actual payment creation
app.post("/api/debug/test-payment", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    console.log("🔧 Testing payment creation with Flutterwave...");
    
    const testRef = `test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    const payload = {
      tx_ref: testRef,
      amount: 10.00,
      currency: "USD",
      redirect_url: "https://core-insight-7.onrender.com/test-callback.html",
      customer: {
        email: req.session.user.email,
        name: req.session.user.username,
      },
      customizations: {
        title: "Core Insight - Test Payment",
        description: "Test payment to verify Flutterwave configuration",
      },
      meta: {
        test: true,
        user_id: req.session.user.id
      }
    };
    
    console.log("Test payload:", JSON.stringify(payload, null, 2));
    
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
    
    console.log("Flutterwave test response:", response.data);
    
    res.json({
      success: true,
      message: "Test payment created successfully!",
      paymentLink: response.data.data?.link,
      response: response.data
    });
    
  } catch (err) {
    console.error("❌ Test payment failed:");
    console.error("Error message:", err.message);
    
    if (err.response) {
      console.error("Flutterwave error response:");
      console.error("- Status:", err.response.status);
      console.error("- Status text:", err.response.statusText);
      console.error("- Data:", JSON.stringify(err.response.data, null, 2));
      
      res.status(500).json({
        error: "Test payment failed",
        flutterwaveError: err.response.data,
        statusCode: err.response.status,
        statusText: err.response.statusText
      });
    } else {
      console.error("No response from Flutterwave");
      res.status(500).json({
        error: "Test payment failed",
        message: err.message
      });
    }
  }
});
// ============================================
// ROUTES - AUTHENTICATION (keep existing)
// ============================================
// ============================================
// ROUTES - AUTHENTICATION
// ============================================
// Updated signup route with proper trial dates
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
        
        // Calculate trial dates for freelancers
        let trialStartDate = null;
        let trialEndDate = null;
        
        if (userRole === 'freelancer') {
            trialStartDate = new Date();
            trialEndDate = new Date();
            trialEndDate.setDate(trialEndDate.getDate() + 90); // 90 days free trial
        }

        const result = await db.query(
            `INSERT INTO users (username, email, password, role, verified, verify_token, verify_token_expiry, 
                                subscription_status, subscription_plan, trial_start_date, trial_end_date, created_at) 
             VALUES (?, ?, ?, ?, 0, ?, ?, 'active', 'free_trial', ?, ?, NOW())`,
            [username, email, hashedPassword, userRole, verifyToken, tokenExpiry, trialStartDate, trialEndDate]
        );

        // If freelancer, create freelancer profile with trial info
        if (userRole === 'freelancer') {
            const userId = result.insertId;
            await db.query(
                `INSERT INTO freelancer_profiles (user_id, subscription_status, trial_days_remaining, created_at)
                 VALUES (?, 'free_trial', 90, NOW())`,
                [userId]
            );
        }

        const verifyLink = `https://core-insight-7.onrender.com/verify.html?token=${verifyToken}`;
        const emailHtml = getVerificationEmailTemplate(username, verifyLink);
        
        const emailResult = await sendEmail(email, "Verify Your Email - Core Insight Marketplace", emailHtml);
        
        const message = userRole === 'freelancer' 
            ? "Account created! You have 90 days free trial. Please check your email to verify your account."
            : "Account created! Please check your email to verify your account.";

        res.json({ 
            message: message,
            requiresVerification: true,
            trial_days: userRole === 'freelancer' ? 90 : null
        });
        
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
// COMPLETE COURSES SYSTEM - FULL CODE
// ============================================

// =================== COURSE FILE UPLOAD CONFIGURATION ===================
// Upload directories
const uploadDir = "uploads/courses";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration for courses
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '-')
      .substring(0, 50);
    
    const filename = `${uniqueSuffix}-${baseName}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 2
  }
});

// =================== ADMIN FILE MANAGEMENT PAGES ===================
app.get("/admin-files.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-files.html"));
});

app.get("/admin-migrate", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-migrate.html"));
});

// =================== COURSE ACCESS MIDDLEWARE ===================
const checkCourseAccess = async (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to access this course" });
  }

  try {
    const courseId = req.params.id;
    const userId = req.session.user.id;

    const accessCheck = await db.query(
      `SELECT c.*, uc.payment_status 
       FROM courses c 
       LEFT JOIN user_courses uc ON c.id = uc.course_id AND uc.user_id = ?
       WHERE c.id = ? AND (c.price = 0 OR uc.payment_status = 'completed')`,
      [userId, courseId]
    );

    let hasAccess = false;
    if (Array.isArray(accessCheck) && accessCheck.length > 0) {
      hasAccess = true;
    } else if (accessCheck && accessCheck[0] && Array.isArray(accessCheck[0]) && accessCheck[0].length > 0) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have access to this course. Please purchase it first." });
    }

    next();
  } catch (err) {
    res.status(500).json({ error: "Error checking course access" });
  }
};

// =================== COURSES ENDPOINTS ===================

// Get all courses
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT 
        c.*, 
        u.username as author_name,
        COALESCE(c.file_url, c.file_path) as file_path_combined,
        COALESCE(c.thumbnail_url, c.thumbnail_path) as thumbnail_path_combined
      FROM courses c 
      LEFT JOIN users u ON c.user_id = u.id 
      ORDER BY c.created_at DESC
    `);
    
    const processedCourses = (Array.isArray(courses) ? courses : (courses[0] || [])).map(course => {
      if (course.id && typeof course.id === 'bigint') {
        course.id = Number(course.id);
      }
      if (course.user_id && typeof course.user_id === 'bigint') {
        course.user_id = Number(course.user_id);
      }
      
      course.thumbnail_url = course.thumbnail_url || course.thumbnail_path;
      course.file_url = course.file_url || course.file_path;
      
      if (course.thumbnail_url && course.thumbnail_url.includes('cloudinary.com')) {
        course.thumbnail_url = course.thumbnail_url.replace('/upload/', '/upload/w_500,h_300,c_limit/');
      }
      
      course.download_url = `/api/download/${course.id}`;
      
      return course;
    });
    
    res.json(processedCourses);
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ 
      error: "Error fetching courses", 
      details: err.message
    });
  }
});

// Get my courses (purchased)
app.get("/api/my-courses", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to view your courses" });
  }

  try {
    const courses = await db.query(`
      SELECT c.*, uc.purchased_at 
      FROM courses c 
      INNER JOIN user_courses uc ON c.id = uc.course_id 
      WHERE uc.user_id = ? AND uc.payment_status = 'completed'
      ORDER BY uc.purchased_at DESC
    `, [req.session.user.id]);

    const safeCourses = (Array.isArray(courses) ? courses : (courses[0] || [])).map(course => {
      if (course.id && typeof course.id === 'bigint') {
        course.id = Number(course.id);
      }
      if (course.user_id && typeof course.user_id === 'bigint') {
        course.user_id = Number(course.user_id);
      }
      return course;
    });

    res.json(safeCourses);
  } catch (err) {
    res.status(500).json({ error: "Error fetching your courses" });
  }
});

// Check course access
app.get('/api/check-access/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.session?.user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        hasAccess: false,
        error: 'Please login first' 
      });
    }
    
    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    
    if (!courses || courses.length === 0) {
      return res.status(404).json({ 
        hasAccess: false,
        error: 'Course not found' 
      });
    }
    
    const course = courses[0];
    
    const isFree = course.price === 0 || course.type === 'free' || course.type === 'Free';
    
    if (isFree) {
      return res.json({
        hasAccess: true,
        isFree: true,
        course: {
          id: course.id,
          title: course.title,
          price: course.price,
          type: course.type
        }
      });
    }
    
    const purchases = await db.query(
      'SELECT * FROM user_courses WHERE course_id = ? AND user_id = ? AND payment_status = "completed"',
      [courseId, userId]
    );
    
    const hasPurchased = purchases && purchases.length > 0;
    
    if (!hasPurchased) {
      const payments = await db.query(
        'SELECT * FROM payments WHERE course_id = ? AND user_id = ? AND status = "successful"',
        [courseId, userId]
      );
      
      const hasPaid = payments && payments.length > 0;
      
      if (!hasPaid) {
        return res.json({
          hasAccess: false,
          isFree: false,
          price: course.price,
          course: {
            id: course.id,
            title: course.title,
            price: course.price,
            type: course.type
          }
        });
      }
    }
    
    res.json({
      hasAccess: true,
      isFree: false,
      course: {
        id: course.id,
        title: course.title,
        price: course.price,
        type: course.type
      }
    });
    
  } catch (error) {
    console.error('❌ Access check error:', error);
    res.status(500).json({ 
      hasAccess: false,
      error: 'Server error' 
    });
  }
});

// =================== DOWNLOAD ENDPOINT ===================
app.get('/api/download/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.session?.user?.id;
    
    console.log('='.repeat(50));
    console.log(`📥 DOWNLOAD REQUEST - Course: ${courseId}, User: ${userId}`);
    console.log('='.repeat(50));
    
    if (!userId) {
      return res.status(401).json({ error: 'Please login first' });
    }
    
    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    
    if (!courses || courses.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const course = courses[0];
    console.log(`✅ Course: "${course.title}"`);
    console.log(`💰 Price: ${course.price}, Type: ${course.type}`);
    
    const isFree = course.price === 0 || course.type === 'free' || course.type === 'Free';
    
    if (isFree) {
      console.log('✅ Course is FREE - granting access immediately');
    } else {
      console.log('💰 Paid course - checking purchase status');
      
      const purchases = await db.query(
        'SELECT * FROM user_courses WHERE course_id = ? AND user_id = ? AND payment_status = "completed"',
        [courseId, userId]
      );
      
      const hasPurchased = purchases && purchases.length > 0;
      
      if (!hasPurchased) {
        const payments = await db.query(
          'SELECT * FROM payments WHERE course_id = ? AND user_id = ? AND status = "successful"',
          [courseId, userId]
        );
        
        const hasPaid = payments && payments.length > 0;
        
        if (!hasPaid) {
          console.log(`❌ User ${userId} has not purchased course ${courseId}`);
          return res.status(403).json({ 
            error: 'You do not have access to this course',
            isPaidCourse: true,
            price: course.price
          });
        }
      }
      console.log('✅ User has purchased this course');
    }
    
    const dbFilePath = course.file_url || course.file_path;
    
    if (!dbFilePath) {
      console.log('❌ No file path in database');
      return res.status(404).json({ error: 'No file associated with this course' });
    }
    
    const filename = path.basename(dbFilePath);
    console.log(`📁 Looking for file: ${filename}`);
    
    const uploadDir = path.join(__dirname, 'uploads', 'courses');
    const expectedPath = path.join(uploadDir, filename);
    console.log(`📍 Expected path: ${expectedPath}`);
    
    const fileExists = fs.existsSync(expectedPath);
    console.log(`📁 File exists: ${fileExists}`);
    
    if (!fileExists) {
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        console.log('📂 Files in uploads/courses:', files);
        
        const searchName = filename.replace(/^\d+-\d+-/, '');
        const similarFile = files.find(f => f.includes(searchName) || searchName.includes(f.replace(/^\d+-\d+-/, '')));
        
        if (similarFile) {
          console.log(`🔍 Found similar file: ${similarFile}`);
          const correctPath = `/uploads/courses/${similarFile}`;
          await db.query(
            'UPDATE courses SET file_path = ? WHERE id = ?',
            [correctPath, course.id]
          );
          console.log(`✅ Updated database with correct path: ${correctPath}`);
          
          const correctFullPath = path.join(uploadDir, similarFile);
          return sendFile(res, correctFullPath, course.title);
        }
      }
      
      return res.status(404).json({ 
        error: 'File not found on server',
        message: 'The course file could not be located. Please contact support.',
        filename: filename,
        expected_path: expectedPath
      });
    }
    
    sendFile(res, expectedPath, course.title);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    res.status(500).json({ error: error.message });
  }
});

function sendFile(res, filePath, title) {
  const stat = fs.statSync(filePath);
  const filename = path.basename(filePath);
  const ext = path.extname(filename);
  
  const safeFilename = title 
    ? title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ext
    : filename;
  
  console.log(`📤 Sending file: ${safeFilename}`);
  console.log(`📊 File size: ${stat.size} bytes`);
  
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('❌ Error sending file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error sending file' });
      }
    } else {
      console.log('✅ File sent successfully!');
    }
  });
}

// =================== COURSE UPLOAD ===================
app.post("/api/courses", (req, res) => {
  console.log('📚 Course upload started');
  
  const uploadDir = path.join(__dirname, 'uploads', 'courses');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`📁 Created upload directory: ${uploadDir}`);
  }
  
  const upload = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, uploadDir);
      },
      filename: function (req, file, cb) {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext)
          .replace(/[^a-zA-Z0-9]/g, '-')
          .substring(0, 50);
        const filename = `${timestamp}-${random}-${baseName}${ext}`;
        console.log(`📝 Generated filename: ${filename}`);
        cb(null, filename);
      }
    }),
    limits: {
      fileSize: 100 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['.pdf', '.epub', '.mp4', '.mov', '.zip', '.doc', '.docx'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedTypes.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${ext} not allowed. Allowed: ${allowedTypes.join(', ')}`));
      }
    }
  }).fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]);

  upload(req, res, async function(err) {
    if (err) {
      console.error('❌ Upload error:', err);
      return res.status(400).json({ error: 'Upload error: ' + err.message });
    }

    try {
      if (!req.session.user) {
        return res.status(401).json({ error: "Please login to upload courses" });
      }

      const { title, description, price, author, content_type } = req.body;
      const user = req.session.user;

      if (!title || title.trim() === '') {
        return res.status(400).json({ error: "Title is required" });
      }

      if (!req.files?.file || !req.files?.file[0]) {
        return res.status(400).json({ error: "Course file is required" });
      }

      if (!req.files?.thumbnail || !req.files?.thumbnail[0]) {
        return res.status(400).json({ error: "Thumbnail image is required" });
      }

      const courseFile = req.files.file[0];
      const thumbnailFile = req.files.thumbnail[0];
      
      const filePath = `/uploads/courses/${courseFile.filename}`;
      const thumbnailPath = `/uploads/courses/${thumbnailFile.filename}`;
      
      const absoluteFilePath = path.join(uploadDir, courseFile.filename);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!fs.existsSync(absoluteFilePath)) {
        console.error(`❌ File not found after upload: ${absoluteFilePath}`);
        return res.status(500).json({ error: "File upload failed - file not saved" });
      }
      
      const fileStats = fs.statSync(absoluteFilePath);
      console.log(`✅ File verified: ${courseFile.filename} (${fileStats.size} bytes)`);

      const result = await db.query(
        `INSERT INTO courses (
          title, description, file_path, thumbnail_path,
          price, type, user_id, author, content_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          title.trim(),
          description ? description.trim() : '',
          filePath,
          thumbnailPath,
          parseFloat(price) || 0,
          (parseFloat(price) > 0) ? 'paid' : 'free',
          user.id,
          author || user.username,
          content_type || 'book'
        ]
      );

      res.json({
        message: "✅ Course uploaded successfully!",
        courseId: result.insertId,
        file_path: filePath,
        file_size: fileStats.size,
        download_url: `/api/download/${result.insertId}`
      });

    } catch (err) {
      console.error('❌ Upload error:', err);
      res.status(500).json({ error: "Error uploading course: " + err.message });
    }
  });
});

// =================== DELETE COURSE ===================
app.delete('/api/courses/:id', async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized - Please log in' });
    }

    const courseId = req.params.id;

    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    
    let course = null;
    if (Array.isArray(courses) && courses.length > 0) {
      course = courses[0];
    } else if (courses && courses[0] && Array.isArray(courses[0]) && courses[0].length > 0) {
      course = courses[0][0];
    }

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const canDelete = user.role === 'admin' || user.id === course.user_id;
    
    if (!canDelete) {
      return res.status(403).json({ 
        error: 'Permission denied - You can only delete your own courses' 
      });
    }

    try {
      if (course.file_path) {
        const fullPath = path.join(__dirname, course.file_path);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    } catch (fileError) {}

    await db.query('DELETE FROM courses WHERE id = ?', [courseId]);

    res.json({ message: 'Course deleted successfully' });

  } catch (error) {
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// =================== COURSE PAYMENT ENDPOINTS ===================
app.post("/api/initiate-payment", async (req, res) => {
  console.log('💳 Payment initiation request received');
  
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to make payment" });
  }

  try {
    const { courseId } = req.body;
    
    if (!courseId) {
      return res.status(400).json({ error: "Course ID is required" });
    }

    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    
    let course = null;
    if (courses && Array.isArray(courses)) {
      if (courses.length === 2 && Array.isArray(courses[0])) {
        course = courses[0][0];
      } else if (courses.length > 0) {
        course = courses[0];
      }
    }

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.price <= 0) {
      return res.status(400).json({ error: "This course is free. No payment required." });
    }

    if (!process.env.FLW_SECRET_KEY) {
      console.error('❌ FLW_SECRET_KEY is missing!');
      return res.status(500).json({ 
        error: "Payment system not configured. Please contact support."
      });
    }
    
    const transaction_ref = "coreinsight_" + Date.now() + "_" + courseId;
    const amount = parseFloat(course.price);
    
    const payload = {
      tx_ref: transaction_ref,
      amount: amount,
      currency: "NGN",
      redirect_url: `https://core-insight-7.onrender.com/payment-callback.html`,
      customer: {
        email: req.session.user.email || `${req.session.user.username}@example.com`,
        name: req.session.user.username,
      },
      customizations: {
        title: "Core Insight",
        description: `Payment for ${course.title}`,
      },
      meta: {
        course_id: courseId,
        user_id: req.session.user.id,
      }
    };
    
    console.log('📤 Sending to Flutterwave...');
    
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
      console.log('✅ Payment link created');
      
      try {
        await db.query(
          `INSERT INTO payments 
           (user_id, course_id, transaction_ref, amount, status, created_at)
           VALUES (?, ?, ?, ?, 'pending', NOW())`,
          [req.session.user.id, courseId, transaction_ref, amount]
        );
        console.log('✅ Payment recorded in database');
      } catch (dbError) {
        console.error('⚠️ Could not save payment to database:', dbError.message);
      }
      
      res.json({
        status: "success",
        paymentLink: response.data.data.link,
        transactionRef: transaction_ref
      });
    } else {
      console.error('❌ Flutterwave error:', response.data);
      res.status(500).json({ 
        error: response.data.message || "Payment initiation failed" 
      });
    }
    
  } catch (err) {
    console.error('❌ Payment error:', err.message);
    if (err.response) {
      console.error('❌ Flutterwave error:', err.response.data);
    }
    res.status(500).json({ 
      error: "Error initiating payment: " + err.message
    });
  }
});

app.get("/api/verify-payment/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;
    
    console.log('🔍 Verifying payment:', transaction_id);
    
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        }
      }
    );
    
    if (response.data.status === "success" && response.data.data.status === "successful") {
      const transaction = response.data.data;
      const tx_ref = transaction.tx_ref;
      const amount = transaction.amount;
      const courseId = transaction.meta?.course_id;
      const userId = transaction.meta?.user_id;
      
      console.log('✅ Payment verified:', { tx_ref, amount, courseId, userId });
      
      await db.query(
        `UPDATE payments 
         SET status = 'completed', 
             transaction_id = ?,
             flutterwave_response = ?
         WHERE transaction_ref = ?`,
        [transaction_id, JSON.stringify(transaction), tx_ref]
      );
      
      await db.query(
        `INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at)
         VALUES (?, ?, 'completed', NOW())
         ON DUPLICATE KEY UPDATE payment_status = 'completed', purchased_at = NOW()`,
        [userId, courseId]
      );
      
      res.json({
        status: "success",
        message: "Payment verified successfully",
        data: transaction
      });
    } else {
      console.log('❌ Payment not successful:', response.data);
      res.status(400).json({ 
        status: "failed", 
        message: "Payment not successful" 
      });
    }
  } catch (err) {
    console.error('❌ Verification error:', err.message);
    if (err.response) {
      console.error('❌ Flutterwave error:', err.response.data);
    }
    res.status(500).json({ 
      error: "Error verifying payment: " + err.message 
    });
  }
});

app.get("/api/verify-by-reference/:tx_ref", async (req, res) => {
  try {
    const { tx_ref } = req.params;
    
    console.log('🔍 Verifying payment by reference:', tx_ref);
    
    const paymentResult = await db.query(
      "SELECT * FROM payments WHERE transaction_ref = ?",
      [tx_ref]
    );
    
    let payment = null;
    if (Array.isArray(paymentResult) && paymentResult.length > 0) {
      payment = paymentResult[0];
    }
    
    if (payment && payment.status === 'completed') {
      const courseResult = await db.query(
        "SELECT title FROM courses WHERE id = ?",
        [payment.course_id]
      );
      
      let courseTitle = 'Your course';
      if (Array.isArray(courseResult) && courseResult.length > 0) {
        courseTitle = courseResult[0].title;
      }
      
      return res.json({
        status: "success",
        message: "Payment already verified",
        course_id: payment.course_id,
        course_title: courseTitle,
        amount: payment.amount
      });
    }
    
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        }
      }
    );
    
    if (response.data.status === "success" && response.data.data.status === "successful") {
      const transaction = response.data.data;
      const amount = transaction.amount;
      const courseId = transaction.meta?.course_id;
      const userId = transaction.meta?.user_id;
      
      console.log('✅ Payment verified by reference:', { tx_ref, amount, courseId, userId });
      
      await db.query(
        `INSERT INTO payments 
         (user_id, course_id, transaction_ref, transaction_id, amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'completed', NOW())
         ON DUPLICATE KEY UPDATE 
         status = 'completed', 
         transaction_id = VALUES(transaction_id)`,
        [userId, courseId, tx_ref, transaction.id, amount]
      );
      
      await db.query(
        `INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at)
         VALUES (?, ?, 'completed', NOW())
         ON DUPLICATE KEY UPDATE payment_status = 'completed', purchased_at = NOW()`,
        [userId, courseId]
      );
      
      const courseResult = await db.query(
        "SELECT title FROM courses WHERE id = ?",
        [courseId]
      );
      
      let courseTitle = 'Your course';
      if (Array.isArray(courseResult) && courseResult.length > 0) {
        courseTitle = courseResult[0].title;
      }
      
      res.json({
        status: "success",
        message: "Payment verified successfully",
        course_id: courseId,
        course_title: courseTitle,
        amount: amount
      });
    } else {
      res.status(400).json({
        status: "failed",
        message: "Payment not successful or not found"
      });
    }
    
  } catch (err) {
    console.error('❌ Verify by reference error:', err.message);
    if (err.response) {
      console.error('❌ Flutterwave error:', err.response.data);
    }
    res.status(500).json({
      status: "error",
      message: "Error verifying payment: " + err.message
    });
  }
});

// =================== MIGRATION ENDPOINTS ===================
app.post("/api/admin/migrate-to-cloudinary", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { courseId } = req.body;
    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    let courses = [];
    if (courseId) {
      const result = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
      courses = Array.isArray(result) ? result : (result[0] || []);
    } else {
      const result = await db.query(`
        SELECT * FROM courses 
        WHERE (file_url IS NULL OR file_url = '') 
        AND file_path IS NOT NULL
      `);
      courses = Array.isArray(result) ? result : (result[0] || []);
    }

    console.log(`Found ${courses.length} courses to migrate`);

    for (const course of courses) {
      try {
        console.log(`Processing course ${course.id}: ${course.title}`);
        
        if (course.file_url && course.file_url.includes('cloudinary.com')) {
          results.skipped.push({
            id: course.id,
            title: course.title,
            reason: "Already has Cloudinary URL"
          });
          continue;
        }

        let filePath = course.file_path;
        const filename = path.basename(filePath);
        
        const possiblePaths = [
          path.join(__dirname, "uploads/courses", filename),
          path.join(__dirname, "uploads", filename),
          path.join(__dirname, filePath),
          path.join(__dirname, "public", "uploads", "courses", filename),
          `/opt/render/project/src/uploads/courses/${filename}`,
          `/opt/render/project/src/uploads/${filename}`,
        ];

        let foundPath = null;
        for (const testPath of possiblePaths) {
          if (fs.existsSync(testPath)) {
            foundPath = testPath;
            break;
          }
        }

        if (!foundPath) {
          results.failed.push({
            id: course.id,
            title: course.title,
            error: "Local file not found",
            searched_paths: possiblePaths
          });
          continue;
        }

        console.log(`Found file at: ${foundPath}`);

        const uploadResult = await new Promise((resolve, reject) => {
          const upload = uploadCourseFile.single('file');
          
          const mockReq = {
            file: {
              path: foundPath,
              originalname: filename,
              mimetype: 'application/pdf'
            },
            body: {}
          };
          
          const mockRes = {
            json: resolve,
            status: () => ({ json: reject })
          };
          
          upload(mockReq, mockRes, (err) => {
            if (err) reject(err);
            else resolve({ file: mockReq.file });
          });
        });

        if (!uploadResult || !uploadResult.file || !uploadResult.file.path) {
          throw new Error("Upload failed - no URL returned");
        }

        const cloudinaryUrl = uploadResult.file.path;
        console.log(`Uploaded to Cloudinary: ${cloudinaryUrl}`);

        await db.query(
          "UPDATE courses SET file_url = ?, file_path = NULL WHERE id = ?",
          [cloudinaryUrl, course.id]
        );

        results.success.push({
          id: course.id,
          title: course.title,
          old_path: course.file_path,
          new_url: cloudinaryUrl
        });

        try {
          fs.unlinkSync(foundPath);
          console.log(`Deleted local file: ${foundPath}`);
        } catch (deleteErr) {
          console.log(`Could not delete local file: ${deleteErr.message}`);
        }

      } catch (err) {
        console.error(`Error migrating course ${course.id}:`, err);
        results.failed.push({
          id: course.id,
          title: course.title,
          error: err.message
        });
      }
    }

    res.json({
      success: true,
      message: `Migration completed. ${results.success.length} succeeded, ${results.failed.length} failed, ${results.skipped.length} skipped.`,
      results: results
    });

  } catch (err) {
    console.error("Migration error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/migration-status", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const result = await db.query(`
      SELECT 
        COUNT(*) as total_courses,
        SUM(CASE WHEN file_url IS NOT NULL AND file_url != '' THEN 1 ELSE 0 END) as has_cloudinary,
        SUM(CASE WHEN (file_url IS NULL OR file_url = '') AND file_path IS NOT NULL THEN 1 ELSE 0 END) as needs_migration,
        SUM(CASE WHEN file_path IS NULL AND (file_url IS NULL OR file_url = '') THEN 1 ELSE 0 END) as no_file
      FROM courses
    `);

    const courses = Array.isArray(result) ? result[0] : result;

    res.json({
      success: true,
      stats: courses
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== FIX COURSE PATHS ===================
app.get("/api/admin/fix-course-paths", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const uploadDir = path.join(__dirname, 'uploads', 'courses');
    
    if (!fs.existsSync(uploadDir)) {
      return res.status(404).json({ 
        error: "Upload directory not found",
        path: uploadDir
      });
    }
    
    const existingFiles = fs.readdirSync(uploadDir);
    console.log('📂 Existing files:', existingFiles);
    
    const courses = await db.query('SELECT id, title, file_path FROM courses');
    
    const results = {
      fixed: [],
      not_found: [],
      skipped: []
    };
    
    for (const course of courses) {
      const dbPath = course.file_path;
      const dbFilename = dbPath ? path.basename(dbPath) : null;
      
      if (!dbFilename) {
        results.skipped.push({ id: course.id, title: course.title, reason: "No filename in DB" });
        continue;
      }
      
      if (existingFiles.includes(dbFilename)) {
        const correctPath = `/uploads/courses/${dbFilename}`;
        if (dbPath !== correctPath) {
          await db.query(
            'UPDATE courses SET file_path = ? WHERE id = ?',
            [correctPath, course.id]
          );
          results.fixed.push({
            id: course.id,
            title: course.title,
            old_path: dbPath,
            new_path: correctPath
          });
        }
      } else {
        const matchingFile = existingFiles.find(f => 
          f.includes(dbFilename.replace(/^\d+-\d+-/, '')) || 
          dbFilename.includes(f.replace(/^\d+-\d+-/, ''))
        );
        
        if (matchingFile) {
          const correctPath = `/uploads/courses/${matchingFile}`;
          await db.query(
            'UPDATE courses SET file_path = ? WHERE id = ?',
            [correctPath, course.id]
          );
          results.fixed.push({
            id: course.id,
            title: course.title,
            old_path: dbPath,
            new_path: correctPath,
            matched_file: matchingFile
          });
        } else {
          results.not_found.push({
            id: course.id,
            title: course.title,
            db_filename: dbFilename,
            available_files: existingFiles.slice(0, 10)
          });
        }
      }
    }
    
    res.json({
      success: true,
      upload_dir: uploadDir,
      files_in_directory: existingFiles.length,
      results: results
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/fix-course-paths", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const results = {
      fixed: [],
      not_found: [],
      errors: []
    };
    
    const courses = await db.query('SELECT id, title, file_path FROM courses');
    
    const uploadDir = path.join(__dirname, 'uploads', 'courses');
    
    if (!fs.existsSync(uploadDir)) {
      return res.status(404).json({ error: "Upload directory not found", uploadDir });
    }
    
    const existingFiles = fs.readdirSync(uploadDir);
    console.log('📂 Existing files:', existingFiles);
    
    for (const course of courses) {
      try {
        const dbFilename = course.file_path ? path.basename(course.file_path) : null;
        
        if (!dbFilename) {
          results.not_found.push({ id: course.id, title: course.title, reason: "No filename in DB" });
          continue;
        }
        
        let foundFile = null;
        
        if (existingFiles.includes(dbFilename)) {
          foundFile = dbFilename;
        } else {
          for (const file of existingFiles) {
            const originalName = dbFilename.replace(/^\d+-\d+-/, '');
            if (file.includes(originalName) || originalName.includes(file.replace(/^\d+-\d+-/, ''))) {
              foundFile = file;
              break;
            }
          }
        }
        
        if (foundFile) {
          const newPath = `/uploads/courses/${foundFile}`;
          await db.query(
            'UPDATE courses SET file_path = ? WHERE id = ?',
            [newPath, course.id]
          );
          
          results.fixed.push({
            id: course.id,
            title: course.title,
            old_path: course.file_path,
            new_path: newPath
          });
        } else {
          results.not_found.push({
            id: course.id,
            title: course.title,
            db_filename: dbFilename,
            available_files: existingFiles.slice(0, 10)
          });
        }
      } catch (err) {
        results.errors.push({ id: course.id, error: err.message });
      }
    }
    
    res.json({
      success: true,
      message: `Fixed ${results.fixed.length} courses, ${results.not_found.length} not found`,
      results
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/fix-all-paths", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const uploadDir = path.join(__dirname, 'uploads', 'courses');
    
    if (!fs.existsSync(uploadDir)) {
      return res.status(404).json({ 
        error: "Upload directory not found",
        path: uploadDir
      });
    }
    
    const existingFiles = fs.readdirSync(uploadDir);
    console.log('📂 Existing files:', existingFiles);
    
    const courses = await db.query('SELECT id, title, file_path FROM courses');
    
    const results = {
      fixed: [],
      need_reupload: [],
      deleted: []
    };
    
    for (const course of courses) {
      const dbPath = course.file_path;
      
      if (!dbPath) {
        results.need_reupload.push({ id: course.id, title: course.title, reason: "No file path" });
        continue;
      }
      
      const dbFilename = path.basename(dbPath);
      
      if (existingFiles.includes(dbFilename)) {
        const correctPath = `/uploads/courses/${dbFilename}`;
        if (dbPath !== correctPath) {
          await db.query(
            'UPDATE courses SET file_path = ? WHERE id = ?',
            [correctPath, course.id]
          );
          results.fixed.push({
            id: course.id,
            title: course.title,
            old_path: dbPath,
            new_path: correctPath,
            match_type: 'exact'
          });
        }
        continue;
      }
      
      let foundFile = null;
      const searchTitle = course.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      for (const file of existingFiles) {
        const fileLower = file.toLowerCase();
        if (fileLower.includes(searchTitle) || searchTitle.includes(fileLower.replace(/^\d+-\d+-/, ''))) {
          foundFile = file;
          break;
        }
      }
      
      if (foundFile) {
        const correctPath = `/uploads/courses/${foundFile}`;
        await db.query(
          'UPDATE courses SET file_path = ? WHERE id = ?',
          [correctPath, course.id]
        );
        results.fixed.push({
          id: course.id,
          title: course.title,
          old_path: dbPath,
          new_path: correctPath,
          match_type: 'title_match',
          matched_file: foundFile
        });
      } else {
        results.need_reupload.push({
          id: course.id,
          title: course.title,
          db_filename: dbFilename,
          reason: "No matching file found"
        });
      }
    }
    
    res.json({
      success: true,
      upload_dir: uploadDir,
      files_in_directory: existingFiles,
      results: results
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/check-integrity", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const uploadDir = path.join(__dirname, 'uploads', 'courses');
    const courses = await db.query('SELECT id, title, file_path FROM courses');
    
    const results = {
      valid: [],
      missing: [],
      orphaned: []
    };
    
    for (const course of courses) {
      if (course.file_path) {
        const filename = path.basename(course.file_path);
        const filePath = path.join(uploadDir, filename);
        
        if (fs.existsSync(filePath)) {
          results.valid.push({
            id: course.id,
            title: course.title,
            file_path: course.file_path,
            size: fs.statSync(filePath).size
          });
        } else {
          results.missing.push({
            id: course.id,
            title: course.title,
            expected_path: course.file_path,
            filename: filename
          });
        }
      }
    }
    
    if (fs.existsSync(uploadDir)) {
      const filesOnDisk = fs.readdirSync(uploadDir);
      const dbFiles = courses.map(c => path.basename(c.file_path)).filter(Boolean);
      
      for (const file of filesOnDisk) {
        if (!dbFiles.includes(file) && !file.startsWith('.')) {
          results.orphaned.push({
            filename: file,
            path: path.join(uploadDir, file),
            size: fs.statSync(path.join(uploadDir, file)).size
          });
        }
      }
    }
    
    res.json({
      success: true,
      summary: {
        total_courses: courses.length,
        valid_files: results.valid.length,
        missing_files: results.missing.length,
        orphaned_files: results.orphaned.length
      },
      details: results
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/courses/:courseId/reupload", (req, res) => {
  const uploadDir = path.join(__dirname, 'uploads', 'courses');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  const upload = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, uploadDir);
      },
      filename: function (req, file, cb) {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext)
          .replace(/[^a-zA-Z0-9]/g, '-')
          .substring(0, 50);
        cb(null, `${timestamp}-${random}-${baseName}${ext}`);
      }
    })
  }).single('file');

  upload(req, res, async function(err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const courseId = req.params.courseId;
      
      if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const newFilePath = `/uploads/courses/${req.file.filename}`;
      
      await db.query(
        'UPDATE courses SET file_path = ? WHERE id = ?',
        [newFilePath, courseId]
      );
      
      res.json({
        success: true,
        message: "File uploaded and course updated successfully!",
        file_path: newFilePath
      });
      
    } catch (error) {
      console.error('Reupload error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

app.get("/api/admin/sync-files", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const results = {
      added: [],
      skipped: [],
      errors: []
    };

    const coursesDir = path.join(__dirname, "uploads", "courses");
    
    if (!fs.existsSync(coursesDir)) {
      return res.status(404).json({ error: "Uploads directory not found" });
    }

    const files = fs.readdirSync(coursesDir);
    
    const pdfFiles = files.filter(file => 
      file.toLowerCase().endsWith('.pdf') && 
      fs.statSync(path.join(coursesDir, file)).isFile()
    );

    console.log(`Found ${pdfFiles.length} PDF files to sync`);

    for (const file of pdfFiles) {
      try {
        let title = file.replace(/^\d+-/, '')
                        .replace(/\.pdf$/i, '')
                        .replace(/[-_]/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
        
        title = title.replace(/\b\w/g, l => l.toUpperCase());
        
        const [existing] = await db.query(
          "SELECT id FROM courses WHERE file_path LIKE ?",
          [`%${file}%`]
        );
        
        let existingRows = [];
        if (Array.isArray(existing) && existing.length > 0) {
          existingRows = existing;
        } else if (existing && existing[0] && Array.isArray(existing[0]) && existing[0].length > 0) {
          existingRows = existing[0];
        }
        
        if (existingRows.length > 0) {
          results.skipped.push({ file, reason: "Already in database" });
          continue;
        }

        const result = await db.query(
          `INSERT INTO courses (title, description, file_path, price, type, user_id, author, created_at) 
           VALUES (?, ?, ?, 0.00, 'free', ?, 'Unknown', NOW())`,
          [
            title,
            `Automatically synced from file: ${file}`,
            `/uploads/courses/${file}`,
            req.session.user.id
          ]
        );

        const insertId = result.insertId || (result[0] && result[0].insertId);
        
        results.added.push({
          file,
          title,
          courseId: insertId
        });

        console.log(`✅ Added: ${title} (ID: ${insertId})`);

      } catch (err) {
        console.error(`❌ Error adding ${file}:`, err);
        results.errors.push({ file, error: err.message });
      }
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sync Results</title>
        <style>
          body { font-family: Arial; padding: 20px; background: #0a192f; color: #e6f1ff; }
          .success { color: #64ffda; }
          .warning { color: #FFD700; }
          .error { color: #ff6b6b; }
          pre { background: #172a45; padding: 10px; border-radius: 5px; overflow: auto; }
        </style>
      </head>
      <body>
        <h1>📁 File Sync Results</h1>
        <p>✅ Added: ${results.added.length}</p>
        <p>⏭️ Skipped: ${results.skipped.length}</p>
        <p>❌ Errors: ${results.errors.length}</p>
        
        <h2>Added Files:</h2>
        <pre>${JSON.stringify(results.added, null, 2)}</pre>
        
        ${results.errors.length > 0 ? `
          <h2>Errors:</h2>
          <pre class="error">${JSON.stringify(results.errors, null, 2)}</pre>
        ` : ''}
        
        <p><a href="/api/debug/all-courses">View All Courses</a></p>
      </body>
      </html>
    `;
    
    res.send(html);

  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

app.get("/api/admin/recover-files", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const results = {
      files_found: [],
      files_missing: [],
      updates: [],
      errors: []
    };

    const coursesResult = await db.query("SELECT id, title, file_path FROM courses");
    let courses = [];
    
    if (Array.isArray(coursesResult)) {
      if (coursesResult.length === 2 && Array.isArray(coursesResult[0])) {
        courses = coursesResult[0];
      } else {
        courses = coursesResult;
      }
    }

    const uploadDir = path.join(__dirname, "uploads/courses");
    if (!fs.existsSync(uploadDir)) {
      return res.json({ error: "Upload directory not found", path: uploadDir });
    }

    const actualFiles = fs.readdirSync(uploadDir);
    console.log(`Found ${actualFiles.length} files in uploads/courses:`);
    actualFiles.forEach(f => console.log(`  - ${f}`));

    for (const course of courses) {
      const dbPath = course.file_path;
      const dbFilename = path.basename(dbPath);
      
      let found = false;
      let foundPath = null;
      
      if (actualFiles.includes(dbFilename)) {
        found = true;
        foundPath = path.join(uploadDir, dbFilename);
        results.files_found.push({
          course_id: course.id,
          title: course.title,
          db_filename: dbFilename,
          status: "exact_match"
        });
      } else {
        const similar = actualFiles.filter(f => 
          f.includes('beyond-good-and-evil') || 
          f.includes(course.title.toLowerCase().replace(/[^a-z0-9]/g, '-'))
        );
        
        if (similar.length > 0) {
          found = true;
          foundPath = path.join(uploadDir, similar[0]);
          
          try {
            await db.query(
              "UPDATE courses SET file_path = ? WHERE id = ?",
              [similar[0], course.id]
            );
            results.updates.push({
              course_id: course.id,
              old: dbFilename,
              new: similar[0]
            });
          } catch (updateError) {
            results.errors.push({
              course_id: course.id,
              error: updateError.message
            });
          }
          
          results.files_found.push({
            course_id: course.id,
            title: course.title,
            db_filename: dbFilename,
            actual_filename: similar[0],
            status: "updated"
          });
        } else {
          results.files_missing.push({
            course_id: course.id,
            title: course.title,
            db_filename: dbFilename
          });
        }
      }
    }

    res.json({
      success: true,
      upload_directory: uploadDir,
      total_files_in_directory: actualFiles.length,
      files_in_directory: actualFiles,
      results: results
    });

  } catch (err) {
    console.error("Recovery error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =================== HEALTH CHECK WITH FILE SYSTEM ===================
app.get("/api/health", async (req, res) => {
  try {
    await db.query('SELECT 1 as healthy');
    
    const uploadDir = path.join(__dirname, 'uploads', 'courses');
    const uploadsExist = fs.existsSync(uploadDir);
    
    let fileCount = 0;
    if (uploadsExist) {
      fileCount = fs.readdirSync(uploadDir).length;
    }
    
    const courses = await db.query('SELECT COUNT(*) as count, SUM(CASE WHEN file_path IS NULL THEN 1 ELSE 0 END) as missing_path FROM courses');
    const courseCount = courses[0]?.count || 0;
    const missingPaths = courses[0]?.missing_path || 0;
    
    res.json({
      status: "healthy",
      database: "connected",
      uploads_directory: uploadsExist,
      file_count: fileCount,
      course_count: courseCount,
      courses_without_paths: missingPaths,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    res.status(500).json({ 
      status: "unhealthy", 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Run integrity check every 24 hours (optional)
if (process.env.NODE_ENV === 'production') {
  setInterval(async () => {
    try {
      console.log('🔍 Running automatic integrity check...');
      const integrityCheck = require('./scripts/check-integrity');
      await integrityCheck();
    } catch (error) {
      console.error('Auto integrity check failed:', error);
    }
  }, 24 * 60 * 60 * 1000);
}

// =================== DEBUG ENDPOINTS ===================
app.get("/api/debug/course-files", async (req, res) => {
  try {
    const results = {
      database_courses: [],
      files_found: [],
      locations_checked: []
    };
    
    const courses = await db.query('SELECT id, title, file_path, file_url FROM courses');
    
    const basePaths = [
      __dirname,
      '/opt/render/project/src',
      process.cwd()
    ];
    
    for (const course of courses) {
      const filename = course.file_path ? path.basename(course.file_path) : null;
      const fileInfo = {
        id: course.id,
        title: course.title,
        db_path: course.file_path,
        filename: filename,
        found_at: null,
        checked_locations: []
      };
      
      if (filename) {
        const locations = [
          path.join(__dirname, 'uploads', 'courses', filename),
          path.join(__dirname, 'public', 'uploads', 'courses', filename),
          path.join(__dirname, 'uploads', filename),
          `/opt/render/project/src/uploads/courses/${filename}`,
          `/opt/render/project/src/public/uploads/courses/${filename}`,
          path.join(process.cwd(), 'uploads', 'courses', filename),
          course.file_path,
          path.join(__dirname, course.file_path),
          path.join(__dirname, '..', course.file_path)
        ];
        
        for (const loc of locations) {
          fileInfo.checked_locations.push(loc);
          if (fs.existsSync(loc)) {
            fileInfo.found_at = loc;
            results.files_found.push({
              id: course.id,
              title: course.title,
              location: loc,
              size: fs.statSync(loc).size
            });
            break;
          }
        }
      }
      
      results.database_courses.push(fileInfo);
    }
    
    const uploadDirs = [
      path.join(__dirname, 'uploads', 'courses'),
      path.join(__dirname, 'public', 'uploads', 'courses'),
      '/opt/render/project/src/uploads/courses',
      '/opt/render/project/src/public/uploads/courses'
    ];
    
    results.directories = {};
    for (const dir of uploadDirs) {
      if (fs.existsSync(dir)) {
        results.directories[dir] = fs.readdirSync(dir);
      } else {
        results.directories[dir] = 'Directory does not exist';
      }
    }
    
    res.json(results);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/debug/courses-list", async (req, res) => {
  try {
    const result = await db.query("SELECT id, title, user_id FROM courses ORDER BY id");
    
    let courses = [];
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) {
        courses = result[0];
      } else if (result.length > 0) {
        courses = result;
      }
    }
    
    res.json({
      count: courses.length,
      courses: courses
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/all-courses", async (req, res) => {
  try {
    const result = await db.query("SELECT id, title, file_path, price, type, created_at FROM courses ORDER BY id DESC");
    
    let courses = [];
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) {
        courses = result[0];
      } else if (result.length > 0) {
        courses = result;
      }
    } else if (result && result.rows) {
      courses = result.rows;
    }
    
    console.log(`Found ${courses.length} courses in database`);
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>All Courses</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #0a192f; color: #e6f1ff; margin: 0; }
          h1 { color: #64ffda; }
          .stats { background: #172a45; padding: 20px; border-radius: 8px; margin-bottom: 20px; display: flex; gap: 30px; }
          .stat { text-align: center; }
          .stat-label { color: #8892b0; font-size: 14px; margin-bottom: 5px; }
          .stat-value { color: #64ffda; font-size: 32px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #172a45; border-radius: 8px; overflow: hidden; }
          th { background: #1d3b5c; color: #64ffda; padding: 12px; text-align: left; font-weight: 600; }
          td { padding: 12px; border-bottom: 1px solid #2a4a6e; color: #e6f1ff; }
          tr:hover { background: #1e3a5a; }
          .free { color: #64ffda; font-weight: bold; }
          .paid { color: #FFD700; font-weight: bold; }
          a { color: #64ffda; text-decoration: none; padding: 4px 8px; border: 1px solid #64ffda; border-radius: 4px; font-size: 12px; margin-right: 5px; }
          a:hover { background: #64ffda; color: #0a192f; }
        </style>
      </head>
      <body>
        <h1>📚 Course Database</h1>
        <div class="stats">
          <div class="stat"><div class="stat-label">Total Courses</div><div class="stat-value">${courses.length}</div></div>
          ${courses.length > 0 ? `<div class="stat"><div class="stat-label">Free Courses</div><div class="stat-value">${courses.filter(c => c.type === 'free' || parseFloat(c.price || 0) === 0).length}</div></div><div class="stat"><div class="stat-label">Paid Courses</div><div class="stat-value">${courses.filter(c => c.type === 'paid' || parseFloat(c.price || 0) > 0).length}</div></div>` : ''}
        </div>
        ${courses.length > 0 ? `
          <table><thead><tr><th>ID</th><th>Title</th><th>File Path</th><th>Price</th><th>Type</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>${courses.map(course => {
            const price = parseFloat(course.price || 0);
            const type = course.type || (price > 0 ? 'paid' : 'free');
            return `<tr><td><strong>${course.id}</strong></td><td>${course.title || 'Untitled'}</td><td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;">${course.file_path || 'N/A'}</td><td>$${price.toFixed(2)}</td><td class="${type === 'free' ? 'free' : 'paid'}">${type}</td><td>${course.created_at ? new Date(course.created_at).toLocaleDateString() : 'N/A'}</td><td><a href="/api/download/${course.id}" target="_blank">Download</a><a href="/api/debug/course/${course.id}" target="_blank">Debug</a></td></tr>`;
          }).join('')}</tbody></table>
        ` : `<div class="no-data"><h2>❌ No courses found</h2><p><a href="/api/debug/check-db" style="padding:10px 20px;font-size:16px;">Check Database</a></p></div>`}
        <p style="margin-top:20px;"><a href="/" style="display:inline-block;padding:10px 20px;">← Back to Home</a></p>
      </body></html>`;
    res.send(html);
  } catch (err) {
    res.status(500).send(`<h1>Error</h1><p>${err.message}</p>`);
  }
});

app.get("/api/debug/course/:id", async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    const [rows] = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    let course = null;
    if (Array.isArray(rows) && rows.length > 0) course = rows[0];
    else if (rows && rows[0] && Array.isArray(rows[0]) && rows[0].length > 0) course = rows[0][0];
    if (!course) return res.status(404).send(`<h1>Course ${courseId} Not Found</h1>`);
    
    let fileExists = false, filePath = null, fileSize = null;
    if (course.file_path) {
      const filename = path.basename(course.file_path);
      const fullPath = path.join(__dirname, "uploads", "courses", filename);
      if (fs.existsSync(fullPath)) {
        fileExists = true;
        filePath = fullPath;
        fileSize = fs.statSync(fullPath).size;
      }
    }
    
    res.send(`<!DOCTYPE html><html><head><title>Course #${courseId}</title><style>body{font-family:Arial;padding:20px;background:#0a192f;color:#e6f1ff;}.card{background:#172a45;padding:20px;border-radius:8px;margin-bottom:20px;}.label{color:#8892b0;font-size:14px;}.value{color:#64ffda;font-size:18px;margin-bottom:10px;}.success{color:#64ffda;}.error{color:#ff6b6b;}a{color:#64ffda;text-decoration:none;padding:8px 16px;border:1px solid #64ffda;border-radius:4px;}</style></head><body>
      <h1>Course #${courseId}: ${course.title}</h1>
      <div class="card"><div class="label">ID</div><div class="value">${course.id}</div><div class="label">Title</div><div class="value">${course.title || 'N/A'}</div><div class="label">Description</div><div class="value">${course.description || 'No description'}</div><div class="label">File Path (DB)</div><div class="value">${course.file_path || 'N/A'}</div><div class="label">Price</div><div class="value">$${parseFloat(course.price || 0).toFixed(2)}</div><div class="label">Type</div><div class="value">${course.type || 'free'}</div><div class="label">Created</div><div class="value">${course.created_at || 'N/A'}</div></div>
      <div class="card"><h2>File Check</h2><div class="label">File Exists on Disk</div><div class="value ${fileExists ? 'success' : 'error'}">${fileExists ? '✅ YES' : '❌ NO'}</div>${fileExists ? `<div class="label">File Path (Actual)</div><div class="value">${filePath}</div><div class="label">File Size</div><div class="value">${Math.round(fileSize / 1024)} KB</div>` : ''}</div>
      <p><a href="/api/download/${courseId}" target="_blank">⬇️ Download Now</a> <a href="/api/debug/all-courses" style="margin-left:10px;">← Back to All Courses</a></p>
    </body></html>`);
  } catch (err) { res.status(500).send(`Error: ${err.message}`); }
});

app.get("/api/debug/check-db", async (req, res) => {
  try {
    const [connectResult] = await db.query("SELECT 1 as test");
    const [tableCheck] = await db.query("SHOW TABLES LIKE 'courses'");
    const tableExists = tableCheck && tableCheck.length > 0;
    let courseCount = 0, sampleCourses = [];
    if (tableExists) {
      const countResult = await db.query("SELECT COUNT(*) as count FROM courses");
      if (Array.isArray(countResult)) courseCount = countResult[0]?.count || 0;
      if (courseCount > 0) {
        const coursesResult = await db.query("SELECT id, title FROM courses LIMIT 5");
        if (Array.isArray(coursesResult)) sampleCourses = coursesResult;
      }
    }
    res.json({ database_connected: true, test_query: connectResult, courses_table_exists: tableExists, course_count: courseCount, sample_courses: sampleCourses });
  } catch (err) { res.status(500).json({ database_connected: false, error: err.message }); }
});

app.get("/api/debug/uploads", async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, "uploads");
    const coursesDir = path.join(uploadsDir, "courses");
    const result = { uploads_exists: fs.existsSync(uploadsDir), courses_exists: fs.existsSync(coursesDir), files: [] };
    if (fs.existsSync(coursesDir)) result.files = fs.readdirSync(coursesDir);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/debug/user-courses/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const result = await db.query(`SELECT uc.*, c.title, c.price FROM user_courses uc JOIN courses c ON uc.course_id = c.id WHERE uc.user_id = ?`, [userId]);
    let courses = [];
    if (result) {
      if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) courses = result[0];
      else if (Array.isArray(result) && result.length > 0) courses = result;
    }
    res.json({ user_id: userId, course_count: courses.length, courses: courses });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/debug/directories", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    const directories = { current_dir: __dirname, uploads_courses: path.join(__dirname, "uploads/courses"), public_uploads: path.join(__dirname, "public/uploads"), public_uploads_courses: path.join(__dirname, "public/uploads/courses") };
    const results = {};
    for (const [name, dir] of Object.entries(directories)) {
      try {
        if (fs.existsSync(dir)) results[name] = { exists: true, isDirectory: fs.statSync(dir).isDirectory(), files: fs.readdirSync(dir).slice(0, 20) };
        else results[name] = { exists: false, error: "Directory does not exist" };
      } catch (err) { results[name] = { exists: false, error: err.message }; }
    }
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ============================================
// FLAGGING SYSTEM - COURSE FLAGGING ENDPOINTS
// ============================================

// =================== FLAGGING SYSTEM ===================

// Submit a flag for a course
app.post("/api/courses/flag", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login to report content" });
    }

    const { courseId, reason } = req.body;
    
    if (!courseId) return res.status(400).json({ error: "Course ID required" });
    if (!reason || reason.length < 10) return res.status(400).json({ error: "Reason must be at least 10 characters" });

    const userId = req.session.user.id;

    // Get course details
    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    const course = courses && courses.length > 0 ? courses[0] : null;
    
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (course.user_id === userId) return res.status(400).json({ error: "Cannot flag your own content" });

    // Check if admin content
    const creator = await db.query("SELECT role FROM users WHERE id = ?", [course.user_id]);
    if (creator && creator[0] && creator[0].role === 'admin') {
      return res.status(403).json({ error: "Admin content cannot be flagged" });
    }

    // Check for duplicate flag
    const existing = await db.query(
      "SELECT id FROM course_flags WHERE course_id = ? AND flagged_by_user_id = ?",
      [courseId, userId]
    );
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: "Already reported this content" });
    }

    // Insert flag
    await db.query(
      `INSERT INTO course_flags (course_id, flagged_by_user_id, reason, status, created_at)
       VALUES (?, ?, ?, 'pending', NOW())`,
      [courseId, userId, reason]
    );

    // Count flags
    const flagCountResult = await db.query(
      "SELECT COUNT(*) as count FROM course_flags WHERE course_id = ? AND status = 'pending'",
      [courseId]
    );
    const flagCount = flagCountResult[0]?.count || 1;
    
    const DELETION_THRESHOLD = 10;
    let deleted = false;
    let warningIssued = false;
    
    // Auto-delete if threshold reached
    if (flagCount >= DELETION_THRESHOLD) {
      await db.query(
        "UPDATE courses SET is_deleted = 1, deleted_at = NOW(), deleted_reason = ? WHERE id = ?",
        [`Removed after ${flagCount} reports`, courseId]
      );
      await db.query(
        "UPDATE course_flags SET status = 'resolved', resolved_at = NOW() WHERE course_id = ?",
        [courseId]
      );
      deleted = true;
    } 
    // Issue warning on first flag
    else if (flagCount === 1) {
      await db.query(
        `INSERT INTO user_warnings (user_id, warning_type, reason, created_at)
         VALUES (?, 'content_flag', ?, NOW())`,
        [course.user_id, `Your course "${course.title}" has been reported. Please review guidelines.`]
      );
      warningIssued = true;
    }

    res.json({
      success: true,
      message: deleted ? "Content removed due to reports" : "Report submitted successfully",
      deleted: deleted,
      warningIssued: warningIssued
    });

  } catch (err) {
    console.error("Flag error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get courses flagged by current user
app.get("/api/courses/flagged-by-me", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json([]);
    }
    
    const flagged = await db.query(
      "SELECT course_id as id FROM course_flags WHERE flagged_by_user_id = ?",
      [req.session.user.id]
    );
    
    res.json(flagged || []);
  } catch (err) {
    console.error("Error fetching flagged courses:", err);
    res.json([]);
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
// MESSAGING SYSTEM - COMPLETE ROUTES
// ============================================

// Configure multer for chat image uploads
const chatImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads', 'chat-images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'chat-' + uniqueSuffix + ext);
  }
});

const chatImageUpload = multer({ 
  storage: chatImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// =================== CHAT SYSTEM ENDPOINTS ===================

// Get total unread messages
app.get("/api/messages/unread-count", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ count: 0 });
    const userId = req.session.user.id;

    const result = await db.query(`
      SELECT COUNT(m.id) AS unread_count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.sender_id != ?
        AND m.is_read = 0
        AND (c.client_id = ? OR c.freelancer_id = ?)
    `, [userId, userId, userId]);

    const unreadCount = (result && result[0]) ? result[0].unread_count : 0;
    res.json({ count: unreadCount });
  } catch (err) {
    console.error("Unread count error:", err);
    res.json({ count: 0 });
  }
});

// Get unread counts by conversation
app.get("/api/messages/unread-by-conversation", async (req, res) => {
  try {
    if (!req.session.user) return res.json({});
    
    const userId = req.session.user.id;

    const result = await db.query(`
      SELECT 
        m.conversation_id,
        COUNT(m.id) AS unread_count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.sender_id != ?
        AND m.is_read = 0
        AND (c.client_id = ? OR c.freelancer_id = ?)
      GROUP BY m.conversation_id
    `, [userId, userId, userId]);

    const rows = extractRows(result);
    const unreadCounts = {};
    if (rows && rows.length > 0) {
      rows.forEach(row => {
        unreadCounts[row.conversation_id] = row.unread_count;
      });
    }
    
    res.json(unreadCounts);
    
  } catch (err) {
    console.error("Error getting unread counts:", err);
    res.json({});
  }
});

// List all conversations for the logged-in user
app.get("/api/messages/conversations", async (req, res) => {
  try {
    if (!req.session.user) {
      console.log("No user in session for conversations request");
      return res.json([]);
    }
    
    const userId = req.session.user.id;
    console.log(`Fetching conversations for user ${userId}`);

    const result = await db.query(`
      SELECT 
        c.id AS conversation_id,
        c.service_id,
        s.title AS service_title,
        c.created_at,
        CASE 
          WHEN c.client_id = ? THEN u2.username 
          ELSE u1.username 
        END AS other_user_name,
        CASE 
          WHEN c.client_id = ? THEN u2.id 
          ELSE u1.id 
        END AS other_user_id,
        (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) as last_message_time,
        (SELECT message FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM conversations c
      JOIN users u1 ON c.client_id = u1.id
      JOIN users u2 ON c.freelancer_id = u2.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.client_id = ? OR c.freelancer_id = ?
      ORDER BY 
        (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) DESC,
        c.created_at DESC
    `, [userId, userId, userId, userId]);

    const conversations = extractRows(result);
    console.log(`Found ${conversations.length} conversations for user ${userId}`);
    
    res.json(conversations);

  } catch (err) {
    console.error("Conversations fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start a new conversation without a service
app.post("/api/conversations/start-without-service", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Login required" });
    
    const { recipient_id } = req.body;
    if (!recipient_id) return res.status(400).json({ error: "Missing recipient ID" });

    console.log(`Starting conversation without service - Recipient ID: ${recipient_id} User ID: ${user.id}`);

    const currentUserId = parseInt(user.id);
    const recipientId = parseInt(recipient_id);

    // Check if there's ANY conversation between these two users
    const existingResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations 
       WHERE (client_id = ? AND freelancer_id = ?) 
          OR (client_id = ? AND freelancer_id = ?)
       LIMIT 1`,
      [currentUserId, recipientId, recipientId, currentUserId]
    );

    const existingConversations = extractRows(existingResult);
    const existingConversation = existingConversations && existingConversations.length > 0 ? existingConversations[0] : null;

    if (existingConversation) {
      console.log(`Using existing conversation: ${existingConversation.id}`);
      return res.status(200).json({ 
        success: true, 
        conversation_id: existingConversation.id,
        message: "Using existing conversation"
      });
    }

    // Determine who is client and who is freelancer based on roles
    let clientId, freelancerId;
    
    // Get user roles
    const userResult = await db.query(
      "SELECT id, role FROM users WHERE id IN (?, ?)",
      [currentUserId, recipientId]
    );

    const users = extractRows(userResult);

    const currentUserData = users.find(u => parseInt(u.id) === currentUserId);
    const recipientData = users.find(u => parseInt(u.id) === recipientId);

    if (!currentUserData || !recipientData) {
      return res.status(404).json({ error: "User not found" });
    }

    // Assign roles: if someone is freelancer, they're the freelancer, otherwise the other is freelancer
    if (currentUserData.role === 'freelancer' && recipientData.role === 'client') {
      clientId = recipientId;
      freelancerId = currentUserId;
    } else if (currentUserData.role === 'client' && recipientData.role === 'freelancer') {
      clientId = currentUserId;
      freelancerId = recipientId;
    } else {
      // Both are same role - default to current user as client, recipient as freelancer
      clientId = currentUserId;
      freelancerId = recipientId;
    }

    console.log(`Creating new conversation - Client: ${clientId}, Freelancer: ${freelancerId}`);
    
    const insertResult = await db.query(
      `INSERT INTO conversations (client_id, freelancer_id, created_at)
       VALUES (?, ?, NOW())`,
      [clientId, freelancerId]
    );

    const conversationId = extractInsertId(insertResult);

    if (!conversationId) {
      return res.status(500).json({ error: "Failed to create conversation" });
    }

    console.log(`New conversation created with ID: ${conversationId}`);

    res.status(201).json({ 
      success: true, 
      conversation_id: conversationId,
      message: "New conversation created without service"
    });
    
  } catch (err) {
    console.error("Start conversation without service error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start a new conversation with service
app.post("/api/conversations/start", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Login required" });
    
    const { service_id, recipient_id } = req.body;
    if (!service_id || !recipient_id) return res.status(400).json({ error: "Missing service or recipient ID" });

    console.log(`Starting conversation - Service ID: ${service_id} Recipient ID: ${recipient_id} User ID: ${user.id}`);

    // First verify the service exists
    const serviceResult = await db.query(
      `SELECT id, user_id as provider_id FROM services WHERE id = ?`,
      [service_id]
    );

    const services = extractRows(serviceResult);
    const service = services && services.length > 0 ? services[0] : null;

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    console.log("Service found:", service);

    const provider_id = parseInt(service.provider_id || service.user_id);
    const client_id = parseInt(user.id);

    // Check if there's ANY conversation between these two users
    const existingResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations 
       WHERE (client_id = ? AND freelancer_id = ?) 
          OR (client_id = ? AND freelancer_id = ?)
       LIMIT 1`,
      [client_id, provider_id, provider_id, client_id]
    );

    const existingConversations = extractRows(existingResult);
    const existingConversation = existingConversations && existingConversations.length > 0 ? existingConversations[0] : null;

    if (existingConversation) {
      console.log(`Using existing conversation: ${existingConversation.id}`);
      
      await db.query(
        `UPDATE conversations SET service_id = ? WHERE id = ? AND service_id IS NULL`,
        [service_id, existingConversation.id]
      );
      
      return res.status(200).json({ 
        success: true, 
        conversation_id: existingConversation.id,
        message: "Using existing conversation"
      });
    }

    console.log(`Creating new conversation - Service: ${service_id}, Client: ${client_id}, Provider: ${provider_id}`);
    
    const insertResult = await db.query(
      `INSERT INTO conversations (service_id, client_id, freelancer_id, created_at)
       VALUES (?, ?, ?, NOW())`,
      [service_id, client_id, provider_id]
    );

    const conversationId = extractInsertId(insertResult);

    if (!conversationId) {
      return res.status(500).json({ error: "Failed to create conversation" });
    }

    console.log(`New conversation created with ID: ${conversationId}`);

    res.status(201).json({ 
      success: true, 
      conversation_id: conversationId,
      message: "New conversation created"
    });
    
  } catch (err) {
    console.error("Start conversation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Send a message
app.post("/api/messages/send", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Login required" });

    const { conversation_id, message } = req.body;
    if (!conversation_id || !message?.trim()) {
      return res.status(400).json({ error: "Missing message or conversation ID" });
    }

    console.log(`Sending message to conversation ${conversation_id} from user ${user.id}`);

    // Check if user has access to this conversation
    const convResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations WHERE id = ?`,
      [conversation_id]
    );

    const conversations = extractRows(convResult);
    const conversation = conversations && conversations.length > 0 ? conversations[0] : null;

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Check if user is either client or freelancer
    const isClient = parseInt(conversation.client_id) === parseInt(user.id);
    const isFreelancer = parseInt(conversation.freelancer_id) === parseInt(user.id);
    
    if (!isClient && !isFreelancer) {
      console.error(`Access denied: User ${user.id} not in conversation ${conversation_id}`);
      return res.status(403).json({ error: "Access denied" });
    }

    // Insert the message
    const insertResult = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, message, created_at, is_read)
       VALUES (?, ?, ?, NOW(), 0)`,
      [conversation_id, user.id, message.trim()]
    );

    const messageId = extractInsertId(insertResult);

    if (!messageId) {
      console.error("Failed to get insertId:", insertResult);
      return res.status(500).json({ error: "Failed to insert message" });
    }

    console.log(`Message inserted with ID: ${messageId}`);

    // Get the inserted message with sender info
    const messageResult = await db.query(
      `SELECT m.*, u.username AS sender_name 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.id = ?`,
      [messageId]
    );

    const messages = extractRows(messageResult);
    const newMessage = messages && messages.length > 0 ? messages[0] : null;

    if (!newMessage) {
      return res.status(500).json({ error: "Failed to retrieve inserted message" });
    }

    res.status(200).json({ 
      success: true, 
      data: newMessage 
    });
    
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Send message with image
app.post("/api/messages/send-with-image", chatImageUpload.single('image'), async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Login required" });

    const { conversation_id, message } = req.body;
    if (!conversation_id) {
      return res.status(400).json({ error: "Missing conversation ID" });
    }

    console.log(`Sending message with image to conversation ${conversation_id} from user ${user.id}`);

    // Check if user has access to this conversation
    const convResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations WHERE id = ?`,
      [conversation_id]
    );

    const conversations = extractRows(convResult);
    const conversation = conversations && conversations.length > 0 ? conversations[0] : null;

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Check if user is either client or freelancer
    const isClient = parseInt(conversation.client_id) === parseInt(user.id);
    const isFreelancer = parseInt(conversation.freelancer_id) === parseInt(user.id);
    
    if (!isClient && !isFreelancer) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Build message content
    let messageContent = message || '';
    let imageUrl = null;
    
    if (req.file) {
      imageUrl = `/uploads/chat-images/${req.file.filename}`;
      if (!messageContent) {
        messageContent = '📷 Sent an image';
      }
    }

    // Insert message with image_url
    const insertResult = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, message, image_url, created_at, is_read)
       VALUES (?, ?, ?, ?, NOW(), 0)`,
      [conversation_id, user.id, messageContent, imageUrl]
    );

    const messageId = extractInsertId(insertResult);

    if (!messageId) {
      return res.status(500).json({ error: "Failed to insert message" });
    }

    // Get the inserted message with sender info
    const messageResult = await db.query(
      `SELECT m.*, u.username AS sender_name 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.id = ?`,
      [messageId]
    );

    const messages = extractRows(messageResult);
    const newMessage = messages && messages.length > 0 ? messages[0] : null;

    res.status(200).json({ 
      success: true, 
      data: newMessage 
    });
    
  } catch (err) {
    console.error("Send message with image error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a conversation
app.get("/api/messages/:conversationId", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const conversationId = parseInt(req.params.conversationId);
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation ID" });
    }

    const userId = req.session.user.id;

    // First check if user has access to this conversation
    const convResult = await db.query(
      `SELECT id FROM conversations WHERE id = ? AND (client_id = ? OR freelancer_id = ?)`,
      [conversationId, userId, userId]
    );

    const convRows = extractRows(convResult);

    if (!convRows || convRows.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get messages WITH image_url
    const messagesResult = await db.query(
      `SELECT 
        m.id, 
        m.conversation_id, 
        m.sender_id, 
        m.message, 
        m.image_url,
        m.is_read, 
        m.created_at,
        u.username AS sender_name
      FROM messages m 
      JOIN users u ON m.sender_id = u.id 
      WHERE m.conversation_id = ? 
      ORDER BY m.created_at ASC`,
      [conversationId]
    );

    const messages = extractRows(messagesResult);
    return res.json(messages);

  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Mark messages as read
app.post("/api/messages/mark-read", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Login required" });
    const { conversation_id } = req.body;
    const userId = req.session.user.id;

    await db.query(
      `UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?`,
      [conversation_id, userId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Search users for chat
app.get("/api/users/search", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Login required" });
        }
        
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json([]);
        }

        const currentUserId = req.session.user.id;
        
        const result = await db.query(
            `SELECT id, username, email, 
                    COALESCE(fp.profile_picture_url, NULL) as profile_picture
             FROM users u
             LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
             WHERE (u.username LIKE ? OR u.email LIKE ?) 
               AND u.id != ?
             LIMIT 10`,
            [`%${q}%`, `%${q}%`, currentUserId]
        );

        const users = extractRows(result);
        res.json(users);
        
    } catch (err) {
        console.error("User search error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get conversation info
app.get("/api/conversation-info/:conversationId", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Login required" });
    const conversationId = parseInt(req.params.conversationId);
    if (isNaN(conversationId)) return res.status(400).json({ error: "Invalid conversation ID" });

    const userId = req.session.user.id;
    const result = await db.query(
      `SELECT c.*, CASE WHEN c.client_id = ? THEN c.freelancer_id ELSE c.client_id END AS other_user_id
       FROM conversations c
       WHERE c.id = ? AND (c.client_id = ? OR c.freelancer_id = ?)`,
      [userId, conversationId, userId, userId]
    );

    const rows = extractRows(result);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Conversation not found or access denied" });

    res.json({ success: true, conversation: rows[0], other_user_id: rows[0].other_user_id });
  } catch (err) {
    console.error("Conversation info error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// =================== DEBUG ENDPOINTS ===================

// Debug endpoint to check all conversations for a user
app.get("/api/debug/user-conversations", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not logged in" });
    }
    
    const userId = req.session.user.id;
    
    const result = await db.query(`
      SELECT 
        c.id,
        c.service_id,
        c.client_id,
        c.freelancer_id,
        c.created_at,
        u1.username as client_username,
        u2.username as freelancer_username,
        s.title as service_title
      FROM conversations c
      LEFT JOIN users u1 ON c.client_id = u1.id
      LEFT JOIN users u2 ON c.freelancer_id = u2.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.client_id = ? OR c.freelancer_id = ?
      ORDER BY c.created_at DESC
    `, [userId, userId]);
    
    const conversations = extractRows(result);
    
    res.json({
      user_id: userId,
      user_role: req.session.user.role,
      conversation_count: conversations.length,
      conversations: conversations
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to check messages for a conversation
app.get("/api/debug/messages/:conversationId", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    
    const messagesResult = await db.query(
      `SELECT m.*, u.username 
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at DESC`,
      [conversationId]
    );

    const messages = extractRows(messagesResult);

    const convResult = await db.query(
      `SELECT * FROM conversations WHERE id = ?`,
      [conversationId]
    );

    const conversations = extractRows(convResult);
    const conversation = conversations && conversations.length > 0 ? conversations[0] : null;

    res.json({
      conversation_id: conversationId,
      conversation: conversation,
      message_count: messages.length,
      messages: messages
    });
    
  } catch (err) {
    console.error("Debug error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint for conversation access
app.get("/api/debug/conversation-access/:conversationId", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not logged in" });
    }
    
    const conversationId = req.params.conversationId;
    const userId = req.session.user.id;
    
    const convResult = await db.query(
      `SELECT * FROM conversations WHERE id = ?`,
      [conversationId]
    );
    
    const convRows = extractRows(convResult);
    
    if (!convRows || convRows.length === 0) {
      return res.json({ exists: false, error: "Conversation not found" });
    }
    
    const conversation = convRows[0];
    const isClient = parseInt(conversation.client_id) === parseInt(userId);
    const isFreelancer = parseInt(conversation.freelancer_id) === parseInt(userId);
    const canAccess = isClient || isFreelancer;
    const userRole = req.session.user.role;
    
    res.json({
      conversation_id: conversationId,
      user_id: userId,
      user_role: userRole,
      client_id: conversation.client_id,
      freelancer_id: conversation.freelancer_id,
      is_client: isClient,
      is_freelancer: isFreelancer,
      can_access: canAccess,
      service_id: conversation.service_id
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper functions (extractRows and extractInsertId)
const extractRows = (result) => {
  if (!result) return [];
  if (Array.isArray(result) && result.length === 2) return result[0] || [];
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object') return [result];
  return [];
};


// ============================================
// SERVICES ROUTES - FROM THE COMPLETE WORKING index.js
// ============================================
// GET ALL SERVICES (PUBLIC) - FIXED
app.get("/api/services", async (req, res) => {
    try {
        const { category, search, sort, limit = 20, offset = 0 } = req.query;

        // Build query - simplified to avoid complex joins that might fail
        let query = `
            SELECT 
                s.*, 
                u.username,
                u.id as user_id,
                fp.profile_picture_url as profile_picture_url
            FROM services s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
            WHERE s.status = 'active'
        `;

        const queryParams = [];

        // Add filters
        if (category) {
            query += " AND s.category = ?";
            queryParams.push(category);
        }

        if (search) {
            query += " AND (s.title LIKE ? OR s.description LIKE ?)";
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        // Sorting
        switch(sort) {
            case 'price_low':
                query += " ORDER BY s.price ASC";
                break;
            case 'price_high':
                query += " ORDER BY s.price DESC";
                break;
            case 'newest':
            default:
                query += " ORDER BY s.created_at DESC";
        }

        query += " LIMIT ? OFFSET ?";
        queryParams.push(parseInt(limit), parseInt(offset));

        console.log("Executing services query...");
        const result = await db.query(query, queryParams);
        
        // Extract services properly
        let services = [];
        if (result && result.length > 0) {
            if (Array.isArray(result[0])) {
                services = result[0];
            } else if (Array.isArray(result)) {
                services = result;
            }
        }

        // Get total count
        let countQuery = "SELECT COUNT(*) as total FROM services WHERE status = 'active'";
        const countParams = [];

        if (category) {
            countQuery += " AND category = ?";
            countParams.push(category);
        }

        if (search) {
            countQuery += " AND (title LIKE ? OR description LIKE ?)";
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const countResult = await db.query(countQuery, countParams);
        const total = (countResult && countResult[0] && countResult[0].total) ? countResult[0].total : 0;

        res.json({
            services: services,
            pagination: {
                total: total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_more: total > (parseInt(offset) + parseInt(limit))
            }
        });

    } catch (err) {
        console.error("Services fetch error:", err);
        // Return empty array instead of error to prevent frontend crash
        res.status(200).json({
            services: [],
            pagination: { total: 0, limit: 20, offset: 0, has_more: false },
            error: err.message
        });
    }
});

// GET MY SERVICES (FREELANCER)
app.get("/api/services/my-services", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login to view your services" });
        }

        let query = `
            SELECT 
                s.*, 
                u.username,
                fp.profile_picture_url as profile_picture,
                fp.headline as provider_headline,
                (SELECT COUNT(*) FROM service_orders WHERE service_id = s.id) as total_orders,
                (SELECT COUNT(*) FROM service_reviews WHERE service_id = s.id) as review_count,
                (SELECT AVG(rating) FROM service_reviews WHERE service_id = s.id) as avg_rating,
                (SELECT SUM(amount) FROM service_orders WHERE service_id = s.id AND status = 'completed') as total_earnings,
                (SELECT COUNT(*) FROM service_favorites WHERE service_id = s.id) as favorite_count
            FROM services s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
            WHERE s.user_id = ?
        `;

        query += " ORDER BY s.created_at DESC";

        const result = await db.query(query, [req.session.user.id]);

        let services = [];
        if (Array.isArray(result)) {
            if (result.length > 0 && Array.isArray(result[0])) {
                services = result[0];
            } else {
                services = result;
            }
        }

        // Parse JSON fields
        services = services.map(service => {
            if (service.tags && typeof service.tags === 'string') {
                try {
                    service.tags = JSON.parse(service.tags);
                } catch (e) {
                    service.tags = [];
                }
            }
            if (service.requirements && typeof service.requirements === 'string') {
                try {
                    service.requirements = JSON.parse(service.requirements);
                } catch (e) {
                    service.requirements = [];
                }
            }
            return service;
        });
        
        res.json(services);

    } catch (err) {
        console.error("Error fetching your services:", err);
        res.status(500).json({ 
            error: "Error fetching your services",
            details: err.message 
        });
    }
});

// GET SERVICE CATEGORIES
app.get("/api/services/categories", async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT category 
            FROM services 
            WHERE category IS NOT NULL AND category != '' AND status = 'active'
            ORDER BY category
        `);
        
        let categories = [];
        if (Array.isArray(result)) {
            categories = result.length === 2 ? result[0] : result;
        }

        res.json(categories.map(row => row.category).filter(Boolean));
    } catch (err) {
        console.error("Error fetching categories:", err);
        res.status(500).json({ error: "Error fetching categories" });
    }
});

// GET SERVICE DETAILS
app.get("/api/services/:id", async (req, res) => {
    try {
        const serviceId = req.params.id;

        const result = await db.query(`
            SELECT 
                s.*, 
                u.username,
                u.id as user_id,
                u.email,
                u.created_at as user_since,
                fp.profile_picture_url as provider_profile_picture,
                fp.headline as provider_headline,
                fp.description as provider_description,
                fp.hourly_rate as provider_hourly_rate,
                fp.skills,
                fp.location,
                fp.completed_orders,
                fp.total_earnings,
                (SELECT AVG(rating) FROM service_reviews WHERE service_id = s.id) as avg_rating,
                (SELECT COUNT(*) FROM service_reviews WHERE service_id = s.id) as review_count,
                (SELECT COUNT(*) FROM service_favorites WHERE service_id = s.id) as favorite_count
            FROM services s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
            WHERE s.id = ? AND s.status = 'active'
        `, [serviceId]);

        let services = [];
        if (Array.isArray(result)) {
            services = result.length === 2 ? result[0] : result;
        }

        if (!services || services.length === 0) {
            return res.status(404).json({ error: "Service not found" });
        }

        const service = services[0];

        // Get packages
        const packagesResult = await db.query(
            `SELECT * FROM service_packages WHERE service_id = ? AND is_active = 1`,
            [serviceId]
        );

        let packages = [];
        if (Array.isArray(packagesResult)) {
            packages = packagesResult.length === 2 ? packagesResult[0] : packagesResult;
        }

        // Get reviews
        const reviewsResult = await db.query(`
            SELECT sr.*, u.username
            FROM service_reviews sr
            JOIN users u ON sr.user_id = u.id
            WHERE sr.service_id = ?
            ORDER BY sr.created_at DESC
            LIMIT 10
        `, [serviceId]);

        let reviews = [];
        if (Array.isArray(reviewsResult)) {
            reviews = reviewsResult.length === 2 ? reviewsResult[0] : reviewsResult;
        }

        // Parse JSON fields
        let requirements = [];
        if (service.requirements) {
            try {
                requirements = JSON.parse(service.requirements);
            } catch (e) {
                requirements = [service.requirements];
            }
        }

        let tags = [];
        if (service.tags) {
            try {
                tags = JSON.parse(service.tags);
            } catch (e) {
                tags = [service.tags];
            }
        }

        res.json({
            ...service,
            packages: packages || [],
            reviews: reviews || [],
            review_count: reviews?.length || 0,
            avg_rating: service.avg_rating || 0,
            requirements: requirements,
            tags: tags
        });

    } catch (err) {
        console.error("Error loading service details:", err);
        res.status(500).json({ error: "Error loading service details: " + err.message });
    }
});

// CREATE SERVICE
app.post("/api/services", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login to create a service" });
    }

    // Only freelancers can create services
    if (req.session.user.role !== 'freelancer' && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: "Only freelancers can create services" });
    }

    try {
        const { 
            title, 
            description, 
            category, 
            hourly_rate, 
            fixed_price,
            delivery_time,
            revisions,
            tags,
            requirements
        } = req.body;

        if (!title || !description) {
            return res.status(400).json({ error: "Title and description are required" });
        }

        if (title.length < 5) {
            return res.status(400).json({ error: "Title must be at least 5 characters" });
        }

        if (description.length < 20) {
            return res.status(400).json({ error: "Description must be at least 20 characters" });
        }

        // Determine price
        const price = fixed_price ? parseFloat(fixed_price) :
                     hourly_rate ? parseFloat(hourly_rate) : 0;

        // Get freelancer profile picture
        const profileResult = await db.query(
            "SELECT profile_picture_url FROM freelancer_profiles WHERE user_id = ?",
            [req.session.user.id]
        );

        let profilePictures = [];
        if (Array.isArray(profileResult)) {
            profilePictures = profileResult.length === 2 ? profileResult[0] : profileResult;
        }

        const profilePicture = profilePictures.length > 0 ? profilePictures[0].profile_picture_url : null;

        // Parse tags and requirements if they're strings
        let parsedTags = tags;
        if (tags && typeof tags === 'string') {
            try {
                parsedTags = JSON.parse(tags);
            } catch (e) {
                parsedTags = tags.split(',').map(t => t.trim());
            }
        }

        let parsedRequirements = requirements;
        if (requirements && typeof requirements === 'string') {
            try {
                parsedRequirements = JSON.parse(requirements);
            } catch (e) {
                parsedRequirements = requirements.split('\n').filter(r => r.trim());
            }
        }

        // Insert service
        const result = await db.query(`
            INSERT INTO services 
            (user_id, title, description, price, category, provider_profile_picture, 
             delivery_time, revisions, tags, requirements, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
        `, [
            req.session.user.id,
            title,
            description,
            price,
            category || 'other',
            profilePicture,
            delivery_time || 7,
            revisions || 2,
            parsedTags ? JSON.stringify(parsedTags) : null,
            parsedRequirements ? JSON.stringify(parsedRequirements) : null
        ]);

        const serviceId = result.insertId || (result[0] && result[0].insertId);
        if (!serviceId) throw new Error("Could not get service ID after creation");

        // If packages were provided, insert them
        if (req.body.packages) {
            let packages = req.body.packages;
            if (typeof packages === 'string') {
                try {
                    packages = JSON.parse(packages);
                } catch (e) {
                    packages = [];
                }
            }

            if (Array.isArray(packages) && packages.length > 0) {
                for (const pkg of packages) {
                    await db.query(`
                        INSERT INTO service_packages 
                        (service_id, package_name, price, delivery_time, revisions, features, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, 1)
                    `, [
                        serviceId,
                        pkg.package_name || 'basic',
                        pkg.price || 0,
                        pkg.delivery_time || delivery_time || 7,
                        pkg.revisions || revisions || 2,
                        pkg.features ? JSON.stringify(pkg.features) : null
                    ]);
                }
            }
        }

        res.json({
            success: true,
            message: "Service created successfully!",
            serviceId: serviceId,
            hasProfilePicture: !!profilePicture
        });

    } catch (err) {
        console.error("Service creation error:", err);
        res.status(500).json({ error: "Error creating service: " + err.message });
    }
});
// ============================================
// FLAGGING SYSTEM BACKEND ROUTES
// ============================================

// Flag a user (client only)
app.post("/api/users/flag", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        if (req.session.user.role !== 'client') {
            return res.status(403).json({ error: "Only clients can flag users" });
        }
        
        const { flagged_user_id, service_id, reason } = req.body;
        
        if (!flagged_user_id || !reason) {
            return res.status(400).json({ error: "User ID and reason are required" });
        }
        
        if (reason.length < 10) {
            return res.status(400).json({ error: "Reason must be at least 10 characters" });
        }
        
        // Check if user is flagging themselves
        if (parseInt(flagged_user_id) === parseInt(req.session.user.id)) {
            return res.status(400).json({ error: "You cannot flag yourself" });
        }
        
        // Get the flagged user's role
        const userResult = await db.query(
            "SELECT role FROM users WHERE id = ?",
            [flagged_user_id]
        );
        
        if (!userResult || userResult.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        
        if (userResult[0].role !== 'freelancer') {
            return res.status(400).json({ error: "Only freelancers can be flagged" });
        }
        
        // Check if client has already flagged this user (optional: prevent duplicate flags)
        const existingFlag = await db.query(
            "SELECT id FROM user_flags WHERE flagged_user_id = ? AND flagged_by_user_id = ?",
            [flagged_user_id, req.session.user.id]
        );
        
        if (existingFlag && existingFlag.length > 0) {
            // Allow multiple flags but with a cooldown? For now, allow multiple
            // But we'll count all flags for the threshold
        }
        
        // Insert the flag
        const flagResult = await db.query(
            `INSERT INTO user_flags (flagged_user_id, flagged_by_user_id, service_id, reason, status, created_at)
             VALUES (?, ?, ?, ?, 'pending', NOW())`,
            [flagged_user_id, req.session.user.id, service_id || null, reason]
        );
        
        const flagId = flagResult.insertId;
        
        // Log to history
        await db.query(
            `INSERT INTO flag_history (flag_id, action, notes, performed_by, performed_at)
             VALUES (?, 'created', ?, ?, NOW())`,
            [flagId, reason, req.session.user.id]
        );
        
        // Count total flags for this user
        const flagCountResult = await db.query(
            "SELECT COUNT(*) as count FROM user_flags WHERE flagged_user_id = ?",
            [flagged_user_id]
        );
        
        const flagCount = flagCountResult[0]?.count || 1;
        
        // Check if this is the first flag - issue warning
        let warningIssued = false;
        if (flagCount === 1) {
            // Add warning record
            await db.query(
                `INSERT INTO user_warnings (user_id, warning_type, reason, issued_by, expires_at, created_at)
                 VALUES (?, 'flag', ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())`,
                [flagged_user_id, "Your account has been flagged. Please review our community guidelines.", null]
            );
            warningIssued = true;
        }
        
        // Check if this is the third flag - lock account and request freelancer statement
        let accountLocked = false;
        if (flagCount >= 3) {
            // Check if already in review
            const existingReview = await db.query(
                "SELECT id FROM admin_reviews WHERE user_id = ? AND status IN ('pending', 'under_review')",
                [flagged_user_id]
            );
            
            if (!existingReview || existingReview.length === 0) {
                // Create admin review record
                await db.query(
                    `INSERT INTO admin_reviews (user_id, flag_count, status, created_at)
                     VALUES (?, ?, 'pending', NOW())`,
                    [flagged_user_id, flagCount]
                );
            } else {
                // Update flag count
                await db.query(
                    "UPDATE admin_reviews SET flag_count = ? WHERE user_id = ?",
                    [flagCount, flagged_user_id]
                );
            }
            
            // Lock the user's account temporarily
            await db.query(
                "UPDATE users SET account_locked = 1, locked_at = NOW(), lock_reason = ? WHERE id = ?",
                ["Multiple flags - pending admin review", flagged_user_id]
            );
            accountLocked = true;
        }
        
        let responseMessage = "User flagged successfully";
        if (warningIssued) {
            responseMessage = "User flagged. A warning has been issued to the user.";
        }
        if (accountLocked) {
            responseMessage = "User flagged. The account has been temporarily locked for admin review.";
        }
        
        res.json({
            success: true,
            message: responseMessage,
            flagCount: flagCount,
            warningIssued: warningIssued,
            accountLocked: accountLocked
        });
        
    } catch (err) {
        console.error("❌ Flag user error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get flag status for a user (for client)
app.get("/api/users/flag-status/:userId", async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        
        if (!req.session.user) {
            return res.json({ canFlag: false, message: "Please login" });
        }
        
        if (req.session.user.role !== 'client') {
            return res.json({ canFlag: false, message: "Only clients can flag users" });
        }
        
        // Check if user has already flagged this freelancer
        const existingFlag = await db.query(
            "SELECT id FROM user_flags WHERE flagged_user_id = ? AND flagged_by_user_id = ?",
            [userId, req.session.user.id]
        );
        
        // Count total flags for this user
        const flagCountResult = await db.query(
            "SELECT COUNT(*) as count FROM user_flags WHERE flagged_user_id = ?",
            [userId]
        );
        
        const flagCount = flagCountResult[0]?.count || 0;
        
        res.json({
            canFlag: true,
            hasFlagged: existingFlag && existingFlag.length > 0,
            flagCount: flagCount,
            message: flagCount >= 3 ? "This user has been flagged multiple times and is under review" : null
        });
        
    } catch (err) {
        console.error("❌ Flag status error:", err);
        res.json({ canFlag: true, message: "Unknown" });
    }
});

// Get freelancer's own flag status
app.get("/api/users/my-flag-status", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const userId = req.session.user.id;
        
        // Check if account is locked
        const userResult = await db.query(
            "SELECT account_locked, locked_at, lock_reason FROM users WHERE id = ?",
            [userId]
        );
        
        const isLocked = userResult && userResult[0]?.account_locked === 1;
        
        // Count active flags (not resolved)
        const flagCountResult = await db.query(
            "SELECT COUNT(*) as count FROM user_flags WHERE flagged_user_id = ? AND status = 'pending'",
            [userId]
        );
        
        const flagCount = flagCountResult[0]?.count || 0;
        
        // Check if admin review is pending
        const reviewResult = await db.query(
            "SELECT status, freelancer_statement FROM admin_reviews WHERE user_id = ?",
            [userId]
        );
        
        const pendingReview = reviewResult && reviewResult.length > 0 && 
                              ['pending', 'under_review'].includes(reviewResult[0].status);
        
        res.json({
            hasFlags: flagCount > 0,
            flagCount: flagCount,
            accountLocked: isLocked,
            pendingReview: pendingReview,
            needsStatement: pendingReview && !reviewResult[0]?.freelancer_statement
        });
        
    } catch (err) {
        console.error("❌ My flag status error:", err);
        res.json({ hasFlags: false, flagCount: 0 });
    }
});

// Submit freelancer's statement (when flagged 3 times)
app.post("/api/users/submit-statement", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const { statement } = req.body;
        
        if (!statement || statement.length < 20) {
            return res.status(400).json({ error: "Please provide a detailed statement (minimum 20 characters)" });
        }
        
        const userId = req.session.user.id;
        
        const reviewResult = await db.query(
            "SELECT id FROM admin_reviews WHERE user_id = ? AND status IN ('pending', 'under_review')",
            [userId]
        );
        
        if (!reviewResult || reviewResult.length === 0) {
            return res.status(400).json({ error: "No pending review found for your account" });
        }
        
        await db.query(
            "UPDATE admin_reviews SET freelancer_statement = ?, status = 'under_review' WHERE user_id = ?",
            [statement, userId]
        );
        
        // Notify admin? Could add notification here
        
        res.json({
            success: true,
            message: "Your statement has been submitted. An admin will review your account shortly."
        });
        
    } catch (err) {
        console.error("❌ Submit statement error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ADMIN ROUTES - Get flagged users
app.get("/api/admin/flagged-users", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }
        
        const users = await db.query(`
            SELECT 
                u.id,
                u.username,
                u.email,
                u.created_at,
                u.account_locked,
                u.locked_at,
                u.lock_reason,
                COUNT(uf.id) as flag_count,
                ar.status as review_status,
                ar.freelancer_statement,
                ar.created_at as review_created_at
            FROM users u
            LEFT JOIN user_flags uf ON uf.flagged_user_id = u.id AND uf.status = 'pending'
            LEFT JOIN admin_reviews ar ON ar.user_id = u.id
            WHERE u.role = 'freelancer'
            GROUP BY u.id
            HAVING flag_count > 0 OR ar.status IS NOT NULL
            ORDER BY flag_count DESC
        `);
        
        res.json({
            users: users.map(user => ({
                ...user,
                flag_count: parseInt(user.flag_count),
                status: user.review_status || (user.account_locked ? 'suspended' : 'pending')
            }))
        });
        
    } catch (err) {
        console.error("❌ Get flagged users error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Admin - Get detailed flags for a user
app.get("/api/admin/user-flags/:userId", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }
        
        const userId = req.params.userId;
        
        const userResult = await db.query(
            "SELECT username FROM users WHERE id = ?",
            [userId]
        );
        
        if (!userResult || userResult.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        
        const flags = await db.query(`
            SELECT uf.*, u.username as flagged_by_name
            FROM user_flags uf
            LEFT JOIN users u ON uf.flagged_by_user_id = u.id
            WHERE uf.flagged_user_id = ?
            ORDER BY uf.created_at DESC
        `, [userId]);
        
        const reviewResult = await db.query(
            "SELECT freelancer_statement FROM admin_reviews WHERE user_id = ?",
            [userId]
        );
        
        res.json({
            username: userResult[0].username,
            flags: flags || [],
            freelancer_statement: reviewResult[0]?.freelancer_statement || null
        });
        
    } catch (err) {
        console.error("❌ Get user flags error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Admin - Resolve flags for a user
app.post("/api/admin/resolve-flags/:userId", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }
        
        const userId = req.params.userId;
        const { action, admin_notes } = req.body;
        
        if (action === 'cleared') {
            // Mark all pending flags as reviewed
            await db.query(
                "UPDATE user_flags SET status = 'reviewed', updated_at = NOW() WHERE flagged_user_id = ? AND status = 'pending'",
                [userId]
            );
            
            // Update admin review record
            await db.query(
                `UPDATE admin_reviews 
                 SET status = 'cleared', 
                     admin_notes = ?,
                     reviewed_by = ?,
                     reviewed_at = NOW()
                 WHERE user_id = ?`,
                [admin_notes, req.session.user.id, userId]
            );
            
            // Unlock account if locked
            await db.query(
                "UPDATE users SET account_locked = 0, locked_at = NULL, lock_reason = NULL WHERE id = ?",
                [userId]
            );
            
            res.json({ success: true, message: "Flags cleared. User account restored." });
            
        } else if (action === 'suspended') {
            // Update admin review record
            await db.query(
                `UPDATE admin_reviews 
                 SET status = 'suspended', 
                     admin_notes = ?,
                     reviewed_by = ?,
                     reviewed_at = NOW()
                 WHERE user_id = ?`,
                [admin_notes, req.session.user.id, userId]
            );
            
            // Keep account locked
            await db.query(
                "UPDATE users SET account_locked = 1, lock_reason = ? WHERE id = ?",
                [admin_notes || "Suspended by admin", userId]
            );
            
            res.json({ success: true, message: "Account suspended." });
        } else {
            res.status(400).json({ error: "Invalid action" });
        }
        
    } catch (err) {
        console.error("❌ Resolve flags error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Admin - Suspend user
app.post("/api/admin/suspend-user/:userId", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }
        
        const userId = req.params.userId;
        const { reason } = req.body;
        
        await db.query(
            "UPDATE users SET account_locked = 1, locked_at = NOW(), lock_reason = ? WHERE id = ?",
            [reason || "Suspended by admin", userId]
        );
        
        res.json({ success: true, message: "User suspended successfully" });
        
    } catch (err) {
        console.error("❌ Suspend user error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Admin - Reactivate user
app.post("/api/admin/reactivate-user/:userId", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }
        
        const userId = req.params.userId;
        
        await db.query(
            "UPDATE users SET account_locked = 0, locked_at = NULL, lock_reason = NULL WHERE id = ?",
            [userId]
        );
        
        res.json({ success: true, message: "User reactivated successfully" });
        
    } catch (err) {
        console.error("❌ Reactivate user error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get subscription status with proper trial calculation
app.get("/api/subscription/status", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const userId = req.session.user.id;
        
        // Get user subscription info
        const userResult = await db.query(
            `SELECT subscription_status, subscription_plan, trial_start_date, trial_end_date,
                    subscription_start_date, subscription_end_date, account_locked
             FROM users WHERE id = ?`,
            [userId]
        );
        
        if (!userResult || userResult.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        
        const user = userResult[0];
        
        let hasActiveSubscription = false;
        let subscriptionPlan = user.subscription_plan || 'free_trial';
        let daysLeft = 0;
        let message = "";
        
        // Check trial status for freelancers
        if (user.subscription_plan === 'free_trial' && user.trial_end_date) {
            const now = new Date();
            const trialEnd = new Date(user.trial_end_date);
            daysLeft = Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)));
            
            if (daysLeft > 0) {
                hasActiveSubscription = true;
                message = `You have ${daysLeft} days left in your free trial`;
            } else {
                hasActiveSubscription = false;
                message = "Your free trial has expired. Please subscribe to continue using services.";
                
                // Update user status to expired
                if (user.subscription_status !== 'expired') {
                    await db.query(
                        "UPDATE users SET subscription_status = 'expired' WHERE id = ?",
                        [userId]
                    );
                }
            }
        } 
        // Check paid subscription
        else if (user.subscription_plan !== 'free_trial' && user.subscription_end_date) {
            const now = new Date();
            const subscriptionEnd = new Date(user.subscription_end_date);
            daysLeft = Math.max(0, Math.ceil((subscriptionEnd - now) / (1000 * 60 * 60 * 24)));
            
            if (daysLeft > 0) {
                hasActiveSubscription = true;
                message = `Your ${subscriptionPlan} subscription is active. ${daysLeft} days remaining.`;
            } else {
                hasActiveSubscription = false;
                message = "Your subscription has expired. Please renew to continue.";
                
                await db.query(
                    "UPDATE users SET subscription_status = 'expired' WHERE id = ?",
                    [userId]
                );
            }
        }
        
        // Check if account is locked (for flagged users)
        const accountLocked = user.account_locked === 1;
        
        res.json({
            hasActiveSubscription: hasActiveSubscription && !accountLocked,
            subscriptionPlan: subscriptionPlan,
            daysLeft: daysLeft,
            message: message,
            accountLocked: accountLocked,
            trialStarted: !!user.trial_start_date,
            trialEndDate: user.trial_end_date,
            subscriptionEndDate: user.subscription_end_date
        });
        
    } catch (err) {
        console.error("❌ Subscription status error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Create subscription payment
app.post("/api/subscription/pay", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const { plan } = req.body;
        
        if (!plan || !['monthly', 'yearly'].includes(plan)) {
            return res.status(400).json({ error: "Invalid subscription plan" });
        }
        
        const amount = plan === 'monthly' ? 5.00 : 57.50;
        const transactionRef = `sub_${plan}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        
        // Store payment intent
        await db.query(
            `INSERT INTO subscription_payments (user_id, plan, amount, payment_status, transaction_ref, created_at)
             VALUES (?, ?, ?, 'pending', ?, NOW())`,
            [req.session.user.id, plan, amount, transactionRef]
        );
        
        // Create Flutterwave payment
        if (!process.env.FLW_SECRET_KEY) {
            return res.status(500).json({ error: "Payment system not configured" });
        }
        
        const payload = {
            tx_ref: transactionRef,
            amount: amount,
            currency: "USD",
            redirect_url: "https://core-insight-7.onrender.com/subscription-callback.html",
            customer: {
                email: req.session.user.email,
                name: req.session.user.username,
            },
            customizations: {
                title: "Core Insight - Subscription",
                description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Subscription`,
            },
            meta: {
                user_id: req.session.user.id,
                plan: plan,
                type: 'subscription'
            }
        };
        
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
        
        if (response.data.status === "success" && response.data.data?.link) {
            res.json({
                success: true,
                paymentLink: response.data.data.link,
                transactionRef: transactionRef,
                amount: amount,
                plan: plan
            });
        } else {
            throw new Error(response.data.message || "Payment initialization failed");
        }
        
    } catch (err) {
        console.error("❌ Subscription payment error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Verify subscription payment callback
app.post("/api/subscription/verify", async (req, res) => {
    try {
        const { transaction_ref, status } = req.body;
        
        if (status !== 'successful') {
            return res.status(400).json({ error: "Payment not successful" });
        }
        
        // Get payment record
        const paymentResult = await db.query(
            "SELECT * FROM subscription_payments WHERE transaction_ref = ? AND payment_status = 'pending'",
            [transaction_ref]
        );
        
        if (!paymentResult || paymentResult.length === 0) {
            return res.status(404).json({ error: "Payment record not found" });
        }
        
        const payment = paymentResult[0];
        const userId = payment.user_id;
        const plan = payment.plan;
        
        // Calculate subscription dates
        const now = new Date();
        let subscriptionEnd = new Date();
        
        if (plan === 'monthly') {
            subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);
        } else {
            subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1);
        }
        
        // Update user subscription
        await db.query(
            `UPDATE users 
             SET subscription_plan = ?,
                 subscription_status = 'active',
                 subscription_start_date = ?,
                 subscription_end_date = ?,
                 trial_start_date = NULL,
                 trial_end_date = NULL
             WHERE id = ?`,
            [plan, now, subscriptionEnd, userId]
        );
        
        // Update payment record
        await db.query(
            `UPDATE subscription_payments 
             SET payment_status = 'completed', 
                 payment_date = ?,
                 subscription_start = ?,
                 subscription_end = ?
             WHERE transaction_ref = ?`,
            [now, now, subscriptionEnd, transaction_ref]
        );
        
        // Update freelancer profile if exists
        await db.query(
            `UPDATE freelancer_profiles 
             SET subscription_status = ?, 
                 trial_days_remaining = 0
             WHERE user_id = ?`,
            [plan, userId]
        );
        
        // Send confirmation email
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Subscription Activated - Core Insight</title></head>
            <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
                <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                    <h1 style="color:#10b981;">✅ Subscription Activated!</h1>
                    <p>Hello ${payment.user_name || 'there'},</p>
                    <p>Your ${plan} subscription has been activated successfully!</p>
                    <div style="background:#0f172a;padding:20px;border-radius:12px;margin:20px 0;">
                        <p><strong>Plan:</strong> ${plan.charAt(0).toUpperCase() + plan.slice(1)}</p>
                        <p><strong>Amount Paid:</strong> $${payment.amount}</p>
                        <p><strong>Valid Until:</strong> ${subscriptionEnd.toLocaleDateString()}</p>
                    </div>
                    <p>You can now create and manage services on Core Insight.</p>
                    <a href="https://core-insight-7.onrender.com/services.html" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:20px;">Go to Dashboard</a>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail(req.session.user.email, "Subscription Activated - Core Insight", emailHtml);
        
        res.json({
            success: true,
            message: "Subscription activated successfully",
            plan: plan,
            validUntil: subscriptionEnd
        });
        
    } catch (err) {
        console.error("❌ Subscription verification error:", err);
        res.status(500).json({ error: err.message });
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

      // ✅ ADD STATUS HISTORY
    await db.query(
      `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at) VALUES (?, 'order_placed', 'Order placed and awaiting seller approval', ?, NOW())`,
      [orderId, req.session.user.id]
    );
    
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
// Add history entry
await db.query(
  `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
   VALUES (?, 'seller_accepted', 'Seller accepted the order', ?, NOW())`,
  [orderId, req.session.user.id]
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

// ============================================
// COMPLETE PHYSICAL ORDER STATUS SYSTEM
// ============================================

app.get("/api/orders/:orderId/complete", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    
    const orderResult = await db.query(`
      SELECT o.*, 
             p.title as product_name, 
             p.images,
             u_seller.username as seller_name,
             u_seller.email as seller_email,
             u_buyer.username as buyer_name,
             u_buyer.email as buyer_email
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u_seller ON o.seller_id = u_seller.id
      LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
      WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ? OR ? = 'admin')
    `, [orderId, req.session.user.id, req.session.user.id, req.session.user.role]);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    
    // Get status history
    const historyResult = await db.query(`
      SELECT * FROM order_status_history 
      WHERE order_id = ? 
      ORDER BY created_at ASC
    `, [orderId]);
    
    // Calculate escrow info - FIXED: Only starts after delivery confirmation
    let escrowInfo = null;
    let refundAvailable = false;
    let refundDeadline = null;
    
    if (order.order_status === 'paid' && order.payment_collected_at) {
      // Payment is in escrow but not yet released
      const paymentDate = new Date(order.payment_collected_at);
      const now = new Date();
      
      // Check if order is delivered
      const isDelivered = order.order_status === 'delivered' || order.order_status === 'completed';
      
      if (!isDelivered) {
        // Money in escrow, customer can request refund
        const daysSincePayment = (now - paymentDate) / (1000 * 60 * 60 * 24);
        refundAvailable = daysSincePayment <= 5;
        if (refundAvailable) {
          refundDeadline = new Date(paymentDate);
          refundDeadline.setDate(refundDeadline.getDate() + 5);
        }
        
        escrowInfo = {
          status: 'held',
          message: 'Payment is held in escrow until you confirm delivery',
          held_since: order.payment_collected_at,
          refund_available: refundAvailable,
          refund_deadline: refundDeadline
        };
      } else if (order.order_status === 'delivered') {
        // Customer received product, 5-day countdown starts for seller payout
        const deliveryDate = order.delivered_at || order.completed_at || new Date();
        const releaseDate = new Date(deliveryDate);
        releaseDate.setDate(releaseDate.getDate() + 5);
        const now = new Date();
        const daysUntilRelease = Math.max(0, Math.ceil((releaseDate - now) / (1000 * 60 * 60 * 24)));
        
        escrowInfo = {
          status: 'waiting_release',
          message: `Product delivered. Funds will be released to seller in ${daysUntilRelease} days`,
          release_date: releaseDate,
          days_remaining: daysUntilRelease
        };
      } else if (order.order_status === 'completed') {
        escrowInfo = {
          status: 'released',
          message: 'Funds have been released to the seller',
          released_at: order.funds_released_at
        };
      }
    }
    
    // Format the order with all buyer details
    const formattedOrder = {
      id: order.id,
      product_name: order.product_name,
      product_images: order.images ? (typeof order.images === 'string' ? JSON.parse(order.images) : order.images) : [],
      quantity: parseInt(order.quantity),
      price: parseFloat(order.price),
      total_amount: parseFloat(order.total_amount),
      order_status: order.order_status,
      payment_status: order.payment_status,
      
      // All buyer details from order form
      buyer_details: {
        name: order.customer_name || order.buyer_name,
        email: order.customer_email || order.buyer_email,
        phone: order.delivery_phone,
        shipping_address: order.shipping_address,
        city: order.city,
        state: order.state,
        country: order.country,
        notes: order.notes
      },
      
      seller: {
        id: order.seller_id,
        name: order.seller_name,
        email: order.seller_email
      },
      
      created_at: order.created_at,
      seller_accepted_at: order.seller_accepted_at,
      payment_collected_at: order.payment_collected_at,
      delivered_at: order.delivered_at,
      completed_at: order.completed_at,
      
      platform_fee: parseFloat(order.platform_fee) || 0,
      seller_earnings: parseFloat(order.seller_earnings) || 0,
      estimated_delivery_days: order.estimated_delivery_days || 7,
      
      status_history: historyResult || [],
      escrow_info: escrowInfo,
      refund_available: refundAvailable,
      refund_deadline: refundDeadline
    };
    
    res.json({ success: true, order: formattedOrder });
    
  } catch (err) {
    console.error("❌ Error loading order details:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper function to build status timeline
function buildStatusTimeline(order) {
  const timeline = [];
  
  // Order placed
  if (order.created_at) {
    timeline.push({
      status: 'order_placed',
      title: 'Order Placed',
      description: 'Your order has been placed and is awaiting seller approval.',
      timestamp: order.created_at,
      completed: true,
      icon: 'fa-shopping-cart'
    });
  }
  
  // Seller accepted/rejected
  if (order.seller_accepted_at) {
    timeline.push({
      status: 'seller_accepted',
      title: 'Order Accepted',
      description: 'Seller has accepted your order. Payment is now required.',
      timestamp: order.seller_accepted_at,
      completed: true,
      icon: 'fa-check-circle'
    });
  } else if (order.order_status === 'cancelled' && order.seller_accepted_at === null) {
    timeline.push({
      status: 'seller_rejected',
      title: 'Order Declined',
      description: order.response_message || 'Seller was unable to fulfill this order.',
      timestamp: order.created_at,
      completed: true,
      icon: 'fa-times-circle',
      isError: true
    });
  }
  
  // Payment completed
  if (order.payment_collected_at) {
    timeline.push({
      status: 'payment_completed',
      title: 'Payment Received',
      description: `Payment of $${parseFloat(order.total_amount).toFixed(2)} has been received and is held in escrow.`,
      timestamp: order.payment_collected_at,
      completed: true,
      icon: 'fa-credit-card'
    });
  }
  
  // Processing (could be added via separate endpoint)
  if (order.order_status === 'processing' || order.order_status === 'paid') {
    timeline.push({
      status: 'processing',
      title: 'Processing Order',
      description: 'Seller is preparing your order for shipment.',
      timestamp: order.payment_collected_at || order.seller_accepted_at,
      completed: order.order_status !== 'processing',
      icon: 'fa-cogs'
    });
  }
  
  // Shipped (from tracking)
  // Completed
  if (order.completed_at) {
    timeline.push({
      status: 'completed',
      title: 'Order Completed',
      description: 'Your order has been completed. Thank you for shopping with us!',
      timestamp: order.completed_at,
      completed: true,
      icon: 'fa-trophy'
    });
  }
  
  // Refund requested
  if (order.refund_requested_at) {
    timeline.push({
      status: 'refund_requested',
      title: 'Refund Requested',
      description: order.refund_reason || 'Customer requested a refund.',
      timestamp: order.refund_requested_at,
      completed: order.order_status === 'refunded',
      icon: 'fa-undo-alt',
      isWarning: true
    });
  }
  
  // Refunded
  if (order.order_status === 'refunded') {
    timeline.push({
      status: 'refunded',
      title: 'Refund Processed',
      description: `Your refund of $${parseFloat(order.total_amount).toFixed(2)} has been processed.`,
      timestamp: order.refund_processed_at || order.payment_collected_at,
      completed: true,
      icon: 'fa-dollar-sign'
    });
  }
  
  // Escrow released
  if (order.funds_released_at) {
    timeline.push({
      status: 'escrow_released',
      title: 'Funds Released to Seller',
      description: `$${parseFloat(order.seller_earnings || 0).toFixed(2)} has been released to the seller.`,
      timestamp: order.funds_released_at,
      completed: true,
      icon: 'fa-money-bill-wave'
    });
  }
  
  return timeline;
}
// Debug endpoint - Check pending orders
app.get("/api/debug/pending-orders", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const sellerId = req.session.user.id;
    
    // Check if any orders exist for this seller
    const allOrders = await db.query(`
      SELECT id, order_status, total_amount, product_name 
      FROM physical_orders 
      WHERE seller_id = ?
    `, [sellerId]);
    
    // Get pending orders
    const pendingOrders = await db.query(`
      SELECT * FROM physical_orders 
      WHERE seller_id = ? AND order_status = 'pending_seller_approval'
    `, [sellerId]);
    
    res.json({
      success: true,
      seller_id: sellerId,
      total_orders: allOrders ? allOrders.length : 0,
      all_orders: allOrders || [],
      pending_count: pendingOrders ? pendingOrders.length : 0,
      pending_orders: pendingOrders || []
    });
    
  } catch (err) {
    console.error("Debug error:", err);
    res.status(500).json({ error: err.message });
  }
});
// GET /api/dashboard/pending-orders - Orders awaiting seller response
app.get("/api/dashboard/pending-orders", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const sellerId = req.session.user.id;
    
    console.log(`Fetching pending orders for seller: ${sellerId}`);
    
    const pendingOrders = await db.query(`
      SELECT 
        o.id,
        o.product_id,
        o.product_name,
        o.quantity,
        o.price,
        o.total_amount,
        o.order_status,
        o.payment_status,
        o.customer_name,
        o.customer_email,
        o.shipping_address,
        o.delivery_phone,
        o.city,
        o.state,
        o.country,
        o.notes,
        o.created_at,
        o.estimated_delivery_days,
        p.title as product_title,
        p.images as product_images
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      WHERE o.seller_id = ? 
        AND o.order_status = 'pending_seller_approval'
      ORDER BY o.created_at ASC
    `, [sellerId]);
    
    console.log(`Found ${pendingOrders ? pendingOrders.length : 0} pending orders`);
    
    const processedOrders = [];
    if (pendingOrders && pendingOrders.length > 0) {
      for (const order of pendingOrders) {
        let productImage = null;
        if (order.product_images) {
          try {
            if (typeof order.product_images === 'string') {
              if (order.product_images.startsWith('[')) {
                const parsed = JSON.parse(order.product_images);
                productImage = Array.isArray(parsed) ? parsed[0] : parsed;
              } else {
                productImage = order.product_images;
              }
            } else if (Array.isArray(order.product_images)) {
              productImage = order.product_images[0];
            }
          } catch (e) {
            console.error("Error parsing image:", e);
          }
        }
        
        processedOrders.push({
          id: order.id,
          product_id: order.product_id,
          product_name: order.product_name || order.product_title || 'Product',
          product_image: productImage,
          quantity: parseInt(order.quantity) || 1,
          price: parseFloat(order.price) || 0,
          total_amount: parseFloat(order.total_amount) || 0,
          customer_name: order.customer_name || 'Customer',
          customer_email: order.customer_email || '',
          shipping_address: order.shipping_address || 'No address provided',
          delivery_phone: order.delivery_phone || '',
          city: order.city || '',
          state: order.state || '',
          country: order.country || '',
          notes: order.notes || '',
          created_at: order.created_at,
          estimated_delivery_days: order.estimated_delivery_days || 7
        });
      }
    }
    
    res.json({
      success: true,
      orders: processedOrders,
      count: processedOrders.length
    });
    
  } catch (err) {
    console.error("❌ Error loading pending orders:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      orders: [],
      count: 0
    });
  }
});

// Add this debug endpoint temporarily
app.get("/api/debug/order-status/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await db.query(
      `SELECT id, order_status, payment_status, total_amount FROM physical_orders WHERE id = ?`,
      [orderId]
    );
    res.json({ order: order[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Update order status (for sellers) - WITHOUT tracking_number
app.post("/api/orders/:orderId/status", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    const { status, notes } = req.body;
    
    // Verify order ownership
    const orderResult = await db.query(
      `SELECT o.*, u.email as buyer_email, u.username as buyer_name
       FROM physical_orders o
       LEFT JOIN users u ON o.buyer_id = u.id
       WHERE o.id = ? AND o.seller_id = ?`,
      [orderId, req.session.user.id]
    );
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found or you don't have permission" });
    }
    
    const order = orderResult[0];
    const validStatuses = ['processing', 'shipped', 'delivered', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status update" });
    }
    
    // Update order status
    let updateFields = `order_status = ?`;
    const updateParams = [status];
    
    if (status === 'completed') {
      updateFields += `, completed_at = NOW(), funds_released_at = NOW()`;
    } else if (status === 'cancelled') {
      updateFields += `, cancelled_at = NOW()`;
    } else if (status === 'shipped') {
      updateFields += `, shipped_at = NOW()`;
    }
    
    updateParams.push(orderId);
    await db.query(`UPDATE physical_orders SET ${updateFields} WHERE id = ?`, updateParams);
    
    // Record status change in history (if table exists)
    try {
      await db.query(
        `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [orderId, status, notes || null, req.session.user.id]
      );
    } catch (historyErr) {
      console.log('History table not available yet');
    }
    
    // Send email notification to buyer
    const statusMessages = {
      'processing': 'Your order is now being processed',
      'shipped': 'Your order has been shipped!',
      'delivered': 'Your order has been delivered',
      'completed': 'Your order has been completed. Thank you!',
      'cancelled': 'Your order has been cancelled'
    };
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order Status Update - Core Insight</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; background: #3b82f6; color: white; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Order #${orderId} Status Update</h1>
          <p>Hello ${order.buyer_name || 'Valued Customer'},</p>
          <div class="status-badge">${statusMessages[status] || `Status: ${status}`}</div>
          ${notes ? `<p><strong>Notes from seller:</strong> ${notes}</p>` : ''}
          <p>You can track your order here: <a href="https://core-insight-7.onrender.com/order-tracking.html?orderId=${orderId}">Track Order</a></p>
        </div>
      </body>
      </html>
    `;
    
    await sendEmail(order.buyer_email, `Order #${orderId} Status Update`, emailHtml);
    
    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order_id: orderId,
      new_status: status
    });
    
  } catch (err) {
    console.error("❌ Status update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Confirm delivery (for buyers)
app.post("/api/orders/:orderId/confirm-delivery", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    
    // Verify buyer owns this order
    const orderResult = await db.query(
      `SELECT * FROM physical_orders WHERE id = ? AND buyer_id = ?`,
      [orderId, req.session.user.id]
    );
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    
    if (order.order_status !== 'delivered' && order.order_status !== 'shipped') {
      return res.status(400).json({ error: "Order cannot be confirmed as delivered yet" });
    }
    
    // Update order to completed
    await db.query(
      `UPDATE physical_orders 
       SET order_status = 'completed', 
           completed_at = NOW(),
           funds_released_at = NOW()
       WHERE id = ?`,
      [orderId]
    );
    
    // Record in history
    await db.query(
      `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
       VALUES (?, 'completed', 'Buyer confirmed delivery', ?, NOW())`,
      [orderId, req.session.user.id]
    );
    
    // Update escrow account
    await db.query(
      `UPDATE escrow_accounts 
       SET status = 'released', 
           released_at = NOW()
       WHERE order_id = ?`,
      [orderId]
    );
    
    res.json({
      success: true,
      message: "Delivery confirmed! Thank you for your purchase."
    });
    
  } catch (err) {
    console.error("❌ Delivery confirmation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/my-orders - Fixed SQL query
app.get("/api/my-orders", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const userId = req.session.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query dynamically
    let query = `
      SELECT 
        o.id,
        o.product_name,
        o.quantity,
        o.total_amount,
        o.order_status,
        o.payment_status,
        o.created_at,
        o.shipping_address,
        o.delivery_phone,
        o.estimated_delivery_days,
        o.tracking_number,
        o.payment_collected_at,
        o.payment_held_until,
        o.refund_requested_at,
        o.seller_id
      FROM physical_orders o
      WHERE o.buyer_id = ?
    `;
    
    const queryParams = [userId];
    
    if (status && status !== 'all') {
      query += " AND o.order_status = ?";
      queryParams.push(status);
    }
    
    query += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    queryParams.push(parseInt(limit), offset);
    
    const orders = await db.query(query, queryParams);
    
    // Get seller names separately
    const sellerIds = [];
    if (orders && orders.length > 0) {
      for (const order of orders) {
        if (order.seller_id && !sellerIds.includes(order.seller_id)) {
          sellerIds.push(order.seller_id);
        }
      }
    }
    
    let sellerNames = {};
    if (sellerIds.length > 0) {
      const placeholders = sellerIds.map(() => '?').join(',');
      const sellers = await db.query(`
        SELECT id, username FROM users WHERE id IN (${placeholders})
      `, sellerIds);
      
      if (sellers && sellers.length > 0) {
        sellers.forEach(s => {
          sellerNames[s.id] = s.username;
        });
      }
    }
    
    // Get counts for each status
    const countsResult = await db.query(`
      SELECT 
        order_status,
        COUNT(*) as count
      FROM physical_orders
      WHERE buyer_id = ?
      GROUP BY order_status
    `, [userId]);
    
    const counts = {};
    if (countsResult && countsResult.length > 0) {
      countsResult.forEach(row => {
        counts[row.order_status] = parseInt(row.count);
      });
    }
    
    // Process orders
    const processedOrders = [];
    if (orders && orders.length > 0) {
      for (const order of orders) {
        processedOrders.push({
          id: order.id,
          product_name: order.product_name || 'Product',
          quantity: parseInt(order.quantity) || 1,
          total_amount: parseFloat(order.total_amount) || 0,
          order_status: order.order_status || 'pending_seller_approval',
          payment_status: order.payment_status || 'pending',
          seller_name: sellerNames[order.seller_id] || 'Seller',
          created_at: order.created_at,
          shipping_address: order.shipping_address,
          delivery_phone: order.delivery_phone,
          estimated_delivery_days: order.estimated_delivery_days || 7,
          tracking_number: order.tracking_number,
          payment_collected_at: order.payment_collected_at,
          payment_held_until: order.payment_held_until,
          refund_requested_at: order.refund_requested_at
        });
      }
    }
    
    res.json({
      success: true,
      orders: processedOrders,
      counts: counts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        has_more: (orders || []).length === parseInt(limit)
      }
    });
    
  } catch (err) {
    console.error("❌ Error fetching my orders:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get order status for tracking page (public with order ID only)
app.get("/api/track-order/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;
    
    const orderResult = await db.query(`
      SELECT o.*, p.title as product_name, p.images,
             u_seller.username as seller_name
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u_seller ON o.seller_id = u_seller.id
      WHERE o.id = ?
    `, [orderId]);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    
    // Get status history
    const historyResult = await db.query(`
      SELECT * FROM order_status_history 
      WHERE order_id = ? 
      ORDER BY created_at ASC
    `, [orderId]);
    
    // Get tracking info
    const trackingResult = await db.query(`
      SELECT * FROM order_tracking 
      WHERE order_id = ? 
      ORDER BY created_at DESC
    `, [orderId]);
    
    // Build timeline for display
    const timeline = buildStatusTimeline(order);
    
    // Add any additional history entries
    if (historyResult && historyResult.length > 0) {
      historyResult.forEach(history => {
        if (!timeline.find(t => t.status === history.status)) {
          timeline.push({
            status: history.status,
            title: history.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            description: history.notes || `Order status updated to ${history.status}`,
            timestamp: history.created_at,
            completed: true,
            icon: getStatusIcon(history.status)
          });
        }
      });
    }
    
    // Sort timeline by timestamp
    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    res.json({
      success: true,
      order: {
        id: order.id,
        product_name: order.product_name,
        product_image: order.images ? (typeof order.images === 'string' ? JSON.parse(order.images)[0] : order.images[0]) : null,
        quantity: parseInt(order.quantity),
        total_amount: parseFloat(order.total_amount),
        order_status: order.order_status,
        payment_status: order.payment_status,
        shipping_address: order.shipping_address,
        estimated_delivery_days: order.estimated_delivery_days || 7,
        created_at: order.created_at,
        seller_accepted_at: order.seller_accepted_at,
        payment_collected_at: order.payment_collected_at,
        completed_at: order.completed_at,
        seller_name: order.seller_name,
        timeline: timeline,
        tracking_info: trackingResult[0] || null,
        refund_available: order.order_status === 'paid' && !order.refund_requested_at,
        refund_deadline: order.payment_collected_at ? new Date(new Date(order.payment_collected_at).getTime() + 5 * 24 * 60 * 60 * 1000) : null
      }
    });
    
  } catch (err) {
    console.error("❌ Track order error:", err);
    res.status(500).json({ error: err.message });
  }
});

function getStatusIcon(status) {
  const icons = {
    'order_placed': 'fa-shopping-cart',
    'seller_accepted': 'fa-check-circle',
    'payment_completed': 'fa-credit-card',
    'processing': 'fa-cogs',
    'shipped': 'fa-truck',
    'delivered': 'fa-box-open',
    'completed': 'fa-trophy',
    'refunded': 'fa-dollar-sign',
    'cancelled': 'fa-times-circle'
  };
  return icons[status] || 'fa-info-circle';
}
app.post("/api/physical-orders/:orderId/get-payment-link", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    
    const order = await db.query(
      `SELECT o.*, p.title as product_name 
       FROM physical_orders o 
       LEFT JOIN products p ON o.product_id = p.id 
       WHERE o.id = ? AND o.buyer_id = ?`,
      [orderId, req.session.user.id]
    );
    
    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const orderData = order[0];
    
    if (orderData.order_status !== 'seller_accepted') {
      return res.status(400).json({ error: "Order not ready for payment" });
    }
    
    const amount = parseFloat(orderData.total_amount);
    const reference = `ORD_${orderId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const paymentData = {
      tx_ref: reference,
      amount: amount,
      currency: "USD",
      redirect_url: "https://core-insight-7.onrender.com/payment-callback.html",
      customer: {
        email: req.session.user.email,
        name: req.session.user.username,
      },
      customizations: {
        title: "Core Insight Marketplace",
        description: `Order #${orderId}: ${orderData.product_name}`,
      },
      meta: {
        order_id: parseInt(orderId),  // IMPORTANT: Store order ID in meta
        buyer_id: req.session.user.id,
        seller_id: orderData.seller_id
      }
    };
    
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      paymentData,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    if (response.data.status === 'success' && response.data.data?.link) {
      // Store transaction reference
      await db.query(
        `UPDATE physical_orders SET transaction_ref = ? WHERE id = ?`,
        [reference, orderId]
      );
      
      res.json({
        success: true,
        paymentLink: response.data.data.link,
        transactionRef: reference,
        orderId: orderId
      });
    } else {
      throw new Error(response.data.message || "Failed to create payment link");
    }
    
  } catch (error) {
    console.error("Payment link error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELIVERY CODE SYSTEM - COMPLETE
// ============================================
// Generate and send delivery code when seller marks order as shipped
app.post("/api/orders/:orderId/generate-delivery-code", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    
    // Verify seller owns this order
    const orderResult = await db.query(
      `SELECT o.*, u.email as buyer_email, u.username as buyer_name, p.title as product_name
       FROM physical_orders o
       LEFT JOIN users u ON o.buyer_id = u.id
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.id = ? AND o.seller_id = ?`,
      [orderId, req.session.user.id]
    );
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found or you don't have permission" });
    }
    
    const order = orderResult[0];
    
    // Check if order is paid
    const isPaid = order.payment_status === 'paid' || order.order_status === 'paid';
    
    if (!isPaid) {
      return res.status(400).json({ 
        error: `Order must be paid before generating delivery code. Current status: ${order.order_status}` 
      });
    }
    
    // Check if already has delivery code
    if (order.delivery_code) {
      return res.json({ 
        success: true, 
        delivery_code: order.delivery_code,
        message: "Delivery code already generated"
      });
    }
    
    // Generate a random 6-digit code
    const deliveryCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store the code and update order status
    await db.query(
      `UPDATE physical_orders 
       SET delivery_code = ?,
           delivery_code_sent_at = NOW(),
           order_status = 'shipped'
       WHERE id = ?`,
      [deliveryCode, orderId]
    );
    
    // Send email with delivery code to buyer
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Your Delivery Code - Core Insight</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          .code-box { background: #0f172a; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0; }
          .code { font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #10b981; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📦 Your Order #${orderId} is Out for Delivery!</h1>
          <p>Hello ${order.buyer_name},</p>
          <p>Your order for <strong>${order.product_name}</strong> has been shipped!</p>
          <div class="code-box">
            <p style="margin-bottom: 10px;">Your Delivery Confirmation Code:</p>
            <div class="code">${deliveryCode}</div>
            <p style="margin-top: 10px; font-size: 12px;">Give this code to the delivery person when you receive your package</p>
          </div>
          <a href="https://core-insight-7.onrender.com/order-tracking.html?orderId=${orderId}" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Track Your Order</a>
        </div>
      </body>
      </html>
    `;
    
    await sendEmail(order.buyer_email, `Delivery Code for Order #${orderId}`, emailHtml);
    
    res.json({
      success: true,
      message: "Delivery code generated and sent to buyer",
      delivery_code: deliveryCode,
      order_status: 'shipped'
    });
    
  } catch (err) {
    console.error("❌ Generate delivery code error:", err);
    res.status(500).json({ error: err.message });
  }
});
// Update order status (for sellers) - WITHOUT shipped_at
app.post("/api/orders/:orderId/status", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    const { status, notes } = req.body;
    
    // Verify order ownership
    const orderResult = await db.query(
      `SELECT o.*, u.email as buyer_email, u.username as buyer_name
       FROM physical_orders o
       LEFT JOIN users u ON o.buyer_id = u.id
       WHERE o.id = ? AND o.seller_id = ?`,
      [orderId, req.session.user.id]
    );
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found or you don't have permission" });
    }
    
    const order = orderResult[0];
    const validStatuses = ['processing', 'shipped', 'delivered', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status update" });
    }
    
    // Update order status - REMOVED shipped_at
    let updateFields = `order_status = ?`;
    const updateParams = [status];
    
    if (status === 'completed') {
      updateFields += `, completed_at = NOW(), funds_released_at = NOW()`;
    } else if (status === 'cancelled') {
      updateFields += `, cancelled_at = NOW()`;
    }
    // REMOVED: else if (status === 'shipped') { updateFields += `, shipped_at = NOW()`; }
    
    updateParams.push(orderId);
    await db.query(`UPDATE physical_orders SET ${updateFields} WHERE id = ?`, updateParams);
    
    // Record status change in history (if table exists)
    try {
      await db.query(
        `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [orderId, status, notes || null, req.session.user.id]
      );
    } catch (historyErr) {
      console.log('History table not available yet');
    }
    
    // Send email notification to buyer
    const statusMessages = {
      'processing': 'Your order is now being processed',
      'shipped': 'Your order has been shipped!',
      'delivered': 'Your order has been delivered',
      'completed': 'Your order has been completed. Thank you!',
      'cancelled': 'Your order has been cancelled'
    };
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order Status Update - Core Insight</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; background: #3b82f6; color: white; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Order #${orderId} Status Update</h1>
          <p>Hello ${order.buyer_name || 'Valued Customer'},</p>
          <div class="status-badge">${statusMessages[status] || `Status: ${status}`}</div>
          ${notes ? `<p><strong>Notes from seller:</strong> ${notes}</p>` : ''}
          <p>You can track your order here: <a href="https://core-insight-7.onrender.com/order-tracking.html?orderId=${orderId}">Track Order</a></p>
        </div>
      </body>
      </html>
    `;
    
    await sendEmail(order.buyer_email, `Order #${orderId} Status Update`, emailHtml);
    
    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order_id: orderId,
      new_status: status
    });
    
  } catch (err) {
    console.error("❌ Status update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Mark order as completed and release funds (automatic after 5 days or manual by admin)
app.post("/api/orders/:orderId/release-funds", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    const isAdmin = req.session.user.role === 'admin';
    
    const orderResult = await db.query(
      `SELECT o.* FROM physical_orders o WHERE o.id = ?`,
      [orderId]
    );
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    
    // Check if order is in delivered status
    if (order.order_status !== 'delivered') {
      return res.status(400).json({ error: `Cannot release funds for order with status: ${order.order_status}` });
    }
    
    // Check if 5 days have passed or admin override
    const canRelease = isAdmin || (order.payment_held_until && new Date() >= new Date(order.payment_held_until));
    
    if (!canRelease) {
      const daysLeft = Math.ceil((new Date(order.payment_held_until) - new Date()) / (1000 * 60 * 60 * 24));
      return res.status(400).json({ 
        error: `Funds cannot be released yet. ${daysLeft} days remaining in escrow period.`,
        days_remaining: daysLeft
      });
    }
    
    // Update order to completed and release funds
    await db.query(
      `UPDATE physical_orders 
       SET order_status = 'completed',
           funds_released_at = NOW()
       WHERE id = ?`,
      [orderId]
    );
    
    // Update escrow account
    await db.query(
      `UPDATE escrow_accounts 
       SET status = 'released', released_at = NOW()
       WHERE order_id = ?`,
      [orderId]
    );
    
    // Add to status history
    await db.query(
      `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
       VALUES (?, 'completed', 'Funds released to seller after escrow period', ?, NOW())`,
      [orderId, req.session.user.id]
    );
    
    // Send notification to seller
    const sellerResult = await db.query(
      `SELECT email, username FROM users WHERE id = ?`,
      [order.seller_id]
    );
    
    if (sellerResult && sellerResult.length > 0) {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Funds Released - Core Insight</title>
          <style>
            body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
            .amount { font-size: 24px; color: #10b981; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>💰 Funds Released!</h1>
            <p>Hello ${sellerResult[0].username},</p>
            <p>Funds for order #${orderId} have been released to your account.</p>
            <p class="amount">Amount: $${parseFloat(order.seller_earnings || order.total_amount * 0.9).toFixed(2)}</p>
            <p>The funds should appear in your bank account within 3-5 business days.</p>
          </div>
        </body>
        </html>
      `;
      await sendEmail(sellerResult[0].email, `Funds Released for Order #${orderId}`, emailHtml);
    }
    
    res.json({
      success: true,
      message: "Funds released to seller successfully",
      order_status: 'completed'
    });
    
  } catch (err) {
    console.error("❌ Release funds error:", err);
    res.status(500).json({ error: err.message });
  }
});
// Verify delivery code and complete order (for buyer)
app.post("/api/orders/:orderId/verify-delivery", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    const { delivery_code } = req.body;
    
    if (!delivery_code) {
      return res.status(400).json({ error: "Delivery code is required" });
    }
    
    // Verify buyer owns this order
    const orderResult = await db.query(
      `SELECT o.*, u.email as seller_email, u.username as seller_name, p.title as product_name
       FROM physical_orders o
       LEFT JOIN users u ON o.seller_id = u.id
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.id = ? AND o.buyer_id = ?`,
      [orderId, req.session.user.id]
    );
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    
    // Check if order is in shipped status (has delivery code)
    if (order.order_status !== 'shipped') {
      return res.status(400).json({ error: `Cannot confirm delivery for order with status: ${order.order_status}` });
    }
    
    if (!order.delivery_code) {
      return res.status(400).json({ error: "No delivery code generated for this order yet" });
    }
    
    // Verify the code
    if (order.delivery_code !== delivery_code) {
      return res.status(400).json({ error: "Invalid delivery code. Please check and try again." });
    }
    
    // Mark delivery code as used
    await db.query(
      `UPDATE delivery_codes 
       SET status = 'used', used_at = NOW(), used_by = ?
       WHERE order_id = ? AND code = ?`,
      [req.session.user.id, orderId, delivery_code]
    );
    
    // Update order to delivered status (5-day escrow starts now)
    const escrowReleaseDate = new Date();
    escrowReleaseDate.setDate(escrowReleaseDate.getDate() + 5);
    
    await db.query(
      `UPDATE physical_orders 
       SET order_status = 'delivered',
           delivered_at = NOW(),
           payment_held_until = ?
       WHERE id = ?`,
      [escrowReleaseDate, orderId]
    );
    
    // Add to status history
    try {
      await db.query(
        `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
         VALUES (?, 'delivered', 'Buyer confirmed delivery with code', ?, NOW())`,
        [orderId, req.session.user.id]
      );
    } catch (historyErr) {
      console.log('History table not available yet');
    }
    
    // Send notification to seller
    const sellerEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order Delivered - Core Insight</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          .success { color: #10b981; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="success">✅ Order Delivered!</h1>
          <p>Hello ${order.seller_name},</p>
          <p>Your order for <strong>${order.product_name}</strong> has been delivered and confirmed by the buyer.</p>
          <p>Funds will be released to your account in 5 days (${escrowReleaseDate.toLocaleDateString()}) unless a dispute is raised.</p>
          <a href="https://core-insight-7.onrender.com/dashboard.html" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">View Dashboard</a>
        </div>
      </body>
      </html>
    `;
    
    await sendEmail(order.seller_email, `Order #${orderId} Delivered`, sellerEmailHtml);
    
    res.json({
      success: true,
      message: "Delivery confirmed! Thank you for your purchase.",
      order_status: 'delivered',
      escrow_release_date: escrowReleaseDate,
      days_until_release: 5
    });
    
  } catch (err) {
    console.error("❌ Verify delivery error:", err);
    res.status(500).json({ error: err.message });
  }
});
// Get delivery code status (for seller to see if code was used)
app.get("/api/orders/:orderId/delivery-code-status", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    
    const orderResult = await db.query(
      `SELECT o.delivery_code, o.delivery_code_sent_at, o.order_status,
              dc.status as code_status, dc.used_at
       FROM physical_orders o
       LEFT JOIN delivery_codes dc ON o.id = dc.order_id
       WHERE o.id = ? AND (o.seller_id = ? OR o.buyer_id = ?)`,
      [orderId, req.session.user.id, req.session.user.id]
    );
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    
    res.json({
      success: true,
      has_delivery_code: !!order.delivery_code,
      delivery_code: order.delivery_code,
      code_sent_at: order.delivery_code_sent_at,
      code_status: order.code_status || (order.order_status === 'delivered' ? 'used' : 'pending'),
      used_at: order.used_at,
      order_status: order.order_status
    });
    
  } catch (err) {
    console.error("❌ Delivery code status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Direct payment verification endpoint (bypasses server-side API call)
app.post("/api/verify-physical-payment-direct", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const { transaction_id, order_id, tx_ref } = req.body;
    
    // Verify with Flutterwave using the transaction ID
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
      }
    );
    
    if (response.data.status === "success" && response.data.data.status === "successful") {
      const transaction = response.data.data;
      const amount = transaction.amount;
      
      // Update order status
      await db.query(
        `UPDATE physical_orders 
         SET payment_status = 'paid',
             order_status = 'paid',
             payment_collected_at = NOW(),
             payment_held_until = DATE_ADD(NOW(), INTERVAL 5 DAY),
             transaction_ref = ?
         WHERE id = ?`,
        [tx_ref, order_id]
      );
      
      res.json({ success: true, message: "Payment verified successfully" });
    } else {
      res.status(400).json({ success: false, message: "Payment verification failed" });
    }
  } catch (err) {
    console.error("❌ Payment verification error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update this endpoint in your index.js
app.post("/api/verify-paystack-payment", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const { reference, order_id, usd_amount } = req.body;
    
    console.log(`🔍 Verifying Paystack payment for order #${order_id}, reference: ${reference}`);
    
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );
    
    if (response.data.status === true && response.data.data.status === "success") {
      const ngnAmountPaid = response.data.data.amount / 100; // Convert from kobo to NGN
      const usdAmount = usd_amount || (ngnAmountPaid / 1500); // Approximate conversion
      
      console.log(`✅ Payment verified! Updating order #${order_id} to 'paid'`);
      
      // Update order with correct statuses
      await db.query(
        `UPDATE physical_orders 
         SET payment_status = 'paid',
             order_status = 'paid',
             payment_collected_at = NOW(),
             payment_held_until = DATE_ADD(NOW(), INTERVAL 5 DAY),
             transaction_ref = ?,
             amount_paid_currency = 'NGN',
             amount_paid = ?,
             original_amount_usd = ?
         WHERE id = ?`,
        [reference, ngnAmountPaid, usdAmount, order_id]
      );
      
      // Add status history entry
      await db.query(
        `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
         VALUES (?, 'payment_completed', 'Payment received and held in escrow', ?, NOW())`,
        [order_id, req.session.user.id]
      );
      
      res.json({ 
        success: true, 
        message: "Payment verified successfully",
        order_id: order_id,
        order_status: 'paid'
      });
    } else {
      console.log(`❌ Paystack verification failed for order #${order_id}`);
      res.status(400).json({ success: false, message: "Payment verification failed" });
    }
  } catch (err) {
    console.error("❌ Paystack verification error:", err);
    res.status(500).json({ error: err.message });
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
// Add history entry
await db.query(
  `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
   VALUES (?, 'payment_completed', 'Payment received and held in escrow', ?, NOW())`,
  [orderId, order.buyer_id]
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
// ============================================
// UNIFIED PAYMENT VERIFICATION ENDPOINT
// Handles both Courses and Physical Products
// ============================================

app.get("/api/unified-verify/:reference", async (req, res) => {
    try {
        const reference = req.params.reference;
        
        // Determine if it's a course or product payment
        if (reference.startsWith('coreinsight_')) {
            // Course payment
            const response = await axios.get(
                `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
                { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
            );
            
            if (response.data.status === "success" && response.data.data.status === "successful") {
                const transaction = response.data.data;
                const courseId = transaction.meta?.course_id;
                const userId = transaction.meta?.user_id;
                
                await db.query(
                    `INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at)
                     VALUES (?, ?, 'completed', NOW())
                     ON DUPLICATE KEY UPDATE payment_status = 'completed', purchased_at = NOW()`,
                    [userId, courseId]
                );
                
                res.json({ status: "success", type: "course", course_id: courseId });
            } else {
                res.json({ status: "failed", type: "course" });
            }
        } 
        else if (reference.startsWith('ORD_')) {
            // Physical product payment
            const response = await axios.get(
                `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
                { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
            );
            
            if (response.data.status === "success" && response.data.data.status === "successful") {
                const transaction = response.data.data;
                const orderId = transaction.meta?.order_id;
                const amount = transaction.amount;
                const escrowReleaseDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
                
                await db.query(
                    `UPDATE physical_orders 
                     SET payment_status = 'paid',
                         order_status = 'paid',
                         payment_collected_at = NOW(),
                         payment_held_until = ?,
                         transaction_ref = ?
                     WHERE id = ?`,
                    [escrowReleaseDate, reference, orderId]
                );
                
                res.json({ status: "success", type: "product", order_id: orderId, amount: amount });
            } else {
                res.json({ status: "failed", type: "product" });
            }
        }
        else {
            res.status(400).json({ error: "Unknown payment type" });
        }
        
    } catch (err) {
        console.error("Unified verification error:", err);
        res.status(500).json({ error: err.message });
    }
});
// Secure endpoint to get payment public keys (only what's safe to expose)
app.get("/api/payment-keys", (req, res) => {
  // Only return public keys - NEVER return secret keys
  res.json({
    flutterwave: {
      public_key: process.env.FLW_PUBLIC_KEY || null,
      isConfigured: !!process.env.FLW_PUBLIC_KEY
    },
    paystack: {
      public_key: process.env.PAYSTACK_PUBLIC_KEY || null,
      isConfigured: !!process.env.PAYSTACK_PUBLIC_KEY
    }
  });
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

// Add these endpoints to your index.js backend file

// Get all users for admin
app.get("/api/admin/users", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const users = await db.query(`
      SELECT u.*, 
        (SELECT COUNT(*) FROM products WHERE user_id = u.id AND is_deleted = 0) as product_count,
        (SELECT COUNT(*) FROM physical_orders WHERE seller_id = u.id) as sales_count
      FROM users u
      ORDER BY u.created_at DESC
    `);
    
    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get platform stats for admin
app.get("/api/admin/platform-stats", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const totalUsers = await db.query("SELECT COUNT(*) as count FROM users");
    const totalProducts = await db.query("SELECT COUNT(*) as count FROM products WHERE is_deleted = 0");
    const totalSales = await db.query("SELECT COUNT(*) as count FROM physical_orders");
    const platformRevenue = await db.query("SELECT SUM(platform_fee) as total FROM physical_orders WHERE order_status = 'completed'");
    
    res.json({
      total_users: totalUsers[0]?.count || 0,
      total_products: totalProducts[0]?.count || 0,
      total_sales: totalSales[0]?.count || 0,
      platform_revenue: platformRevenue[0]?.total || 0
    });
  } catch (err) {
    console.error("Error fetching platform stats:", err);
    res.status(500).json({ error: err.message });
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
// GET /api/seller/paid-orders - Orders ready for shipment
app.get("/api/seller/paid-orders", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const sellerId = req.session.user.id;
    
    const orders = await db.query(`
      SELECT 
        o.id,
        o.product_name,
        o.quantity,
        o.total_amount,
        o.order_status,
        o.customer_name,
        o.customer_email,
        o.shipping_address,
        o.delivery_phone,
        o.city,
        o.state,
        o.country,
        o.created_at,
        o.payment_collected_at,
        o.platform_fee,
        o.seller_earnings,
        o.estimated_delivery_days,
        p.id as product_id,
        p.title as product_title
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      WHERE o.seller_id = ? 
        AND o.order_status = 'paid'
        AND o.payment_status = 'paid'
      ORDER BY o.payment_collected_at ASC
    `, [sellerId]);
    
    const processedOrders = (orders || []).map(order => ({
      id: order.id,
      product_name: order.product_name || order.product_title,
      quantity: parseInt(order.quantity) || 1,
      total_amount: parseFloat(order.total_amount) || 0,
      seller_earnings: parseFloat(order.seller_earnings) || (parseFloat(order.total_amount) * 0.9),
      platform_fee: parseFloat(order.platform_fee) || (parseFloat(order.total_amount) * 0.1),
      customer_name: order.customer_name || 'Customer',
      customer_email: order.customer_email,
      shipping_address: order.shipping_address,
      delivery_phone: order.delivery_phone,
      city: order.city,
      state: order.state,
      country: order.country,
      created_at: order.created_at,
      payment_collected_at: order.payment_collected_at,
      estimated_delivery_days: order.estimated_delivery_days || 7
    }));
    
    res.json({
      success: true,
      orders: processedOrders,
      count: processedOrders.length
    });
    
  } catch (err) {
    console.error("❌ Error fetching paid orders:", err);
    res.status(500).json({ error: err.message });
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


// GET /api/orders/:orderId/escrow-status
app.get("/api/orders/:orderId/escrow-status", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    
    const order = await db.query(
      `SELECT id, payment_status, order_status, payment_held_until, total_amount, seller_earnings, platform_fee
       FROM physical_orders
       WHERE id = ? AND (buyer_id = ? OR seller_id = ?)`,
      [orderId, req.session.user.id, req.session.user.id]
    );
    
    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const orderData = order[0];
    const isPaid = orderData.payment_status === 'paid';
    const isCompleted = orderData.order_status === 'completed';
    
    res.json({
      success: true,
      is_escrow: isPaid && !isCompleted,
      amount_held: parseFloat(orderData.total_amount),
      seller_earnings: parseFloat(orderData.seller_earnings) || (parseFloat(orderData.total_amount) * 0.9),
      platform_fee: parseFloat(orderData.platform_fee) || (parseFloat(orderData.total_amount) * 0.1),
      payment_held_until: orderData.payment_held_until,
      funds_released: isCompleted
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
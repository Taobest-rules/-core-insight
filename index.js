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
const {
    uploadCourse,
    uploadProduct,
    uploadProductImages,
    uploadThumbnail,
    uploadProfilePicture,
    uploadChatImage,
    uploadCertificate,
    uploadCourseFile,
    uploadProductFile,
    uploadMultipleProducts,
    uploadToImgbb,
    uploadToBackblaze,
    uploadFile,           // This comes from mega-storage.js
    uploadSmartFile,
    uploadFileToMega
} = require('./mega-storage');
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
            <a href="https://coreinsightmarket.com/order-tracking?orderId=${orderId}" class="button">Track Your Order</a>
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
            <a href=" https://coreinsightmarket.com/dashboard" class="button">Go to Dashboard</a>
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

function getPaymentConfirmationTemplate(paymentData) {
  const { email, name, orderId, productName, quantity, totalAmount, platformFee, sellerEarnings } = paymentData;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Confirmed - Core Insight Market</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #10b981, #3b82f6); padding: 30px; text-align: center; }
        .header h1 { margin: 0; color: white; }
        .content { padding: 30px; }
        .order-details { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; }
        .amount { font-size: 28px; color: #10b981; font-weight: bold; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
        .footer { background: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Core Insight Market</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">Payment Confirmed</p>
        </div>
        <div class="content">
          <h2>Hello ${escapeHtml(name || 'Valued Customer')},</h2>
          <p>Your payment has been successfully processed!</p>
          
          <div class="order-details">
            <p><strong>Order #${orderId}</strong></p>
            <p>${escapeHtml(productName)} × ${quantity}</p>
            <p class="amount">Total Paid: $${parseFloat(totalAmount).toFixed(2)}</p>
            <hr style="border-color: #334155; margin: 15px 0;">
            <p><strong>Platform Fee:</strong> $${parseFloat(platformFee || totalAmount * 0.1).toFixed(2)}</p>
            <p><strong>Seller Receives:</strong> $${parseFloat(sellerEarnings || totalAmount * 0.9).toFixed(2)} <small>(after 5-day escrow)</small></p>
          </div>
          
          <div style="text-align: center;">
            <a href="https://coreinsightmarket.com/order-tracking.html?orderId=${orderId}" class="button">
              Track Your Order
            </a>
          </div>
          
          <p>Your payment is held in escrow and will be released to the seller 5 days after you confirm delivery.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Core Insight Market. All rights reserved.</p>
          <p>Need help? Contact suppourt@coreinsightmarket.com</p>
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
            <a href="https://coreinsightmarket.com/order-tracking?orderId=${orderId}" class="button">View Order Details</a>
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
// Middleware to check if freelancer has active subscription
async function checkFreelancerSubscription(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }
    
    // Admins always have access
    if (req.session.user.role === 'admin') {
        return next();
    }
    
    // Clients always have access
    if (req.session.user.role === 'client') {
        return next();
    }
    
    try {
        const userId = req.session.user.id;
        
        const userResult = await db.query(
            `SELECT subscription_status, subscription_end_date, trial_end_date, role 
             FROM users WHERE id = ?`,
            [userId]
        );
        
        if (!userResult || userResult.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        
        const user = userResult[0];
        const today = new Date();
        let hasActiveSubscription = false;
        
        // Check trial period
        if (user.trial_end_date) {
            const trialEnd = new Date(user.trial_end_date);
            if (today <= trialEnd) {
                hasActiveSubscription = true;
            }
        }
        
        // Check paid subscription
        if (!hasActiveSubscription && user.subscription_end_date) {
            const subEnd = new Date(user.subscription_end_date);
            if (today <= subEnd) {
                hasActiveSubscription = true;
            }
        }
        
        if (!hasActiveSubscription) {
            return res.status(403).json({ 
                error: "Your subscription has expired. Please renew to continue.",
                requiresSubscription: true,
                expired: true,
                redirect: "/subscription.html"
            });
        }
        
        next();
    } catch (err) {
        console.error("Subscription check error:", err);
        res.status(500).json({ error: err.message });
    }
}

// Apply middleware to protected routes
app.use("/api/services", checkFreelancerSubscription);
app.use("/api/services/create", checkFreelancerSubscription);
app.use("/api/services/my-services", checkFreelancerSubscription);
app.use("/api/messages/send", checkFreelancerSubscription);
app.use("/api/messages/send-with-image", checkFreelancerSubscription);
app.use("/api/conversations/start", checkFreelancerSubscription);
app.use("/api/freelancer/update-profile", checkFreelancerSubscription);
app.use("/api/freelancer/certificate-images", checkFreelancerSubscription);
app.use("/api/freelancer/profile", checkFreelancerSubscription);
app.use("/api/freelancer/dashboard", checkFreelancerSubscription);
// ============================================
// COMPLETE PRODUCT UPLOAD - FLUTTERWAVE ONLY
// ============================================


// Create Flutterwave subaccount - UPDATED with international fields
async function createFlutterwaveSubaccount(userId, bankData) {
    try {
        const { 
            bank_code, 
            account_number, 
            business_name, 
            country = 'NG', 
            business_email, 
            business_phone,
            is_virtual = false,
            // NEW FIELDS FOR INTERNATIONAL PAYOUTS
            routing_number,
            swift_code,
            iban,
            branch_code,
            institution_number,
            transit_number,
            bsb_number
        } = bankData;
        
        console.log(`🔧 Creating Flutterwave subaccount for user ${userId}:`, { 
            bank_code, 
            account_number, 
            business_name, 
            country,
            has_routing: !!routing_number,
            has_swift: !!swift_code,
            has_branch: !!branch_code
        });
        
        // Build the payload based on country requirements
        let payload = {
            account_bank: String(bank_code).padStart(3, '0'),
            account_number: String(account_number),
            business_name: business_name,
            split_type: "percentage",
            split_value: 0.1,  // Platform gets 10%
            country: country,
            business_email: business_email || '',
            business_mobile: business_phone || ''
        };
        
        // Add country-specific fields
        if (country === 'US') {
            if (routing_number) {
                payload.routing_number = routing_number;
            }
            if (swift_code) {
                payload.swift_code = swift_code;
            }
        }
        
        if (country === 'CA') {
            if (institution_number) {
                payload.institution_number = institution_number;
            }
            if (transit_number) {
                payload.transit_number = transit_number;
            }
        }
        
        // European countries (SEPA)
        const europeanCountries = ['GB', 'FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'PT', 'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'AT', 'PL', 'CZ', 'GR', 'HU', 'RO'];
        if (europeanCountries.includes(country)) {
            if (swift_code) {
                payload.swift_code = swift_code;
            }
            if (iban) {
                payload.iban = iban;
            }
        }
        
        // African countries requiring branch code
        const branchCodeCountries = ['GH', 'TZ', 'UG', 'RW'];
        if (branchCodeCountries.includes(country) && branch_code) {
            payload.branch_code = branch_code;
        }
        
        // Australia
        if (country === 'AU' && bsb_number) {
            payload.bsb_number = bsb_number;
        }
        
        // For virtual accounts, add metadata
        if (is_virtual) {
            payload.meta = {
                is_virtual_account: true,
                provider: 'virtual_bank_provider'
            };
        }
        
        console.log("📤 Subaccount payload:", JSON.stringify(payload, null, 2));
        
        const response = await axios.post(
            'https://api.flutterwave.com/v3/subaccounts',
            payload,
            {
                headers: {
                    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        if (response.data.status === 'success') {
            const subaccountId = response.data.data.subaccount_id;
            
            // Store all additional fields in database
            await db.query(
                `UPDATE users 
                 SET flutterwave_subaccount_id = ?,
                     subaccount_created_at = NOW(),
                     subaccount_status = 'active',
                     bank_code = ?,
                     account_number = ?,
                     account_name = ?,
                     is_virtual_account = ?,
                     routing_number = ?,
                     swift_code = ?,
                     iban = ?,
                     branch_code = ?,
                     institution_number = ?,
                     transit_number = ?,
                     bsb_number = ?
                 WHERE id = ?`,
                [
                    subaccountId, 
                    bank_code, 
                    account_number, 
                    business_name, 
                    is_virtual ? 1 : 0,
                    routing_number || null,
                    swift_code || null,
                    iban || null,
                    branch_code || null,
                    institution_number || null,
                    transit_number || null,
                    bsb_number || null,
                    userId
                ]
            );
            
            console.log(`✅ Flutterwave subaccount created for user ${userId}: ${subaccountId}`);
            console.log(`   Split configuration: Platform gets 10%, Seller gets 90%`);
            console.log(`   Country: ${country}, Has SWIFT: ${!!swift_code}, Has Routing: ${!!routing_number}`);
            
            return { success: true, subaccount_id: subaccountId };
        } else {
            throw new Error(response.data.message || 'Subaccount creation failed');
        }
        
    } catch (err) {
        console.error(`❌ Flutterwave subaccount error for user ${userId}:`, err.response?.data || err.message);
        return { success: false, error: err.response?.data?.message || err.message };
    }
}
// Auto-escalate refunds that are pending for more than 3 days
setInterval(async () => {
  const staleRefunds = await db.query(`
    SELECT o.*, 
           TIMESTAMPDIFF(HOUR, o.refund_requested_at, NOW()) as hours_pending
    FROM physical_orders o
    WHERE o.order_status = 'refund_requested'
      AND o.refund_requested_at < DATE_SUB(NOW(), INTERVAL 3 DAY)
      AND o.admin_review_requested_at IS NULL
      AND o.refund_auto_escalated = FALSE
  `);
  
  for (const refund of staleRefunds) {
    console.log(`⚠️ Auto-escalating refund #${refund.id} after ${refund.hours_pending} hours`);
    
    await db.query(
      `UPDATE physical_orders 
       SET admin_review_requested_at = NOW(),
           refund_auto_escalated = TRUE,
           refund_notes = CONCAT(IFNULL(refund_notes, ''), ' [Auto-escalated: No resolution after 3 days]')
       WHERE id = ?`,
      [refund.id]
    );
    
    // Notify admins
    const admins = await db.query("SELECT email FROM users WHERE role = 'admin'");
    for (const admin of admins) {
      await sendEmail(admin.email, `⚠️ Auto-Escalated Refund #${refund.id} - Needs Review`, `
        <h2>Refund Auto-Escalated to Admin</h2>
        <p><strong>Order #${refund.id}</strong> has been pending for ${Math.floor(refund.hours_pending / 24)} days.</p>
        <p><strong>Reason:</strong> ${refund.refund_reason}</p>
        <p><strong>Customer:</strong> ${refund.buyer_name || 'Customer'}</p>
        <p><strong>Seller:</strong> ${refund.seller_name || 'Seller'}</p>
        <p><strong>Action Required:</strong> Review and make final decision within 48 hours.</p>
      `);
    }
  }
}, 3600000); // Check every hour
// ============================================
// NOTIFICATION HELPER FUNCTIONS
// ============================================

// Create seller notification (ENUM compatible)
async function createSellerNotification(sellerId, orderId, notificationType, title, message) {
    try {
        // Map notification types to ENUM values: 'new_order', 'order_update', 'payment_received'
        let mappedType = notificationType;
        
        const typeMap = {
            'new_order': 'new_order',
            'order_accepted': 'order_update',
            'order_rejected': 'order_update',
            'order_shipped': 'order_update',
            'delivery_confirmed': 'order_update',
            'payment_received': 'payment_received',
            'refund_requested': 'order_update',
            'refund_approved': 'payment_received',
            'refund_denied': 'order_update'
        };
        
        mappedType = typeMap[notificationType] || 'order_update';
        
        const result = await db.query(
            `INSERT INTO seller_notifications (seller_id, order_id, notification_type, title, message, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [sellerId, orderId, mappedType, title, message]
        );
        
        console.log(`📢 Seller notification created: ${notificationType} → ${mappedType} for seller ${sellerId}`);
        return result.insertId;
        
    } catch (err) {
        console.error("Failed to create seller notification:", err);
        return null;
    }
}

// Create buyer notification (VARCHAR - no restriction)
async function createBuyerNotification(buyerId, orderId, notificationType, title, message) {
    try {
        const result = await db.query(
            `INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [buyerId, orderId, notificationType, title, message]
        );
        
        console.log(`📢 Buyer notification created: ${notificationType} for buyer ${buyerId}`);
        return result.insertId;
        
    } catch (err) {
        console.error("Failed to create buyer notification:", err);
        return null;
    }
}
// ============================================
// CURRENCY CONVERSION ENDPOINT
// ============================================

// ============================================
// CURRENCY CONVERSION - FIXED
// ============================================

// Store exchange rates (refresh every hour)
let cachedExchangeRates = {
    rates: {
        USD: 1,
        NGN: 1500,      // Default fallback
        EUR: 0.92,
        GBP: 0.79,
        KES: 130,
        GHS: 15,
        ZAR: 19,
        CAD: 1.37,
        AUD: 1.50,
        JPY: 150,
        CNY: 7.2,
        INR: 83,
        BRL: 5.1,
        MXN: 17,
        AED: 3.67,
        SAR: 3.75,
        EGP: 48,
        MAD: 10,
        TZS: 2600,
        UGX: 3800,
        RWF: 1300,
        XOF: 610,
        XAF: 610
    },
    lastUpdated: null
};

// Get current exchange rate with USD as base
async function getExchangeRate() {
    try {
        // Check if cache is stale (older than 1 hour)
        if (cachedExchangeRates.lastUpdated && 
            (Date.now() - cachedExchangeRates.lastUpdated) < 3600000) {
            console.log('📊 Using cached exchange rates');
            return cachedExchangeRates;
        }
        
        console.log('🌍 Fetching fresh exchange rates...');
        
        // Use a reliable free API
        const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
            timeout: 10000
        });
        
        if (response.data && response.data.rates && response.data.rates.NGN) {
            cachedExchangeRates = {
                USD_TO_NGN: response.data.rates.NGN,
                rates: response.data.rates,
                lastUpdated: Date.now()
            };
            console.log(`💰 Exchange rate updated: 1 USD = ${cachedExchangeRates.USD_TO_NGN} NGN`);
            return cachedExchangeRates;
        } else {
            throw new Error('Invalid response from exchange rate API');
        }
        
    } catch (err) {
        console.error("❌ Exchange rate fetch error:", err.message);
        // Return fallback rate
        return {
            USD_TO_NGN: 1500,
            rates: { NGN: 1500, USD: 1, EUR: 0.92, GBP: 0.79 },
            lastUpdated: null,
            isFallback: true
        };
    }
}

// API endpoint to get current rates
app.get("/api/currency-rates", async (req, res) => {
    try {
        const rates = await getExchangeRate();
        res.json({
            success: true,
            rates: rates.rates,
            lastUpdated: rates.lastUpdated,
            base: 'USD'
        });
    } catch (err) {
        console.error('Currency rates error:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message,
            rates: { USD: 1, NGN: 1500 } // Fallback
        });
    }
});

// ============================================
// AUTOMATIC ESCROW RELEASE SYSTEM
// Runs every hour to check for orders ready for payment release
// ============================================

// Schedule automatic escrow release
function startEscrowReleaseScheduler() {
    console.log('🔄 Starting automatic escrow release scheduler...');
    
    // Run immediately on startup
    setTimeout(() => {
        releaseExpiredEscrowFunds();
    }, 5000); // Wait 5 seconds after server start
    
    // Then run every hour
    setInterval(async () => {
        await releaseExpiredEscrowFunds();
    }, 60 * 60 * 1000); // Every hour
    
    console.log('✅ Escrow release scheduler started (runs every hour)');
}

async function releaseExpiredEscrowFunds() {
  try {
    console.log(`🕐 Running escrow release at ${new Date().toISOString()}`);
    
    // ✅ Find orders where 5 days have passed since delivery
    const orders = await db.query(`
      SELECT 
        o.id,
        o.seller_id,
        o.total_amount,
        o.seller_earnings,
        o.platform_fee,
        o.payment_held_until,
        o.delivered_at,
        u.email as seller_email,
        u.username as seller_name
      FROM physical_orders o
      LEFT JOIN users u ON o.seller_id = u.id
      WHERE o.payment_status = 'paid'
        AND o.order_status = 'delivered'
        AND o.payment_held_until IS NOT NULL
        AND o.payment_held_until <= NOW()
        AND o.funds_released_at IS NULL
        AND o.order_status != 'refund_requested'
        AND o.order_status != 'refunded'
    `);
    
    for (const order of orders) {
      try {
        console.log(`  Releasing $${order.seller_earnings} for order #${order.id}`);
        
        // ✅ Release funds to seller
        await db.query(`
          UPDATE physical_orders 
          SET order_status = 'completed',
              funds_released_at = NOW()
          WHERE id = ?
        `, [order.id]);
        
        // Send email to seller
        if (order.seller_email) {
          const emailHtml = `
            <div style="font-family: Arial; padding: 20px;">
              <h2 style="color: #10b981;">💰 Funds Released!</h2>
              <p>Hello ${order.seller_name},</p>
              <p>$${parseFloat(order.seller_earnings).toFixed(2)} has been released for Order #${order.id}.</p>
              <p><strong>Breakdown:</strong></p>
              <ul>
                <li>Order Total: $${parseFloat(order.total_amount).toFixed(2)}</li>
                <li>Platform Fee: $${parseFloat(order.platform_fee).toFixed(2)}</li>
                <li>Your Earnings: $${parseFloat(order.seller_earnings).toFixed(2)}</li>
              </ul>
            </div>
          `;
          await sendEmail(order.seller_email, `Funds Released - Order #${order.id}`, emailHtml);
        }
        
      } catch (err) {
        console.error(`Failed to release order #${order.id}:`, err.message);
      }
    }
    
  } catch (err) {
    console.error('Escrow release error:', err);
  }
}

// Also add a manual trigger endpoint for testing
app.post("/api/admin/trigger-escrow-release", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }
        
        console.log("🔄 Manual escrow release triggered by admin");
        await releaseExpiredEscrowFunds();
        
        res.json({ 
            success: true, 
            message: "Escrow release check completed. Check server logs for details." 
        });
        
    } catch (err) {
        console.error("Manual escrow release error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Start the scheduler when server starts
startEscrowReleaseScheduler();

// ============================================
// UPDATE EXISTING FUNCTIONS TO USE NEW EMAIL SYSTEM
// ============================================

// Update verification email function
async function sendVerificationEmail(to, username, verifyToken) {
  const verifyLink = `https://coreinsightmarket.com/verify.html?token=${verifyToken}`;
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

app.post("/api/send-complaint", complaintUpload.array('attachments', 5), async (req, res) => {
  try {
    console.log("📧 Received complaint submission");
    
    const { name, email, subject, priority, message, orderId } = req.body;
    
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "Please fill in all required fields" });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    
    // Upload attachments to ImgBB
    const attachments = req.files || [];
    const attachmentUrls = [];
    
    for (const file of attachments) {
      const url = await uploadToImgbb(file.path, file.originalname);
      attachmentUrls.push({
        url: url,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });
      // Clean up local file
      try { fs.unlinkSync(file.path); } catch(e) {}
    }
    
    // Prepare email HTML with attachment links
    let emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>New Complaint: ${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
          .container { max-width: 700px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          h1 { color: #3b82f6; margin-top: 0; }
          .complaint-details { background: #0f172a; padding: 20px; border-radius: 12px; margin: 20px 0; }
          .attachment-item { margin: 8px 0; padding: 8px; background: #1e293b; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📧 New Support Complaint</h1>
          <div class="complaint-details">
            <p><strong>From:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
            <p><strong>Priority:</strong> ${escapeHtml(priority)}</p>
            ${orderId ? `<p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>` : ''}
          </div>
          <div class="complaint-details">
            <strong>Message:</strong><br>
            <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
          </div>
    `;
    
    if (attachmentUrls.length > 0) {
      emailHtml += `
        <div class="complaint-details">
          <strong>📎 Attachments (${attachmentUrls.length} files):</strong><br>
          ${attachmentUrls.map(att => `
            <div class="attachment-item">
              <a href="${att.url}" target="_blank" style="color: #3b82f6;">${escapeHtml(att.filename)}</a>
              <small>(${(att.size / 1024).toFixed(1)} KB)</small>
            </div>
          `).join('')}
        </div>
      `;
    }
    
    emailHtml += `
        </div>
      </body>
      </html>
    `;
    
    // Send email to support
    const supportEmail = SUPPORT_EMAIL || 'suppourtcoreinsight@gmail.com';
    
    if (transporter) {
      await transporter.sendMail({
        from: `"Core Insight Support" <${process.env.EMAIL_USER || 'coreinsightmail@gmail.com'}>`,
        to: supportEmail,
        replyTo: email,
        subject: `[COMPLAINT] ${priority} - ${subject}`,
        html: emailHtml
      });
      console.log(`✅ Complaint email sent to ${supportEmail}`);
    }
    
    res.json({
      success: true,
      message: "Complaint submitted successfully! We'll respond within 24 hours."
    });
    
  } catch (error) {
    console.error("❌ Complaint submission error:", error);
    res.status(500).json({ error: "Failed to submit complaint" });
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
      redirect_url: "https://coreinsightmarket.com/payment-callback.html",
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

// ============================================
// SIMPLIFIED AUTO VERIFICATION - NO TWILIO
// ============================================



// Configure multer for verification documents
const verificationStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads', 'verification');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
        cb(null, `${req.session.user.id}_${timestamp}_${random}_${baseName}${ext}`);
    }
});

const uploadVerification = multer({ 
    storage: verificationStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only images and PDF files are allowed'));
        }
    }
});

// 1. Send OTP via Email (no Twilio needed)
app.post("/api/verification/send-otp", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }

        const { phone_number } = req.body;
        
        if (!phone_number) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        // Store OTP in database
        await db.query(
            `INSERT INTO phone_verifications (user_id, phone_number, otp_code, expires_at, verified, created_at)
             VALUES (?, ?, ?, ?, 0, NOW())
             ON DUPLICATE KEY UPDATE otp_code = ?, expires_at = ?, created_at = NOW()`,
            [req.session.user.id, phone_number, otpCode, expiresAt, otpCode, expiresAt]
        );

        // Send OTP via email instead of SMS (free, no Twilio)
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Phone Verification - Core Insight Market</title></head>
            <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
                <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                    <h1 style="color:#FFD700;">📱 Phone Verification</h1>
                    <p>Hello ${req.session.user.username},</p>
                    <p>Your verification code is:</p>
                    <div style="font-size: 48px; font-weight: bold; text-align: center; padding: 20px; background: #0f172a; border-radius: 12px; letter-spacing: 10px;">
                        ${otpCode}
                    </div>
                    <p>This code expires in 10 minutes.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail(req.session.user.email, "Phone Verification Code - Core Insight Market", emailHtml);
        
        console.log(`📧 OTP sent to email: ${otpCode} for phone: ${phone_number}`);

        res.json({
            success: true,
            message: "Verification code sent to your email. Valid for 10 minutes."
        });

    } catch (err) {
        console.error("OTP send error:", err);
        res.status(500).json({ error: "Failed to send OTP" });
    }
});

// 2. Verify OTP (free, no Twilio)
app.post("/api/verification/verify-otp", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }

        const { otp_code } = req.body;

        if (!otp_code) {
            return res.status(400).json({ error: "OTP code is required" });
        }

        const verification = await db.query(
            `SELECT * FROM phone_verifications 
             WHERE user_id = ? AND otp_code = ? AND expires_at > NOW() AND verified = 0
             ORDER BY created_at DESC LIMIT 1`,
            [req.session.user.id, otp_code]
        );

        if (!verification || verification.length === 0) {
            return res.status(400).json({ error: "Invalid or expired OTP code" });
        }

        // Mark phone as verified
        await db.query(
            `UPDATE phone_verifications SET verified = 1 WHERE id = ?`,
            [verification[0].id]
        );

        // Update user with verified phone
        await db.query(
            `UPDATE users SET phone_verified = 1, phone_number = ? WHERE id = ?`,
            [verification[0].phone_number, req.session.user.id]
        );

        res.json({
            success: true,
            message: "Phone number verified successfully!"
        });

    } catch (err) {
        console.error("OTP verify error:", err);
        res.status(500).json({ error: "Failed to verify OTP" });
    }
});

// 3. Auto-verify seller (no admin review)
app.post("/api/verification/auto-verify", uploadVerification.fields([
    { name: 'government_id', maxCount: 1 },
    { name: 'selfie_with_id', maxCount: 1 },
    { name: 'address_proof', maxCount: 1 },
    { name: 'business_certificate', maxCount: 1 },
    { name: 'tax_id_document', maxCount: 1 }
]), async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }

        const { verification_type, business_name, tax_id } = req.body;

        // Check if phone is verified first
        const phoneCheck = await db.query(
            "SELECT phone_verified FROM users WHERE id = ?",
            [req.session.user.id]
        );

        if (!phoneCheck[0]?.phone_verified) {
            return res.status(400).json({ error: "Please verify your phone number first" });
        }

        let documentsUploaded = 0;

        // Upload Government ID
        if (req.files['government_id']) {
            const file = req.files['government_id'][0];
            const url = await uploadToImgbb(file.path, file.originalname);
            await db.query(
                `INSERT INTO verification_documents (user_id, document_type, document_url, uploaded_at)
                 VALUES (?, 'government_id', ?, NOW())`,
                [req.session.user.id, url]
            );
            documentsUploaded++;
        } else {
            return res.status(400).json({ error: "Government ID is required" });
        }

        // Upload Selfie with ID
        if (req.files['selfie_with_id']) {
            const file = req.files['selfie_with_id'][0];
            const url = await uploadToImgbb(file.path, file.originalname);
            await db.query(
                `INSERT INTO verification_documents (user_id, document_type, document_url, uploaded_at)
                 VALUES (?, 'selfie_with_id', ?, NOW())`,
                [req.session.user.id, url]
            );
            documentsUploaded++;
        } else {
            return res.status(400).json({ error: "Selfie with ID is required" });
        }

        // Upload Address Proof
        if (req.files['address_proof']) {
            const file = req.files['address_proof'][0];
            const url = await uploadToImgbb(file.path, file.originalname);
            await db.query(
                `INSERT INTO verification_documents (user_id, document_type, document_url, uploaded_at)
                 VALUES (?, 'address_proof', ?, NOW())`,
                [req.session.user.id, url]
            );
            documentsUploaded++;
        } else {
            return res.status(400).json({ error: "Proof of address is required" });
        }

        // Optional business documents
        if (verification_type === 'business') {
            if (req.files['business_certificate']) {
                const file = req.files['business_certificate'][0];
                const url = await uploadToImgbb(file.path, file.originalname);
                await db.query(
                    `INSERT INTO verification_documents (user_id, document_type, document_url, uploaded_at)
                     VALUES (?, 'business_certificate', ?, NOW())`,
                    [req.session.user.id, url]
                );
                documentsUploaded++;
            }
            
            if (req.files['tax_id_document']) {
                const file = req.files['tax_id_document'][0];
                const url = await uploadToImgbb(file.path, file.originalname);
                await db.query(
                    `INSERT INTO verification_documents (user_id, document_type, document_url, uploaded_at)
                     VALUES (?, 'tax_id', ?, NOW())`,
                    [req.session.user.id, url]
                );
                documentsUploaded++;
            }
        }

        // AUTO-VERIFY - No admin review needed
        await db.query(
            `UPDATE users 
             SET verification_status = 'verified',
                 verification_type = ?,
                 verified_at = NOW()
             WHERE id = ?`,
            [verification_type || 'individual', req.session.user.id]
        );

        // Send welcome email
        const welcomeHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Welcome Seller - Core Insight Market</title></head>
            <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
                <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                    <h1 style="color:#10b981;">✅ Verification Complete!</h1>
                    <p>Hello ${req.session.user.username},</p>
                    <p>Congratulations! Your seller account has been automatically verified.</p>
                    <p>You can now list products and start selling on Core Insight Market.</p>
                    <a href="https://coreinsightmarket.com/products.html" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:20px;">Start Selling</a>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail(req.session.user.email, "Welcome to Core Insight Market - Seller", welcomeHtml);

        res.json({
            success: true,
            message: "Verification complete! You can now start selling.",
            documents_uploaded: documentsUploaded,
            verified: true
        });

    } catch (err) {
        console.error("Auto-verify error:", err);
        res.status(500).json({ error: err.message });
    }
});



// 4. Check verification status
app.get("/api/verification/status", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }

        const user = await db.query(
            `SELECT verification_status, verification_type, verified_at, phone_verified, phone_number
             FROM users WHERE id = ?`,
            [req.session.user.id]
        );

        const documents = await db.query(
            `SELECT document_type, document_url, uploaded_at
             FROM verification_documents WHERE user_id = ?`,
            [req.session.user.id]
        );

        res.json({
            success: true,
            status: user[0]?.verification_status || 'unverified',
            verification_type: user[0]?.verification_type,
            verified_at: user[0]?.verified_at,
            phone_verified: user[0]?.phone_verified === 1,
            phone_number: user[0]?.phone_number,
            documents_uploaded: documents.length
        });

    } catch (err) {
        console.error("Status check error:", err);
        res.status(500).json({ error: err.message });
    }
});
// ============================================
// EMAIL VERIFICATION ENDPOINT
// ============================================

app.post("/api/verify", async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ success: false, error: "Verification token is required" });
        }
        
        // Find user with this token that hasn't expired
        const users = await db.query(
            "SELECT * FROM users WHERE verify_token = ? AND verify_token_expiry > NOW()",
            [token]
        );
        
        let user = null;
        if (Array.isArray(users)) {
            if (users.length === 2 && Array.isArray(users[0])) {
                user = users[0][0];
            } else if (users.length > 0) {
                user = users[0];
            }
        }
        
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                error: "Invalid or expired verification token. Please request a new verification email." 
            });
        }
        
        // Update user as verified
        await db.query(
            "UPDATE users SET verified = 1, verify_token = NULL, verify_token_expiry = NULL WHERE id = ?",
            [user.id]
        );
        
        console.log(`✅ User ${user.email} verified successfully`);
        
        res.json({ 
            success: true, 
            message: "Email verified successfully! You can now log in." 
        });
        
    } catch (err) {
        console.error("❌ Verification error:", err);
        res.status(500).json({ 
            success: false, 
            error: "Server error during verification. Please try again." 
        });
    }
});

// Resend verification email endpoint
app.post("/api/resend-verification", async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, error: "Email is required" });
        }
        
        // Find unverified user
        const users = await db.query(
            "SELECT * FROM users WHERE email = ? AND verified = 0",
            [email]
        );
        
        let user = null;
        if (Array.isArray(users)) {
            if (users.length === 2 && Array.isArray(users[0])) {
                user = users[0][0];
            } else if (users.length > 0) {
                user = users[0];
            }
        }
        
        if (!user) {
            // Don't reveal if user exists or not for security
            return res.json({ 
                success: true, 
                message: "If an unverified account exists with that email, a new verification link has been sent." 
            });
        }
        
        // Generate new token
        const newToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + 24);
        
        await db.query(
            "UPDATE users SET verify_token = ?, verify_token_expiry = ? WHERE id = ?",
            [newToken, tokenExpiry, user.id]
        );
        
        // Send new verification email
        const verifyLink = `https://core-insight-7.onrender.com/verify.html?token=${newToken}`;
        const emailHtml = getVerificationEmailTemplate(user.username, verifyLink);
        
        await sendEmail(email, "Verify Your Email - Core Insight", emailHtml);
        
        res.json({ 
            success: true, 
            message: "A new verification link has been sent to your email." 
        });
        
    } catch (err) {
        console.error("❌ Resend verification error:", err);
        res.status(500).json({ success: false, error: "Failed to resend verification email." });
    }
});

// ============================================
// ROUTES - AUTHENTICATION (keep existing)
// ============================================
// ============================================
// ROUTES - AUTHENTICATION
// ============================================
// Updated signup route with proper trial dates for freelancers
app.post("/api/signup", async (req, res) => {
    try {
        const { username, password, email, role } = req.body;
        
        console.log("📝 Signup attempt:", { username, email, role });
        
        // Validation
        if (!username || !password || !email) {
            return res.status(400).json({ error: "Username, email, and password are required" });
        }
        
        let userRole = role || 'client';
        if (!['client', 'freelancer', 'admin'].includes(userRole)) {
            return res.status(400).json({ error: "Invalid role" });
        }
        
        // Check existing user
        const existingUsers = await db.query(
            "SELECT id FROM users WHERE username = ? OR email = ?", 
            [username, email]
        );
        
        if (existingUsers && existingUsers.length > 0) {
            return res.status(400).json({ error: "Username or email already exists" });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const verifyToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + 24);
        
        // Calculate trial dates for freelancers
        let trialStartDate = null;
        let trialEndDate = null;
        let subscriptionStatus = 'active';
        let subscriptionPlan = null;
        
        if (userRole === 'freelancer') {
            trialStartDate = new Date();
            trialEndDate = new Date();
            trialEndDate.setDate(trialEndDate.getDate() + 90); // 90 days free trial
            subscriptionPlan = 'free_trial';
        }
        
        // Insert user
        const result = await db.query(
            `INSERT INTO users (
                username, email, password, role, verified, 
                verify_token, verify_token_expiry,
                subscription_status, subscription_plan, 
                trial_start_date, trial_end_date, created_at
            ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                username, email, hashedPassword, userRole, 
                verifyToken, tokenExpiry,
                subscriptionStatus, subscriptionPlan,
                trialStartDate, trialEndDate
            ]
        );
        
        const userId = result.insertId;
        console.log(`✅ User created with ID: ${userId} (Role: ${userRole})`);
        
        // If freelancer, create freelancer profile with trial info
        if (userRole === 'freelancer') {
            await db.query(
                `INSERT INTO freelancer_profiles (
                    user_id, subscription_status, trial_days_remaining, 
                    headline, created_at
                ) VALUES (?, 'free_trial', 90, 'Professional Freelancer', NOW())`,
                [userId]
            );
        }
        
        // Send verification email
        const verifyLink = `https://coreinsightmarket.com/verify.html?token=${verifyToken}`;
        
        const emailHtml = getVerificationEmailTemplate(username, verifyLink);
        
        const emailResult = await sendVerificationEmail(email, "Verify Your Email - Core Insight", emailHtml);
        
        const message = userRole === 'freelancer' 
            ? "Account created! You have 90 days free trial. Please check your email to verify your account."
            : "Account created! Please check your email to verify your account.";
        
        res.json({ 
            message: message,
            requiresVerification: true,
            trial_days: userRole === 'freelancer' ? 90 : null,
            userId: userId
        });
        
    } catch (err) {
        console.error("❌ Signup error:", err);
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: "Username or email already exists" });
        } else {
            res.status(500).json({ error: "Registration failed. Please try again." });
        }
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

    if (result.affectedRows > 0) {
      const resetLink = `https://coreinsightmarket.com/reset-password.html?token=${token}`;
      
      // Create HTML email
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Reset Your Password</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; }
            .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 30px; text-align: center; }
            .header h1 { margin: 0; color: white; }
            .content { padding: 30px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
            .footer { background: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
            .warning { background: #f59e0b20; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Reset Your Password</h1>
            </div>
            <div class="content">
              <p>We received a request to reset your password for your Core Insight account.</p>
              <div style="text-align: center;">
                <a href="${resetLink}" class="button">Reset Password</a>
              </div>
              <div class="warning">
                <strong>⚠️ This link expires in 1 hour.</strong><br>
                If you didn't request this, you can safely ignore this email.
              </div>
              <p>Or copy and paste this link:<br>
              <small style="color: #94a3b8; word-break: break-all;">${resetLink}</small></p>
            </div>
            <div class="footer">
              <p>Core Insight Marketplace<br>Need help? Contact support@coreinsightmarket.com</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      // Use Brevo email function
      await sendEmail(email, "Reset Your Core Insight Password", emailHtml);
    }

    res.json({ success: true, message: responseMessage });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, message: "An error occurred. Please try again later." });
  }
});

app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;
  
  console.log("🔐 Reset password attempt - Token received:", token ? token.substring(0, 20) + "..." : "NO TOKEN");
  
  if (!token || !password) {
    return res.status(400).json({ success: false, error: "Token and password are required" });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
  }

  try {
    // Check if token exists and is not expired
    const users = await db.query(
      "SELECT id, email, username FROM users WHERE reset_token = ? AND reset_expires > NOW()",
      [token]
    );
    
    console.log("📊 Query result:", users ? (users.length + " users found") : "No results");

    if (!users || users.length === 0) {
      // Check if token exists but expired
      const expiredToken = await db.query(
        "SELECT id FROM users WHERE reset_token = ? AND reset_expires <= NOW()",
        [token]
      );
      
      if (expiredToken && expiredToken.length > 0) {
        return res.status(400).json({ success: false, error: "Reset link has expired. Please request a new one." });
      }
      
      return res.status(400).json({ success: false, error: "Invalid or expired reset token" });
    }

    const user = users[0];
    console.log(`✅ Valid token found for user: ${user.email}`);

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update password and clear reset token
    await db.query(
      "UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?",
      [hashedPassword, user.id]
    );

    console.log(`✅ Password reset successful for user: ${user.email}`);

    // Send confirmation email
    const confirmationHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Password Changed - Core Insight</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a192f; color: #e6f1ff; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          .header { text-align: center; border-bottom: 1px solid #334155; padding-bottom: 20px; margin-bottom: 20px; }
          h1 { color: #10b981; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Password Changed Successfully</h1>
          </div>
          <p>Hello ${user.username},</p>
          <p>Your password has been successfully changed.</p>
          <p>If you did not make this change, please contact support immediately.</p>
          <p style="margin-top: 20px;">- Core Insight Team</p>
        </div>
      </body>
      </html>
    `;
    
    await sendEmail(user.email, "Your Password Has Been Changed", confirmationHtml).catch(err => {
      console.error("Confirmation email failed:", err.message);
    });

    res.json({ success: true, message: "Password reset successfully! Redirecting to login..." });
    
  } catch (err) {
    console.error("❌ Reset password error:", err);
    res.status(500).json({ success: false, error: "Error resetting password. Please try again." });
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
app.get("/api/debug/flutterwave-test", async (req, res) => {
  try {
    console.log("🔧 Testing Flutterwave connection...");
    
    const testRef = "test_" + Date.now();
    
    const payload = {
      tx_ref: testRef,
      amount: 0.50,
      currency: "USD",
      redirect_url: "https://coreinsightmarket.com/payment-callback.html",
      customer: {
        email: "test@example.com",
        name: "Test User",
      },
      customizations: {
        title: "Test Payment",
        description: "Testing Flutterwave",
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
        timeout: 30000
      }
    );
    
    res.json({
      success: true,
      message: "Flutterwave is working!",
      paymentLink: response.data.data?.link,
      response: response.data
    });
    
  } catch (err) {
    console.error("❌ Test failed:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
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
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT 
        c.*, 
        u.username as author_name,
        u.role as user_role,
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

// =================== COURSE DOWNLOAD - UPDATED FOR IMGBB ===================
app.get('/api/download/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.session?.user?.id;
    
    console.log(`📥 Download request for course ${courseId}`);
    
    if (!userId) {
      return res.status(401).json({ error: 'Please login first' });
    }
    
    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    
    if (!courses || courses.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const course = courses[0];
    
    // Check access (free or purchased)
    const isFree = course.price === 0 || course.type === 'free';
    
    if (!isFree) {
      const purchases = await db.query(
        'SELECT * FROM user_courses WHERE course_id = ? AND user_id = ? AND payment_status = "completed"',
        [courseId, userId]
      );
      
      if (!purchases || purchases.length === 0) {
        return res.status(403).json({ error: 'You do not have access to this course' });
      }
    }
    
    const fileUrl = course.file_url;
    
    if (!fileUrl) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // For ImgBB URLs - just redirect or provide the link
    if (fileUrl.includes('imgbb.com') || fileUrl.includes('i.ibb.co')) {
      console.log(`✅ Redirecting to ImgBB file: ${fileUrl}`);
      // Option 1: Redirect directly to ImgBB
      return res.redirect(fileUrl);
      
      // Option 2: If you want to force download instead of redirect:
      // return res.json({ 
      //   download_url: fileUrl,
      //   message: 'Click the link to download your course'
      // });
    }
    
    // For local files (fallback)
    if (fileUrl.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, fileUrl);
      if (fs.existsSync(localPath)) {
        return res.download(localPath, `${course.title}.pdf`);
      }
    }
    
    // If it's a generic HTTP URL
    if (fileUrl.startsWith('http')) {
      return res.redirect(fileUrl);
    }
    
    res.status(404).json({ error: 'File not found' });
    
  } catch (error) {
    console.error('❌ Download error:', error);
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

// Course Upload (File + Thumbnail) - USING SMART UPLOAD
app.post("/api/courses", uploadCourse, async (req, res) => {
  try {
    console.log('📚 Course upload started with smart upload...');
    
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login to upload courses" });
    }

    const { title, description, price, author, content_type } = req.body;
    
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: "Title is required" });
    }

    if (!req.files?.file || !req.files?.file[0]) {
      return res.status(400).json({ error: "Course file is required" });
    }

    if (!req.files?.thumbnail || !req.files?.thumbnail[0]) {
      return res.status(400).json({ error: "Thumbnail image is required" });
    }

    // ✅ UPLOAD COURSE FILE - USE SMART UPLOAD (auto-detects file type)
    const courseFile = req.files.file[0];
    const fileUrl = await uploadSmartFile(courseFile.path, courseFile.originalname);  // ✅ SMART UPLOAD
    
    // ✅ UPLOAD THUMBNAIL - Use ImgBB directly (it's an image)
    const thumbnailFile = req.files.thumbnail[0];
    const thumbnailUrl = await uploadToImgbb(thumbnailFile.path, thumbnailFile.originalname);
    
    console.log(`✅ Course file uploaded to: ${fileUrl.substring(0, 60)}...`);
    console.log(`✅ Thumbnail uploaded to: ${thumbnailUrl.substring(0, 60)}...`);

    // Store in database
    const result = await db.query(
      `INSERT INTO courses (
        title, description, file_url, thumbnail_url,
        price, type, user_id, author, content_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        title.trim(),
        description ? description.trim() : '',
        fileUrl,
        thumbnailUrl,
        parseFloat(price) || 0,
        (parseFloat(price) > 0) ? 'paid' : 'free',
        req.session.user.id,
        author || req.session.user.username,
        content_type || 'book'
      ]
    );

    res.json({
      success: true,
      message: "✅ Course uploaded successfully!",
      courseId: result.insertId,
      file_url: fileUrl,
      thumbnail_url: thumbnailUrl,
      download_url: `/api/download/${result.insertId}`
    });

  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ error: "Error uploading course: " + err.message });
  }
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

    // Get course from database
    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    
    let course = null;
    if (courses && courses.length > 0) {
      course = courses[0];
    }

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const priceInNGN = parseFloat(course.price);
    
    if (isNaN(priceInNGN) || priceInNGN <= 0) {
      return res.status(400).json({ error: "Invalid course price" });
    }

    if (!process.env.FLW_SECRET_KEY) {
      return res.status(500).json({ error: "Payment system not configured." });
    }
    
    // ✅ Get user's country from IP address
    let userCountry = 'NG'; // Default to Nigeria
    let currency = "NGN";
    let amount = priceInNGN;
    let paymentOptions = "card, account, banktransfer, ussd, mobilemoney, qr, barter";
    
    try {
      // Get client IP address
      const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      
      // Use free IP geolocation API
      const geoResponse = await axios.get(`http://ip-api.com/json/${userIp}`, { 
        timeout: 3000 
      });
      
      if (geoResponse.data && geoResponse.data.countryCode) {
        userCountry = geoResponse.data.countryCode;
        console.log(`🌍 User country detected: ${userCountry}`);
      }
    } catch (geoError) {
      console.log('Could not detect country, defaulting to Nigeria');
    }
    
    // ✅ Set currency based on user's country
    if (userCountry === 'NG') {
      // Nigerian users - pay in NGN with all local methods
      currency = "NGN";
      amount = priceInNGN;
      paymentOptions = "card, account, banktransfer, ussd, mobilemoney, qr, barter";
      console.log(`💰 Nigerian user - Paying ${amount} NGN with local payment methods`);
    } else {
      // International users - pay in USD
      currency = "USD";
      paymentOptions = "card";
      
      // Convert NGN to USD
      let usdRate = 1500;
      try {
        const rates = await getExchangeRate();
        usdRate = rates.USD_TO_NGN || 1500;
      } catch (rateErr) {
        console.error('Rate fetch error, using fallback:', rateErr.message);
      }
      
      let amountInUSD = priceInNGN / usdRate;
      amount = Math.round(amountInUSD * 100) / 100;
      
      if (amount < 0.50) {
        amount = 0.50;
      }
      console.log(`💰 International user (${userCountry}) - Paying ${amount} USD`);
    }
    
    const transaction_ref = `coreinsight_${Date.now()}_${courseId}`;
    
    // ✅ Build payload
    const payload = {
      tx_ref: transaction_ref,
      amount: amount,
      currency: currency,
      redirect_url: "https://coreinsightmarket.com/payment-callback.html",
      customer: {
        email: req.session.user.email,
        name: req.session.user.username,
      },
      customizations: {
        title: "Core Insight Course",
        description: course.title.substring(0, 50),
      },
      payment_options: paymentOptions,
      meta: {
        course_id: courseId,
        user_id: req.session.user.id,
        price_ngn: priceInNGN,
        user_country: userCountry
      }
    };
    
    console.log('📤 Payment payload:', JSON.stringify(payload, null, 2));
    
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    if (response.data.status === "success" && response.data.data && response.data.data.link) {
      console.log(`✅ Payment link created in ${currency}`);
      
      // Store payment record
      await db.query(
        `INSERT INTO payments (user_id, course_id, transaction_ref, amount, currency, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
        [req.session.user.id, courseId, transaction_ref, amount, currency]
      );
      
      res.json({
        status: "success",
        paymentLink: response.data.data.link,
        transactionRef: transaction_ref,
        amount: amount,
        currency: currency
      });
    } else {
      console.error('❌ Flutterwave error:', response.data);
      res.status(500).json({ error: response.data.message || "Payment initiation failed" });
    }
    
  } catch (err) {
    console.error('❌ Payment error:', err.message);
    res.status(500).json({ error: "Error initiating payment: " + err.message });
  }
});
app.get('/api/debug/course-file/:courseId', async (req, res) => {
    try {
        const courseId = req.params.courseId;
        const course = await db.query('SELECT id, title, file_url FROM courses WHERE id = ?', [courseId]);
        
        if (!course || course.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }
        
        const fileUrl = course[0].file_url;
        
        // Test if the URL is accessible
        let urlAccessible = false;
        let urlError = null;
        
        if (fileUrl) {
            try {
                const testResponse = await axios.head(fileUrl, { timeout: 5000 });
                urlAccessible = testResponse.status === 200;
            } catch (err) {
                urlError = err.message;
            }
        }
        
        res.json({
            course_id: courseId,
            title: course[0].title,
            file_url: fileUrl,
            url_accessibile: urlAccessible,
            url_error: urlError,
            expected_format: `https://${process.env.B2_BUCKET_ENDPOINT}/file/${process.env.B2_BUCKET_NAME}/[filename]`
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
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
    
    console.log('🔍 Verifying course payment by reference:', tx_ref);
    
    // Check if already verified in database
    const paymentResult = await db.query(
      "SELECT * FROM payments WHERE transaction_ref = ?",
      [tx_ref]
    );
    
    let payment = null;
    if (paymentResult && paymentResult.length > 0) {
      payment = paymentResult[0];
    }
    
    if (payment && payment.status === 'completed') {
      // Get course details
      const courseResult = await db.query(
        "SELECT title, id FROM courses WHERE id = ?",
        [payment.course_id]
      );
      
      let courseTitle = 'Your course';
      let isVideo = false;
      if (courseResult && courseResult.length > 0) {
        courseTitle = courseResult[0].title;
        // Check if video course
        const fileUrl = courseResult[0].file_url || '';
        isVideo = fileUrl.match(/\.(mp4|mov|avi|mkv|webm)$/i) ? true : false;
      }
      
      return res.json({
        status: "success",
        message: "Payment already verified",
        type: "course",
        course_id: payment.course_id,
        course_title: courseTitle,
        amount: payment.amount,
        is_video: isVideo
      });
    }
    
    // Verify with Flutterwave
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        },
        timeout: 15000
      }
    );
    
    if (response.data.status === "success" && response.data.data.status === "successful") {
      const transaction = response.data.data;
      const amount = transaction.amount;
      const courseId = transaction.meta?.course_id;
      const userId = transaction.meta?.user_id;
      
      console.log('✅ Course payment verified:', { tx_ref, amount, courseId, userId });
      
      // Update payment record
      await db.query(
        `UPDATE payments 
         SET status = 'completed', 
             transaction_id = ?,
             flutterwave_response = ?,
             completed_at = NOW()
         WHERE transaction_ref = ?`,
        [transaction.id, JSON.stringify(transaction), tx_ref]
      );
      
      // Grant course access
      await db.query(
        `INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at)
         VALUES (?, ?, 'completed', NOW())
         ON DUPLICATE KEY UPDATE payment_status = 'completed', purchased_at = NOW()`,
        [userId, courseId]
      );
      
      // Get course details
      const courseResult = await db.query(
        "SELECT title, file_url FROM courses WHERE id = ?",
        [courseId]
      );
      
      let courseTitle = 'Your course';
      let isVideo = false;
      if (courseResult && courseResult.length > 0) {
        courseTitle = courseResult[0].title;
        const fileUrl = courseResult[0].file_url || '';
        isVideo = fileUrl.match(/\.(mp4|mov|avi|mkv|webm)$/i) ? true : false;
      }
      
      res.json({
        status: "success",
        message: "Payment verified successfully",
        type: "course",
        course_id: courseId,
        course_title: courseTitle,
        amount: amount,
        is_video: isVideo
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

// ============================================
// SHARE PRODUCT API ENDPOINTS
// ============================================

// Get product by ID for sharing (public endpoint - no login required)
app.get("/api/products/shared/:id", async (req, res) => {
    try {
        const productId = req.params.id;
        
        const productResult = await db.query(`
            SELECT 
                p.*,
                u.username as seller_name,
                u.email as seller_email
            FROM products p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.id = ? AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
        `, [productId]);
        
        if (!productResult || productResult.length === 0) {
            return res.status(404).json({ error: "Product not found" });
        }
        
        const product = productResult[0];
        
        // Parse images
        let imageUrls = [];
        if (product.image_urls) {
            try {
                if (typeof product.image_urls === 'string') {
                    if (product.image_urls.startsWith('[')) {
                        imageUrls = JSON.parse(product.image_urls);
                    } else {
                        imageUrls = [product.image_urls];
                    }
                } else if (Array.isArray(product.image_urls)) {
                    imageUrls = product.image_urls;
                }
            } catch (e) {
                imageUrls = [];
            }
        }
        
        product.images = imageUrls;
        product.price = parseFloat(product.price);
        product.original_price = parseFloat(product.original_price) || product.price;
        
        res.json({
            success: true,
            product: product
        });
        
    } catch (err) {
        console.error("Error fetching shared product:", err);
        res.status(500).json({ error: err.message });
    }
});

// Generate share token for product (authenticated)
app.post("/api/products/:id/share-token", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login to generate share link" });
        }
        
        const productId = req.params.id;
        const userId = req.session.user.id;
        
        // Verify product ownership
        const productCheck = await db.query(
            "SELECT id, user_id, title FROM products WHERE id = ? AND user_id = ?",
            [productId, userId]
        );
        
        if (!productCheck || productCheck.length === 0) {
            return res.status(403).json({ error: "You can only share your own products" });
        }
        
        // Generate unique share token
        const shareToken = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry
        
        // Store share token
        await db.query(
            `INSERT INTO product_share_tokens (product_id, user_id, share_token, expires_at, created_at)
             VALUES (?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE share_token = ?, expires_at = ?, updated_at = NOW()`,
            [productId, userId, shareToken, expiresAt, shareToken, expiresAt]
        );
        
        const shareUrl = `https://coreinsightmarket.com/product-share.html?token=${shareToken}`;
        
        // Update product share count
        await db.query(
            "UPDATE products SET share_count = share_count + 1 WHERE id = ?",
            [productId]
        );
        
        res.json({
            success: true,
            shareUrl: shareUrl,
            shareToken: shareToken,
            expiresAt: expiresAt,
            productTitle: productCheck[0].title
        });
        
    } catch (err) {
        console.error("Error generating share token:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get product by share token (public)
app.get("/api/products/by-share-token/:token", async (req, res) => {
    try {
        const shareToken = req.params.token;
        
        const tokenResult = await db.query(`
            SELECT pst.*, p.*, u.username as seller_name
            FROM product_share_tokens pst
            JOIN products p ON pst.product_id = p.id
            LEFT JOIN users u ON p.user_id = u.id
            WHERE pst.share_token = ? AND pst.expires_at > NOW()
        `, [shareToken]);
        
        if (!tokenResult || tokenResult.length === 0) {
            return res.status(404).json({ error: "Invalid or expired share link" });
        }
        
        const product = tokenResult[0];
        
        // Parse images
        let imageUrls = [];
        if (product.image_urls) {
            try {
                if (typeof product.image_urls === 'string') {
                    if (product.image_urls.startsWith('[')) {
                        imageUrls = JSON.parse(product.image_urls);
                    } else {
                        imageUrls = [product.image_urls];
                    }
                } else if (Array.isArray(product.image_urls)) {
                    imageUrls = product.image_urls;
                }
            } catch (e) {
                imageUrls = [];
            }
        }
        
        product.images = imageUrls;
        product.price = parseFloat(product.price);
        product.original_price = parseFloat(product.original_price) || product.price;
        
        // Track share click
        await db.query(
            "UPDATE product_share_tokens SET click_count = click_count + 1 WHERE share_token = ?",
            [shareToken]
        );
        
        res.json({
            success: true,
            product: product,
            shareStats: {
                clicks: tokenResult[0].click_count || 0,
                expiresAt: tokenResult[0].expires_at
            }
        });
        
    } catch (err) {
        console.error("Error fetching product by share token:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get share statistics for seller's products
app.get("/api/products/share-stats", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const userId = req.session.user.id;
        
        const stats = await db.query(`
            SELECT 
                p.id,
                p.title,
                p.share_count,
                pst.share_token,
                pst.click_count,
                pst.created_at as token_created,
                pst.expires_at,
                pst.updated_at
            FROM products p
            LEFT JOIN product_share_tokens pst ON p.id = pst.product_id
            WHERE p.user_id = ?
            ORDER BY p.share_count DESC
        `, [userId]);
        
        res.json({
            success: true,
            stats: stats || []
        });
        
    } catch (err) {
        console.error("Error fetching share stats:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/seller/notifications/:id/read", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const notificationId = req.params.id;
        const sellerId = req.session.user.id;
        
        await db.query(
            "UPDATE seller_notifications SET is_read = 1 WHERE id = ? AND seller_id = ?",
            [notificationId, sellerId]
        );
        
        res.json({ success: true });
        
    } catch (err) {
        console.error("Error marking notification read:", err);
        res.status(500).json({ error: err.message });
    }
});


app.get("/api/seller/notifications", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }

        const sellerId = req.session.user.id;
        
        // Get unread count
        const unreadResult = await db.query(
            "SELECT COUNT(*) as count FROM seller_notifications WHERE seller_id = ? AND is_read = 0",
            [sellerId]
        );
        
        // Get recent notifications (last 50)
        const notifications = await db.query(
            `SELECT id, notification_type, title, message, is_read, created_at 
             FROM seller_notifications 
             WHERE seller_id = ? 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [sellerId]
        );
        
        res.json({
            success: true,
            unreadCount: unreadResult[0]?.count || 0,
            notifications: notifications || []
        });
        
    } catch (err) {
        console.error("Error fetching seller notifications:", err);
        // Return empty data instead of error to prevent frontend crashes
        res.json({ 
            success: false, 
            unreadCount: 0, 
            notifications: [],
            error: err.message 
        });
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
// =================== DELETE SERVICE ===================
app.delete("/api/services/:id", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }

        const serviceId = parseInt(req.params.id);
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        const { reason } = req.body;

        console.log(`🗑️ Delete request for service ${serviceId} by user ${userId} (${userRole})`);

        // Check if service exists and get ownership
        const serviceResult = await db.query(
            "SELECT id, user_id, title FROM services WHERE id = ?",
            [serviceId]
        );

        let service = null;
        if (Array.isArray(serviceResult) && serviceResult.length > 0) {
            service = serviceResult[0];
        }

        if (!service) {
            return res.status(404).json({ error: "Service not found" });
        }

        const isOwner = service.user_id === userId;
        const isAdmin = userRole === 'admin';

        // Check permission
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: "You can only delete your own services" });
        }

        // For freelancers (non-admin), check daily delete limit
        if (!isAdmin && userRole === 'freelancer') {
            try {
                const today = new Date().toISOString().split('T')[0];
                
                const deleteCountResult = await db.query(
                    `SELECT COUNT(*) as count FROM deleted_services 
                     WHERE deleted_by = ? AND DATE(deleted_at) = ?`,
                    [userId, today]
                );

                let deleteCount = 0;
                if (Array.isArray(deleteCountResult) && deleteCountResult.length > 0) {
                    deleteCount = deleteCountResult[0]?.count || 0;
                }

                if (deleteCount >= 3) {
                    return res.status(403).json({ 
                        error: "Daily delete limit reached (3 per day). Please try again tomorrow." 
                    });
                }
            } catch (limitErr) {
                console.error("Delete limit check error:", limitErr);
            }
        }

        // Log deletion in deleted_services table FIRST
        await db.query(
            `INSERT INTO deleted_services 
             (service_id, service_owner_id, service_title, deleted_by, deleted_by_role, reason, deleted_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [
                service.id, 
                service.user_id, 
                service.title,
                userId, 
                isAdmin ? 'admin' : 'freelancer', 
                reason || (isAdmin ? 'Deleted by admin' : 'Deleted by owner')
            ]
        );
        console.log(`✅ Logged deletion for service ${serviceId}`);

        // Delete service packages
        try {
            await db.query("DELETE FROM service_packages WHERE service_id = ?", [serviceId]);
        } catch (pkgErr) {
            console.log("No service_packages table or already deleted");
        }

        // Delete service favorites
        try {
            await db.query("DELETE FROM service_favorites WHERE service_id = ?", [serviceId]);
        } catch (favErr) {
            console.log("No service_favorites table or already deleted");
        }

        // Finally delete the service
        await db.query("DELETE FROM services WHERE id = ?", [serviceId]);
        console.log(`✅ Deleted service ${serviceId}`);

        res.json({
            success: true,
            message: "Service deleted successfully"
        });

    } catch (err) {
        console.error("❌ Delete service error:", err);
        res.status(500).json({ error: "Internal server error: " + err.message });
    }
});
// Search messages in conversation
app.get("/api/messages/:conversationId/search", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const conversationId = req.params.conversationId;
        const query = req.query.q;
        
        if (!query || query.length < 2) {
            return res.json([]);
        }
        
        // Check access
        const userId = req.session.user.id;
        const convCheck = await db.query(
            "SELECT id FROM conversations WHERE id = ? AND (client_id = ? OR freelancer_id = ?)",
            [conversationId, userId, userId]
        );
        
        if (!convCheck || convCheck.length === 0) {
            return res.status(403).json({ error: "Access denied" });
        }
        
        const messages = await db.query(
            `SELECT m.*, u.username as sender_name 
             FROM messages m
             JOIN users u ON m.sender_id = u.id
             WHERE m.conversation_id = ? 
             AND (m.message LIKE ? OR m.message LIKE ?)
             ORDER BY m.created_at DESC`,
            [conversationId, `%${query}%`, `%${query}%`]
        );
        
        res.json(messages || []);
        
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: err.message });
    }
});
app.get("/api/admin/all-flagged-users", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        // Get flagged freelancers - FIXED
        const flaggedFreelancers = await db.query(`
            SELECT 
                u.id,
                u.username,
                u.email,
                u.role,
                u.created_at,
                u.account_locked,
                (SELECT COUNT(*) FROM user_flags WHERE flagged_user_id = u.id AND status = 'pending') as flag_count,
                (SELECT GROUP_CONCAT(DISTINCT reason SEPARATOR ' | ') FROM user_flags WHERE flagged_user_id = u.id AND status = 'pending') as flag_reasons,
                (SELECT MAX(created_at) FROM user_flags WHERE flagged_user_id = u.id) as last_flag_date,
                ar.status as review_status,
                ar.freelancer_statement,
                ar.id as review_id
            FROM users u
            LEFT JOIN admin_reviews ar ON ar.user_id = u.id AND ar.user_type = 'freelancer'
            WHERE u.role = 'freelancer'
            HAVING flag_count > 0 OR review_status IS NOT NULL
            ORDER BY flag_count DESC, last_flag_date DESC
        `);

        // Get flagged clients - FIXED
        const flaggedClients = await db.query(`
            SELECT 
                u.id,
                u.username,
                u.email,
                u.role,
                u.created_at,
                u.account_locked,
                (SELECT COUNT(*) FROM client_flags WHERE client_id = u.id AND status = 'pending') as flag_count,
                (SELECT GROUP_CONCAT(DISTINCT reason SEPARATOR ' | ') FROM client_flags WHERE client_id = u.id AND status = 'pending') as flag_reasons,
                (SELECT MAX(created_at) FROM client_flags WHERE client_id = u.id) as last_flag_date,
                ar.status as review_status,
                ar.admin_notes,
                ar.id as review_id
            FROM users u
            LEFT JOIN admin_reviews ar ON ar.user_id = u.id AND ar.user_type = 'client'
            WHERE u.role = 'client'
            HAVING flag_count > 0 OR review_status IS NOT NULL
            ORDER BY flag_count DESC, last_flag_date DESC
        `);

        res.json({
            success: true,
            flagged_freelancers: flaggedFreelancers || [],
            flagged_clients: flaggedClients || [],
            total_freelancers: flaggedFreelancers?.length || 0,
            total_clients: flaggedClients?.length || 0
        });

    } catch (err) {
        console.error("Error fetching flagged users:", err);
        res.status(500).json({ error: err.message });
    }
});
// Get flag details for freelancer (show reasons)
app.get("/api/freelancer/flags", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const freelancerId = req.session.user.id;
        
        const flags = await db.query(`
            SELECT uf.*, u.username as flagged_by_name
            FROM user_flags uf
            JOIN users u ON uf.flagged_by_user_id = u.id
            WHERE uf.flagged_user_id = ? 
            ORDER BY uf.created_at DESC
        `, [freelancerId]);
        
        res.json({ flags: flags || [] });
        
    } catch (err) {
        console.error("Error fetching flags:", err);
        res.json({ flags: [] });
    }
});
// ==================== ADMIN GET DETAILED FLAGS FOR A SPECIFIC USER ====================
app.get("/api/admin/user-flags-details/:userId/:userType", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        const userId = req.params.userId;
        const userType = req.params.userType; // 'freelancer' or 'client'

        let flags = [];
        let userInfo = null;

        if (userType === 'freelancer') {
            // Get freelancer flags
            flags = await db.query(`
                SELECT 
                    uf.*,
                    u.username as flagged_by_name,
                    u.email as flagged_by_email,
                    s.title as service_title
                FROM user_flags uf
                LEFT JOIN users u ON uf.flagged_by_user_id = u.id
                LEFT JOIN services s ON uf.service_id = s.id
                WHERE uf.flagged_user_id = ?
                ORDER BY uf.created_at DESC
            `, [userId]);

            userInfo = await db.query(
                "SELECT id, username, email, role, created_at, account_locked FROM users WHERE id = ?",
                [userId]
            );
        } else {
            // Get client flags
            flags = await db.query(`
                SELECT 
                    cf.*,
                    u.username as flagged_by_name,
                    u.email as flagged_by_email,
                    s.title as service_title
                FROM client_flags cf
                LEFT JOIN users u ON cf.flagged_by_freelancer_id = u.id
                LEFT JOIN services s ON cf.service_id = s.id
                WHERE cf.client_id = ?
                ORDER BY cf.created_at DESC
            `, [userId]);

            userInfo = await db.query(
                "SELECT id, username, email, role, created_at, account_locked FROM users WHERE id = ?",
                [userId]
            );
        }

        // Get admin review record
        const review = await db.query(
            "SELECT * FROM admin_reviews WHERE user_id = ? AND user_type = ?",
            [userId, userType]
        );

        res.json({
            success: true,
            user: userInfo[0] || null,
            flags: flags || [],
            review: review[0] || null
        });

    } catch (err) {
        console.error("Error fetching flag details:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== ADMIN RESOLVE FLAGS (FOR BOTH TYPES) ====================
app.post("/api/admin/resolve-user-flags/:userId/:userType", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        const userId = req.params.userId;
        const userType = req.params.userType;
        const { action, admin_notes } = req.body;

        if (action === 'clear_flags') {
            // Mark all pending flags as reviewed
            if (userType === 'freelancer') {
                await db.query(
                    "UPDATE user_flags SET status = 'reviewed', updated_at = NOW() WHERE flagged_user_id = ? AND status = 'pending'",
                    [userId]
                );
            } else {
                await db.query(
                    "UPDATE client_flags SET status = 'reviewed', updated_at = NOW() WHERE client_id = ? AND status = 'pending'",
                    [userId]
                );
            }

            // Update or create admin review record
            await db.query(
                `INSERT INTO admin_reviews (user_id, user_type, status, admin_notes, reviewed_by, reviewed_at)
                 VALUES (?, ?, 'cleared', ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE 
                 status = 'cleared', admin_notes = ?, reviewed_by = ?, reviewed_at = NOW()`,
                [userId, userType, admin_notes, req.session.user.id, admin_notes, req.session.user.id]
            );

            // Unlock account if it was locked
            await db.query(
                "UPDATE users SET account_locked = 0, locked_at = NULL, lock_reason = NULL WHERE id = ?",
                [userId]
            );

            res.json({ success: true, message: "Flags cleared. User account restored." });

        } else if (action === 'suspend') {
            // Update admin review record
            await db.query(
                `INSERT INTO admin_reviews (user_id, user_type, status, admin_notes, reviewed_by, reviewed_at)
                 VALUES (?, ?, 'suspended', ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE 
                 status = 'suspended', admin_notes = ?, reviewed_by = ?, reviewed_at = NOW()`,
                [userId, userType, admin_notes, req.session.user.id, admin_notes, req.session.user.id]
            );

            // Lock the user's account
            await db.query(
                "UPDATE users SET account_locked = 1, locked_at = NOW(), lock_reason = ? WHERE id = ?",
                [admin_notes || "Suspended by admin after review", userId]
            );

            res.json({ success: true, message: "User account suspended." });

        } else if (action === 'warn') {
            // Issue a warning
            await db.query(
                `INSERT INTO user_warnings (user_id, warning_type, reason, issued_by, expires_at, created_at)
                 VALUES (?, 'flag', ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())`,
                [userId, admin_notes || "Warning issued after flag review", req.session.user.id]
            );

            res.json({ success: true, message: "Warning issued to user." });

        } else {
            res.status(400).json({ error: "Invalid action" });
        }

    } catch (err) {
        console.error("Error resolving flags:", err);
        res.status(500).json({ error: err.message });
    }
});
// Remove freelancer from client's list
app.post("/api/freelancer/remove", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const { freelancerId } = req.body;
        const clientId = req.session.user.id;

        if (req.session.user.role !== 'client') {
            return res.status(403).json({ error: "Only clients can remove freelancers" });
        }

        await db.query(
            "DELETE FROM client_providers WHERE client_id = ? AND freelancer_id = ?",
            [clientId, freelancerId]
        );

        res.json({
            success: true,
            message: "Freelancer removed from your list"
        });

    } catch (err) {
        console.error("Remove error:", err);
        res.status(500).json({ error: err.message });
    }
});
app.get("/api/user/delete-count", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const result = await db.query(
            "SELECT COUNT(*) as count FROM deleted_services WHERE deleted_by = ? AND DATE(deleted_at) = ?",
            [req.session.user.id, today]
        );
        
        res.json({ todayCount: result[0]?.count || 0 });
    } catch (err) {
        console.error("Error getting delete count:", err);
        res.json({ todayCount: 0 });
    }
});


// Profile Picture Upload
app.post("/api/freelancer/profile-picture", uploadProfilePicture, async (req, res) => {
  try {
    console.log("📸 Profile picture upload request received");
    
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: "Only image files are allowed" });
    }

    // Upload to ImgBB
    const imageUrl = await uploadToImgbb(req.file.path, req.file.originalname);
    console.log(`✅ Uploaded to ImgBB: ${imageUrl}`);

    // Update profile picture in database
    await db.query(
      `UPDATE freelancer_profiles 
       SET profile_picture_url = ?,
           profile_picture = ?,
           updated_at = NOW() 
       WHERE user_id = ?`,
      [imageUrl, imageUrl, req.session.user.id]
    );
    
    console.log(`✅ Updated profile picture for user ${req.session.user.id}`);
    
    res.json({
      success: true,
      message: "Profile picture updated successfully",
      profile_picture: imageUrl
    });
    
  } catch (err) {
    console.error("❌ Error uploading profile picture:", err);
    res.status(500).json({ error: "Error uploading profile picture: " + err.message });
  }
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
     VALUES (?, 'flag', ?, NOW())`,
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
// SELLER NOTIFICATIONS API
// ============================================





// Mark all seller notifications as read
app.post("/api/seller/notifications/mark-all-read", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        await db.query(
            "UPDATE seller_notifications SET is_read = 1 WHERE seller_id = ? AND is_read = 0",
            [req.session.user.id]
        );
        
        res.json({ success: true });
        
    } catch (err) {
        console.error("❌ Error marking all notifications read:", err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// BUYER NOTIFICATIONS API
// ============================================




// Mark all buyer notifications as read
app.post("/api/buyer/notifications/mark-all-read", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        await db.query(
            "UPDATE buyer_notifications SET is_read = 1 WHERE buyer_id = ? AND is_read = 0",
            [req.session.user.id]
        );
        
        res.json({ success: true });
        
    } catch (err) {
        console.error("❌ Error marking all notifications read:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get unread counts for both seller and buyer
app.get("/api/notifications/unread-counts", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ seller: 0, buyer: 0 });
        }
        
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        let sellerUnread = 0;
        let buyerUnread = 0;
        
        if (userRole === 'seller' || userRole === 'admin') {
            const sellerResult = await db.query(
                "SELECT COUNT(*) as count FROM seller_notifications WHERE seller_id = ? AND is_read = 0",
                [userId]
            );
            sellerUnread = sellerResult[0]?.count || 0;
        }
        
        if (userRole === 'client' || userRole === 'admin') {
            const buyerResult = await db.query(
                "SELECT COUNT(*) as count FROM buyer_notifications WHERE buyer_id = ? AND is_read = 0",
                [userId]
            );
            buyerUnread = buyerResult[0]?.count || 0;
        }
        
        res.json({
            success: true,
            seller_unread: sellerUnread,
            buyer_unread: buyerUnread,
            total_unread: sellerUnread + buyerUnread
        });
        
    } catch (err) {
        console.error("❌ Error getting unread counts:", err);
        res.json({ seller: 0, buyer: 0 });
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


// Admin resolve dispute endpoint
app.post("/api/admin/resolve-dispute/:orderId", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const orderId = req.params.orderId;
    const { decision, admin_notes, refund_amount } = req.body;
    
    const order = await db.query(
      `SELECT o.*, u_buyer.email as buyer_email, u_seller.email as seller_email
       FROM physical_orders o
       LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
       LEFT JOIN users u_seller ON o.seller_id = u_seller.id
       WHERE o.id = ?`,
      [orderId]
    );
    
    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const orderData = order[0];
    
    if (decision === 'customer_wins') {
      // Full refund to customer, seller gets nothing
      const refundAmount = refund_amount || orderData.total_amount;
      await processPaymentRefund(orderData);
      
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'refunded',
             refund_processed_at = NOW(),
             refund_approved_by = ?,
             admin_decision = 'customer_wins',
             admin_notes = ?,
             refund_amount = ?,
             admin_resolved_at = NOW()
         WHERE id = ?`,
        [req.session.user.id, admin_notes, refundAmount, orderId]
      );
      
      await sendEmail(orderData.buyer_email, `Dispute Resolved in Your Favor - Order #${orderId}`, `
        <h2>✅ Dispute Resolved - Refund Issued</h2>
        <p>After reviewing your dispute, we have decided in your favor.</p>
        <p>Refund Amount: $${refundAmount.toFixed(2)}</p>
        <p>Admin Notes: ${admin_notes}</p>
      `);
      
      await sendEmail(orderData.seller_email, `Dispute Resolved - Order #${orderId}`, `
        <h2>⚠️ Dispute Resolution</h2>
        <p>The dispute for Order #${orderId} has been resolved in the customer's favor.</p>
        <p>A refund of $${refundAmount.toFixed(2)} has been issued to the customer.</p>
        <p>Admin Notes: ${admin_notes}</p>
      `);
      
    } else if (decision === 'seller_wins') {
      // Release funds to seller, no refund
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'completed',
             funds_released_at = NOW(),
             admin_decision = 'seller_wins',
             admin_notes = ?,
             admin_resolved_at = NOW()
         WHERE id = ?`,
        [admin_notes, orderId]
      );
      
      await sendEmail(orderData.seller_email, `Dispute Resolved in Your Favor - Order #${orderId}`, `
        <h2>✅ Dispute Resolved - Funds Released</h2>
        <p>After reviewing the dispute, we have decided in your favor.</p>
        <p>$${orderData.seller_earnings} has been released to your account.</p>
        <p>Admin Notes: ${admin_notes}</p>
      `);
      
      await sendEmail(orderData.buyer_email, `Dispute Resolution - Order #${orderId}`, `
        <h2>⚠️ Dispute Resolution</h2>
        <p>After reviewing your dispute, we have decided in the seller's favor.</p>
        <p>No refund will be issued.</p>
        <p>Admin Notes: ${admin_notes}</p>
      `);
      
    } else if (decision === 'split') {
      // Split the loss between platform and seller
      const splitAmount = refund_amount || (orderData.total_amount * 0.5);
      
      await processPaymentRefund({ ...orderData, total_amount: splitAmount });
      
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'refunded',
             refund_processed_at = NOW(),
             refund_approved_by = ?,
             admin_decision = 'split',
             admin_notes = ?,
             refund_amount = ?,
             admin_resolved_at = NOW()
         WHERE id = ?`,
        [req.session.user.id, admin_notes, splitAmount, orderId]
      );
      
      // Notify both parties
      await sendEmail(orderData.buyer_email, `Dispute Resolution - Partial Refund - Order #${orderId}`, `
        <h2>⚠️ Dispute Resolution - Partial Refund</h2>
        <p>After reviewing the dispute, we have issued a partial refund.</p>
        <p>Refund Amount: $${splitAmount.toFixed(2)}</p>
        <p>Admin Notes: ${admin_notes}</p>
      `);
      
      await sendEmail(orderData.seller_email, `Dispute Resolution - Partial Refund - Order #${orderId}`, `
        <h2>⚠️ Dispute Resolution - Partial Refund Issued</h2>
        <p>A partial refund of $${splitAmount.toFixed(2)} has been issued to the customer.</p>
        <p>You will receive the remaining balance.</p>
        <p>Admin Notes: ${admin_notes}</p>
      `);
    }
    
    // Update dispute record
    await db.query(
      `UPDATE refund_disputes 
       SET status = 'resolved', 
           resolved_at = NOW(), 
           final_decision = ?,
           assigned_admin_id = ?
       WHERE order_id = ?`,
      [decision, req.session.user.id, orderId]
    );
    
    res.json({
      success: true,
      message: `Dispute resolved: ${decision}`,
      decision: decision
    });
    
  } catch (err) {
    console.error("Admin resolve error:", err);
    res.status(500).json({ error: err.message });
  }
});
// Helper function for sellers to compare returned product
app.get("/api/order/:orderId/inspection-guide", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    
    const product = await db.query(`
      SELECT p.condition_type, p.condition_description, p.visible_defects, 
             p.accessories_included, p.original_packaging,
             o.product_name, o.id as order_id
      FROM products p
      JOIN physical_orders o ON p.id = o.product_id
      WHERE o.id = ? AND o.seller_id = ?
    `, [orderId, req.session.user.id]);
    
    if (!product || product.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const inspectionGuide = `
      <div class="inspection-guide">
        <h3>📋 Return Inspection Checklist</h3>
        <p><strong>Product:</strong> ${product[0].product_name}</p>
        <p><strong>Expected Condition:</strong> ${product[0].condition_type}</p>
        <p><strong>Description Provided:</strong> ${product[0].condition_description || 'No description'}</p>
        
        <div class="checklist">
          <h4>✅ Verify These Items:</h4>
          <ul>
            <li><input type="checkbox"> Product matches ${product[0].condition_type} condition standard</li>
            ${product[0].visible_defects ? `<li><input type="checkbox"> Visible defects match: ${product[0].visible_defects}</li>` : ''}
            ${product[0].accessories_included ? `<li><input type="checkbox"> Accessories included: ${product[0].accessories_included}</li>` : ''}
            ${product[0].original_packaging ? '<li><input type="checkbox"> Original packaging included</li>' : ''}
            <li><input type="checkbox"> No additional damage beyond described</li>
            <li><input type="checkbox"> All parts and components present</li>
          </ul>
        </div>
        
        <div class="photo-required">
          <h4>📸 Required Photos for Disputes:</h4>
          <p>If rejecting return, upload photos showing:</p>
          <ul>
            <li>The damage or missing parts</li>
            <li>Comparison with your listing photos</li>
            <li>Packaging condition</li>
          </ul>
        </div>
      </div>
    `;
    
    res.json({
      success: true,
      inspection_guide: inspectionGuide,
      condition_details: product[0]
    });
    
  } catch (err) {
    console.error("Inspection guide error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    }
  });
  res.json(routes.filter(r => r.path && r.path.includes('download')));
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


app.get("/api/debug/subaccount-creation", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin only" });
    }
    
    // Check recent subaccount attempts from your database
    const users = await db.query(`
      SELECT id, username, flutterwave_subaccount_id, paystack_subaccount_code, 
             subaccount_created_at, subaccount_status, bank_name, account_number
      FROM users 
      WHERE flutterwave_subaccount_id IS NOT NULL OR paystack_subaccount_code IS NOT NULL
      ORDER BY subaccount_created_at DESC
    `);
    
    res.json({
      success: true,
      subaccount_count: users.length,
      subaccounts: users
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/test-create-subaccount", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin only" });
    }
    
    const { bank_code, account_number, business_name } = req.body;
    
    if (!bank_code || !account_number || !business_name) {
      return res.status(400).json({ error: "bank_code, account_number, business_name required" });
    }
    
    console.log("🧪 Testing subaccount creation with:");
    console.log("- Bank code:", bank_code);
    console.log("- Account number:", account_number);
    console.log("- Business name:", business_name);
    
    const payload = {
      account_bank: String(bank_code),
      account_number: String(account_number),
      business_name: business_name,
      split_type: "percentage",
      split_value: 0.9,
      country: "NG"
    };
    
    const response = await axios.post(
      'https://api.flutterwave.com/v3/subaccounts',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    console.log("Response:", JSON.stringify(response.data, null, 2));
    
    res.json({
      success: response.data.status === 'success',
      data: response.data
    });
    
  } catch (err) {
    console.error("Test error:", err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data?.message || err.message,
      full_response: err.response?.data
    });
  }
});
// ============================================
// FLUTTERWAVE SUBACCOUNT ENDPOINTS
// ============================================

app.post("/api/flutterwave/create-subaccount", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const { 
            bank_code, 
            account_number, 
            business_name, 
            business_email, 
            business_mobile, 
            country, 
            is_virtual,
            // New fields
            routing_number,
            swift_code,
            iban,
            branch_code,
            institution_number,
            transit_number,
            bsb_number
        } = req.body;
        
        if (!bank_code || !account_number || !business_name) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        
        console.log("🔧 Creating Flutterwave subaccount:", {
            bank_code,
            account_number,
            business_name,
            country,
            is_virtual: is_virtual ? 'Yes' : 'No',
            has_routing: !!routing_number,
            has_swift: !!swift_code
        });
        
        const result = await createFlutterwaveSubaccount(req.session.user.id, {
            bank_code,
            account_number,
            business_name,
            business_email,
            business_phone: business_mobile,
            country: country || 'NG',
            is_virtual: is_virtual || false,
            routing_number,
            swift_code,
            iban,
            branch_code,
            institution_number,
            transit_number,
            bsb_number
        });
        
        if (result.success) {
            res.json({
                success: true,
                subaccount_id: result.subaccount_id,
                message: is_virtual ? "Virtual account linked successfully!" : "Subaccount created successfully!"
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
        
    } catch (err) {
        console.error("❌ Subaccount error:", err);
        res.status(500).json({ error: err.message });
    }
});
// Get seller's Flutterwave subaccount status
app.get("/api/flutterwave/subaccount-status", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const result = await db.query(
            `SELECT flutterwave_subaccount_id, subaccount_status, subaccount_created_at 
             FROM users WHERE id = ?`,
            [req.session.user.id]
        );
        
        res.json({
            has_subaccount: !!(result[0]?.flutterwave_subaccount_id),
            subaccount_id: result[0]?.flutterwave_subaccount_id,
            status: result[0]?.subaccount_status || 'pending',
            created_at: result[0]?.subaccount_created_at
        });
        
    } catch (err) {
        console.error("Error fetching subaccount status:", err);
        res.status(500).json({ error: err.message });
    }
});
// ============================================
// PAYSTACK SUBACCOUNT ENDPOINTS
// ============================================

// Create Paystack subaccount for seller
app.post("/api/paystack/create-subaccount", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const { 
            bank_code, 
            account_number, 
            business_name,
            percentage_charge = 90  // 90% to seller
        } = req.body;
        
        if (!bank_code || !account_number || !business_name) {
            return res.status(400).json({ 
                error: "Bank code, account number, and business name are required" 
            });
        }
        
        // Check if subaccount already exists
        const existingSubaccount = await db.query(
            "SELECT paystack_subaccount_code FROM users WHERE id = ? AND paystack_subaccount_code IS NOT NULL",
            [req.session.user.id]
        );
        
        if (existingSubaccount && existingSubaccount.length > 0) {
            return res.json({
                success: true,
                subaccount_code: existingSubaccount[0].paystack_subaccount_code,
                message: "Subaccount already exists"
            });
        }
        
        // Create subaccount with Paystack
        const response = await axios.post(
            'https://api.paystack.co/subaccount',
            {
                business_name: business_name,
                settlement_bank: bank_code,
                account_number: account_number,
                percentage_charge: percentage_charge,  // 90%
                primary_contact_email: req.session.user.email,
                primary_contact_name: req.session.user.username,
                metadata: {
                    user_id: req.session.user.id,
                    platform_fee: 10
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        if (response.data.status === true && response.data.data) {
            const subaccountCode = response.data.data.subaccount_code;
            
            // Store in database
            await db.query(
                `UPDATE users 
                 SET paystack_subaccount_code = ?,
                     subaccount_created_at = NOW(),
                     subaccount_status = 'active'
                 WHERE id = ?`,
                [subaccountCode, req.session.user.id]
            );
            
            // Store in seller_bank_accounts
            await db.query(
                `INSERT INTO seller_bank_accounts (user_id, bank_name, bank_code, account_number, account_name, 
                    paystack_subaccount_code, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())
                 ON DUPLICATE KEY UPDATE 
                    paystack_subaccount_code = ?,
                    updated_at = NOW()`,
                [req.session.user.id, response.data.data.bank_name, bank_code, account_number, 
                 business_name, subaccountCode, subaccountCode]
            );
            
            console.log(`✅ Paystack subaccount created for user ${req.session.user.id}: ${subaccountCode}`);
            
            res.json({
                success: true,
                subaccount_code: subaccountCode,
                message: "Subaccount created successfully! Funds will be automatically split 90/10."
            });
        } else {
            throw new Error(response.data.message || "Failed to create subaccount");
        }
        
    } catch (err) {
        console.error("❌ Paystack subaccount error:", err);
        res.status(500).json({ 
            error: err.response?.data?.message || err.message,
            details: err.response?.data
        });
    }
});

// Get seller's Paystack subaccount status
app.get("/api/paystack/subaccount-status", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const result = await db.query(
            `SELECT paystack_subaccount_code, subaccount_status, subaccount_created_at 
             FROM users WHERE id = ?`,
            [req.session.user.id]
        );
        
        res.json({
            has_subaccount: !!(result[0]?.paystack_subaccount_code),
            subaccount_code: result[0]?.paystack_subaccount_code,
            status: result[0]?.subaccount_status || 'pending',
            created_at: result[0]?.subaccount_created_at
        });
        
    } catch (err) {
        console.error("Error fetching subaccount status:", err);
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

app.post("/api/verify-paystack-payment", async (req, res) => {
  try {
    console.log("🔍 Verifying Paystack payment...");
    
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const { reference, order_id, usd_amount } = req.body;
    
    if (!reference || !order_id) {
      return res.status(400).json({ error: "Reference and order_id are required" });
    }
    
    console.log(`📝 Verifying Paystack payment for order #${order_id}, reference: ${reference}`);
    
    // Verify with Paystack API
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );
    
    if (response.data.status === true && response.data.data.status === "success") {
      const transaction = response.data.data;
      const ngnAmountPaid = transaction.amount / 100;
      
      // Update order status
      const [updateResult] = await db.query(
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
      
      console.log(`✅ Order #${order_id} updated to PAID status`);
      
      res.json({ 
        success: true, 
        message: "Payment verified successfully",
        order_id: order_id,
        order_status: 'paid'
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: "Payment verification failed" 
      });
    }
  } catch (err) {
    console.error("❌ Paystack verification error:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/confirm-payment", async (req, res) => {
  try {
    const { order_id, reference, payment_method } = req.body;
    
    if (!order_id) {
      return res.status(400).json({ error: "Order ID required" });
    }
    
    console.log(`💰 Confirming payment for order #${order_id} via ${payment_method || 'direct'}`);
    
    // Update order status
    await db.query(
      `UPDATE physical_orders 
       SET payment_status = 'paid',
           order_status = 'paid',
           payment_collected_at = NOW(),
           payment_held_until = DATE_ADD(NOW(), INTERVAL 5 DAY),
           transaction_ref = COALESCE(?, transaction_ref)
       WHERE id = ? AND payment_status != 'paid'`,
      [reference, order_id]
    );
    
    res.json({ 
      success: true, 
      message: "Payment confirmed successfully"
    });
    
  } catch (err) {
    console.error("Confirm payment error:", err);
    res.status(500).json({ error: err.message });
  }
});
// Add to index.js - Admin fix endpoint
app.post("/api/admin/fix-order-payment", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin only" });
    }
    
    const { order_id } = req.body;
    
    await db.query(
      `UPDATE physical_orders 
       SET payment_status = 'paid',
           order_status = 'paid',
           payment_collected_at = NOW(),
           payment_held_until = DATE_ADD(NOW(), INTERVAL 5 DAY)
       WHERE id = ?`,
      [order_id]
    );
    
    res.json({ success: true, message: `Order #${order_id} fixed` });
  } catch (err) {
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

// Start a new conversation without a service - FIXED
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

    // Get user roles - FIXED: Properly extract array
    const userResult = await db.query(
      "SELECT id, role FROM users WHERE id IN (?, ?)",
      [currentUserId, recipientId]
    );
    
    // FIX: Properly extract rows from the result
    let users = extractRows(userResult);
    
    // Ensure users is an array
    if (!Array.isArray(users)) {
      users = [];
    }

    console.log("Users found:", users);

    let currentUserData = null;
    let recipientData = null;
    
    // Find users using a simple loop instead of .find()
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      if (parseInt(u.id) === currentUserId) {
        currentUserData = u;
      }
      if (parseInt(u.id) === recipientId) {
        recipientData = u;
      }
    }

    if (!currentUserData || !recipientData) {
      console.log("User not found:", { currentUserData, recipientData, users });
      return res.status(404).json({ error: "User not found" });
    }

    // Assign roles: if someone is freelancer, they're the freelancer, otherwise the other is freelancer
    let clientId, freelancerId;
    
    if (currentUserData.role === 'freelancer' && recipientData.role === 'client') {
      clientId = recipientId;
      freelancerId = currentUserId;
    } else if (currentUserData.role === 'client' && recipientData.role === 'freelancer') {
      clientId = currentUserId;
      freelancerId = recipientId;
    } else if (currentUserData.role === 'freelancer' && recipientData.role === 'freelancer') {
      // Both are freelancers - treat current as client, recipient as freelancer
      clientId = currentUserId;
      freelancerId = recipientId;
    } else if (currentUserData.role === 'client' && recipientData.role === 'client') {
      // Both are clients - treat current as client, recipient as freelancer
      clientId = currentUserId;
      freelancerId = recipientId;
    } else {
      // Default
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

// Block chat messages from expired freelancers
app.post("/api/messages/send", async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) return res.status(401).json({ error: "Login required" });

        const { conversation_id, message } = req.body;
        if (!conversation_id || !message?.trim()) {
            return res.status(400).json({ error: "Missing message or conversation ID" });
        }

        // Check if sender is freelancer and has active subscription
        if (user.role === 'freelancer') {
            const userResult = await db.query(
                `SELECT subscription_end_date, trial_end_date 
                 FROM users WHERE id = ?`,
                [user.id]
            );
            
            if (userResult && userResult.length > 0) {
                const userData = userResult[0];
                const today = new Date();
                let hasActiveSubscription = false;
                
                if (userData.trial_end_date && today <= new Date(userData.trial_end_date)) {
                    hasActiveSubscription = true;
                }
                if (!hasActiveSubscription && userData.subscription_end_date && today <= new Date(userData.subscription_end_date)) {
                    hasActiveSubscription = true;
                }
                
                if (!hasActiveSubscription) {
                    return res.status(403).json({ 
                        error: "Your subscription has expired. Please renew to send messages.",
                        requiresSubscription: true
                    });
                }
            }
        }

        // Check conversation access
        const convResult = await db.query(
            `SELECT id, client_id, freelancer_id FROM conversations WHERE id = ?`,
            [conversation_id]
        );

        const conversations = extractRows(convResult);
        const conversation = conversations && conversations.length > 0 ? conversations[0] : null;

        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found" });
        }

        const isClient = parseInt(conversation.client_id) === parseInt(user.id);
        const isFreelancer = parseInt(conversation.freelancer_id) === parseInt(user.id);
        
        if (!isClient && !isFreelancer) {
            return res.status(403).json({ error: "Access denied" });
        }

        const insertResult = await db.query(
            `INSERT INTO messages (conversation_id, sender_id, message, created_at, is_read)
             VALUES (?, ?, ?, NOW(), 0)`,
            [conversation_id, user.id, message.trim()]
        );

        const messageId = extractInsertId(insertResult);

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
        console.error("Send message error:", err);
        res.status(500).json({ error: err.message });
    }
});


// Chat Image Upload
app.post("/api/messages/send-with-image", uploadChatImage, async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Login required" });

    const { conversation_id, message } = req.body;
    if (!conversation_id) {
      return res.status(400).json({ error: "Missing conversation ID" });
    }

    // Check access to conversation
    const convResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations WHERE id = ?`,
      [conversation_id]
    );

    if (!convResult || convResult.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const conversation = convResult[0];
    const isClient = parseInt(conversation.client_id) === parseInt(user.id);
    const isFreelancer = parseInt(conversation.freelancer_id) === parseInt(user.id);
    
    if (!isClient && !isFreelancer) {
      return res.status(403).json({ error: "Access denied" });
    }

    let messageContent = message || '';
    let imageUrl = null;
    
    if (req.file) {
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: "Only image files are allowed" });
      }
      
      // Upload chat image to ImgBB
      imageUrl = await uploadToImgbb(req.file.path, req.file.originalname);
      if (!messageContent) {
        messageContent = '📷 Sent an image';
      }
    }

    if (!messageContent && !imageUrl) {
      return res.status(400).json({ error: "Message or image is required" });
    }

    const result = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, message, image_url, created_at, is_read)
       VALUES (?, ?, ?, ?, NOW(), 0)`,
      [conversation_id, user.id, messageContent, imageUrl]
    );

    const messageId = result.insertId;

    const messageResult = await db.query(
      `SELECT m.*, u.username AS sender_name 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.id = ?`,
      [messageId]
    );

    res.status(200).json({ 
      success: true, 
      data: messageResult[0] 
    });
    
  } catch (err) {
    console.error("Send message with image error:", err);
    res.status(500).json({ error: err.message });
  }
});


// Certificate Images Upload (Multiple) - FIXED
app.post("/api/freelancer/certificate-images", uploadCertificate, async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const certificateUrls = [];
    for (const file of req.files) {
      const url = await uploadToImgbb(file.path, file.originalname);
      certificateUrls.push(url);
      console.log(`✅ Uploaded certificate: ${url.substring(0, 60)}...`);
    }

    // Get current certificates from BOTH possible columns
    const currentProfile = await db.query(
      "SELECT certificate_images, certificate_image_urls FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    let currentCertificates = [];
    if (currentProfile && currentProfile.length > 0) {
      // Try certificate_images first
      if (currentProfile[0].certificate_images) {
        try {
          currentCertificates = JSON.parse(currentProfile[0].certificate_images);
        } catch (e) {
          currentCertificates = currentProfile[0].certificate_images ? [currentProfile[0].certificate_images] : [];
        }
      }
      // If certificate_images is empty, try certificate_image_urls
      else if (currentProfile[0].certificate_image_urls) {
        try {
          currentCertificates = JSON.parse(currentProfile[0].certificate_image_urls);
        } catch (e) {
          currentCertificates = [];
        }
      }
    }

    // Ensure we have an array
    if (!Array.isArray(currentCertificates)) {
      currentCertificates = [];
    }

    // Limit to 5 certificates total
    const updatedCertificates = [...currentCertificates, ...certificateUrls].slice(0, 5);
    
    // Update BOTH certificate columns for compatibility
    const certsJson = JSON.stringify(updatedCertificates);
    await db.query(`
      UPDATE freelancer_profiles 
      SET certificate_images = ?,
          certificate_image_urls = ?,
          updated_at = NOW() 
      WHERE user_id = ?
    `, [certsJson, certsJson, req.session.user.id]);

    console.log(`✅ Updated certificates for user ${req.session.user.id}: ${updatedCertificates.length} total`);

    res.json({ 
      success: true,
      message: `${certificateUrls.length} certificate(s) uploaded successfully`,
      certificate_images: updatedCertificates
    });
    
  } catch (err) {
    console.error('❌ Error uploading certificates:', err);
    res.status(500).json({ 
      success: false,
      error: "Error uploading certificate images: " + err.message 
    });
  }
});

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

    // Check access
    const convResult = await db.query(
      `SELECT id FROM conversations WHERE id = ? AND (client_id = ? OR freelancer_id = ?)`,
      [conversationId, userId, userId]
    );

    const convRows = extractRows(convResult);
    if (!convRows || convRows.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get messages with file info
    const messagesResult = await db.query(
      `SELECT 
        m.id, 
        m.conversation_id, 
        m.sender_id, 
        m.message, 
        m.image_url,
        m.file_url,
        m.file_name,
        m.file_size,
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
    return res.json(Array.isArray(messages) ? messages : []);
    
  } catch (err) {
    console.error("Error fetching messages:", err);
    return res.json([]);
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
// Configure multer for file uploads (documents)
const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads', 'chat-files');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Get file extension from original name
        const ext = path.extname(file.originalname);
        // Sanitize filename
        const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
        cb(null, uniqueSuffix + '-' + baseName + ext);
    }
});

// TO THIS:
const chatFileUpload = multer({ 
    storage: fileStorage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.zip', '.jpg', '.jpeg', '.png', '.gif'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed'));
        }
    }
});

// Chat File Attachment Upload (Documents, PDFs, etc.)
app.post("/api/messages/send-with-file", chatFileUpload.single('file'), async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.status(401).json({ error: "Login required" });
    }

    const { conversation_id, message } = req.body;
    if (!conversation_id) {
      return res.status(400).json({ error: "Missing conversation ID" });
    }

    // Check access to conversation
    const convResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations WHERE id = ?`,
      [conversation_id]
    );

    if (!convResult || convResult.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const conversation = convResult[0];
    const isClient = parseInt(conversation.client_id) === parseInt(user.id);
    const isFreelancer = parseInt(conversation.freelancer_id) === parseInt(user.id);
    
    if (!isClient && !isFreelancer) {
      return res.status(403).json({ error: "Access denied" });
    }

    let messageContent = message || '';
    let fileUrl = null;
    let fileName = null;
    let fileSize = null;
    
    if (req.file) {
      // Upload file to ImgBB
      fileUrl = await uploadToImgbb(req.file.path, req.file.originalname);
      fileName = req.file.originalname;
      fileSize = req.file.size;
      messageContent = messageContent || `📎 Sent a file: ${fileName}`;
    }

    if (!messageContent && !fileUrl) {
      return res.status(400).json({ error: "Message or file is required" });
    }

    const result = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, message, file_url, file_name, file_size, created_at, is_read)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), 0)`,
      [conversation_id, user.id, messageContent, fileUrl, fileName, fileSize]
    );

    const messageId = result.insertId;

    const messageResult = await db.query(
      `SELECT m.*, u.username AS sender_name 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.id = ?`,
      [messageId]
    );

    res.status(200).json({ 
      success: true, 
      data: messageResult[0] 
    });
    
  } catch (err) {
    console.error("Send file error:", err);
    res.status(500).json({ error: err.message });
  }
});



// ============================================
// SELLER PAID ORDERS - FIXED
// ============================================
app.get("/api/seller/paid-orders", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }

    const sellerId = req.session.user.id;
    
    // Get orders that are paid and ready for delivery/shipment
    const orders = await db.query(`
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
        o.payment_collected_at,
        o.platform_fee,
        o.seller_earnings,
        o.estimated_delivery_days,
        o.delivery_code,
        o.delivery_code_sent_at,
        
        p.title as product_title,
        p.images as product_images
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      WHERE o.seller_id = ? 
        AND o.payment_status = 'paid'
        AND o.order_status IN ('paid', 'processing', 'shipped')
      ORDER BY o.payment_collected_at ASC
    `, [sellerId]);
    
    const processedOrders = (orders || []).map(order => ({
      id: order.id,
      product_id: order.product_id,
      product_name: order.product_name || order.product_title,
      quantity: parseInt(order.quantity) || 1,
      price: parseFloat(order.price) || 0,
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
      notes: order.notes,
      created_at: order.created_at,
      payment_collected_at: order.payment_collected_at,
      estimated_delivery_days: order.estimated_delivery_days || 7,
      order_status: order.order_status,
      payment_status: order.payment_status,
      has_delivery_code: !!order.delivery_code,
      delivery_code_sent_at: order.delivery_code_sent_at,
      delivery_code_verified_at: order.delivery_code_verified_at
    }));
    
    res.json({
      success: true,
      orders: processedOrders,
      count: processedOrders.length
    });
    
  } catch (err) {
    console.error("❌ Error loading paid orders:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      orders: [],
      count: 0
    });
  }
});



// ============================================
// PROCESS REFUND - SELLER/ADMIN APPROVES OR DENIES
// ============================================
app.post("/api/refunds/:orderId/process", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    const { action, admin_notes, inspection_passed } = req.body;
    
    // Get order details with payment info
    const orderResult = await db.query(`
      SELECT o.*, p.title as product_name, 
             u_buyer.email as buyer_email, u_buyer.username as buyer_name,
             u_seller.email as seller_email, u_seller.username as seller_name
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
      LEFT JOIN users u_seller ON o.seller_id = u_seller.id
      WHERE o.id = ?
    `, [orderId]);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    
    // Check permission (seller or admin)
    const isAdmin = req.session.user.role === 'admin';
    const isSeller = order.seller_id === req.session.user.id;
    
    if (!isAdmin && !isSeller) {
      return res.status(403).json({ error: "Only the seller or admin can process refunds" });
    }
    
    // Check if refund was already processed
    if (order.order_status === 'refunded') {
      return res.status(400).json({ error: "Refund already processed for this order" });
    }
    
    // Check if refund was requested
    if (order.order_status !== 'refund_requested') {
      return res.status(400).json({ error: "No refund request found for this order" });
    }
    
    if (action === 'approve') {
      // APPROVE REFUND
      let refundAmount = parseFloat(order.refund_amount) || parseFloat(order.total_amount);
      let transportFee = 0;
      
      // Calculate transport fee for pickup returns
      if (order.return_option === 'pickup') {
        transportFee = order.total_amount * 0.03;
        refundAmount = order.total_amount - transportFee;
      }
      
      // Process refund based on payment provider
      const paymentProvider = order.payment_provider || 'flutterwave';
      let refundSuccess = false;
      let refundError = null;
      
      if (paymentProvider === 'flutterwave' && order.transaction_ref) {
        try {
          const refundResponse = await axios.post(
            'https://api.flutterwave.com/v3/transactions/refund',
            {
              transaction_id: order.transaction_ref,
              amount: refundAmount,
              full_refund: refundAmount >= order.total_amount,
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
            console.log(`✅ Flutterwave refund processed for order #${orderId}: $${refundAmount}`);
          } else {
            refundError = refundResponse.data.message;
          }
        } catch (err) {
          refundError = err.response?.data?.message || err.message;
          console.error('❌ Flutterwave refund error:', refundError);
        }
      } 
      else if (paymentProvider === 'paystack' && order.transaction_ref) {
        try {
          const refundResponse = await axios.post(
            'https://api.paystack.co/transaction/refund',
            {
              transaction: order.transaction_ref,
              amount: Math.round(refundAmount * 100)
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
            console.log(`✅ Paystack refund processed for order #${orderId}: $${refundAmount}`);
          } else {
            refundError = refundResponse.data.message;
          }
        } catch (err) {
          refundError = err.response?.data?.message || err.message;
          console.error('❌ Paystack refund error:', refundError);
        }
      }
      
      if (refundSuccess) {
        // Update order status
        await db.query(`
          UPDATE physical_orders 
          SET order_status = 'refunded',
              refund_processed_at = NOW(),
              refund_approved_by = ?,
              refund_notes = ?,
              refund_amount = ?,
              seller_transport_fee = ?,
              funds_released_at = NULL,
              payment_held_until = NULL
          WHERE id = ?
        `, [req.session.user.id, admin_notes || 'Refund approved', refundAmount, transportFee, orderId]);
        
        // Update pickup request if exists
        await db.query(`
          UPDATE refund_pickup_requests 
          SET status = 'completed', completed_at = NOW()
          WHERE order_id = ?
        `, [orderId]);
        
        // Send email notification to buyer
        const buyerEmailHtml = `
          <!DOCTYPE html>
          <html>
          <head><title>Refund Approved - Core Insight</title></head>
          <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
            <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
              <h1 style="color:#10b981;">✅ Refund Approved!</h1>
              <p>Hello ${escapeHtml(order.buyer_name || 'Valued Customer')},</p>
              <p>Your refund for <strong>Order #${orderId}</strong> has been approved.</p>
              <div style="background:#0f172a;padding:20px;border-radius:12px;margin:20px 0;">
                <p><strong>Product:</strong> ${escapeHtml(order.product_name)}</p>
                <p><strong>Quantity:</strong> ${order.quantity}</p>
                <p><strong>Refund Amount:</strong> <span style="font-size:24px;color:#10b981;">$${refundAmount.toFixed(2)}</span></p>
                ${transportFee > 0 ? `<p><strong>Transport Fee Deducted:</strong> $${transportFee.toFixed(2)} (3%)</p>` : ''}
                <p><strong>Notes:</strong> ${escapeHtml(admin_notes || 'Refund processed successfully')}</p>
              </div>
              <p>Please allow 5-10 business days for the refund to appear in your account.</p>
            </div>
          </body>
          </html>
        `;
        
        await sendEmail(order.buyer_email, `Refund Approved for Order #${orderId}`, buyerEmailHtml);
        
        // Send notification to seller
        const sellerEmailHtml = `
          <!DOCTYPE html>
          <html>
          <head><title>Refund Processed - Core Insight</title></head>
          <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
            <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
              <h1>🔄 Refund Processed</h1>
              <p>Hello ${escapeHtml(order.seller_name || 'Seller')},</p>
              <p>A refund has been processed for <strong>Order #${orderId}</strong>.</p>
              <div style="background:#0f172a;padding:20px;border-radius:12px;margin:20px 0;">
                <p><strong>Product:</strong> ${escapeHtml(order.product_name)}</p>
                <p><strong>Refund Amount:</strong> $${refundAmount.toFixed(2)}</p>
                ${transportFee > 0 ? `<p><strong>Transport Fee (Your Compensation):</strong> $${transportFee.toFixed(2)}</p>` : ''}
              </div>
            </div>
          </body>
          </html>
        `;
        
        await sendEmail(order.seller_email, `Refund Processed for Order #${orderId}`, sellerEmailHtml);
        
        res.json({
          success: true,
          message: "Refund approved and processed successfully",
          refund_amount: refundAmount,
          transport_fee: transportFee
        });
        
      } else {
        res.status(500).json({ 
          success: false, 
          error: `Refund failed: ${refundError || 'Unknown error'}` 
        });
      }
      
    } else if (action === 'deny') {
      // DENY REFUND
      await db.query(`
        UPDATE physical_orders 
        SET order_status = 'completed',
            refund_denied_at = NOW(),
            refund_denied_by = ?,
            refund_notes = ?
        WHERE id = ?
      `, [req.session.user.id, admin_notes || 'Refund denied - product condition mismatch', orderId]);
      
      // Update pickup request
      await db.query(`
        UPDATE refund_pickup_requests 
        SET status = 'denied', completed_at = NOW()
        WHERE order_id = ?
      `, [orderId]);
      
      // Send email notification to buyer
      const buyerEmailHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Refund Request Denied - Core Insight</title></head>
        <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
          <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
            <h1 style="color:#ef4444;">❌ Refund Request Denied</h1>
            <p>Hello ${escapeHtml(order.buyer_name || 'Valued Customer')},</p>
            <p>Your refund request for <strong>Order #${orderId}</strong> has been reviewed and denied.</p>
            <div style="background:#0f172a;padding:20px;border-radius:12px;margin:20px 0;">
              <p><strong>Product:</strong> ${escapeHtml(order.product_name)}</p>
              <p><strong>Reason for denial:</strong></p>
              <p style="color:#f59e0b;">${escapeHtml(admin_notes || 'Product condition does not match listing')}</p>
            </div>
            <p>If you have questions about this decision, please contact our support team.</p>
          </div>
        </body>
        </html>
      `;
      
      await sendEmail(order.buyer_email, `Refund Request Denied for Order #${orderId}`, buyerEmailHtml);
      
      res.json({
        success: true,
        message: "Refund request denied"
      });
    } else {
      res.status(400).json({ error: "Invalid action. Must be 'approve' or 'deny'" });
    }
    
  } catch (err) {
    console.error("❌ Refund processing error:", err);
    res.status(500).json({ error: err.message });
  }
});





// ============================================
// ADMIN: GET ALL USERS ENDPOINT
// ============================================

app.get("/api/admin/users", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const users = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.role,
        u.created_at,
        u.verified,
        u.account_locked,
        (SELECT COUNT(*) FROM products WHERE user_id = u.id AND (is_deleted = 0 OR is_deleted IS NULL)) as product_count,
        (SELECT COUNT(*) FROM physical_orders WHERE seller_id = u.id) as sales_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM physical_orders WHERE seller_id = u.id AND order_status = 'completed') as total_earnings
      FROM users u
      ORDER BY u.created_at DESC
    `);
    
    res.json(users || []);
    
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN: GET PLATFORM STATS ENDPOINT
// ============================================

app.get("/api/admin/platform-stats", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const totalUsers = await db.query("SELECT COUNT(*) as count FROM users");
    const totalProducts = await db.query("SELECT COUNT(*) as count FROM products WHERE is_deleted = 0 OR is_deleted IS NULL");
    const totalSales = await db.query("SELECT COUNT(*) as count FROM physical_orders");
    const totalOrders = await db.query("SELECT COUNT(*) as count FROM physical_orders");
    const platformRevenue = await db.query("SELECT COALESCE(SUM(platform_fee), 0) as total FROM physical_orders WHERE order_status IN ('completed', 'refunded')");
    
    res.json({
      total_users: totalUsers[0]?.count || 0,
      total_products: totalProducts[0]?.count || 0,
      total_sales: totalSales[0]?.count || 0,
      total_orders: totalOrders[0]?.count || 0,
      platform_revenue: parseFloat(platformRevenue[0]?.total || 0)
    });
    
  } catch (err) {
    console.error("Error fetching platform stats:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET ESCROW STATUS FOR ORDER
// ============================================

app.get("/api/orders/:orderId/escrow-status", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    
    const orderResult = await db.query(`
      SELECT 
        id, 
        payment_status, 
        order_status, 
        payment_held_until, 
        total_amount, 
        seller_earnings, 
        platform_fee,
        funds_released_at
      FROM physical_orders
      WHERE id = ? AND (buyer_id = ? OR seller_id = ?)
    `, [orderId, req.session.user.id, req.session.user.id]);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    const isPaid = order.payment_status === 'paid';
    const isCompleted = order.order_status === 'completed';
    const isRefunded = order.order_status === 'refunded';
    
    let daysRemaining = null;
    let releaseDate = null;
    
    if (order.payment_held_until && !isCompleted && !isRefunded) {
      releaseDate = new Date(order.payment_held_until);
      const now = new Date();
      daysRemaining = Math.max(0, Math.ceil((releaseDate - now) / (1000 * 60 * 60 * 24)));
    }
    
    res.json({
      success: true,
      is_escrow: isPaid && !isCompleted && !isRefunded,
      amount_held: parseFloat(order.total_amount || 0),
      seller_earnings: parseFloat(order.seller_earnings) || (parseFloat(order.total_amount) * 0.9),
      platform_fee: parseFloat(order.platform_fee) || (parseFloat(order.total_amount) * 0.1),
      payment_held_until: order.payment_held_until,
      release_date: releaseDate,
      days_remaining: daysRemaining,
      funds_released: isCompleted,
      is_refunded: isRefunded
    });
    
  } catch (err) {
    console.error("❌ Error checking escrow status:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ESCROW RELEASE CRON JOB (Automatic)
// ============================================

// Run every hour to check for orders that need escrow release
setInterval(async () => {
  try {
    console.log('🔄 Running automatic escrow release check...');
    
    const ordersToRelease = await db.query(`
      SELECT o.id, o.seller_id, o.seller_earnings, o.total_amount, 
             u.email as seller_email, u.username as seller_name
      FROM physical_orders o
      LEFT JOIN users u ON o.seller_id = u.id
      WHERE o.payment_status = 'paid' 
        AND o.order_status = 'delivered'
        AND o.payment_held_until IS NOT NULL
        AND o.payment_held_until <= NOW()
        AND o.funds_released_at IS NULL
    `);
    
    for (const order of ordersToRelease) {
      await db.query(`
        UPDATE physical_orders 
        SET order_status = 'completed',
            funds_released_at = NOW()
        WHERE id = ?
      `, [order.id]);
      
      // Send email notification to seller
      if (order.seller_email) {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Funds Released - Core Insight</title>
            <style>
              body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
              .amount { font-size: 28px; color: #10b981; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 style="color: #10b981;">💰 Funds Released!</h1>
              <p>Hello ${escapeHtml(order.seller_name || 'Seller')},</p>
              <p>The escrow period for <strong>Order #${order.id}</strong> has completed.</p>
              <p class="amount">$${parseFloat(order.seller_earnings || order.total_amount * 0.9).toFixed(2)}</p>
              <p>has been released to your account. Funds should appear within 3-5 business days.</p>
              <a href="https://coreinsightmarket.com/dashboard" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px;">View Dashboard</a>
            </div>
          </body>
          </html>
        `;
        await sendEmail(order.seller_email, `Funds Released for Order #${order.id}`, emailHtml);
      }
    }
    
    if (ordersToRelease.length > 0) {
      console.log(`✅ Released escrow for ${ordersToRelease.length} orders`);
    }
    
  } catch (err) {
    console.error('❌ Escrow release error:', err);
  }
}, 60 * 60 * 1000); // Run every hour

// ============================================
// ESCROW RELEASE MANUAL TRIGGER (Admin)
// ============================================

app.post("/api/admin/release-escrow/:orderId", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const orderId = req.params.orderId;
    
    const orderResult = await db.query(`
      SELECT o.*, u.email as seller_email, u.username as seller_name
      FROM physical_orders o
      LEFT JOIN users u ON o.seller_id = u.id
      WHERE o.id = ? AND o.order_status = 'delivered'
    `, [orderId]);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found or not in delivered status" });
    }
    
    const order = orderResult[0];
    
    await db.query(`
      UPDATE physical_orders 
      SET order_status = 'completed',
          funds_released_at = NOW()
      WHERE id = ?
    `, [orderId]);
    
    // Send email notification
    if (order.seller_email) {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Funds Released (Admin) - Core Insight</title>
          <style>
            body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 style="color: #10b981;">💰 Funds Released</h1>
            <p>Hello ${escapeHtml(order.seller_name || 'Seller')},</p>
            <p>An administrator has manually released funds for <strong>Order #${order.id}</strong>.</p>
            <p>Amount: <strong>$${parseFloat(order.seller_earnings || order.total_amount * 0.9).toFixed(2)}</strong></p>
          </div>
        </body>
        </html>
      `;
      await sendEmail(order.seller_email, `Funds Released for Order #${order.id}`, emailHtml);
    }
    
    res.json({ success: true, message: "Funds released successfully" });
    
  } catch (err) {
    console.error("Manual escrow release error:", err);
    res.status(500).json({ error: err.message });
  }
});







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
        const searchTerm = `%${q}%`;
        
        // Only return id and username, no email
        const result = await db.query(
            `SELECT u.id, u.username
             FROM users u
             WHERE (u.username LIKE ?) 
               AND u.id != ?
             LIMIT 10`,
            [searchTerm, currentUserId]
        );
        
        let users = [];
        if (result && Array.isArray(result)) {
            if (result.length === 2 && Array.isArray(result[0])) {
                users = result[0];
            } else {
                users = result;
            }
        }
        
        res.json(users);
        
    } catch (err) {
        console.error("User search error:", err);
        res.json([]);
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
// =================== GET ALL SERVICES (PUBLIC) - SAFE VERSION ===================
app.get("/api/services", async (req, res) => {
    try {
        const { category, search, sort, limit = 20, offset = 0 } = req.query;

        const parsedLimit = parseInt(limit) || 20;
        const parsedOffset = parseInt(offset) || 0;

        let sql = `
            SELECT 
                s.*, 
                u.username,
                u.id as user_id,
                fp.profile_picture_url as profile_picture_url,
                fp.headline as provider_headline,
                (SELECT AVG(rating) FROM service_reviews WHERE service_id = s.id) as avg_rating,
                (SELECT COUNT(*) FROM service_reviews WHERE service_id = s.id) as review_count,
                (SELECT COUNT(*) FROM service_favorites WHERE service_id = s.id) as favorite_count
            FROM services s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
            WHERE s.status = 'active'  -- Only show active services
        `;

        const params = [];

        if (category) {
            sql += " AND s.category = ?";
            params.push(category);
        }

        if (search) {
            sql += " AND (s.title LIKE ? OR s.description LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        switch(sort) {
            case 'price_low':
                sql += " ORDER BY s.price ASC";
                break;
            case 'price_high':
                sql += " ORDER BY s.price DESC";
                break;
            case 'rating':
                sql += " ORDER BY avg_rating DESC";
                break;
            case 'newest':
            default:
                sql += " ORDER BY s.created_at DESC";
        }

        sql += ` LIMIT ${parsedLimit} OFFSET ${parsedOffset}`;

        const services = await db.query(sql, params);

        let countSql = "SELECT COUNT(*) as total FROM services WHERE status = 'active'";
        const countParams = [];

        if (category) {
            countSql += " AND category = ?";
            countParams.push(category);
        }

        if (search) {
            countSql += " AND (title LIKE ? OR description LIKE ?)";
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const countResult = await db.query(countSql, countParams);
        const total = countResult && countResult[0] ? countResult[0].total : 0;

        let processedServices = services || [];
        
        if (req.session.user && processedServices.length > 0) {
            try {
                const favoritesResult = await db.query(
                    "SELECT service_id FROM service_favorites WHERE user_id = ?",
                    [req.session.user.id]
                );
                
                const favoriteIds = new Set(favoritesResult.map(f => f.service_id));
                
                processedServices = processedServices.map(service => ({
                    ...service,
                    is_favorited: favoriteIds.has(service.id)
                }));
            } catch (favErr) {
                console.error("Error checking favorites:", favErr);
            }
        }

        res.json({
            services: processedServices,
            pagination: {
                total: total,
                limit: parsedLimit,
                offset: parsedOffset,
                has_more: total > (parsedOffset + parsedLimit)
            }
        });

    } catch (err) {
        console.error("Services fetch error:", err);
        res.status(200).json({
            services: [],
            pagination: { total: 0, limit: 20, offset: 0, has_more: false }
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





// ==================== PHONE VERIFICATION (EMAIL OTP) ====================

// 1. Send OTP via Email
app.post("/api/verification/send-otp", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }

        const { phone_number } = req.body;
        
        if (!phone_number) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        await db.query(
            `INSERT INTO phone_verifications (user_id, phone_number, otp_code, expires_at, verified, created_at)
             VALUES (?, ?, ?, ?, 0, NOW())
             ON DUPLICATE KEY UPDATE otp_code = ?, expires_at = ?, created_at = NOW()`,
            [req.session.user.id, phone_number, otpCode, expiresAt, otpCode, expiresAt]
        );

        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Phone Verification - Core Insight Market</title></head>
            <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
                <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                    <h1 style="color:#FFD700;">📱 Phone Verification</h1>
                    <p>Hello ${req.session.user.username},</p>
                    <p>Your verification code is:</p>
                    <div style="font-size: 48px; font-weight: bold; text-align: center; padding: 20px; background: #0f172a; border-radius: 12px; letter-spacing: 10px;">
                        ${otpCode}
                    </div>
                    <p>This code expires in 10 minutes.</p>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail(req.session.user.email, "Phone Verification Code", emailHtml);

        res.json({
            success: true,
            message: "Verification code sent to your email. Valid for 10 minutes."
        });

    } catch (err) {
        console.error("OTP send error:", err);
        res.status(500).json({ error: "Failed to send OTP" });
    }
});

// 2. Verify OTP
app.post("/api/verification/verify-otp", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }

        const { otp_code } = req.body;

        if (!otp_code) {
            return res.status(400).json({ error: "OTP code is required" });
        }

        const verification = await db.query(
            `SELECT * FROM phone_verifications 
             WHERE user_id = ? AND otp_code = ? AND expires_at > NOW() AND verified = 0
             ORDER BY created_at DESC LIMIT 1`,
            [req.session.user.id, otp_code]
        );

        if (!verification || verification.length === 0) {
            return res.status(400).json({ error: "Invalid or expired OTP code" });
        }

        await db.query(
            `UPDATE phone_verifications SET verified = 1 WHERE id = ?`,
            [verification[0].id]
        );

        await db.query(
            `UPDATE users SET phone_verified = 1, phone_number = ? WHERE id = ?`,
            [verification[0].phone_number, req.session.user.id]
        );

        res.json({
            success: true,
            message: "Phone number verified successfully!"
        });

    } catch (err) {
        console.error("OTP verify error:", err);
        res.status(500).json({ error: "Failed to verify OTP" });
    }
});

// ==================== IDENTITY VERIFICATION (2-HOUR AUTO VERIFY) ====================

// 3. Submit verification (status: pending_review, auto-verify after 2 hours)
app.post("/api/verification/submit", 
    uploadVerification.fields([
        { name: 'government_id', maxCount: 1 },
        { name: 'selfie_with_id', maxCount: 1 },
        { name: 'address_proof', maxCount: 1 }
    ]), 
    async (req, res) => {
        try {
            if (!req.session.user) {
                return res.status(401).json({ error: "Please login" });
            }

            const { verification_type, business_name } = req.body;

            // Check if phone is verified first
            const phoneCheck = await db.query(
                "SELECT phone_verified FROM users WHERE id = ?",
                [req.session.user.id]
            );

            if (!phoneCheck[0]?.phone_verified) {
                return res.status(400).json({ error: "Please verify your phone number first" });
            }

            // Validate required documents
            if (!req.files['government_id']) {
                return res.status(400).json({ error: "Government ID is required" });
            }

            if (!req.files['selfie_with_id']) {
                return res.status(400).json({ error: "Selfie with ID is required" });
            }

            if (!req.files['address_proof']) {
                return res.status(400).json({ error: "Proof of address is required" });
            }

            let documentsUploaded = 0;

            // Upload Government ID
            if (req.files['government_id']) {
                const file = req.files['government_id'][0];
                const url = await uploadToImgbb(file.path, file.originalname);
                await db.query(
                    `INSERT INTO verification_documents (user_id, document_type, document_url, uploaded_at, status)
                     VALUES (?, 'government_id', ?, NOW(), 'pending')`,
                    [req.session.user.id, url]
                );
                documentsUploaded++;
            }

            // Upload Selfie with ID
            if (req.files['selfie_with_id']) {
                const file = req.files['selfie_with_id'][0];
                const url = await uploadToImgbb(file.path, file.originalname);
                await db.query(
                    `INSERT INTO verification_documents (user_id, document_type, document_url, uploaded_at, status)
                     VALUES (?, 'selfie_with_id', ?, NOW(), 'pending')`,
                    [req.session.user.id, url]
                );
                documentsUploaded++;
            }

            // Upload Address Proof
            if (req.files['address_proof']) {
                const file = req.files['address_proof'][0];
                const url = await uploadToImgbb(file.path, file.originalname);
                await db.query(
                    `INSERT INTO verification_documents (user_id, document_type, document_url, uploaded_at, status)
                     VALUES (?, 'address_proof', ?, NOW(), 'pending')`,
                    [req.session.user.id, url]
                );
                documentsUploaded++;
            }

            // Update user to pending_review - verification will auto-approve after 2 hours
            await db.query(
                `UPDATE users 
                 SET verification_status = 'pending_review',
                     verification_type = ?,
                     verification_submitted_at = NOW(),
                     business_name = ?
                 WHERE id = ?`,
                [verification_type || 'individual', business_name || null, req.session.user.id]
            );

            // Send confirmation email
            const confirmationHtml = `
                <!DOCTYPE html>
                <html>
                <head><title>Verification Submitted - Core Insight</title></head>
                <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
                    <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                        <h1 style="color:#fbbf24;">⏳ Verification Under Review</h1>
                        <p>Hello ${req.session.user.username},</p>
                        <p>Your verification documents have been submitted successfully.</p>
                        <p><strong>Status:</strong> Under Review</p>
                        <p><strong>Estimated time:</strong> 2 hours</p>
                        <p>You will receive an email once your account is verified.</p>
                        <p>You can create draft services now. They will become active after verification.</p>
                    </div>
                </body>
                </html>
            `;
            
            await sendEmail(req.session.user.email, "Verification Submitted - Core Insight", confirmationHtml);

            res.json({
                success: true,
                message: "Verification documents submitted! Your account will be verified within 2 hours.",
                documents_uploaded: documentsUploaded,
                status: 'pending_review',
                auto_verify_hours: 2
            });

        } catch (err) {
            console.error("Verification submission error:", err);
            res.status(500).json({ error: err.message });
        }
    }
);

// 4. Check verification status
app.get("/api/verification/status", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }

        const user = await db.query(
            `SELECT verification_status, verification_type, verified_at, verification_submitted_at, phone_verified, phone_number
             FROM users WHERE id = ?`,
            [req.session.user.id]
        );

        const documents = await db.query(
            `SELECT document_type, document_url, uploaded_at, status
             FROM verification_documents WHERE user_id = ?`,
            [req.session.user.id]
        );

        // Calculate time remaining if pending
        let hoursRemaining = null;
        let minutesRemaining = null;
        
        if (user[0]?.verification_status === 'pending_review' && user[0]?.verification_submitted_at) {
            const submittedAt = new Date(user[0].verification_submitted_at);
            const autoVerifyTime = new Date(submittedAt.getTime() + (2 * 60 * 60 * 1000));
            const now = new Date();
            
            if (now < autoVerifyTime) {
                const diffMs = autoVerifyTime - now;
                hoursRemaining = Math.floor(diffMs / (60 * 60 * 1000));
                minutesRemaining = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
            }
        }

        res.json({
            success: true,
            status: user[0]?.verification_status || 'unverified',
            verification_type: user[0]?.verification_type,
            verified_at: user[0]?.verified_at,
            submitted_at: user[0]?.verification_submitted_at,
            phone_verified: user[0]?.phone_verified === 1,
            phone_number: user[0]?.phone_number,
            documents_uploaded: documents.length,
            documents: documents,
            hours_remaining: hoursRemaining,
            minutes_remaining: minutesRemaining
        });

    } catch (err) {
        console.error("Status check error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 5. Background job: Auto-verify pending applications after 2 hours
async function processAutoVerifications() {
    try {
        console.log(`🕐 Running auto-verification check at ${new Date().toISOString()}`);
        
        // Find pending verifications submitted more than 2 hours ago
        const pendingUsers = await db.query(`
            SELECT id, username, email, verification_submitted_at
            FROM users 
            WHERE verification_status = 'pending_review'
              AND verification_submitted_at IS NOT NULL
              AND verification_submitted_at <= DATE_SUB(NOW(), INTERVAL 2 HOUR)
        `);
        
        for (const user of pendingUsers) {
            console.log(`✅ Auto-verifying user ${user.id} (${user.username}) - submitted at ${user.verification_submitted_at}`);
            
            // Update user to verified
            await db.query(
                `UPDATE users 
                 SET verification_status = 'verified',
                     verified_at = NOW()
                 WHERE id = ?`,
                [user.id]
            );
            
            // Update all pending documents to approved
            await db.query(
                `UPDATE verification_documents 
                 SET status = 'approved'
                 WHERE user_id = ? AND status = 'pending'`,
                [user.id]
            );
            
            // Send welcome email
            const welcomeHtml = `
                <!DOCTYPE html>
                <html>
                <head><title>Verification Complete - Core Insight</title></head>
                <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
                    <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                        <h1 style="color:#10b981;">✅ Verification Complete!</h1>
                        <p>Hello ${user.username},</p>
                        <p>Your seller account has been verified!</p>
                        <p>Your services are now active and visible to customers.</p>
                        <a href="https://coreinsightmarket.com/services.html" 
                           style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:20px;">
                            View Your Services
                        </a>
                    </div>
                </body>
                </html>
            `;
            
            await sendEmail(user.email, "Verification Complete - Core Insight", welcomeHtml);
        }
        
        if (pendingUsers.length > 0) {
            console.log(`✅ Auto-verified ${pendingUsers.length} users`);
        }
        
    } catch (err) {
        console.error("Auto-verification error:", err);
    }
}

// Schedule auto-verification to run every 10 minutes
setInterval(() => {
    processAutoVerifications();
}, 10 * 60 * 1000); // Run every 10 minutes

// Also run on startup
setTimeout(() => {
    processAutoVerifications();
}, 5000);

// ==================== VERIFICATION MIDDLEWARE ====================

// Middleware to check if seller is verified
const checkSellerVerification = async (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    if (req.session.user.role !== 'freelancer') {
        return next();
    }

    try {
        const user = await db.query(
            "SELECT verification_status FROM users WHERE id = ?",
            [req.session.user.id]
        );

        const verificationStatus = user[0]?.verification_status;

        if (verificationStatus === 'unverified') {
            return res.status(403).json({ 
                error: "Please complete identity verification before offering services",
                verification_required: true,
                verification_status: 'unverified',
                redirect_url: '/verification.html'
            });
        }
        
        if (verificationStatus === 'pending_review') {
            return res.status(403).json({ 
                error: "Your verification is pending review. You can create draft services, but they won't be visible until verification is complete (within 2 hours).",
                verification_required: true,
                verification_status: 'pending_review',
                redirect_url: '/verification.html',
                can_create_drafts: true  // Allow draft creation during pending
            });
        }

        next();
    } catch (err) {
        console.error("Verification check error:", err);
        res.status(500).json({ error: err.message });
    }
};

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


// Create service (with draft support for pending users)
app.post("/api/services", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login to create a service" });
    }

    if (req.session.user.role !== 'freelancer' && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: "Only freelancers can create services" });
    }

    try {
        // Check verification status
        const userCheck = await db.query(
            "SELECT verification_status FROM users WHERE id = ?",
            [req.session.user.id]
        );
        
        const verificationStatus = userCheck[0]?.verification_status;
        
        // If not verified, service will be created as draft
        let serviceStatus = 'active';
        let isDraft = false;
        let responseMessage = "Service created successfully!";
        
        if (verificationStatus === 'unverified') {
            return res.status(403).json({ 
                error: "Please complete identity verification before creating services",
                verification_required: true,
                redirect_url: '/verification.html'
            });
        } else if (verificationStatus === 'pending_review') {
            serviceStatus = 'draft';  // Draft until verification completes
            isDraft = true;
            responseMessage = "Service saved as draft. It will become active once your verification is complete (within 2 hours).";
        }
        
        const { 
            title, description, category, hourly_rate, fixed_price,
            delivery_time, revisions, tags, requirements
        } = req.body;

        if (!title || !description) {
            return res.status(400).json({ error: "Title and description are required" });
        }

        const price = fixed_price ? parseFloat(fixed_price) : (hourly_rate ? parseFloat(hourly_rate) : 0);

        const profileResult = await db.query(
            "SELECT profile_picture_url FROM freelancer_profiles WHERE user_id = ?",
            [req.session.user.id]
        );

        const profilePicture = profileResult.length > 0 ? profileResult[0].profile_picture_url : null;

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

        const result = await db.query(`
            INSERT INTO services 
            (user_id, title, description, price, category, provider_profile_picture, 
             delivery_time, revisions, tags, requirements, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
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
            parsedRequirements ? JSON.stringify(parsedRequirements) : null,
            serviceStatus
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
            message: responseMessage,
            serviceId: serviceId,
            is_draft: isDraft,
            verification_status: verificationStatus,
            will_activate_after: isDraft ? '2 hours' : null
        });

    } catch (err) {
        console.error("Service creation error:", err);
        res.status(500).json({ error: "Error creating service: " + err.message });
    }
});


// ==================== SERVICE FAVORITES ENDPOINT ====================
app.post("/api/services/:serviceId/favorite", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const serviceId = req.params.serviceId;
        const userId = req.session.user.id;

        // Check if already favorited
        const existing = await db.query(
            "SELECT id FROM service_favorites WHERE user_id = ? AND service_id = ?",
            [userId, serviceId]
        );

        let favorited = false;
        let favoriteCount = 0;

        if (existing && existing.length > 0) {
            // Remove favorite
            await db.query(
                "DELETE FROM service_favorites WHERE user_id = ? AND service_id = ?",
                [userId, serviceId]
            );
            favorited = false;
        } else {
            // Add favorite
            await db.query(
                "INSERT INTO service_favorites (user_id, service_id) VALUES (?, ?)",
                [userId, serviceId]
            );
            favorited = true;
        }

        // Get updated count
        const countResult = await db.query(
            "SELECT COUNT(*) as count FROM service_favorites WHERE service_id = ?",
            [serviceId]
        );
        
        favoriteCount = countResult[0]?.count || 0;

        // Update service table
        await db.query(
            "UPDATE services SET favorite_count = ? WHERE id = ?",
            [favoriteCount, serviceId]
        );

        res.json({
            success: true,
            favorited: favorited,
            favoriteCount: favoriteCount,
            message: favorited ? "Added to favorites" : "Removed from favorites"
        });

    } catch (err) {
        console.error("Favorite error:", err);
        res.status(500).json({ error: err.message });
    }
});



// ==================== GET USER PROFILE ENDPOINT ====================
app.get("/api/users/:userId/profile", async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const result = await db.query(
            `SELECT 
                u.id,
                u.username,
                u.email,
                u.created_at,
                fp.headline,
                fp.description,
                fp.hourly_rate,
                fp.skills,
                fp.languages,
                fp.experience_level,
                fp.location,
                fp.availability,
                fp.profile_picture_url as profile_picture,
                fp.completed_orders,
                fp.total_earnings,
                (SELECT AVG(rating) FROM service_reviews WHERE service_id IN (SELECT id FROM services WHERE user_id = u.id)) as avg_rating,
                (SELECT COUNT(*) FROM service_reviews WHERE service_id IN (SELECT id FROM services WHERE user_id = u.id)) as review_count,
                (SELECT COUNT(*) FROM services WHERE user_id = u.id AND status = 'active') as service_count
            FROM users u
            LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
            WHERE u.id = ?`,
            [userId]
        );

        let user = null;
        if (Array.isArray(result)) {
            user = result.length === 2 ? result[0][0] : result[0];
        }

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Parse skills if string
        if (user.skills && typeof user.skills === 'string') {
            try {
                user.skills = JSON.parse(user.skills);
            } catch (e) {
                user.skills = [];
            }
        }

        // Parse languages if string
        if (user.languages && typeof user.languages === 'string') {
            try {
                user.languages = JSON.parse(user.languages);
            } catch (e) {
                user.languages = [];
            }
        }

        res.json(user);

    } catch (err) {
        console.error("Error fetching user profile:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET USER CERTIFICATES ENDPOINT ====================
app.get("/api/users/:userId/certificates", async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const result = await db.query(
            "SELECT certificate_image_urls as certificate_images FROM freelancer_profiles WHERE user_id = ?",
            [userId]
        );

        let certificates = [];
        if (result && result.length > 0 && result[0].certificate_images) {
            try {
                certificates = JSON.parse(result[0].certificate_images);
            } catch (e) {
                certificates = [result[0].certificate_images];
            }
        }

        res.json({ certificate_images: certificates });

    } catch (err) {
        console.error("Error fetching certificates:", err);
        res.json({ certificate_images: [] });
    }
});



// DELETE CERTIFICATE - FIXED VERSION
app.delete("/api/freelancer/certificate-images/:index", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const index = parseInt(req.params.index);
        
        if (isNaN(index) || index < 0) {
            return res.status(400).json({ error: "Invalid certificate index" });
        }
        
        // Get current profile - check BOTH column names
        const currentProfile = await db.query(
            "SELECT certificate_images, certificate_image_urls FROM freelancer_profiles WHERE user_id = ?",
            [req.session.user.id]
        );

        if (!currentProfile || currentProfile.length === 0) {
            return res.status(404).json({ error: "Profile not found" });
        }

        let certificates = [];
        
        // Try certificate_image_urls first (newer column)
        if (currentProfile[0].certificate_image_urls) {
            try {
                certificates = JSON.parse(currentProfile[0].certificate_image_urls);
            } catch (e) {
                certificates = [];
            }
        }
        
        // Fallback to certificate_images (older column)
        if (certificates.length === 0 && currentProfile[0].certificate_images) {
            try {
                certificates = JSON.parse(currentProfile[0].certificate_images);
            } catch (e) {
                certificates = [];
            }
        }

        if (index >= 0 && index < certificates.length) {
            certificates.splice(index, 1);
            
            // Update BOTH columns to maintain consistency
            const certsJson = JSON.stringify(certificates);
            await db.query(
                `UPDATE freelancer_profiles 
                 SET certificate_image_urls = ?, 
                     certificate_images = ?,
                     updated_at = NOW() 
                 WHERE user_id = ?`,
                [certsJson, certsJson, req.session.user.id]
            );
            
            res.json({
                success: true,
                message: "Certificate removed successfully",
                certificate_images: certificates
            });
        } else {
            res.status(400).json({ 
                error: `Invalid certificate index: ${index}. Total certificates: ${certificates.length}` 
            });
        }
        
    } catch (err) {
        console.error("Error deleting certificate:", err);
        res.status(500).json({ error: err.message });
    }
});
// ==================== SERVICE FAVORITES ENDPOINT ====================
app.post("/api/services/:serviceId/favorite", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const serviceId = req.params.serviceId;
        const userId = req.session.user.id;

        // Check if table exists, if not create it
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS service_favorites (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT NOT NULL,
                    service_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_favorite (user_id, service_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
                )
            `);
        } catch (tableErr) {
            console.log("Table might already exist");
        }

        // Check if already favorited
        const existing = await db.query(
            "SELECT id FROM service_favorites WHERE user_id = ? AND service_id = ?",
            [userId, serviceId]
        );

        let favorited = false;
        let favoriteCount = 0;

        if (existing && existing.length > 0) {
            // Remove favorite
            await db.query(
                "DELETE FROM service_favorites WHERE user_id = ? AND service_id = ?",
                [userId, serviceId]
            );
            favorited = false;
        } else {
            // Add favorite
            await db.query(
                "INSERT INTO service_favorites (user_id, service_id) VALUES (?, ?)",
                [userId, serviceId]
            );
            favorited = true;
        }

        // Get updated count
        const countResult = await db.query(
            "SELECT COUNT(*) as count FROM service_favorites WHERE service_id = ?",
            [serviceId]
        );
        
        favoriteCount = countResult[0]?.count || 0;

        // Update service table if favorite_count column exists
        try {
            await db.query(
                "UPDATE services SET favorite_count = ? WHERE id = ?",
                [favoriteCount, serviceId]
            );
        } catch (updateErr) {
            console.log("favorite_count column might not exist yet");
        }

        res.json({
            success: true,
            favorited: favorited,
            favoriteCount: favoriteCount,
            message: favorited ? "Added to favorites" : "Removed from favorites"
        });

    } catch (err) {
        console.error("Favorite error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET SERVICE FAVORITES FOR USER ====================
app.get("/api/services/favorites", async (req, res) => {
    if (!req.session.user) {
        return res.json([]);
    }

    try {
        const userId = req.session.user.id;
        
        const favorites = await db.query(`
            SELECT s.*, u.username 
            FROM service_favorites sf
            JOIN services s ON sf.service_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE sf.user_id = ?
            ORDER BY sf.created_at DESC
        `, [userId]);

        res.json(favorites || []);
        
    } catch (err) {
        console.error("Error fetching favorites:", err);
        res.json([]);
    }
});

// Block recruiting for expired freelancers
app.post("/api/freelancer/recruit", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }
    
    const { freelancerId, serviceId } = req.body;
    
    // Check if the freelancer being recruited has active subscription
    const freelancerResult = await db.query(
        `SELECT subscription_status, subscription_end_date, trial_end_date 
         FROM users WHERE id = ? AND role = 'freelancer'`,
        [freelancerId]
    );
    
    if (freelancerResult && freelancerResult.length > 0) {
        const freelancer = freelancerResult[0];
        const today = new Date();
        let hasActiveSubscription = false;
        
        if (freelancer.trial_end_date && today <= new Date(freelancer.trial_end_date)) {
            hasActiveSubscription = true;
        }
        if (!hasActiveSubscription && freelancer.subscription_end_date && today <= new Date(freelancer.subscription_end_date)) {
            hasActiveSubscription = true;
        }
        
        if (!hasActiveSubscription) {
            return res.status(403).json({ 
                error: "This freelancer's account is inactive. They cannot be recruited until they renew their subscription.",
                freelancer_expired: true
            });
        }
    }
    
    // Continue with existing recruitment logic
    try {
        const clientId = req.session.user.id;
        
        if (req.session.user.role !== 'client') {
            return res.status(403).json({ error: "Only clients can recruit freelancers" });
        }
        
        if (parseInt(clientId) === parseInt(freelancerId)) {
            return res.status(400).json({ error: "You cannot recruit yourself" });
        }
        
        const freelancerCheck = await db.query(
            "SELECT id FROM users WHERE id = ? AND role = 'freelancer'",
            [freelancerId]
        );
        
        if (!freelancerCheck || freelancerCheck.length === 0) {
            return res.status(404).json({ error: "Freelancer not found" });
        }
        
        const existing = await db.query(
            "SELECT id FROM client_providers WHERE client_id = ? AND freelancer_id = ?",
            [clientId, freelancerId]
        );
        
        if (existing && existing.length > 0) {
            await db.query(
                `UPDATE client_providers 
                 SET service_id = COALESCE(?, service_id),
                     last_contacted = NOW(),
                     status = 'active'
                 WHERE client_id = ? AND freelancer_id = ?`,
                [serviceId || null, clientId, freelancerId]
            );
            
            return res.json({
                success: true,
                message: "Provider already in your list, updated successfully"
            });
        }
        
        await db.query(
            `INSERT INTO client_providers (client_id, freelancer_id, service_id, recruited_at, last_contacted, status) 
             VALUES (?, ?, ?, NOW(), NOW(), 'active')`,
            [clientId, freelancerId, serviceId || null]
        );
        
        res.json({
            success: true,
            message: "Freelancer added to your providers list successfully!"
        });
        
    } catch (err) {
        console.error("Recruit error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET USER PROFILE ENDPOINT ====================
app.get("/api/users/:userId/profile", async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const result = await db.query(
            `SELECT 
                u.id,
                u.username,
                u.email,
                u.created_at,
                fp.headline,
                fp.description,
                fp.hourly_rate,
                fp.skills,
                fp.languages,
                fp.experience_level,
                fp.location,
                fp.phone,
                fp.website,
                fp.availability,
                fp.profile_picture_url as profile_picture,
                fp.completed_orders,
                fp.total_earnings,
                (SELECT COUNT(*) FROM services WHERE user_id = u.id AND status = 'active') as service_count
            FROM users u
            LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
            WHERE u.id = ?`,
            [userId]
        );

        let user = null;
        if (Array.isArray(result) && result.length > 0) {
            user = result[0];
        }

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Parse skills if string
        if (user.skills && typeof user.skills === 'string') {
            try {
                user.skills = JSON.parse(user.skills);
            } catch (e) {
                user.skills = [];
            }
        }

        // Parse languages if string
        if (user.languages && typeof user.languages === 'string') {
            try {
                user.languages = JSON.parse(user.languages);
            } catch (e) {
                user.languages = [];
            }
        }

        res.json(user);

    } catch (err) {
        console.error("Error fetching user profile:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET USER CERTIFICATES ENDPOINT ====================
app.get("/api/users/:userId/certificates", async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const result = await db.query(
            "SELECT certificate_image_urls as certificate_images FROM freelancer_profiles WHERE user_id = ?",
            [userId]
        );

        let certificates = [];
        if (result && result.length > 0 && result[0].certificate_images) {
            try {
                certificates = JSON.parse(result[0].certificate_images);
            } catch (e) {
                certificates = [result[0].certificate_images];
            }
        }

        res.json({ certificate_images: certificates });

    } catch (err) {
        console.error("Error fetching certificates:", err);
        res.json({ certificate_images: [] });
    }
});
app.get("/api/client/providers", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    if (req.session.user.role !== 'client' && req.session.user.role !== 'admin') {
        return res.json([]);
    }

    try {
        const clientId = req.session.user.id;
        
        console.log("Fetching providers for client:", clientId);

        // REMOVED fp.avg_rating since it doesn't exist
        const result = await db.query(`
            SELECT 
                cp.*,
                u.id as freelancer_id,
                u.username,
                u.email,
                fp.profile_picture_url as profile_picture,
                fp.headline,
                fp.hourly_rate,
                fp.skills,
                fp.location,
                fp.completed_orders,
                fp.availability,
                s.id as service_id,
                s.title as service_title,
                s.price as service_price,
                s.category as service_category,
                DATE_FORMAT(cp.recruited_at, '%Y-%m-%d %H:%i:%s') as recruited_at,
                DATE_FORMAT(cp.last_contacted, '%Y-%m-%d %H:%i:%s') as last_contacted,
                cp.status
            FROM client_providers cp
            JOIN users u ON cp.freelancer_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = cp.freelancer_id
            LEFT JOIN services s ON cp.service_id = s.id
            WHERE cp.client_id = ? AND (cp.status = 'active' OR cp.status IS NULL)
            ORDER BY cp.last_contacted DESC, cp.recruited_at DESC
        `, [clientId]);

        // Extract rows properly
        let providers = [];
        if (result) {
            if (Array.isArray(result)) {
                if (result.length === 2 && Array.isArray(result[0])) {
                    providers = result[0];
                } else if (result.length > 0) {
                    providers = result;
                }
            } else if (result.rows) {
                providers = result.rows;
            }
        }

        // Add default rating for each provider
        providers = providers.map(provider => ({
            ...provider,
            avg_rating: 0 // Default rating since column doesn't exist
        }));

        res.json(providers);

    } catch (err) {
        console.error("Error loading freelancers:", err);
        res.json([]);
    }
});
// ==================== GET CLIENT'S FAVORITES ====================
app.get("/api/client/favorites", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const userId = req.session.user.id;
        
        const favorites = await db.query(`
            SELECT 
                s.*,
                u.username as provider_name,
                u.id as provider_id,
                fp.profile_picture_url as provider_picture,
                fp.headline as provider_headline,
                sf.created_at as favorited_at
            FROM service_favorites sf
            JOIN services s ON sf.service_id = s.id
            JOIN users u ON s.user_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = u.id
            WHERE sf.user_id = ? AND s.status = 'active'
            ORDER BY sf.created_at DESC
        `, [userId]);

        let favoritesList = [];
        if (Array.isArray(favorites)) {
            favoritesList = favorites.length === 2 ? favorites[0] : favorites;
        }

        res.json(favoritesList);

    } catch (err) {
        console.error("Error loading favorites:", err);
        res.status(500).json({ error: "Failed to load favorites: " + err.message });
    }
});

// UPDATE SERVICE (PUT endpoint)
app.put("/api/services/:id", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }
    
    try {
        const serviceId = req.params.id;
        const userId = req.session.user.id;
        
        // Check if user owns the service
        const serviceCheck = await db.query(
            "SELECT user_id FROM services WHERE id = ?",
            [serviceId]
        );
        
        if (!serviceCheck || serviceCheck.length === 0) {
            return res.status(404).json({ error: "Service not found" });
        }
        
        if (serviceCheck[0].user_id !== userId && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "You can only edit your own services" });
        }
        
        const { title, description, price, category, delivery_time, revisions } = req.body;
        
        await db.query(
            `UPDATE services 
             SET title = ?, description = ?, price = ?, category = ?, 
                 delivery_time = ?, revisions = ?, updated_at = NOW()
             WHERE id = ?`,
            [title, description, price, category, delivery_time, revisions, serviceId]
        );
        
        res.json({ success: true, message: "Service updated successfully" });
        
    } catch (err) {
        console.error("Update error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET FREELANCER'S CLIENTS ====================
app.get("/api/freelancer/clients", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    if (req.session.user.role !== 'freelancer' && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: "Access denied" });
    }

    try {
        const freelancerId = req.session.user.id;
        
        const clients = await db.query(`
            SELECT 
                cp.*,
                u.id as client_id,
                u.username,
                u.email,
                u.created_at,
                cp.recruited_at,
                cp.last_contacted,
                cp.total_orders,
                cp.total_spent,
                s.title as service_title,
                s.id as service_id
            FROM client_providers cp
            JOIN users u ON cp.client_id = u.id
            LEFT JOIN services s ON cp.service_id = s.id
            WHERE cp.freelancer_id = ? AND cp.status = 'active'
            ORDER BY cp.last_contacted DESC, cp.total_orders DESC
        `, [freelancerId]);

        // Ensure we return an array
        let clientsList = [];
        if (clients) {
            if (Array.isArray(clients)) {
                if (clients.length === 2 && Array.isArray(clients[0])) {
                    clientsList = clients[0];
                } else {
                    clientsList = clients;
                }
            }
        }
        
        res.json(clientsList);

    } catch (err) {
        console.error("Error loading freelancer's clients:", err);
        res.json([]); // Always return an array
    }
});
// ==================== GET FREELANCER RECRUITMENT STATS ====================
app.get("/api/freelancer/recruitment-stats", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const freelancerId = req.session.user.id;
        
        const stats = await db.query(`
            SELECT 
                COUNT(DISTINCT cp.client_id) as total_clients,
                COUNT(cp.id) as total_recruitments,
                SUM(cp.total_orders) as total_orders,
                SUM(cp.total_spent) as total_revenue,
                MAX(cp.recruited_at) as last_recruitment,
                (SELECT COUNT(*) FROM services WHERE user_id = ? AND status = 'active') as active_services,
                (SELECT COUNT(*) FROM service_favorites WHERE service_id IN (SELECT id FROM services WHERE user_id = ?)) as total_favorites
            FROM client_providers cp
            WHERE cp.freelancer_id = ?
        `, [freelancerId, freelancerId, freelancerId]);

        let recruitmentStats = {
            total_clients: 0,
            total_recruitments: 0,
            total_orders: 0,
            total_revenue: 0,
            active_services: 0,
            total_favorites: 0
        };

        if (stats && stats.length > 0) {
            recruitmentStats = {
                total_clients: parseInt(stats[0].total_clients) || 0,
                total_recruitments: parseInt(stats[0].total_recruitments) || 0,
                total_orders: parseInt(stats[0].total_orders) || 0,
                total_revenue: parseFloat(stats[0].total_revenue) || 0,
                active_services: parseInt(stats[0].active_services) || 0,
                total_favorites: parseInt(stats[0].total_favorites) || 0
            };
        }

        // Get top clients
        const topClients = await db.query(`
            SELECT 
                u.id,
                u.username,
                cp.total_orders,
                cp.total_spent,
                cp.recruited_at
            FROM client_providers cp
            JOIN users u ON cp.client_id = u.id
            WHERE cp.freelancer_id = ?
            ORDER BY cp.total_orders DESC, cp.total_spent DESC
            LIMIT 5
        `, [freelancerId]);

        // Get recent orders/recruitments
        const recentRecruitments = await db.query(`
            SELECT 
                u.username as client_name,
                cp.recruited_at,
                cp.total_orders,
                s.title as service_title
            FROM client_providers cp
            JOIN users u ON cp.client_id = u.id
            LEFT JOIN services s ON cp.service_id = s.id
            WHERE cp.freelancer_id = ?
            ORDER BY cp.recruited_at DESC
            LIMIT 10
        `, [freelancerId]);

        res.json({
            success: true,
            stats: recruitmentStats,
            top_clients: topClients || [],
            recent_recruitments: recentRecruitments || []
        });

    } catch (err) {
        console.error("Error loading recruitment stats:", err);
        res.status(500).json({ error: err.message });
    }
});
// Submit review for freelancer
app.post("/api/reviews/freelancer", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    if (req.session.user.role !== 'client') {
        return res.status(403).json({ error: "Only clients can submit reviews" });
    }

    try {
        const { freelancerId, serviceId, rating, comment } = req.body;
        
        if (!freelancerId || !rating || !comment) {
            return res.status(400).json({ error: "Freelancer ID, rating, and comment are required" });
        }
        
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Rating must be between 1 and 5" });
        }
        
        if (comment.length < 10) {
            return res.status(400).json({ error: "Review must be at least 10 characters" });
        }

        const clientId = req.session.user.id;

        // Check if client has worked with this freelancer
        const hasWorked = await db.query(
            "SELECT id FROM client_providers WHERE client_id = ? AND freelancer_id = ?",
            [clientId, freelancerId]
        );

        if (!hasWorked || hasWorked.length === 0) {
            return res.status(403).json({ error: "You can only review freelancers you've worked with" });
        }

        // Check if already reviewed
        const existingReview = await db.query(
            "SELECT id FROM freelancer_reviews WHERE client_id = ? AND freelancer_id = ?",
            [clientId, freelancerId]
        );

        let serviceIdValue = null;
        if (serviceId && serviceId !== 'null' && serviceId !== 'undefined' && !isNaN(parseInt(serviceId))) {
            serviceIdValue = parseInt(serviceId);
        }

        if (existingReview && existingReview.length > 0) {
            // Update existing review
            await db.query(
                "UPDATE freelancer_reviews SET rating = ?, comment = ?, updated_at = NOW() WHERE client_id = ? AND freelancer_id = ?",
                [rating, comment, clientId, freelancerId]
            );
        } else {
            // Insert new review
            await db.query(
                `INSERT INTO freelancer_reviews (freelancer_id, client_id, service_id, rating, comment, created_at) 
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [freelancerId, clientId, serviceIdValue, rating, comment]
            );
        }

        // Get updated rating for this freelancer
        const avgResult = await db.query(
            "SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM freelancer_reviews WHERE freelancer_id = ?",
            [freelancerId]
        );

        const avgRating = avgResult[0]?.avg_rating || 0;
        const reviewCount = avgResult[0]?.count || 0;

        // Update ONLY columns that exist in freelancer_profiles
        await db.query(
            "UPDATE freelancer_profiles SET review_count = ?, updated_at = NOW() WHERE user_id = ?",
            [reviewCount, freelancerId]
        );
        
        // Also update the users table if it has rating columns
        try {
            await db.query(
                "UPDATE users SET review_count = ? WHERE id = ?",
                [reviewCount, freelancerId]
            );
        } catch (userErr) {
            console.log("Users table update skipped - column may not exist");
        }

        res.json({
            success: true,
            message: existingReview && existingReview.length > 0 ? "Review updated successfully" : "Review submitted successfully",
            avg_rating: avgRating,
            review_count: reviewCount
        });

    } catch (err) {
        console.error("Error submitting review:", err);
        res.status(500).json({ error: err.message });
    }
});
// Get reviews for freelancer (their own reviews received)
app.get("/api/freelancer/reviews", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const freelancerId = req.session.user.id;
        
        const reviews = await db.query(`
            SELECT fr.*, u.username as client_name
            FROM freelancer_reviews fr
            JOIN users u ON fr.client_id = u.id
            WHERE fr.freelancer_id = ?
            ORDER BY fr.created_at DESC
        `, [freelancerId]);
        
        res.json({ reviews: reviews || [] });
        
    } catch (err) {
        console.error("Error fetching freelancer reviews:", err);
        res.json({ reviews: [] });
    }
});
// ==================== FLAG CLIENT (FREELANCER REPORTS CLIENT) ====================
app.post("/api/client/flag", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        if (req.session.user.role !== 'freelancer') {
            return res.status(403).json({ error: "Only freelancers can flag clients" });
        }
        
        const { client_id, service_id, reason } = req.body;
        
        if (!client_id || !reason) {
            return res.status(400).json({ error: "Client ID and reason are required" });
        }
        
        if (reason.length < 10) {
            return res.status(400).json({ error: "Reason must be at least 10 characters" });
        }
        
        if (parseInt(client_id) === parseInt(req.session.user.id)) {
            return res.status(400).json({ error: "You cannot flag yourself" });
        }
        
        // Check if client exists
        const clientCheck = await db.query(
            "SELECT role FROM users WHERE id = ?",
            [client_id]
        );
        
        if (!clientCheck || clientCheck.length === 0) {
            return res.status(404).json({ error: "Client not found" });
        }
        
        if (clientCheck[0].role !== 'client') {
            return res.status(400).json({ error: "Only clients can be flagged by freelancers" });
        }
        
        // Insert flag
        await db.query(
            `INSERT INTO client_flags (client_id, flagged_by_freelancer_id, service_id, reason, status, created_at)
             VALUES (?, ?, ?, ?, 'pending', NOW())`,
            [client_id, req.session.user.id, service_id || null, reason]
        );
        
        // Count total flags for this client
        const flagCountResult = await db.query(
            "SELECT COUNT(*) as count FROM client_flags WHERE client_id = ? AND status = 'pending'",
            [client_id]
        );
        
        const flagCount = flagCountResult[0]?.count || 1;
        
        res.json({
            success: true,
            message: "Client flagged successfully. Admin will review.",
            flagCount: flagCount
        });
        
    } catch (err) {
        console.error("❌ Flag client error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// DATA EXPORT ENDPOINTS
// ============================================

// Export all user data (for admin)
app.get("/api/export/user-data", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }

    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    
    // If not admin, only export their own data
    const queryUserId = isAdmin && req.query.userId ? req.query.userId : userId;
    
    // Get user info
    const userResult = await db.query(
      "SELECT id, username, email, role, created_at, verified, account_locked FROM users WHERE id = ?",
      [queryUserId]
    );
    
    if (!userResult || userResult.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const user = userResult[0];
    
    // Get user's products
    const products = await db.query(
      `SELECT id, title, description, price, type, category, 
              created_at, status, sales_count, favorite_count, rating
       FROM products 
       WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
       ORDER BY created_at DESC`,
      [queryUserId]
    );
    
    // Get user's orders (as buyer)
    const buyerOrders = await db.query(
      `SELECT o.id, o.product_name, o.quantity, o.total_amount, o.order_status,
              o.payment_status, o.created_at, o.completed_at, o.seller_earnings,
              o.platform_fee, o.delivery_phone, o.shipping_address
       FROM physical_orders o
       WHERE o.buyer_id = ?
       ORDER BY o.created_at DESC`,
      [queryUserId]
    );
    
    // Get user's sales (as seller)
    const sellerOrders = await db.query(
      `SELECT o.id, o.product_name, o.quantity, o.total_amount, o.order_status,
              o.payment_status, o.created_at, o.completed_at, o.seller_earnings,
              o.platform_fee, o.customer_name, o.customer_email, o.shipping_address
       FROM physical_orders o
       WHERE o.seller_id = ?
       ORDER BY o.created_at DESC`,
      [queryUserId]
    );
    
    // Get user's service orders (if freelancer)
    const serviceOrders = await db.query(
      `SELECT so.id, s.title as service_name, so.amount, so.status, so.created_at
       FROM service_orders so
       LEFT JOIN services s ON so.service_id = s.id
       WHERE so.buyer_id = ? OR so.seller_id = ?
       ORDER BY so.created_at DESC`,
      [queryUserId, queryUserId]
    );
    
    // Get user's reviews
    const reviewsGiven = await db.query(
      `SELECT r.id, r.rating, r.comment, p.title as product_name, r.created_at
       FROM reviews r
       LEFT JOIN products p ON r.product_id = p.id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
      [queryUserId]
    );
    
    const reviewsReceived = await db.query(
      `SELECT r.id, r.rating, r.comment, u.username as reviewer_name, 
              p.title as product_name, r.created_at
       FROM reviews r
       LEFT JOIN products p ON r.product_id = p.id
       LEFT JOIN users u ON r.user_id = u.id
       WHERE p.user_id = ?
       ORDER BY r.created_at DESC`,
      [queryUserId]
    );
    
    // Get favorites
    const favorites = await db.query(
      `SELECT f.id, p.title as product_name, f.created_at
       FROM favorites f
       LEFT JOIN products p ON f.product_id = p.id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [queryUserId]
    );
    
    // Get notifications
    const notifications = await db.query(
      `SELECT n.id, n.notification_type, n.title, n.message, n.is_read, n.created_at
       FROM buyer_notifications n
       WHERE n.buyer_id = ?
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [queryUserId]
    );
    
    const sellerNotifications = await db.query(
      `SELECT n.id, n.notification_type, n.title, n.message, n.is_read, n.created_at
       FROM seller_notifications n
       WHERE n.seller_id = ?
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [queryUserId]
    );
    
    // Compile all data
    const exportData = {
      exported_at: new Date().toISOString(),
      exported_by: {
        id: req.session.user.id,
        username: req.session.user.username,
        role: req.session.user.role
      },
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        verified: user.verified === 1,
        account_locked: user.account_locked === 1
      },
      summary: {
        total_products: products.length,
        total_orders_as_buyer: buyerOrders.length,
        total_sales_as_seller: sellerOrders.length,
        total_reviews_given: reviewsGiven.length,
        total_reviews_received: reviewsReceived.length,
        total_favorites: favorites.length,
        total_notifications: notifications.length + sellerNotifications.length
      },
      products: products.map(p => ({
        id: p.id,
        title: p.title,
        price: parseFloat(p.price),
        type: p.type,
        category: p.category,
        created_at: p.created_at,
        status: p.status,
        sales_count: p.sales_count || 0,
        favorite_count: p.favorite_count || 0,
        rating: parseFloat(p.rating) || 0
      })),
      orders_as_buyer: buyerOrders.map(o => ({
        id: o.id,
        product_name: o.product_name,
        quantity: parseInt(o.quantity),
        total_amount: parseFloat(o.total_amount),
        order_status: o.order_status,
        payment_status: o.payment_status,
        created_at: o.created_at,
        completed_at: o.completed_at,
        platform_fee: parseFloat(o.platform_fee) || 0,
        seller_earnings: parseFloat(o.seller_earnings) || 0
      })),
      sales_as_seller: sellerOrders.map(o => ({
        id: o.id,
        product_name: o.product_name,
        quantity: parseInt(o.quantity),
        total_amount: parseFloat(o.total_amount),
        order_status: o.order_status,
        payment_status: o.payment_status,
        created_at: o.created_at,
        completed_at: o.completed_at,
        platform_fee: parseFloat(o.platform_fee) || 0,
        seller_earnings: parseFloat(o.seller_earnings) || 0,
        customer_name: o.customer_name,
        customer_email: o.customer_email
      })),
      reviews_given: reviewsGiven.map(r => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        product_name: r.product_name,
        created_at: r.created_at
      })),
      reviews_received: reviewsReceived.map(r => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        product_name: r.product_name,
        reviewer_name: r.reviewer_name,
        created_at: r.created_at
      })),
      favorites: favorites.map(f => ({
        id: f.id,
        product_name: f.product_name,
        favorited_at: f.created_at
      })),
      notifications: [...notifications, ...sellerNotifications].map(n => ({
        id: n.id,
        type: n.notification_type,
        title: n.title,
        message: n.message,
        is_read: n.is_read === 1,
        created_at: n.created_at
      }))
    };
    
    // Return as JSON for download
    res.json({
      success: true,
      message: "Data exported successfully",
      data: exportData
    });
    
  } catch (err) {
    console.error("❌ Export error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Download as CSV
app.get("/api/export/csv/:type", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const { type } = req.params; // products, sales, orders, all
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    
    let data = [];
    let filename = '';
    
    if (type === 'products' || type === 'all') {
      const products = await db.query(
        `SELECT id, title, price, type, category, status, sales_count, 
                favorite_count, created_at
         FROM products 
         WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
         ORDER BY created_at DESC`,
        [userId]
      );
      
      data = products.map(p => ({
        'Product ID': p.id,
        'Title': p.title,
        'Price': parseFloat(p.price),
        'Type': p.type,
        'Category': p.category,
        'Status': p.status,
        'Sales Count': p.sales_count || 0,
        'Favorites': p.favorite_count || 0,
        'Created At': p.created_at
      }));
      
      filename = `my_products_${new Date().toISOString().split('T')[0]}.csv`;
    }
    
    else if (type === 'sales') {
      const sales = await db.query(
        `SELECT o.id, o.product_name, o.quantity, o.total_amount, o.order_status,
                o.payment_status, o.customer_name, o.customer_email, o.created_at,
                o.completed_at, o.platform_fee, o.seller_earnings
         FROM physical_orders o
         WHERE o.seller_id = ?
         ORDER BY o.created_at DESC`,
        [userId]
      );
      
      data = sales.map(s => ({
        'Order ID': s.id,
        'Product': s.product_name,
        'Quantity': parseInt(s.quantity),
        'Total Amount': parseFloat(s.total_amount),
        'Status': s.order_status,
        'Payment Status': s.payment_status,
        'Customer': s.customer_name,
        'Customer Email': s.customer_email,
        'Platform Fee': parseFloat(s.platform_fee) || 0,
        'Your Earnings': parseFloat(s.seller_earnings) || 0,
        'Order Date': s.created_at,
        'Completed Date': s.completed_at || ''
      }));
      
      filename = `my_sales_${new Date().toISOString().split('T')[0]}.csv`;
    }
    
    else if (type === 'orders') {
      const orders = await db.query(
        `SELECT o.id, o.product_name, o.quantity, o.total_amount, o.order_status,
                o.payment_status, o.seller_name, o.created_at, o.completed_at,
                o.platform_fee, o.seller_earnings, o.shipping_address
         FROM physical_orders o
         WHERE o.buyer_id = ?
         ORDER BY o.created_at DESC`,
        [userId]
      );
      
      data = orders.map(o => ({
        'Order ID': o.id,
        'Product': o.product_name,
        'Quantity': parseInt(o.quantity),
        'Total Amount': parseFloat(o.total_amount),
        'Status': o.order_status,
        'Payment Status': o.payment_status,
        'Seller': o.seller_name,
        'Platform Fee': parseFloat(o.platform_fee) || 0,
        'Seller Earnings': parseFloat(o.seller_earnings) || 0,
        'Order Date': o.created_at,
        'Completed Date': o.completed_at || ''
      }));
      
      filename = `my_orders_${new Date().toISOString().split('T')[0]}.csv`;
    }
    
    // Convert to CSV
    if (data.length === 0) {
      return res.status(404).json({ error: "No data to export" });
    }
    
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    csvRows.push(headers.join(','));
    
    for (const row of data) {
      const values = headers.map(header => {
        let val = row[header];
        if (val === undefined || val === null) val = '';
        if (typeof val === 'string') {
          // Escape quotes and wrap in quotes if contains comma
          val = val.replace(/"/g, '""');
          if (val.includes(',') || val.includes('\n')) {
            val = `"${val}"`;
          }
        }
        return val;
      });
      csvRows.push(values.join(','));
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvRows.join('\n'));
    
  } catch (err) {
    console.error("❌ CSV export error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get export summary (for dashboard)
app.get("/api/export/summary", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const userId = req.session.user.id;
    
    const productCount = await db.query(
      "SELECT COUNT(*) as count FROM products WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)",
      [userId]
    );
    
    const salesCount = await db.query(
      "SELECT COUNT(*) as count, SUM(total_amount) as total FROM physical_orders WHERE seller_id = ?",
      [userId]
    );
    
    const orderCount = await db.query(
      "SELECT COUNT(*) as count, SUM(total_amount) as total FROM physical_orders WHERE buyer_id = ?",
      [userId]
    );
    
    const reviewCount = await db.query(
      "SELECT COUNT(*) as count FROM reviews WHERE user_id = ?",
      [userId]
    );
    
    res.json({
      success: true,
      summary: {
        products: parseInt(productCount[0]?.count || 0),
        sales: {
          count: parseInt(salesCount[0]?.count || 0),
          total: parseFloat(salesCount[0]?.total || 0)
        },
        orders: {
          count: parseInt(orderCount[0]?.count || 0),
          total: parseFloat(orderCount[0]?.total || 0)
        },
        reviews: parseInt(reviewCount[0]?.count || 0)
      },
      export_types: ['products', 'sales', 'orders', 'all_data']
    });
    
  } catch (err) {
    console.error("❌ Export summary error:", err);
    res.status(500).json({ error: err.message });
  }
});
// ============================================
// FLAGGING SYSTEM BACKEND ROUTES
// ============================================

// Flag a user (client only) - WITH NOTIFICATION
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
        
        if (parseInt(flagged_user_id) === parseInt(req.session.user.id)) {
            return res.status(400).json({ error: "You cannot flag yourself" });
        }
        
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
        
        // Handle null service_id
        let serviceIdValue = null;
        if (service_id && service_id !== 'null' && service_id !== 'undefined' && !isNaN(parseInt(service_id))) {
            serviceIdValue = parseInt(service_id);
        }
        
        const flagResult = await db.query(
            `INSERT INTO user_flags (flagged_user_id, flagged_by_user_id, service_id, reason, status, created_at)
             VALUES (?, ?, ?, ?, 'pending', NOW())`,
            [flagged_user_id, req.session.user.id, serviceIdValue, reason]
        );
        
        const flagId = flagResult.insertId;
        
        // INSERT NOTIFICATION FOR FREELANCER - USING YOUR TABLE STRUCTURE
        await db.query(
            `INSERT INTO freelancer_notifications (freelancer_id, client_id, notification_type, title, message, created_at)
             VALUES (?, ?, 'flag', 'Account Flagged', ?, NOW())`,
            [flagged_user_id, req.session.user.id, `Your account has been flagged. Reason: ${reason.substring(0, 100)}`]
        );
        
        const flagCountResult = await db.query(
            "SELECT COUNT(*) as count FROM user_flags WHERE flagged_user_id = ?",
            [flagged_user_id]
        );
        
        const flagCount = flagCountResult[0]?.count || 1;
        
        let warningIssued = false;
        let accountLocked = false;
        
        if (flagCount === 1) {
            await db.query(
                `INSERT INTO user_warnings (user_id, warning_type, reason, issued_by, expires_at, created_at)
                 VALUES (?, 'flag', ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())`,
                [flagged_user_id, "Your account has been flagged. Please review our community guidelines.", null]
            );
            warningIssued = true;
        }
        
        if (flagCount >= 3) {
            const existingReview = await db.query(
                "SELECT id FROM admin_reviews WHERE user_id = ? AND status IN ('pending', 'under_review')",
                [flagged_user_id]
            );
            
            if (!existingReview || existingReview.length === 0) {
                await db.query(
                    `INSERT INTO admin_reviews (user_id, flag_count, status, created_at)
                     VALUES (?, ?, 'pending', NOW())`,
                    [flagged_user_id, flagCount]
                );
            } else {
                await db.query(
                    "UPDATE admin_reviews SET flag_count = ? WHERE user_id = ?",
                    [flagCount, flagged_user_id]
                );
            }
            
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

// ADMIN ROUTES - Get flagged users (FIXED for ONLY_FULL_GROUP_BY)
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
                (SELECT COUNT(*) FROM user_flags WHERE flagged_user_id = u.id AND status = 'pending') as flag_count,
                ar.status as review_status,
                ar.freelancer_statement,
                ar.created_at as review_created_at
            FROM users u
            LEFT JOIN admin_reviews ar ON ar.user_id = u.id
            WHERE u.role = 'freelancer'
            HAVING flag_count > 0 OR review_status IS NOT NULL
            ORDER BY flag_count DESC
        `);
        
        res.json({
            users: users.map(user => ({
                ...user,
                flag_count: parseInt(user.flag_count) || 0,
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

app.get("/api/freelancer/profile", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login to view profile" });
    }

    if (req.session.user.role !== 'freelancer' && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: "Access denied. Freelancer profile only." });
    }

    try {
        const userId = req.session.user.id;
        
        const userResult = await db.query(
            "SELECT id, username, email, created_at, role FROM users WHERE id = ?",
            [userId]
        );
        
        const user = userResult[0];
        
        const profileResult = await db.query(
            `SELECT *, 
                    profile_picture_url as profile_picture,
                    profile_picture as profile_picture_alt
             FROM freelancer_profiles WHERE user_id = ?`,
            [userId]
        );
        
        let profile = {};
        if (profileResult && profileResult.length > 0) {
            profile = profileResult[0];
            
            // Prioritize profile_picture_url, fallback to profile_picture
            const profilePic = profile.profile_picture_url || profile.profile_picture;
            profile.profile_picture = profilePic;
            
            // Parse JSON fields
            if (profile.skills && typeof profile.skills === 'string') {
                try {
                    profile.skills = JSON.parse(profile.skills);
                } catch (e) {
                    profile.skills = [];
                }
            }
            
            if (profile.languages && typeof profile.languages === 'string') {
                try {
                    profile.languages = JSON.parse(profile.languages);
                } catch (e) {
                    profile.languages = [];
                }
            }
        }
        
        const fullProfile = {
            ...profile,
            username: user.username,
            email: user.email,
            created_at: user.created_at,
            role: user.role
        };
        
        res.json(fullProfile);
        
    } catch (err) {
        console.error("Error loading profile:", err);
        res.status(500).json({ error: "Error loading profile: " + err.message });
    }
});

// Update freelancer profile
app.put("/api/freelancer/update-profile", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login to update profile" });
    }

    try {
        const userId = req.session.user.id;
        const {
            headline,
            description,
            hourly_rate,
            experience_level,
            availability,
            location,
            phone,
            website,
            education,
            certifications,
            skills,
            languages
        } = req.body;
        
        // Prepare update fields
        const updateFields = [];
        const updateValues = [];
        
        if (headline !== undefined) {
            updateFields.push("headline = ?");
            updateValues.push(headline);
        }
        if (description !== undefined) {
            updateFields.push("description = ?");
            updateValues.push(description);
        }
        if (hourly_rate !== undefined) {
            updateFields.push("hourly_rate = ?");
            updateValues.push(parseFloat(hourly_rate) || 0);
        }
        if (experience_level !== undefined) {
            updateFields.push("experience_level = ?");
            updateValues.push(experience_level);
        }
        if (availability !== undefined) {
            updateFields.push("availability = ?");
            updateValues.push(availability);
        }
        if (location !== undefined) {
            updateFields.push("location = ?");
            updateValues.push(location);
        }
        if (phone !== undefined) {
            updateFields.push("phone = ?");
            updateValues.push(phone);
        }
        if (website !== undefined) {
            updateFields.push("website = ?");
            updateValues.push(website);
        }
        if (education !== undefined) {
            updateFields.push("education = ?");
            updateValues.push(education);
        }
        if (certifications !== undefined) {
            updateFields.push("certifications = ?");
            updateValues.push(certifications);
        }
        if (skills !== undefined) {
            updateFields.push("skills = ?");
            updateValues.push(JSON.stringify(skills || []));
        }
        if (languages !== undefined) {
            updateFields.push("languages = ?");
            updateValues.push(JSON.stringify(languages || []));
        }
        
        updateFields.push("updated_at = NOW()");
        updateValues.push(userId);
        
        if (updateFields.length > 1) {
            const updateQuery = `
                UPDATE freelancer_profiles 
                SET ${updateFields.join(", ")}
                WHERE user_id = ?
            `;
            
            await db.query(updateQuery, updateValues);
        }
        
        res.json({
            success: true,
            message: "Profile updated successfully"
        });
        
    } catch (err) {
        console.error("Error updating profile:", err);
        res.status(500).json({ error: "Error updating profile: " + err.message });
    }
});
// Debug endpoint - Check what dashboard API actually returns
app.get("/api/debug/dashboard-raw", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }
    
    try {
        const userId = req.session.user.id;
        
        // Direct queries to see raw data
        const clientProviders = await db.query(
            "SELECT * FROM client_providers WHERE freelancer_id = ?",
            [userId]
        );
        
        const serviceCount = await db.query(
            "SELECT COUNT(*) as count FROM services WHERE user_id = ? AND status = 'active'",
            [userId]
        );
        
        const profile = await db.query(
            "SELECT * FROM freelancer_profiles WHERE user_id = ?",
            [userId]
        );
        
        // Now call the actual dashboard query
        const dashboardResult = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM services WHERE user_id = ? AND status = 'active') as total_services,
                (SELECT COUNT(DISTINCT client_id) FROM client_providers WHERE freelancer_id = ? AND status = 'active') as total_clients,
                (SELECT COUNT(*) FROM client_providers WHERE freelancer_id = ?) as total_recruitments,
                (SELECT avg_rating FROM freelancer_profiles WHERE user_id = ?) as avg_rating,
                (SELECT review_count FROM freelancer_profiles WHERE user_id = ?) as review_count,
                (SELECT completed_orders FROM freelancer_profiles WHERE user_id = ?) as completed_orders,
                (SELECT total_earnings FROM freelancer_profiles WHERE user_id = ?) as total_earnings
        `, [userId, userId, userId, userId, userId, userId, userId]);
        
        res.json({
            user_id: userId,
            client_providers_count: clientProviders.length,
            client_providers: clientProviders,
            service_count: serviceCount[0]?.count || 0,
            profile: profile[0] || null,
            dashboard_query_result: dashboardResult[0] || null,
            raw_dashboard_data: dashboardResult
        });
        
    } catch (err) {
        console.error("Debug error:", err);
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});
// ============================================
// FREELANCER DASHBOARD - FIXED
// ============================================

app.get("/api/freelancer/dashboard", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const userId = req.session.user.id;
        
        // Get service stats (active services only)
        const serviceStats = await db.query(
            "SELECT COUNT(*) as total FROM services WHERE user_id = ? AND status = 'active'",
            [userId]
        );
        
        // Get total clients (unique clients who recruited this freelancer)
        const clientStats = await db.query(
            `SELECT COUNT(DISTINCT client_id) as total 
             FROM client_providers 
             WHERE freelancer_id = ? AND status = 'active'`,
            [userId]
        );
        
        // Get recruitment stats (total recruitments)
        const recruitmentStats = await db.query(
            `SELECT COUNT(*) as total_recruitments
             FROM client_providers 
             WHERE freelancer_id = ?`,
            [userId]
        );
        
        // Get freelancer profile stats
        const profileStats = await db.query(
            "SELECT avg_rating, review_count, completed_orders, total_earnings FROM freelancer_profiles WHERE user_id = ?",
            [userId]
        );
        
        // ========== RECENT CLIENTS (most recent recruitment) ==========
        const recentClients = await db.query(`
            SELECT 
                u.id,
                u.username,
                cp.recruited_at,
                s.title as service_title
            FROM client_providers cp
            JOIN users u ON cp.client_id = u.id
            LEFT JOIN services s ON cp.service_id = s.id
            WHERE cp.freelancer_id = ? 
              AND cp.status = 'active'
            ORDER BY cp.recruited_at DESC
            LIMIT 5
        `, [userId]);
        
        // ========== TOP CLIENTS (most orders from service_orders) ==========
        const topClients = await db.query(`
            SELECT 
                u.id,
                u.username,
                COUNT(so.id) as total_orders,
                COALESCE(SUM(so.amount), 0) as total_spent
            FROM client_providers cp
            JOIN users u ON cp.client_id = u.id
            LEFT JOIN service_orders so ON so.buyer_id = cp.client_id AND so.seller_id = cp.freelancer_id AND so.status = 'completed'
            WHERE cp.freelancer_id = ? 
              AND cp.status = 'active'
            GROUP BY u.id, u.username
            ORDER BY total_orders DESC, total_spent DESC
            LIMIT 5
        `, [userId]);
        
        // Build response with safe values
        const totalServices = serviceStats && serviceStats[0] ? parseInt(serviceStats[0].total) || 0 : 0;
        const totalClients = clientStats && clientStats[0] ? parseInt(clientStats[0].total) || 0 : 0;
        const totalRecruitments = recruitmentStats && recruitmentStats[0] ? parseInt(recruitmentStats[0].total_recruitments) || 0 : 0;
        const avgRating = profileStats && profileStats[0] ? parseFloat(profileStats[0].avg_rating) || 0 : 0;
        const reviewCount = profileStats && profileStats[0] ? parseInt(profileStats[0].review_count) || 0 : 0;
        const completedOrders = profileStats && profileStats[0] ? parseInt(profileStats[0].completed_orders) || 0 : 0;
        const totalEarnings = profileStats && profileStats[0] ? parseFloat(profileStats[0].total_earnings) || 0 : 0;
        
        // Process recent clients
        const recentClientsList = [];
        if (recentClients && recentClients.length > 0) {
            for (const client of recentClients) {
                recentClientsList.push({
                    id: client.id,
                    username: client.username || 'Unknown',
                    recruited_at: client.recruited_at,
                    service_title: client.service_title || 'General Service'
                });
            }
        }
        
        // Process top clients
        const topClientsList = [];
        if (topClients && topClients.length > 0) {
            for (const client of topClients) {
                topClientsList.push({
                    id: client.id,
                    username: client.username || 'Unknown',
                    total_orders: parseInt(client.total_orders) || 0,
                    total_spent: parseFloat(client.total_spent) || 0
                });
            }
        }
        
        const dashboardData = {
            services: {
                total_services: totalServices
            },
            clients: {
                total_clients: totalClients,
                recent: recentClientsList,
                top: topClientsList
            },
            recruitments: {
                total: totalRecruitments
            },
            profile: {
                completed_orders: completedOrders,
                total_earnings: totalEarnings,
                avg_rating: avgRating,
                review_count: reviewCount
            }
        };
        
        console.log("Dashboard data sent:", JSON.stringify(dashboardData, null, 2));
        res.json(dashboardData);
        
    } catch (err) {
        console.error("Error loading dashboard:", err);
        // Return default values instead of error
        res.json({
            services: { total_services: 0 },
            clients: { total_clients: 0, recent: [], top: [] },
            recruitments: { total: 0 },
            profile: { completed_orders: 0, total_earnings: 0, avg_rating: 0, review_count: 0 }
        });
    }
});


// Add to your index.js
app.post("/api/client/flag", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        if (req.session.user.role !== 'freelancer') {
            return res.status(403).json({ error: "Only freelancers can flag clients" });
        }
        
        const { client_id, reason } = req.body;
        
        if (!client_id || !reason) {
            return res.status(400).json({ error: "Client ID and reason are required" });
        }
        
        if (reason.length < 10) {
            return res.status(400).json({ error: "Reason must be at least 10 characters" });
        }
        
        // Insert flag
        await db.query(
            `INSERT INTO client_flags (client_id, flagged_by_freelancer_id, reason, status, created_at)
             VALUES (?, ?, ?, 'pending', NOW())`,
            [client_id, req.session.user.id, reason]
        );
        
        res.json({
            success: true,
            message: "Client reported successfully. Admin will review."
        });
        
    } catch (err) {
        console.error("Flag client error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// SERVICE PAYMENT VERIFICATION
// ============================================

app.get("/api/verify-service-payment/:transactionId", async (req, res) => {
    try {
        const transactionId = req.params.transactionId;
        console.log(`🔍 Verifying service payment: ${transactionId}`);
        
        // Get payment record from subscription_payments table
        const paymentResult = await db.query(
            "SELECT * FROM subscription_payments WHERE transaction_ref = ? OR transaction_id = ?",
            [transactionId, transactionId]
        );
        
        let payment = null;
        if (paymentResult && paymentResult.length > 0) {
            payment = paymentResult[0];
        }
        
        if (!payment) {
            // Try to verify directly with Flutterwave
            const response = await axios.get(
                `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );
            
            if (response.data.status === "success" && response.data.data.status === "successful") {
                const transaction = response.data.data;
                const tx_ref = transaction.tx_ref;
                
                // Update subscription if this is a subscription payment
                if (tx_ref && (tx_ref.startsWith('sub_monthly') || tx_ref.startsWith('sub_yearly'))) {
                    await db.query(
                        `UPDATE subscription_payments 
                         SET payment_status = 'completed',
                             transaction_id = ?,
                             flutterwave_response = ?
                         WHERE transaction_ref = ?`,
                        [transactionId, JSON.stringify(transaction), tx_ref]
                    );
                    
                    // Update user subscription
                    const plan = tx_ref.includes('yearly') ? 'yearly' : 'monthly';
                    const now = new Date();
                    let subscriptionEnd = new Date();
                    
                    if (plan === 'monthly') {
                        subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);
                    } else {
                        subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1);
                    }
                    
                    await db.query(
                        `UPDATE users 
                         SET subscription_plan = ?,
                             subscription_status = 'active',
                             subscription_start_date = ?,
                             subscription_end_date = ?,
                             trial_end_date = NULL
                         WHERE id = ?`,
                        [plan, now, subscriptionEnd, transaction.meta?.user_id]
                    );
                    
                    return res.json({
                        status: "success",
                        message: "Subscription activated successfully",
                        plan: plan,
                        validUntil: subscriptionEnd
                    });
                }
            }
        }
        
        if (payment && payment.payment_status === 'completed') {
            res.json({
                status: "success",
                message: "Payment already verified",
                plan: payment.plan,
                amount: payment.amount
            });
        } else {
            res.status(400).json({ 
                status: "failed", 
                message: "Payment not found or not completed" 
            });
        }
        
    } catch (err) {
        console.error("❌ Service payment verification error:", err);
        res.status(500).json({ 
            status: "error", 
            message: err.message 
        });
    }
});
// =================== SUBSCRIPTION SYSTEM ===================

// Check subscription status for freelancers (updated)
app.get("/api/subscription/status", async (req, res) => {
    if (!req.session.user) {
        return res.json({ 
            hasActiveSubscription: false,
            requiresSubscription: false,
            role: null
        });
    }

    try {
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Clients don't need subscription
        if (userRole === 'client') {
            return res.json({
                hasActiveSubscription: true,
                requiresSubscription: false,
                role: 'client',
                message: "Clients have free access to all features"
            });
        }

        // Admins always have access
        if (userRole === 'admin') {
            return res.json({
                hasActiveSubscription: true,
                requiresSubscription: false,
                role: 'admin'
            });
        }

        // For freelancers, check subscription/trial
        const userResult = await db.query(
            `SELECT subscription_status, subscription_plan, subscription_end_date, 
                    trial_start_date, trial_end_date, role, created_at
             FROM users WHERE id = ?`,
            [userId]
        );
        
        let user = null;
        if (Array.isArray(userResult)) {
            if (userResult.length === 2 && Array.isArray(userResult[0]) && userResult[0].length > 0) {
                user = userResult[0][0];
            } else if (userResult.length > 0) {
                user = userResult[0];
            }
        }

        if (!user) {
            return res.json({ 
                hasActiveSubscription: false,
                requiresSubscription: true,
                role: userRole
            });
        }

        const today = new Date();
        let isActive = false;
        let daysLeft = 0;
        let subscriptionPlan = user.subscription_plan || 'free_trial';
        
        // Check trial period
        if (user.trial_end_date) {
            const trialEnd = new Date(user.trial_end_date);
            if (today <= trialEnd) {
                isActive = true;
                daysLeft = Math.ceil((trialEnd - today) / (1000 * 60 * 60 * 24));
                subscriptionPlan = 'free_trial';
            }
        }
        
        // Check paid subscription if trial expired
        if (!isActive && user.subscription_end_date) {
            const subEnd = new Date(user.subscription_end_date);
            if (today <= subEnd) {
                isActive = true;
                daysLeft = Math.ceil((subEnd - today) / (1000 * 60 * 60 * 24));
                subscriptionPlan = user.subscription_plan || 'monthly';
            }
        }

        // Update status if expired
        if (!isActive && user.subscription_status === 'active') {
            await db.query(
                "UPDATE users SET subscription_status = 'expired' WHERE id = ?",
                [userId]
            );
        }

        // Calculate trial days remaining for new freelancers
        let trialDaysRemaining = 0;
        if (user.role === 'freelancer' && !user.trial_end_date) {
            // New freelancer, should have 90 days trial from registration
            const createdAt = new Date(user.created_at);
            const trialEnd = new Date(createdAt);
            trialEnd.setDate(trialEnd.getDate() + 90);
            const daysSinceCreation = Math.ceil((today - createdAt) / (1000 * 60 * 60 * 24));
            trialDaysRemaining = Math.max(0, 90 - daysSinceCreation);
        }

        res.json({
            hasActiveSubscription: isActive,
            requiresSubscription: !isActive && userRole === 'freelancer',
            role: userRole,
            subscriptionStatus: user.subscription_status || (isActive ? 'active' : 'expired'),
            subscriptionPlan: subscriptionPlan,
            daysLeft: daysLeft > 0 ? daysLeft : trialDaysRemaining,
            trialEndDate: user.trial_end_date,
            subscriptionEndDate: user.subscription_end_date,
            isTrial: subscriptionPlan === 'free_trial'
        });

    } catch (err) {
        console.error("Subscription status error:", err);
        res.json({ 
            hasActiveSubscription: false,
            requiresSubscription: req.session.user?.role === 'freelancer',
            role: req.session.user?.role,
            error: "Error checking subscription"
        });
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
            redirect_url: "https://coreinsightmarket.com/subscription-callback.html",
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
            redirect_url: "https://coreinsightmarket.com/subscription-callback.html",
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





// GET /api/orders/:orderId - UPDATED with product images
app.get("/api/orders/:orderId", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    
    const orderResult = await db.query(`
      SELECT o.*, 
             p.id as product_id,
             p.title as product_name, 
             p.images,
             p.image_urls,
             u_seller.username as seller_name, 
             u_seller.email as seller_email,
             u_buyer.username as buyer_name, 
             u_buyer.email as buyer_email
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u_seller ON o.seller_id = u_seller.id
      LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
      WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)
    `, [orderId, req.session.user.id, req.session.user.id]);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    
    // Parse product image
    let productImage = null;
    const imageSource = order.images || order.image_urls;
    if (imageSource) {
      try {
        if (typeof imageSource === 'string') {
          if (imageSource.startsWith('[')) {
            const parsed = JSON.parse(imageSource);
            productImage = Array.isArray(parsed) ? parsed[0] : parsed;
          } else if (imageSource.startsWith('http')) {
            productImage = imageSource;
          }
        } else if (Array.isArray(imageSource)) {
          productImage = imageSource[0];
        }
      } catch (e) {
        productImage = null;
      }
    }
    
    const responseOrder = {
      id: order.id,
      product_id: order.product_id,
      product_name: order.product_name,
      product_image: productImage,
      quantity: parseInt(order.quantity),
      price: parseFloat(order.price),
      total_amount: parseFloat(order.total_amount),
      order_status: order.order_status,
      payment_status: order.payment_status,
      shipping_address: order.shipping_address,
      delivery_phone: order.delivery_phone,
      city: order.city,
      state: order.state,
      country: order.country,
      notes: order.notes,
      created_at: order.created_at,
      seller_accepted_at: order.seller_accepted_at,
      payment_collected_at: order.payment_collected_at,
      payment_held_until: order.payment_held_until,
      delivered_at: order.delivered_at,
      completed_at: order.completed_at,
      estimated_delivery_days: order.estimated_delivery_days || 7,
      has_delivery_code: !!(order.delivery_code && order.order_status === 'shipped'),
      delivery_code_generated_at: order.delivery_code_sent_at,
      delivery_code_used: order.delivery_code_used === 1,
      buyer: {
        id: order.buyer_id,
        name: order.buyer_name,
        email: order.buyer_email
      },
      seller: {
        id: order.seller_id,
        name: order.seller_name,
        email: order.seller_email
      },
      platform_fee: parseFloat(order.platform_fee) || 0,
      seller_earnings: parseFloat(order.seller_earnings) || 0,
      refund_available: order.order_status === 'delivered' && order.payment_held_until && new Date(order.payment_held_until) > new Date(),
      refund_deadline: order.payment_held_until
    };
    
    res.json({ success: true, order: responseOrder });
    
  } catch (err) {
    console.error("❌ Error loading order:", err);
    res.status(500).json({ error: err.message });
  }
});;


// ===========================================
// UNIFIED WEBHOOK - HANDLES ALL PAYMENT TYPES
// ============================================

app.post("/api/webhook/paystack", async (req, res) => {
  try {
    const event = req.body;
    const signature = req.headers['x-paystack-signature'];
    
    console.log("📨 Paystack webhook received:", event.event);
    
    // Verify signature
    const crypto = require('crypto');
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (hash !== signature) {
      console.log("⚠️ Invalid webhook signature");
      return res.status(401).send('Invalid signature');
    }
    
    if (event.event === 'charge.success') {
      const transaction = event.data;
      const reference = transaction.reference;
      const amount = transaction.amount / 100;
      
      console.log(`✅ Payment successful! Reference: ${reference}, Amount: ₦${amount}`);
      
      // Detect payment type from reference
      if (reference.includes('DIGITAL_')) {
        // DIGITAL PRODUCT
        await handleDigitalProductPayment(reference);
      } 
      else if (reference.includes('COURSE_')) {
        // COURSE PAYMENT
        await handleCoursePayment(reference);
      }
      else if (reference.includes('sub_monthly') || reference.includes('sub_yearly')) {
        // SUBSCRIPTION PAYMENT
        await handleSubscriptionPayment(reference);
      }
      else {
        // PHYSICAL PRODUCT (default)
        await handlePhysicalProductPayment(reference);
      }
    }
    
    res.sendStatus(200);
    
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.sendStatus(500);
  }
});

// Helper functions
async function handleDigitalProductPayment(reference) {
  console.log(`📦 Processing digital product payment: ${reference}`);
  
  await db.query(
    `UPDATE digital_orders 
     SET status = 'completed', 
         completed_at = NOW(),
         paystack_reference = ?
     WHERE transaction_ref = ? OR transaction_ref LIKE ?`,
    [reference, reference, `%${reference}%`]
  );
  
  // Generate download token
  const orderResult = await db.query(
    `SELECT id FROM digital_orders WHERE transaction_ref LIKE ?`,
    [`%${reference}%`]
  );
  
  if (orderResult && orderResult.length > 0) {
    const orderId = orderResult[0].id;
    const downloadToken = crypto.randomBytes(32).toString('hex');
    
    await db.query(
      `UPDATE digital_orders 
       SET download_url = ?, download_expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY)
       WHERE id = ?`,
      [`/api/download-digital/${orderId}?token=${downloadToken}`, orderId]
    );
    
    console.log(`✅ Digital order #${orderId} completed`);
  }
}

async function handlePhysicalProductPayment(reference) {
  console.log(`📦 Processing physical product payment: ${reference}`);
  
  let cleanRef = reference;
  if (cleanRef.startsWith('PS_')) cleanRef = cleanRef.substring(3);
  
  await db.query(
    `UPDATE physical_orders 
     SET payment_status = 'paid',
         order_status = 'paid',
         payment_collected_at = NOW(),
         payment_held_until = DATE_ADD(NOW(), INTERVAL 5 DAY),
         transaction_ref = ?
     WHERE transaction_ref = ? OR transaction_ref LIKE ?`,
    [reference, cleanRef, `%${cleanRef}%`]
  );
  
  console.log(`✅ Physical order updated`);
}

async function handleCoursePayment(reference) {
  console.log(`📚 Processing course payment: ${reference}`);
  
  const courseResult = await db.query(
    `SELECT * FROM payments WHERE transaction_ref = ?`,
    [reference]
  );
  
  if (courseResult && courseResult.length > 0) {
    await db.query(
      `UPDATE payments SET status = 'completed' WHERE transaction_ref = ?`,
      [reference]
    );
    
    // Add to user_courses
    await db.query(
      `INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at)
       SELECT user_id, course_id, 'completed', NOW()
       FROM payments WHERE transaction_ref = ?`,
      [reference]
    );
  }
}

async function handleSubscriptionPayment(reference) {
  console.log(`💳 Processing subscription payment: ${reference}`);
  
  await db.query(
    `UPDATE subscription_payments 
     SET payment_status = 'completed', payment_date = NOW()
     WHERE transaction_ref = ?`,
    [reference]
  );
  
  // Extract plan from reference
  const plan = reference.includes('yearly') ? 'yearly' : 'monthly';
  const userId = await db.query(
    `SELECT user_id FROM subscription_payments WHERE transaction_ref = ?`,
    [reference]
  );
  
  if (userId && userId.length > 0) {
    const subscriptionEnd = new Date();
    if (plan === 'monthly') {
      subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);
    } else {
      subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1);
    }
    
    await db.query(
      `UPDATE users 
       SET subscription_plan = ?,
           subscription_status = 'active',
           subscription_start_date = NOW(),
           subscription_end_date = ?,
           trial_end_date = NULL
       WHERE id = ?`,
      [plan, subscriptionEnd, userId[0].user_id]
    );
  }
}

// ============================================
// FLUTTERWAVE WEBHOOK - HANDLES ALL PAYMENT TYPES
// ============================================


app.post("/api/webhook/flutterwave", async (req, res) => {
  try {
    const event = req.body;
    
    console.log("📨 Flutterwave webhook received:", event.event);
    
    // ✅ FIXED: Flutterwave uses 'verif-hash' header (lowercase)
    const signature = req.headers['verif-hash'];
    const expectedSignature = process.env.FLW_WEBHOOK_SECRET;
    
    console.log(`Signature received: ${signature}`);
    console.log(`Expected signature: ${expectedSignature ? 'present' : 'missing'}`);
    
    // Only verify signature if webhook secret is configured
    if (expectedSignature && signature !== expectedSignature) {
      console.log("⚠️ Invalid Flutterwave webhook signature - ignoring");
      // Still return 200 to prevent Flutterwave from retrying
      return res.sendStatus(200);
    }
    
    if (event.event === "charge.completed" && event.data.status === "successful") {
      const transaction = event.data;
      let tx_ref = transaction.tx_ref;
      const amount = transaction.amount;
      const currency = transaction.currency;
      
      console.log(`✅ Flutterwave payment successful! Reference: ${tx_ref}, Amount: ${amount} ${currency}`);
      
      // Clean the reference (remove FW_ prefix if present)
      if (tx_ref && tx_ref.startsWith('FW_')) {
        tx_ref = tx_ref.substring(3);
        console.log(`Cleaned reference: ${tx_ref}`);
      }
      
      // Detect payment type from reference
      if (tx_ref && tx_ref.includes('DIGITAL_')) {
        // DIGITAL PRODUCT
        await handleFlutterwaveDigitalPayment(tx_ref, transaction);
      }
      else if (tx_ref && tx_ref.includes('COURSE_')) {
        // COURSE PAYMENT
        await handleFlutterwaveCoursePayment(tx_ref, transaction);
      }
      else if (tx_ref && (tx_ref.includes('sub_monthly') || tx_ref.includes('sub_yearly'))) {
        // SUBSCRIPTION PAYMENT
        await handleFlutterwaveSubscriptionPayment(tx_ref, transaction);
      }
      else if (tx_ref && (tx_ref.includes('ORDER_') || tx_ref.includes('FW_'))) {
        // PHYSICAL PRODUCT
        await handleFlutterwavePhysicalPayment(tx_ref, transaction);
      }
    }
    
    res.sendStatus(200);
    
  } catch (err) {
    console.error("❌ Flutterwave webhook error:", err);
    res.sendStatus(500);
  }
});

// Helper: Handle Flutterwave Digital Payment
async function handleFlutterwaveDigitalPayment(tx_ref, transaction) {
  console.log(`📦 Processing Flutterwave digital product payment: ${tx_ref}`);
  
  try {
    // Find the order by transaction_ref
    const orderResult = await db.query(
      `SELECT id FROM digital_orders WHERE transaction_ref = ? OR transaction_ref LIKE ?`,
      [tx_ref, `%${tx_ref}%`]
    );
    
    if (!orderResult || orderResult.length === 0) {
      console.log(`⚠️ Order not found for reference: ${tx_ref}`);
      return;
    }
    
    const orderId = orderResult[0].id;
    
    // Update order status
    await db.query(
      `UPDATE digital_orders 
       SET status = 'completed', 
           completed_at = NOW(),
           flutterwave_reference = ?,
           payment_gateway = 'flutterwave'
       WHERE id = ?`,
      [transaction.id, orderId]
    );
    
    // Generate download token and URL
    const downloadToken = crypto.randomBytes(32).toString('hex');
    const downloadUrl = `/api/download-digital/${orderId}?token=${downloadToken}`;
    const downloadExpiry = new Date();
    downloadExpiry.setDate(downloadExpiry.getDate() + 7);
    
    await db.query(
      `UPDATE digital_orders 
       SET download_url = ?, download_expires_at = ?
       WHERE id = ?`,
      [downloadUrl, downloadExpiry, orderId]
    );
    
    console.log(`✅ Digital order #${orderId} completed via Flutterwave webhook`);
    
  } catch (err) {
    console.error('Error processing digital payment webhook:', err);
  }
}

// Helper: Handle Flutterwave Physical Payment
async function handleFlutterwavePhysicalPayment(tx_ref, transaction) {
  console.log(`📦 Processing Flutterwave physical product payment: ${tx_ref}`);
  
  try {
    // Extract order ID from reference (format: ORDER_123_timestamp_random)
    let orderId = null;
    const orderMatch = tx_ref.match(/ORDER_(\d+)/);
    if (orderMatch) {
      orderId = orderMatch[1];
    }
    
    if (orderId) {
      await db.query(
        `UPDATE physical_orders 
         SET payment_status = 'paid',
             order_status = 'paid',
             payment_collected_at = NOW(),
             payment_held_until = DATE_ADD(NOW(), INTERVAL 5 DAY),
             transaction_ref = ?,
             flutterwave_reference = ?
         WHERE id = ?`,
        [tx_ref, transaction.id, orderId]
      );
      console.log(`✅ Physical order #${orderId} updated via Flutterwave webhook`);
    } else {
      console.log(`⚠️ Could not extract order ID from reference: ${tx_ref}`);
    }
    
  } catch (err) {
    console.error('Error processing physical payment webhook:', err);
  }
}

// Helper: Handle Flutterwave Course Payment
async function handleFlutterwaveCoursePayment(tx_ref, transaction) {
  console.log(`📚 Processing Flutterwave course payment: ${tx_ref}`);
  
  try {
    const courseId = transaction.meta?.course_id;
    const userId = transaction.meta?.user_id;
    
    if (courseId && userId) {
      await db.query(
        `INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at)
         VALUES (?, ?, 'completed', NOW())
         ON DUPLICATE KEY UPDATE payment_status = 'completed', purchased_at = NOW()`,
        [userId, courseId]
      );
      console.log(`✅ Course enrollment completed for user ${userId}, course ${courseId}`);
    }
    
  } catch (err) {
    console.error('Error processing course payment webhook:', err);
  }
}

// Helper: Handle Flutterwave Subscription Payment
async function handleFlutterwaveSubscriptionPayment(tx_ref, transaction) {
  console.log(`💳 Processing Flutterwave subscription payment: ${tx_ref}`);
  
  try {
    const userId = transaction.meta?.user_id;
    const plan = tx_ref.includes('yearly') ? 'yearly' : 'monthly';
    
    if (userId) {
      const subscriptionEnd = new Date();
      if (plan === 'monthly') {
        subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);
      } else {
        subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1);
      }
      
      await db.query(
        `UPDATE users 
         SET subscription_plan = ?,
             subscription_status = 'active',
             subscription_start_date = NOW(),
             subscription_end_date = ?,
             trial_end_date = NULL
         WHERE id = ?`,
        [plan, subscriptionEnd, userId]
      );
      
      await db.query(
        `UPDATE subscription_payments 
         SET payment_status = 'completed', 
             payment_date = NOW(),
             flutterwave_response = ?
         WHERE transaction_ref = ?`,
        [JSON.stringify(transaction), tx_ref]
      );
      
      console.log(`✅ Subscription activated for user ${userId} (${plan} plan)`);
    }
    
  } catch (err) {
    console.error('Error processing subscription payment webhook:', err);
  }
}
async function handleFlutterwaveServicePayment(tx_ref, transaction) {
  console.log(`🎯 Processing Flutterwave service payment: ${tx_ref}`);
  // Add your service payment logic here
}
// Universal callback handler - handles all payment types
app.get("/payment-callback", async (req, res) => {
    const { reference, trxref, transaction_id, tx_ref } = req.query;
    const paymentRef = reference || trxref || tx_ref || transaction_id;
    
    console.log(`🎯 Universal callback received. Reference: ${paymentRef}`);
    
    if (!paymentRef) {
        return res.redirect('/products.html');
    }
    
    // Determine payment type and redirect
    if (paymentRef.includes('DIGITAL_')) {
        return res.redirect(`/digital-payment-callback.html?reference=${paymentRef}`);
    }
    else if (paymentRef.includes('sub_monthly') || paymentRef.includes('sub_yearly')) {
        return res.redirect(`/subscription-callback.html?tx_ref=${paymentRef}&status=successful`);
    }
    else if (paymentRef.includes('coreinsight_')) {
        return res.redirect(`/payment-callback.html?reference=${paymentRef}&type=course`);
    }
    else if (paymentRef.includes('SERVICE_')) {
        return res.redirect(`/services-payment-verification.html?tx_ref=${paymentRef}`);
    }
    else {
        // Physical product (default)
        return res.redirect(`/payment-callback.html?reference=${paymentRef}`);
    }
});
// ============================================
// CREATE PHYSICAL ORDER PAYMENT - UPDATED
// ============================================
app.post("/api/create-physical-order-payment", async (req, res) => {
    try {
        console.log("📦 Creating physical order payment");
        
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const { productId, quantity, deliveryAddress, deliveryPhone, city, state, country, notes } = req.body;
        const qty = parseInt(quantity) || 1;
        
        // Get product with seller info
        const productResult = await db.query(`
            SELECT p.*, u.id as seller_id, u.email as seller_email, u.username as seller_name,
                   u.flutterwave_subaccount_id
            FROM products p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ? AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
        `, [productId]);
        
        if (!productResult || productResult.length === 0) {
            return res.status(404).json({ error: "Product not found" });
        }
        
        const product = productResult[0];
        const productPrice = parseFloat(product.price);
        const totalAmount = productPrice * qty;
        
        if (isNaN(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({ error: "Invalid amount" });
        }
        
        // ✅ SIMPLE 10% PLATFORM FEE
        const platformFee = totalAmount * 0.10;
        const sellerEarnings = totalAmount - platformFee;
        
        const feeBreakdown = {
            type: "standard",
            total_amount: totalAmount,
            platform_fee: platformFee,
            seller_earnings: sellerEarnings,
            note: `Flat 10% platform fee: $${platformFee.toFixed(2)} (10% of $${totalAmount.toFixed(2)})`
        };
        
        console.log(`💰 Order fee calculation:`, feeBreakdown);
        
        // Create unique transaction reference
        const transactionRef = `ORDER_${Date.now()}_${productId}_${Math.floor(Math.random() * 10000)}`;
        
        // ✅ IMPORTANT: payment_held_until = NULL (escrow NOT started yet)
        const orderResult = await db.query(
            `INSERT INTO physical_orders (
                product_id, seller_id, buyer_id, product_name, quantity, 
                price, total_amount,
                customer_name, customer_email, shipping_address, delivery_phone,
                city, state, country, notes,
                platform_fee, seller_earnings, fee_breakdown,
                transaction_ref, payment_provider, payment_status, order_status, 
                payment_held_until, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'flutterwave', 'pending', 'pending_seller_approval', NULL, NOW())`,
            [
                productId, product.seller_id, req.session.user.id, product.title, qty,
                productPrice, totalAmount,
                req.session.user.username, req.session.user.email,
                deliveryAddress, deliveryPhone, city || null, state || null, country || null, notes || null,
                platformFee, sellerEarnings, JSON.stringify(feeBreakdown),
                transactionRef
            ]
        );
        
        const orderId = orderResult.insertId;
        console.log(`✅ Order #${orderId} created with ${platformFee.toFixed(2)} platform fee (10%)`);
        console.log(`   Escrow status: NOT STARTED (payment_held_until = NULL)`);
        
        // Create Flutterwave payment link
        if (!process.env.FLW_SECRET_KEY) {
            return res.status(500).json({ error: "Payment system not configured. Please contact support." });
        }
        
        const flutterwaveRef = `FW_${transactionRef}`;
        
        const flutterwavePayload = {
            tx_ref: flutterwaveRef,
            amount: totalAmount,
            currency: "USD",
            redirect_url: "https://coreinsightmarket.com/payment-callback.html",
            customer: {
                email: req.session.user.email,
                name: req.session.user.username || "Customer"
            },
            customizations: {
                title: "Core Insight Marketplace",
                description: `${product.title} x${qty}`
            },
            meta: {
                product_id: productId,
                seller_id: product.seller_id,
                order_id: orderId,
                quantity: qty,
                type: 'physical_product',
                amount_usd: totalAmount,
                platform_fee: platformFee,
                seller_earnings: sellerEarnings,
                delivery_address: deliveryAddress,
                delivery_phone: deliveryPhone,
                fee_breakdown: JSON.stringify(feeBreakdown)
            }
        };
        
        // Add subaccount for 90/10 split
        if (product.flutterwave_subaccount_id) {
            flutterwavePayload.subaccounts = [{
                id: product.flutterwave_subaccount_id,
                transaction_split_ratio: 0.9
            }];
            console.log(`✅ Flutterwave subaccount added: ${product.flutterwave_subaccount_id}`);
        } else {
            console.log(`⚠️ No Flutterwave subaccount found for seller ${product.seller_id}`);
        }
        
        const response = await axios.post(
            'https://api.flutterwave.com/v3/payments',
            flutterwavePayload,
            {
                headers: {
                    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        if (response.data.status === 'success' && response.data.data?.link) {
            await db.query(
                `UPDATE physical_orders SET payment_link = ? WHERE id = ?`,
                [response.data.data.link, orderId]
            );
            
            res.json({
                success: true,
                paymentLink: response.data.data.link,
                transactionRef: transactionRef,
                orderId: orderId,
                gateway: 'flutterwave',
                amount_usd: totalAmount,
                platform_fee: platformFee,
                seller_earnings: sellerEarnings,
                fee_breakdown: feeBreakdown,
                escrow_status: "not_started",
                split: {
                    platform_percentage: 10,
                    seller_percentage: 90,
                    message: "Flat 10% platform fee on total amount"
                },
                message: `Redirecting to Flutterwave payment...`
            });
        } else {
            throw new Error(response.data.message || "Payment initialization failed");
        }
        
    } catch (err) {
        console.error("❌ Payment creation error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// FLUTTERWAVE WEBHOOK (for auto-split confirmation)
// ============================================

app.post("/api/webhooks/flutterwave", async (req, res) => {
    try {
        const event = req.body;
        
        console.log("📨 Flutterwave webhook received:", event.event);
        
        // Verify webhook signature (security)
        const signature = req.headers['verif-hash'];
        if (signature !== process.env.FLW_WEBHOOK_SECRET) {
            return res.status(401).json({ error: "Invalid signature" });
        }
        
        if (event.event === "charge.completed" && event.data.status === "successful") {
            const transactionRef = event.data.tx_ref;
            const amount = event.data.amount;
            const subaccountId = event.data.subaccount?.id;
            
            // Update order status
            await db.query(
                `UPDATE physical_orders 
                 SET payment_status = 'paid',
                     order_status = 'paid',
                     payment_collected_at = NOW(),
                     payment_held_until = DATE_ADD(NOW(), INTERVAL 5 DAY)
                 WHERE transaction_ref = ?`,
                [transactionRef]
            );
            
            // Update split status
            await db.query(
                `UPDATE transaction_splits 
                 SET status = 'completed'
                 WHERE transaction_ref = ?`,
                [transactionRef]
            );
            
            console.log(`✅ Webhook: Payment confirmed for ${transactionRef}. Split executed automatically.`);
        }
        
        res.sendStatus(200);
        
    } catch (err) {
        console.error("❌ Webhook error:", err);
        res.sendStatus(500);
    }
});

// Paystack Webhook
app.post("/api/webhooks/paystack", async (req, res) => {
    try {
        const event = req.body;
        
        console.log("📨 Paystack webhook received:", event.event);
        
        // Verify webhook signature
        const signature = req.headers['x-paystack-signature'];
        const crypto = require('crypto');
        const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
            .update(JSON.stringify(req.body))
            .digest('hex');
        
        if (hash !== signature) {
            return res.status(401).json({ error: "Invalid signature" });
        }
        
        if (event.event === 'charge.success') {
            const transactionRef = event.data.reference;
            const amount = event.data.amount / 100;
            
            await db.query(
                `UPDATE physical_orders 
                 SET payment_status = 'paid',
                     order_status = 'paid',
                     payment_collected_at = NOW(),
                     payment_held_until = DATE_ADD(NOW(), INTERVAL 5 DAY)
                 WHERE transaction_ref = ?`,
                [transactionRef]
            );
            
            await db.query(
                `UPDATE transaction_splits 
                 SET status = 'completed'
                 WHERE transaction_ref = ?`,
                [transactionRef]
            );
            
            console.log(`✅ Paystack webhook: Payment confirmed for ${transactionRef}`);
        }
        
        res.sendStatus(200);
        
    } catch (err) {
        console.error("❌ Paystack webhook error:", err);
        res.sendStatus(500);
    }
});
// Get banks for Flutterwave
app.get("/api/banks/flutterwave", async (req, res) => {
    try {
        const response = await axios.get(
            'https://api.flutterwave.com/v3/banks/NG',
            { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
        );
        res.json(response.data.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get banks for Paystack
app.get("/api/banks/paystack", async (req, res) => {
    try {
        const response = await axios.get(
            'https://api.paystack.co/bank',
            { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
        );
        res.json(response.data.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verify account number (Flutterwave)
app.post("/api/verify-account/flutterwave", async (req, res) => {
    try {
        const { account_number, bank_code } = req.body;
        
        const response = await axios.post(
            'https://api.flutterwave.com/v3/accounts/resolve',
            { account_number, account_bank: bank_code },
            { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
        );
        
        res.json({ status: 'success', account_name: response.data.data.account_name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verify account number (Paystack)
app.post("/api/verify-account/paystack", async (req, res) => {
    try {
        const { account_number, bank_code } = req.body;
        
        const response = await axios.get(
            `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
            { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
        );
        
        res.json({ status: 'success', account_name: response.data.data.account_name });
    } catch (err) {
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
// FLUTTERWAVE INTERNATIONAL BANKS
// ============================================

app.get("/api/banks/flutterwave/:country", async (req, res) => {
    try {
        const country = req.params.country;
        console.log(`🌍 Fetching banks for country: ${country}`);
        
        // Countries that Flutterwave actually supports
        const supportedCountries = ['NG', 'GH', 'KE', 'UG', 'TZ', 'ZA', 'RW', 'US', 'GB', 'CA'];
        
        if (!supportedCountries.includes(country)) {
            console.log(`⚠️ Country ${country} not supported by Flutterwave API`);
            return res.json([]);
        }
        
        const response = await axios.get(
            `https://api.flutterwave.com/v3/banks/${country}`,
            {
                headers: { 
                    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );
        
        if (response.data.status === 'success' && response.data.data && response.data.data.length > 0) {
            console.log(`✅ Found ${response.data.data.length} banks for ${country}`);
            res.json(response.data.data);
        } else {
            console.log(`⚠️ No banks found for ${country}`);
            res.json([]);
        }
        
    } catch (err) {
        const country = req.params.country;
        console.error(`❌ Error fetching banks for ${country}:`, err.message);
        
        // Return fallback banks for common countries
        const fallbackBanks = {
            'US': [
                { code: '021000021', name: 'Chase Bank' },
                { code: '026009593', name: 'Bank of America' },
                { code: '121000358', name: 'Wells Fargo' },
                { code: '021001088', name: 'Citibank' }
            ],
            'GB': [
                { code: '40-00-00', name: 'Barclays' },
                { code: '60-00-00', name: 'NatWest' },
                { code: '20-00-00', name: 'HSBC UK' }
            ],
            'NG': [
                { code: '000001', name: 'Access Bank' },
                { code: '000002', name: 'GTBank' },
                { code: '000003', name: 'Zenith Bank' },
                { code: '000004', name: 'First Bank' },
                { code: '000005', name: 'UBA' }
            ],
            'KE': [
                { code: '000001', name: 'Equity Bank' },
                { code: '000002', name: 'KCB Bank' },
                { code: '000003', name: 'Cooperative Bank' }
            ],
            'ZA': [
                { code: '000001', name: 'Standard Bank' },
                { code: '000002', name: 'First National Bank' },
                { code: '000003', name: 'ABSA' }
            ],
            'GH': [
                { code: '000001', name: 'Ghana Commercial Bank' },
                { code: '000002', name: 'Ecobank Ghana' }
            ],
            'UG': [
                { code: '000001', name: 'Centenary Bank' },
                { code: '000002', name: 'Stanbic Bank' }
            ],
            'TZ': [
                { code: '000001', name: 'CRDB Bank' },
                { code: '000002', name: 'NMB Bank' }
            ],
            'RW': [
                { code: '000001', name: 'Bank of Kigali' },
                { code: '000002', name: 'Equity Bank Rwanda' }
            ],
            'CA': [
                { code: '000001', name: 'Royal Bank of Canada' },
                { code: '000002', name: 'TD Canada Trust' },
                { code: '000003', name: 'Scotiabank' }
            ]
        };
        
        if (fallbackBanks[country]) {
            console.log(`📝 Using fallback banks for ${country}`);
            res.json(fallbackBanks[country]);
        } else {
            res.json([]);
        }
    }
});

// Helper function to get fallback banks for any country
function getFallbackBanksForCountry(countryCode) {
    const fallbackBanks = {
        // North America
        'US': [
            { code: '021000021', name: 'Chase Bank' },
            { code: '026009593', name: 'Bank of America' },
            { code: '121000358', name: 'Wells Fargo' },
            { code: '021001088', name: 'Citibank' },
            { code: '054001725', name: 'PNC Bank' }
        ],
        'CA': [
            { code: '000001', name: 'Royal Bank of Canada' },
            { code: '000002', name: 'TD Canada Trust' },
            { code: '000003', name: 'Scotiabank' },
            { code: '000004', name: 'Bank of Montreal' }
        ],
        // Europe
        'GB': [
            { code: '40-00-00', name: 'Barclays' },
            { code: '60-00-00', name: 'NatWest' },
            { code: '20-00-00', name: 'HSBC UK' },
            { code: '30-00-00', name: 'Lloyds Bank' }
        ],
        'FR': [
            { code: '30001', name: 'BNP Paribas' },
            { code: '30002', name: 'Société Générale' },
            { code: '30003', name: 'Crédit Agricole' }
        ],
        'DE': [
            { code: '10000000', name: 'Deutsche Bank' },
            { code: '20000000', name: 'Commerzbank' },
            { code: '30000000', name: 'Sparkasse' }
        ],
        'ES': [
            { code: '2100', name: 'Santander' },
            { code: '2101', name: 'BBVA' },
            { code: '2102', name: 'CaixaBank' }
        ],
        'IT': [
            { code: '03000', name: 'Intesa Sanpaolo' },
            { code: '02000', name: 'UniCredit' },
            { code: '01000', name: 'Poste Italiane' }
        ],
        'NL': [
            { code: 'ABNANL2A', name: 'ABN AMRO' },
            { code: 'INGBNL2A', name: 'ING Bank' },
            { code: 'RABONL2U', name: 'Rabobank' }
        ],
        // Africa
        'NG': [
            { code: '000001', name: 'Access Bank' },
            { code: '000002', name: 'GTBank' },
            { code: '000003', name: 'Zenith Bank' },
            { code: '000004', name: 'First Bank' },
            { code: '000005', name: 'UBA' }
        ],
        'GH': [
            { code: '000001', name: 'Ghana Commercial Bank' },
            { code: '000002', name: 'Ecobank Ghana' },
            { code: '000003', name: 'Stanbic Bank Ghana' }
        ],
        'KE': [
            { code: '000001', name: 'Equity Bank' },
            { code: '000002', name: 'KCB Bank' },
            { code: '000003', name: 'Cooperative Bank' }
        ],
        'ZA': [
            { code: '000001', name: 'Standard Bank' },
            { code: '000002', name: 'First National Bank' },
            { code: '000003', name: 'ABSA' },
            { code: '000004', name: 'Nedbank' }
        ],
        'UG': [
            { code: '000001', name: 'Centenary Bank' },
            { code: '000002', name: 'Stanbic Bank Uganda' },
            { code: '000003', name: 'Equity Bank Uganda' }
        ],
        'TZ': [
            { code: '000001', name: 'CRDB Bank' },
            { code: '000002', name: 'NMB Bank' },
            { code: '000003', name: 'Stanbic Bank Tanzania' }
        ],
        'RW': [
            { code: '000001', name: 'Bank of Kigali' },
            { code: '000002', name: 'Equity Bank Rwanda' },
            { code: '000003', name: 'I&M Bank Rwanda' }
        ],
        // Asia & Middle East
        'AE': [
            { code: '001', name: 'Emirates NBD' },
            { code: '002', name: 'Abu Dhabi Commercial Bank' },
            { code: '003', name: 'Dubai Islamic Bank' }
        ],
        'IN': [
            { code: 'SBIN0000001', name: 'State Bank of India' },
            { code: 'HDFC0000001', name: 'HDFC Bank' },
            { code: 'ICIC0000001', name: 'ICICI Bank' }
        ],
        // Oceania
        'AU': [
            { code: '01', name: 'Commonwealth Bank' },
            { code: '02', name: 'Westpac' },
            { code: '03', name: 'ANZ' },
            { code: '04', name: 'National Australia Bank' }
        ],
        'NZ': [
            { code: '01', name: 'ANZ Bank New Zealand' },
            { code: '02', name: 'BNZ' },
            { code: '03', name: 'Westpac New Zealand' }
        ]
    };
    
    // Return fallback for specific country or generic fallback
    if (fallbackBanks[countryCode]) {
        return fallbackBanks[countryCode];
    }
    
    // Generic fallback for any other country
    return [
        { code: 'MANUAL', name: 'Enter bank code manually' }
    ];
}

// Verify international account (Flutterwave) - Supports Real & Virtual Accounts
app.post("/api/verify-account/flutterwave/:country", async (req, res) => {
    try {
        const { account_number, bank_code, account_name } = req.body;
        const country = req.params.country || 'NG';
        
        console.log(`🔍 Verifying ${country} account:`, { account_number, bank_code });
        
        // Validate input
        if (!account_number || !bank_code) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Account number and bank code are required' 
            });
        }
        
        // Clean account number
        const cleanAccountNumber = account_number.replace(/[\s-]/g, '');
        
        // Try Flutterwave verification first
        try {
            const response = await axios.post(
                'https://api.flutterwave.com/v3/accounts/resolve',
                {
                    account_number: cleanAccountNumber,
                    account_bank: String(bank_code),
                    country: country
                },
                {
                    headers: { 
                        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );
            
            if (response.data.status === 'success' && response.data.data?.account_name) {
                console.log(`✅ Real account verified: ${response.data.data.account_name}`);
                return res.json({
                    status: 'success',
                    account_name: response.data.data.account_name,
                    account_number: cleanAccountNumber,
                    bank_name: response.data.data.bank_name || 'Bank',
                    account_type: 'real',
                    message: 'Account verified successfully!'
                });
            } else {
                throw new Error(response.data.message || 'Verification failed');
            }
            
        } catch (apiError) {
            console.log('Flutterwave verification failed, checking for virtual account...');
            
            // If verification fails but we have an account name, treat as virtual account
            if (account_name && account_name.trim()) {
                console.log(`✅ Virtual account accepted: ${account_name}`);
                return res.json({
                    status: 'success',
                    account_name: account_name.trim(),
                    account_number: cleanAccountNumber,
                    bank_name: getBankNameFromCode(bank_code, country),
                    account_type: 'virtual',
                    message: 'Virtual account accepted! Payouts will work.',
                    warning: 'Verification skipped - Virtual accounts are supported for payouts'
                });
            }
            
            // If no account name provided, return error with option to proceed as virtual
            return res.status(400).json({
                status: 'warning',
                message: 'Unable to verify automatically. Please confirm this is a virtual account (Raenest, Grey, etc.) and provide the account holder name.',
                requires_manual_name: true,
                can_proceed_as_virtual: true
            });
        }
        
    } catch (err) {
        console.error('❌ Account verification error:', err.response?.data || err.message);
        
        res.status(500).json({ 
            status: 'error', 
            message: err.response?.data?.message || 'Verification failed. Please check your account details.'
        });
    }
});

function getBankNameFromCode(bankCode, country) {
    const bankNames = {
        'US': {
            '021000021': 'Chase Bank',
            '026009593': 'Bank of America',
            '121000358': 'Wells Fargo',
            'default': 'US Bank'
        },
        'GB': {
            '40-00-00': 'Barclays',
            '60-00-00': 'NatWest',
            '20-00-00': 'HSBC UK',
            'default': 'UK Bank'
        },
        'NG': {
            '000001': 'Access Bank',
            '000002': 'GTBank',
            '000003': 'Zenith Bank',
            'default': 'Nigerian Bank'
        },
        'KE': {
            '000001': 'Equity Bank',
            '000002': 'KCB Bank',
            'default': 'Kenyan Bank'
        },
        'ZA': {
            '000001': 'Standard Bank',
            '000002': 'FNB',
            '000003': 'ABSA',
            'default': 'South African Bank'
        },
        'default': 'International Bank'
    };
    
    const countryBanks = bankNames[country] || bankNames.default;
    return countryBanks[bankCode] || countryBanks.default;
}


// ============================================
// PHYSICAL ORDER CREATION - WITH NOTIFICATIONS (FULL CODE)
// ============================================
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
        
        // ✅ SIMPLE 10% PLATFORM FEE
        const platformFee = totalAmount * 0.10;
        const sellerEarnings = totalAmount - platformFee;
        const estimatedDays = product.estimated_delivery_days || 7;
        
        const feeBreakdown = {
            type: "standard",
            total_amount: totalAmount,
            platform_fee: platformFee,
            seller_earnings: sellerEarnings,
            note: `Flat 10% platform fee: $${platformFee.toFixed(2)} (10% of $${totalAmount.toFixed(2)})`
        };
        
        // ✅ IMPORTANT: payment_held_until = NULL (escrow NOT started yet)
        const result = await db.query(
            `INSERT INTO physical_orders (
                product_id, seller_id, buyer_id, product_name, quantity, price,
                total_amount, customer_name, customer_email, shipping_address,
                delivery_phone, payment_method, payment_status, order_status,
                notes, platform_fee, seller_earnings, fee_breakdown,
                estimated_delivery_days, payment_held_until, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW())`,
            [
                productId, sellerId, buyerId, product.title, qty, productPrice,
                totalAmount, req.session.user.username || 'Buyer', req.session.user.email,
                deliveryAddress, deliveryPhone, 'flutterwave', 'pending',
                'pending_seller_approval', notes || '', platformFee, sellerEarnings,
                JSON.stringify(feeBreakdown), estimatedDays
            ]
        );
        
        const orderId = result.insertId;
        console.log(`✅ Order #${orderId} created successfully (escrow not started yet)`);

        // Record status history
        await db.query(
            `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at) 
             VALUES (?, 'order_placed', 'Order placed and awaiting seller approval', ?, NOW())`,
            [orderId, req.session.user.id]
        );
        
        // ✅ CREATE SELLER NOTIFICATION - New order received
        await createSellerNotification(
            sellerId,
            orderId,
            'new_order',
            '📦 New Order Received!',
            `You have received a new order for ${product.title} (x${qty}). Total: $${totalAmount.toFixed(2)}. Please respond within 24 hours.`
        );
        
        // ✅ CREATE BUYER NOTIFICATION - Order placed
        await createBuyerNotification(
            buyerId,
            orderId,
            'order_placed',
            '✅ Order Placed Successfully!',
            `Your order for ${product.title} (x${qty}) has been placed. Total: $${totalAmount.toFixed(2)}. The seller will review your order shortly.`
        );
        
        // Send confirmation email to buyer
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
            totalAmount: totalAmount,
            platformFee: platformFee,
            sellerEarnings: sellerEarnings,
            escrow_status: "not_started"
        });
        
    } catch (err) {
        console.error("❌ Order creation error:", err);
        res.status(500).json({ error: "Failed to create order: " + err.message });
    }
});

// ============================================
// SELLER RESPONDS TO ORDER - WITH NOTIFICATIONS (FULL CODE)
// ============================================
app.post("/api/physical-orders/:orderId/respond", async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ error: "Please login" });
        
        const orderId = req.params.orderId;
        const { action, message } = req.body;
        
        // Fetch order with all details
        const orderResult = await db.query(
            `SELECT o.*, p.title as product_name, p.product_cost, p.user_id as product_seller_id, 
                    u.email as buyer_email, u.username as buyer_name
             FROM physical_orders o
             LEFT JOIN products p ON o.product_id = p.id
             LEFT JOIN users u ON o.buyer_id = u.id
             WHERE o.id = ?`,
            [orderId]
        );
        
        if (!orderResult || orderResult.length === 0) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        const order = orderResult[0];
        
        // Check permission
        if (order.seller_id !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Only the seller can respond to this order" });
        }
        
        // Check if already responded
        if (order.order_status !== 'pending_seller_approval') {
            return res.status(400).json({ error: "Order has already been responded to" });
        }
        
        if (action === 'accept') {
            const totalAmount = parseFloat(order.total_amount);
            
            // ✅ SIMPLE 10% PLATFORM FEE
            const platformFee = totalAmount * 0.10;
            const sellerEarnings = totalAmount - platformFee;
            
            const feeBreakdown = {
                type: "standard",
                total_amount: totalAmount,
                platform_fee: platformFee,
                seller_earnings: sellerEarnings,
                note: `Flat 10% platform fee: $${platformFee.toFixed(2)} (10% of $${totalAmount.toFixed(2)})`
            };
            
            // ✅ IMPORTANT: payment_held_until remains NULL (escrow still not started)
            await db.query(
                `UPDATE physical_orders 
                 SET order_status = 'seller_accepted',
                     seller_accepted_at = NOW(),
                     platform_fee = ?,
                     seller_earnings = ?,
                     fee_breakdown = ?,
                     payment_held_until = NULL
                 WHERE id = ?`,
                [platformFee, sellerEarnings, JSON.stringify(feeBreakdown), orderId]
            );
            
            await db.query(
                `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
                 VALUES (?, 'seller_accepted', 'Seller accepted the order', ?, NOW())`,
                [orderId, req.session.user.id]
            );
            
            // ✅ CREATE BUYER NOTIFICATION - Order accepted, payment required
            await createBuyerNotification(
                order.buyer_id,
                orderId,
                'payment_required',
                '💰 Payment Required - Order Accepted!',
                `Great news! The seller has accepted your order for ${order.product_name}. Please complete payment of $${totalAmount.toFixed(2)} to confirm your order.`
            );
            
            // ✅ CREATE SELLER NOTIFICATION - Order accepted confirmation
            await createSellerNotification(
                order.seller_id,
                orderId,
                'order_update',
                '✅ Order Accepted',
                `You accepted order #${orderId}. The buyer has been notified to complete payment.`
            );
            
            // Send payment link email
            try {
                const paymentLink = `https://coreinsightmarket.com/pay-order.html?orderId=${orderId}`;
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
                                <p style="font-size:12px;color:#f59e0b;">Platform fee: 10% ($${platformFee.toFixed(2)})</p>
                            </div>
                            <a href="${paymentLink}" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin:20px 0;">Pay Now</a>
                        </div>
                    </body>
                    </html>
                `;
                await sendEmail(order.buyer_email, `Payment Required for Order #${orderId}`, emailHtml);
            } catch (emailError) {
                console.error('❌ Payment link email failed:', emailError.message);
            }
            
            res.json({
                success: true,
                message: "Order accepted! The buyer has been notified to complete payment.",
                orderId: orderId,
                platformFee: platformFee,
                sellerEarnings: sellerEarnings,
                feeBreakdown: feeBreakdown,
                escrow_status: "not_started"
            });
            
        } else if (action === 'reject') {
            // Update order to cancelled
            await db.query(
                `UPDATE physical_orders 
                 SET order_status = 'cancelled',
                     response_message = ?
                 WHERE id = ?`,
                [message || 'Seller unable to fulfill order', orderId]
            );
            
            await db.query(
                `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
                 VALUES (?, 'cancelled', 'Order rejected by seller', ?, NOW())`,
                [orderId, req.session.user.id]
            );
            
            // ✅ CREATE BUYER NOTIFICATION - Order rejected
            await createBuyerNotification(
                order.buyer_id,
                orderId,
                'order_rejected',
                '❌ Order Declined',
                `Unfortunately, the seller was unable to fulfill your order for ${order.product_name}. Reason: ${message || 'No reason provided'}. No payment has been taken.`
            );
            
            // ✅ CREATE SELLER NOTIFICATION - Order rejected confirmation
            await createSellerNotification(
                order.seller_id,
                orderId,
                'order_update',
                '❌ Order Rejected',
                `You rejected order #${orderId}. The buyer has been notified.`
            );
            
            // Send email notification to buyer
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
            
            await sendEmail(order.buyer_email, `Order #${orderId} Declined`, emailHtml);
            
            res.json({
                success: true,
                message: "Order rejected. Buyer has been notified."
            });
        }
        
    } catch (err) {
        console.error("❌ Order response error:", err);
        res.status(500).json({ error: "Failed to process order response: " + err.message });
    }
});

// ============================================
// PAYMENT VERIFICATION - WITH NOTIFICATIONS (FULL CODE)
// ============================================
app.get("/api/verify-physical-payment/:transaction_ref", async (req, res) => {
    try {
        const { transaction_ref } = req.params;
        
        console.log(`🔍 Verifying physical payment for: ${transaction_ref}`);
        
        // Clean reference
        let cleanRef = transaction_ref;
        if (cleanRef.startsWith('FW_')) {
            cleanRef = cleanRef.substring(3);
        }
        
        // Get order
        const orderResult = await db.query(
            `SELECT o.*, p.title as product_name 
             FROM physical_orders o
             LEFT JOIN products p ON o.product_id = p.id
             WHERE o.transaction_ref = ? OR o.id = ?`,
            [cleanRef, cleanRef]
        );
        
        if (!orderResult || orderResult.length === 0) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        const order = orderResult[0];
        
        // Verify with Flutterwave
        const response = await axios.get(
            `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${transaction_ref}`,
            {
                headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
                timeout: 15000
            }
        );
        
        if (response.data.status === "success" && response.data.data.status === "successful") {
            const transaction = response.data.data;
            
            // ✅ IMPORTANT: payment_held_until remains NULL (escrow starts AFTER delivery)
            await db.query(
                `UPDATE physical_orders 
                 SET payment_status = 'paid',
                     order_status = 'paid',
                     payment_collected_at = NOW(),
                     payment_held_until = NULL,
                     transaction_ref = ?,
                     flutterwave_reference = ?
                 WHERE id = ?`,
                [transaction_ref, transaction.id, order.id]
            );
            
            console.log(`✅ Payment verified for order #${order.id}`);
            console.log(`   Escrow status: NOT STARTED (will start after delivery confirmation)`);
            
            // ✅ CREATE BUYER NOTIFICATION - Payment confirmed
            await createBuyerNotification(
                order.buyer_id,
                order.id,
                'payment_confirmed',
                '✅ Payment Confirmed!',
                `Your payment of $${parseFloat(order.total_amount).toFixed(2)} has been confirmed. The seller will now process your order.`
            );
            
            // ✅ CREATE SELLER NOTIFICATION - Payment received
            await createSellerNotification(
                order.seller_id,
                order.id,
                'payment_received',
                '💰 Payment Received!',
                `Payment of $${parseFloat(order.total_amount).toFixed(2)} has been received for Order #${order.id}. Your earnings: $${parseFloat(order.seller_earnings || order.total_amount * 0.9).toFixed(2)}. You can now ship the product.`
            );
            
            // Send confirmation email
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head><title>Payment Confirmed - Core Insight</title></head>
                <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
                    <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                        <h1 style="color:#10b981;">✅ Payment Confirmed!</h1>
                        <p>Your payment has been received.</p>
                        <p>The seller will now prepare and ship your order.</p>
                        <p>You will receive a delivery code when your order is shipped.</p>
                    </div>
                </body>
                </html>
            `;
            
            await sendEmail(order.customer_email, `Payment Confirmed - Order #${order.id}`, emailHtml);
            
            res.json({
                status: "success",
                message: "Payment verified! Funds held in escrow.",
                order_id: order.id,
                platform_fee: order.platform_fee,
                seller_earnings: order.seller_earnings,
                escrow_status: "not_started",
                next_step: "Seller will process your order and provide delivery code"
            });
        } else {
            res.status(400).json({
                status: "failed",
                message: "Payment not completed yet"
            });
        }
        
    } catch (err) {
        console.error("❌ Payment verification error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// GENERATE DELIVERY CODE - WITH NOTIFICATIONS (FULL CODE)
// ============================================
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
        if (order.payment_status !== 'paid') {
            return res.status(400).json({ error: "Order must be paid before generating delivery code" });
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
        
        // ✅ CREATE BUYER NOTIFICATION - Order shipped with delivery code
        await createBuyerNotification(
            order.buyer_id,
            orderId,
            'order_shipped',
            '📦 Your Order Has Been Shipped!',
            `Great news! Your order for ${order.product_name} has been shipped. You will receive a delivery code via email. Keep it safe - you'll need it to confirm delivery.`
        );
        
        // ✅ CREATE SELLER NOTIFICATION - Shipping confirmed
        await createSellerNotification(
            order.seller_id,
            orderId,
            'order_update',
            '📦 Order Shipped',
            `Order #${orderId} has been marked as shipped. The buyer has been notified.`
        );
        
        // Send email with delivery code to CUSTOMER ONLY
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Your Delivery Code - Core Insight</title>
                <style>
                    body { font-family: Arial, sans-serif; background: #0a192f; color: #e6f1ff; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; }
                    .code-box { background: #0f172a; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0; border: 2px solid #FFD700; }
                    .code { font-size: 48px; font-weight: bold; letter-spacing: 10px; color: #FFD700; font-family: monospace; }
                    .warning { color: #f59e0b; font-size: 12px; margin-top: 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📦 Your Order #${orderId} is Ready for Delivery!</h1>
                    <p>Hello ${order.buyer_name},</p>
                    <p>Your order for <strong>${order.product_name}</strong> has been shipped!</p>
                    <div class="code-box">
                        <p style="margin-bottom: 10px;">🔐 Your 6-Digit Delivery Code:</p>
                        <div class="code">${deliveryCode}</div>
                        <p class="warning">⚠️ Keep this code confidential! Do not share it with anyone except the delivery person.</p>
                    </div>
                    <p><strong>How it works:</strong></p>
                    <ol style="margin-left: 20px; color: #94a3b8;">
                        <li>Show this code to the delivery person when you receive your package</li>
                        <li>The seller will enter this code to confirm delivery</li>
                        <li>Your 5-day escrow protection starts after delivery confirmation</li>
                    </ol>
                    <a href="https://coreinsightmarket.com/order-tracking.html?orderId=${orderId}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px;">Track Your Order</a>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail(order.buyer_email, `🔐 Your Delivery Code for Order #${orderId}`, emailHtml);
        
        // Add to status history
        await db.query(
            `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
             VALUES (?, 'shipped', 'Delivery code generated and sent to customer', ?, NOW())`,
            [orderId, req.session.user.id]
        );
        
        res.json({
            success: true,
            message: "Delivery code generated and sent to customer. The customer will provide this code for delivery confirmation.",
            order_status: 'shipped'
        });
        
    } catch (err) {
        console.error("❌ Generate delivery code error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// VERIFY DELIVERY CODE - WITH NOTIFICATIONS (FULL CODE)
// ============================================
app.post("/api/orders/:orderId/verify-delivery", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const orderId = req.params.orderId;
        const { delivery_code } = req.body;
        
        // Verify buyer owns this order
        const orderResult = await db.query(
            `SELECT o.*, u.email as seller_email, u.username as seller_name, p.title as product_name,
                    o.seller_earnings, o.total_amount
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
        
        if (order.order_status !== 'shipped') {
            return res.status(400).json({ error: `Cannot confirm delivery for order with status: ${order.order_status}` });
        }
        
        if (!order.delivery_code) {
            return res.status(400).json({ error: "No delivery code generated for this order yet" });
        }
        
        if (order.delivery_code !== delivery_code) {
            return res.status(400).json({ error: "Invalid delivery code" });
        }
        
        // ✅ START 5-DAY ESCROW COUNTDOWN FROM DELIVERY CONFIRMATION
        const escrowReleaseDate = new Date();
        escrowReleaseDate.setDate(escrowReleaseDate.getDate() + 5);
        
        console.log(`✅ Delivery confirmed for order #${orderId}`);
        console.log(`   Escrow release date: ${escrowReleaseDate.toISOString()}`);
        console.log(`   5-day countdown started NOW`);
        
        await db.query(
            `UPDATE physical_orders 
             SET order_status = 'delivered',
                 delivered_at = NOW(),
                 payment_held_until = ?,  // ✅ 5-DAY COUNTDOWN STARTS NOW
                 delivery_code_used = 1,
                 delivery_code_used_at = NOW()
             WHERE id = ?`,
            [escrowReleaseDate, orderId]
        );
        
        // Add to status history
        await db.query(
            `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
             VALUES (?, 'delivered', 'Buyer confirmed delivery. 5-day escrow countdown started.', ?, NOW())`,
            [orderId, req.session.user.id]
        );
        
        // ✅ CREATE BUYER NOTIFICATION - Delivery confirmed, escrow started
        await createBuyerNotification(
            order.buyer_id,
            orderId,
            'delivery_confirmed',
            '✅ Delivery Confirmed!',
            `You have confirmed delivery for Order #${orderId}. The 5-day escrow period has started. You have 5 days to request a refund if there are any issues.`
        );
        
        // ✅ CREATE SELLER NOTIFICATION - Delivery confirmed, escrow started
        await createSellerNotification(
            order.seller_id,
            orderId,
            'order_update',
            '✅ Delivery Confirmed!',
            `The buyer has confirmed delivery for Order #${orderId}. The 5-day escrow period has started. Funds will be released to you after 5 days.`
        );
        
        // Send email confirmation to buyer
        const buyerEmailHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Delivery Confirmed - Core Insight</title></head>
            <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
                <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                    <h1 style="color:#10b981;">✅ Delivery Confirmed!</h1>
                    <p>Thank you for confirming delivery of your order.</p>
                    <p><strong>What happens next:</strong></p>
                    <ul>
                        <li>You have 5 days to request a refund if there are issues</li>
                        <li>After 5 days, funds will be released to the seller</li>
                        <li>Release date: ${escrowReleaseDate.toLocaleDateString()}</li>
                    </ul>
                    <p><strong>Refund available until:</strong> ${escrowReleaseDate.toLocaleDateString()}</p>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail(order.customer_email, `Delivery Confirmed - Order #${orderId}`, buyerEmailHtml);
        
        // Notify seller
        const sellerEmailHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Delivery Confirmed - Core Insight</title></head>
            <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
                <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                    <h1 style="color:#10b981;">✅ Delivery Confirmed!</h1>
                    <p>The buyer has confirmed delivery for Order #${orderId}.</p>
                    <p><strong>Your earnings: $${parseFloat(order.seller_earnings || order.total_amount * 0.9).toFixed(2)}</strong></p>
                    <p><strong>Funds release date:</strong> ${escrowReleaseDate.toLocaleDateString()}</p>
                    <p>Funds will be automatically released to your account after 5 days.</p>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail(order.seller_email, `Delivery Confirmed - Order #${orderId}`, sellerEmailHtml);
        
        res.json({
            success: true,
            message: "Delivery confirmed! 5-day escrow period started.",
            order_status: 'delivered',
            escrow_release_date: escrowReleaseDate,
            refund_available_until: escrowReleaseDate,
            days_until_release: 5,
            seller_earnings: order.seller_earnings,
            platform_fee: order.platform_fee
        });
        
    } catch (err) {
        console.error("❌ Verify delivery error:", err);
        res.status(500).json({ error: err.message });
    }
});


// ============================================
// SELLER VERIFIES DELIVERY WITH CODE
// ============================================
app.post("/api/orders/:orderId/verify-delivery-seller", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login" });
        }
        
        const orderId = req.params.orderId;
        const { delivery_code } = req.body;
        
        if (!delivery_code || delivery_code.length !== 6) {
            return res.status(400).json({ error: "Please enter a valid 6-digit delivery code" });
        }
        
        // Verify SELLER owns this order (NOT buyer)
        const orderResult = await db.query(
            `SELECT o.*, u.email as buyer_email, u.username as buyer_name, p.title as product_name,
                    o.seller_earnings, o.total_amount
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
        
        // Check if order is in shipped status
        if (order.order_status !== 'shipped') {
            return res.status(400).json({ 
                error: `Cannot verify delivery. Order status is: ${order.order_status}. Expected: shipped`,
                current_status: order.order_status
            });
        }
        
        // Check if delivery code exists
        if (!order.delivery_code) {
            return res.status(400).json({ error: "No delivery code generated for this order yet. Please generate one first." });
        }
        
        // Verify the delivery code matches
        if (order.delivery_code !== delivery_code) {
            return res.status(400).json({ error: "Invalid delivery code. Please check with the customer." });
        }
        
        // Check if code already used
        if (order.delivery_code_used === 1) {
            return res.status(400).json({ error: "This delivery code has already been used." });
        }
        
        // ✅ START 5-DAY ESCROW COUNTDOWN
        const escrowReleaseDate = new Date();
        escrowReleaseDate.setDate(escrowReleaseDate.getDate() + 5);
        
        console.log(`✅ Delivery verified by seller for order #${orderId}`);
        console.log(`   Escrow release date: ${escrowReleaseDate.toISOString()}`);
        
        await db.query(
            `UPDATE physical_orders 
             SET order_status = 'delivered',
                 delivered_at = NOW(),
                 payment_held_until = ?,
                 delivery_code_used = 1,
                 delivery_code_used_at = NOW()
             WHERE id = ?`,
            [escrowReleaseDate, orderId]
        );
        
        // Send email confirmation to buyer
        const buyerEmailHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Delivery Confirmed - Core Insight</title></head>
            <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
                <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                    <h1 style="color:#10b981;">✅ Delivery Confirmed!</h1>
                    <p>The seller has confirmed delivery of your order.</p>
                    <p><strong>What happens next:</strong></p>
                    <ul>
                        <li>You have 5 days to request a refund if there are issues</li>
                        <li>After 5 days, funds will be released to the seller</li>
                        <li>Refund available until: ${escrowReleaseDate.toLocaleDateString()}</li>
                    </ul>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail(order.buyer_email, `Delivery Confirmed - Order #${orderId}`, buyerEmailHtml);
        
        res.json({
            success: true,
            message: "Delivery verified! 5-day escrow period started.",
            order_status: 'delivered',
            escrow_release_date: escrowReleaseDate,
            days_until_release: 5,
            seller_earnings: order.seller_earnings,
            platform_fee: order.platform_fee
        });
        
    } catch (err) {
        console.error("❌ Seller verify delivery error:", err);
        res.status(500).json({ error: err.message });
    }
});
// ============================================
// NOTIFICATION HELPER FUNCTIONS
// ============================================





// ============================================
// BUY DIGITAL PRODUCT - FLUTTERWAVE ONLY
// ============================================
// ============================================
// BUY DIGITAL PRODUCT - FLUTTERWAVE ONLY (90/10 Split)
// ============================================
app.post("/api/buy-product", async (req, res) => {
    try {
        console.log("🛒 Buy digital product request received");
        
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: "Please login to purchase" });
        }
        
        const { productId } = req.body;
        
        if (!productId) {
            return res.status(400).json({ error: "Product ID is required" });
        }
        
        // Get product details with seller subaccount info
        const products = await db.query(
            `SELECT p.*, 
                    u.email as seller_email, 
                    u.username as seller_name,
                    u.flutterwave_subaccount_id
             FROM products p
             LEFT JOIN users u ON p.user_id = u.id
             WHERE p.id = ? AND (p.is_deleted = 0 OR p.is_deleted IS NULL)`,
            [productId]
        );
        
        if (!products || products.length === 0) {
            return res.status(404).json({ error: "Product not found" });
        }
        
        const product = products[0];
        const priceInUSD = parseFloat(product.price);
        
        if (isNaN(priceInUSD) || priceInUSD <= 0) {
            return res.status(400).json({ error: "Invalid product price" });
        }
        
        // ✅ Get user's country from IP address
        let userCountry = 'NG';
        let currency = "USD";
        let amount = priceInUSD;
        let exchangeRate = 1.0;
        
        try {
            const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const geoResponse = await axios.get(`http://ip-api.com/json/${userIp}`, { 
                timeout: 3000 
            });
            
            if (geoResponse.data && geoResponse.data.countryCode) {
                userCountry = geoResponse.data.countryCode;
                console.log(`🌍 User country detected: ${userCountry}`);
            }
        } catch (geoError) {
            console.log('Could not detect country, defaulting to international');
        }
        
        // ✅ Set currency based on user's country
        let paymentOptions = "card";
        let amountInNGN = null;
        
        if (userCountry === 'NG') {
            currency = "NGN";
            try {
                const rates = await getExchangeRate();
                exchangeRate = rates.USD_TO_NGN || 1500;
            } catch (rateErr) {
                console.error('Rate fetch error, using fallback:', rateErr.message);
                exchangeRate = 1500;
            }
            amount = priceInUSD * exchangeRate;
            amountInNGN = amount;
            paymentOptions = "card, account, banktransfer, ussd, mobilemoney, qr, barter";
            console.log(`💰 Nigerian user - Paying ${amount} NGN (Rate: ${exchangeRate})`);
        } else {
            currency = "USD";
            amount = priceInUSD;
            paymentOptions = "card";
            console.log(`💰 International user (${userCountry}) - Paying ${amount} USD`);
        }
        
        // Calculate splits (90/10)
        const platformFeeUSD = priceInUSD * 0.10;
        const sellerEarningsUSD = priceInUSD - platformFeeUSD;
        
        const platformFeeNGN = platformFeeUSD * exchangeRate;
        const sellerEarningsNGN = sellerEarningsUSD * exchangeRate;
        
        // ✅ Create clean transaction reference (NO prefixes for Flutterwave)
        const timestamp = Date.now();
        const randomNum = Math.floor(Math.random() * 10000);
        const transactionRef = `DIGITAL_${timestamp}_${randomNum}`;
        
        // Store order in database
        let orderId = null;
        try {
            const orderResult = await db.query(
                `INSERT INTO digital_orders (
                    product_id, buyer_id, seller_id,
                    amount, amount_usd, amount_ngn,
                    platform_fee, platform_fee_usd, platform_fee_ngn,
                    seller_earnings, seller_earnings_usd, seller_earnings_ngn,
                    exchange_rate, transaction_ref, currency,
                    original_amount_usd, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
                [
                    productId,
                    req.session.user.id,
                    product.user_id,
                    amount,
                    priceInUSD,
                    amountInNGN,
                    platformFeeNGN,
                    platformFeeUSD,
                    platformFeeNGN,
                    sellerEarningsNGN,
                    sellerEarningsUSD,
                    sellerEarningsNGN,
                    exchangeRate,
                    transactionRef,
                    currency,
                    priceInUSD
                ]
            );
            
            orderId = orderResult.insertId || (orderResult[0] && orderResult[0].insertId);
            console.log(`✅ Digital order created with ID: ${orderId}`);
            
        } catch (dbErr) {
            console.error("❌ Database insert error:", dbErr.message);
            return res.status(500).json({ error: "Failed to create order: " + dbErr.message });
        }
        
        // Create Flutterwave payment link
        if (!process.env.FLW_SECRET_KEY) {
            return res.status(500).json({ error: "Payment system not configured. Please contact support." });
        }
        
        // ✅ Use CLEAN reference (NO prefix for Flutterwave)
        const flutterwavePayload = {
            tx_ref: transactionRef,
            amount: amount,
            currency: currency,
            redirect_url: "https://coreinsightmarket.com/digital-payment-callback.html",
            customer: {
                email: req.session.user.email,
                name: req.session.user.username || "Customer"
            },
            customizations: {
                title: "Core Insight",
                description: product.title.substring(0, 50)
            },
            payment_options: paymentOptions,
            meta: {
                product_id: productId,
                order_id: orderId,
                type: 'digital_product',
                transaction_ref: transactionRef,
                user_country: userCountry,
                original_amount_usd: priceInUSD,
                exchange_rate: exchangeRate,
                amount_in_currency: amount
            }
        };
        
        // ✅ ADD SUBACCOUNT FOR 90/10 SPLIT
        if (product.flutterwave_subaccount_id) {
            flutterwavePayload.subaccounts = [{
                id: product.flutterwave_subaccount_id,
                transaction_split_ratio: 0.9
            }];
            console.log(`✅ Flutterwave subaccount added: ${product.flutterwave_subaccount_id}`);
        } else {
            console.log(`⚠️ No Flutterwave subaccount found for seller ${product.user_id}`);
        }
        
        try {
            const response = await axios.post(
                'https://api.flutterwave.com/v3/payments',
                flutterwavePayload,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            
            if (response.data.status === 'success' && response.data.data?.link) {
                // Update order with payment link
                await db.query(
                    `UPDATE digital_orders 
                     SET payment_gateway = 'flutterwave', 
                         payment_link = ?
                     WHERE id = ?`,
                    [response.data.data.link, orderId]
                );
                
                res.json({
                    success: true,
                    paymentLink: response.data.data.link,
                    transactionRef: transactionRef,
                    orderId: orderId,
                    gateway: 'flutterwave',
                    amount: amount,
                    currency: currency,
                    userCountry: userCountry,
                    exchangeRate: exchangeRate,
                    split: {
                        platform_fee: currency === 'NGN' ? platformFeeNGN : platformFeeUSD,
                        seller_earnings: currency === 'NGN' ? sellerEarningsNGN : sellerEarningsUSD,
                        platform_percentage: 10,
                        seller_percentage: 90
                    },
                    message: `Redirecting to ${currency} payment...`
                });
            } else {
                throw new Error(response.data.message || "Payment initialization failed");
            }
        } catch (flutterErr) {
            console.error("Flutterwave error:", flutterErr.message);
            return res.status(500).json({ error: "Payment gateway error. Please try again." });
        }
        
    } catch (err) {
        console.error("❌ Buy product error:", err.message);
        res.status(500).json({ 
            error: err.message || "Failed to process purchase"
        });
    }
});
app.get("/api/debug/product-file/:productId", async (req, res) => {
  try {
    const productId = req.params.productId;
    const product = await db.query(
      "SELECT id, title, type, file_url, created_at FROM products WHERE id = ?",
      [productId]
    );
    res.json({
      product: product[0],
      has_file: !!product[0]?.file_url,
      file_url: product[0]?.file_url
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// =================== DIGITAL PRODUCT DOWNLOAD ===================
app.get('/api/download-digital/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { token } = req.query;
    
    console.log(`📥 Digital download request for order #${orderId}, token: ${token}`);
    
    if (!req.session.user) {
      return res.status(401).json({ error: 'Please login to download' });
    }
    
    // Verify the order and download token
    const orderResult = await db.query(
      `SELECT o.*, p.title as product_title, p.file_url, p.user_id as seller_id
       FROM digital_orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.id = ? AND o.buyer_id = ? AND o.status = 'completed'`,
      [orderId, req.session.user.id]
    );
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: 'Order not found or not completed' });
    }
    
    const order = orderResult[0];
    
    // Check if download link is expired
    if (order.download_expires_at && new Date(order.download_expires_at) < new Date()) {
      return res.status(410).json({ error: 'Download link has expired. Please contact support.' });
    }
    
    // Check token if required
    if (token && order.download_url && !order.download_url.includes(token)) {
      return res.status(403).json({ error: 'Invalid download token' });
    }
    
    const fileUrl = order.file_url;
    
    if (!fileUrl) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    console.log(`✅ Serving digital product: ${order.product_title}`);
    
    // For ImgBB URLs - redirect to the file
    if (fileUrl.includes('imgbb.com') || fileUrl.includes('i.ibb.co')) {
      return res.redirect(fileUrl);
    }
    
    // For Backblaze B2 URLs
    if (fileUrl.includes('backblazeb2.com') || fileUrl.includes('b2cloud')) {
      return res.redirect(fileUrl);
    }
    
    // For local files (fallback)
    if (fileUrl.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, fileUrl);
      if (fs.existsSync(localPath)) {
        const filename = `${order.product_title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        return res.download(localPath, filename);
      }
    }
    
    // For any other URL, redirect
    if (fileUrl.startsWith('http')) {
      return res.redirect(fileUrl);
    }
    
    res.status(404).json({ error: 'File not found' });
    
  } catch (error) {
    console.error('❌ Digital download error:', error);
    res.status(500).json({ error: error.message });
  }
});
// ============================================
// VERIFY DIGITAL PRODUCT PAYMENT - FIXED
// ============================================

app.get("/api/check-payment-status/:reference", async (req, res) => {
  try {
    let reference = req.params.reference;
    
    console.log(`🔍 Checking payment status for reference: ${reference}`);
    
    // Remove FW_ prefix if present
    if (reference && reference.startsWith('FW_')) {
      reference = reference.substring(3);
      console.log(`Cleaned reference: ${reference}`);
    }
    
    // First check our database
    const orderResult = await db.query(
      `SELECT * FROM digital_orders WHERE transaction_ref = ?`,
      [reference]
    );
    
    if (orderResult && orderResult.length > 0 && orderResult[0].status === 'completed') {
      return res.json({
        status: 'success',
        message: 'Payment already verified',
        order_id: orderResult[0].id
      });
    }
    
    // Then verify with Flutterwave using the CLEAN reference
    // Flutterwave expects the original tx_ref without FW_ prefix
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    console.log('Flutterwave response:', response.data);
    
    if (response.data.status === 'success' && response.data.data.status === 'successful') {
      const transaction = response.data.data;
      
      // Update order
      await db.query(
        `UPDATE digital_orders 
         SET status = 'completed', 
             completed_at = NOW(),
             flutterwave_reference = ?
         WHERE transaction_ref = ?`,
        [transaction.id, reference]
      );
      
      res.json({
        status: 'success',
        message: 'Payment verified successfully',
        transaction: transaction
      });
    } else {
      res.json({
        status: 'pending',
        message: response.data.message || 'Payment not completed yet'
      });
    }
    
  } catch (err) {
    console.error('Check payment error:', err.response?.data || err.message);
    res.json({
      status: 'error',
      message: err.response?.data?.message || err.message
    });
  }
});

// =================== VERIFY DIGITAL PAYMENT - UPDATED ===================
app.get("/api/verify-digital-payment/:reference", async (req, res) => {
  try {
    let reference = req.params.reference;
    
    console.log(`🔍 Verifying digital payment for reference: ${reference}`);
    
    if (!reference) {
      return res.status(400).json({ 
        status: "failed", 
        message: "No payment reference provided" 
      });
    }
    
    // ✅ Remove FW_ prefix if present (clean reference)
    if (reference.startsWith('FW_')) {
      reference = reference.substring(3);
      console.log(`Removed FW_ prefix, checking: ${reference}`);
    }
    
    // Find the order in database
    const orderResult = await db.query(
      `SELECT o.*, p.title as product_title, p.file_url, p.user_id as seller_id
       FROM digital_orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.transaction_ref = ? OR o.transaction_ref LIKE ?`,
      [reference, `%${reference}%`]
    );
    
    let order = null;
    if (orderResult && orderResult.length > 0) {
      order = orderResult[0];
    }
    
    if (!order) {
      return res.status(404).json({ 
        status: "failed", 
        message: "Order not found for this reference" 
      });
    }
    
    // If order is already completed, return download link
    if (order.status === 'completed') {
      console.log(`✅ Order #${order.id} already completed`);
      
      let downloadUrl = order.download_url;
      if (!downloadUrl) {
        const downloadToken = crypto.randomBytes(32).toString('hex');
        downloadUrl = `/api/download-digital/${order.id}?token=${downloadToken}`;
        const downloadExpiry = new Date();
        downloadExpiry.setDate(downloadExpiry.getDate() + 7);
        
        await db.query(
          `UPDATE digital_orders 
           SET download_url = ?, 
               download_expires_at = ? 
           WHERE id = ?`,
          [downloadUrl, downloadExpiry, order.id]
        );
      }
      
      return res.json({
        status: "success",
        message: "Payment already verified",
        product_title: order.product_title,
        download_url: downloadUrl,
        order_id: order.id
      });
    }
    
    // Check if flutterwave_reference exists (webhook already processed)
    if (order.flutterwave_reference) {
      console.log(`✅ Order already has Flutterwave reference, marking as completed`);
      
      await db.query(
        `UPDATE digital_orders 
         SET status = 'completed', 
             completed_at = NOW() 
         WHERE id = ?`,
        [order.id]
      );
      
      const downloadToken = crypto.randomBytes(32).toString('hex');
      const downloadUrl = `/api/download-digital/${order.id}?token=${downloadToken}`;
      const downloadExpiry = new Date();
      downloadExpiry.setDate(downloadExpiry.getDate() + 7);
      
      await db.query(
        `UPDATE digital_orders 
         SET download_url = ?, 
             download_expires_at = ? 
         WHERE id = ?`,
        [downloadUrl, downloadExpiry, order.id]
      );
      
      return res.json({
        status: "success",
        message: "Payment verified successfully",
        product_title: order.product_title,
        download_url: downloadUrl,
        order_id: order.id
      });
    }
    
    // ✅ VERIFY WITH FLUTTERWAVE API DIRECTLY
    try {
      console.log(`🔄 Verifying with Flutterwave API for reference: ${reference}`);
      
      const flutterwaveResponse = await axios.get(
        `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      console.log('📥 Flutterwave response:', flutterwaveResponse.data);
      
      if (flutterwaveResponse.data.status === 'success' && 
          flutterwaveResponse.data.data.status === 'successful') {
        
        const transaction = flutterwaveResponse.data.data;
        console.log(`✅ Payment verified via Flutterwave API! Transaction ID: ${transaction.id}`);
        
        // Update order as completed
        await db.query(
          `UPDATE digital_orders 
           SET status = 'completed', 
               completed_at = NOW(),
               flutterwave_reference = ?
           WHERE id = ?`,
          [transaction.id, order.id]
        );
        
        // Generate download URL
        const downloadToken = crypto.randomBytes(32).toString('hex');
        const downloadUrl = `/api/download-digital/${order.id}?token=${downloadToken}`;
        const downloadExpiry = new Date();
        downloadExpiry.setDate(downloadExpiry.getDate() + 7);
        
        await db.query(
          `UPDATE digital_orders 
           SET download_url = ?, 
               download_expires_at = ? 
           WHERE id = ?`,
          [downloadUrl, downloadExpiry, order.id]
        );
        
        return res.json({
          status: "success",
          message: "Payment verified successfully",
          product_title: order.product_title,
          download_url: downloadUrl,
          order_id: order.id
        });
        
      } else {
        // Payment not completed yet
        console.log('⏳ Payment not yet completed on Flutterwave');
        return res.status(400).json({
          status: "pending",
          message: "Payment is being processed. Please check back in a few moments."
        });
      }
      
    } catch (flutterErr) {
      console.error('❌ Flutterwave verification error:', flutterErr.response?.data || flutterErr.message);
      
      // Check if order has payment_link - user might not have completed payment
      if (order.payment_link) {
        return res.status(400).json({
          status: "pending",
          message: "Payment not completed yet. Please complete the payment on Flutterwave.",
          payment_link: order.payment_link
        });
      }
      
      return res.status(400).json({
        status: "pending",
        message: "Payment verification in progress. Please wait..."
      });
    }
    
  } catch (err) {
    console.error("❌ Digital payment verification error:", err);
    res.status(500).json({ 
      status: "failed", 
      message: "Error verifying payment: " + err.message
    });
  }
});
app.get("/api/debug/digital-order/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;
    
    const order = await db.query(
      `SELECT o.*, p.title, p.file_url as product_file_url 
       FROM digital_orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.id = ?`,
      [orderId]
    );
    
    res.json({
      order: order[0],
      file_url_from_product: order[0]?.product_file_url,
      file_url_from_order: order[0]?.file_url,
      download_url: order[0]?.download_url
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Enhanced download endpoint - proxies the file instead of redirecting
app.get("/api/download-secure/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { token } = req.query;
    
    // Verify token and payment (same as before)
    const order = await db.query(`
      SELECT o.*, p.file_url, p.title
      FROM digital_orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.id = ? AND o.download_url LIKE ? AND o.download_expires_at > NOW()
    `, [orderId, `%token=${token}%`]);
    
    if (!order || order.length === 0) {
      return res.status(404).json({ error: "Download link invalid or expired" });
    }
    
    const fileUrl = order[0].file_url;
    const filename = order[0].title.replace(/[^a-z0-9]/gi, '_') + '.pdf';
    
    // PROXY THE FILE (hide the actual storage URL)
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream'
    });
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', response.headers['content-type']);
    
    response.data.pipe(res);
    
  } catch (err) {
    console.error('Download error:', err);
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
          <p>You can track your order here: <a href="https://coreinsightmarket.com/order-tracking.html?orderId=${orderId}">Track Order</a></p>
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
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    const { delivery_code } = req.body;
    
    const orderResult = await db.query(
      `SELECT o.* FROM physical_orders o WHERE o.id = ? AND o.seller_id = ?`,
      [orderId, req.session.user.id]
    );
    
    const order = orderResult[0];
    
    if (order.order_status !== 'shipped') {
      return res.status(400).json({ error: "Order must be shipped first" });
    }
    
    if (order.delivery_code !== delivery_code) {
      return res.status(400).json({ error: "Invalid delivery code" });
    }
    
    // ✅ START 5-DAY ESCROW COUNTDOWN FROM DELIVERY CONFIRMATION
    const escrowReleaseDate = new Date();
    escrowReleaseDate.setDate(escrowReleaseDate.getDate() + 5);
    
    await db.query(
      `UPDATE physical_orders 
       SET order_status = 'delivered',
           delivered_at = NOW(),
           payment_held_until = ?,  -- 5-day countdown starts NOW
           delivery_code_used = 1
       WHERE id = ?`,
      [escrowReleaseDate, orderId]
    );
    
    res.json({
      success: true,
      message: "Delivery confirmed! 5-day escrow period started.",
      escrow_release_date: escrowReleaseDate,
      seller_earnings: order.seller_earnings,
      platform_fee: order.platform_fee
    });
    
  } catch (err) {
    console.error("Confirm delivery error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET MY ORDERS - UPDATED with product images
// ============================================
// ============================================
// GET MY ORDERS - FIXED PARAMETER ISSUE
// ============================================
app.get("/api/my-orders", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const userId = req.session.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    const offset = (parsedPage - 1) * parsedLimit;
    
    // Build query WITHOUT LIMIT in the main query to avoid parameter issues
    let query = `
      SELECT 
        o.id,
        o.product_id,
        o.product_name,
        o.quantity,
        o.price,
        o.total_amount,
        o.order_status,
        o.payment_status,
        o.created_at,
        o.shipping_address,
        o.delivery_phone,
        o.city,
        o.state,
        o.country,
        o.estimated_delivery_days,
        o.payment_collected_at,
        o.payment_held_until,
        o.refund_requested_at,
        o.refund_processed_at,
        o.delivered_at,
        o.completed_at,
        o.seller_id,
        o.platform_fee,
        o.seller_earnings,
        p.title as product_title,
        p.images as product_images,
        p.image_urls,
        u.username as seller_name,
        u.email as seller_email
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.seller_id = u.id
      WHERE o.buyer_id = ?
    `;
    
    const queryParams = [userId];
    
    // Add status filter if provided
    if (status && status !== 'all') {
      query += " AND o.order_status = ?";
      queryParams.push(status);
    }
    
    query += " ORDER BY o.created_at DESC";
    
    // Execute query first to get all orders
    const orders = await db.query(query, queryParams);
    
    // Apply pagination manually after fetching (simpler and avoids parameter issues)
    const paginatedOrders = orders.slice(offset, offset + parsedLimit);
    
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
      for (const row of countsResult) {
        counts[row.order_status] = parseInt(row.count);
      }
    }
    
    // Process orders with product images
    const processedOrders = [];
    if (paginatedOrders && paginatedOrders.length > 0) {
      for (const order of paginatedOrders) {
        // Parse product images from either images or image_urls
        let productImage = null;
        const imageSource = order.product_images || order.image_urls;
        
        if (imageSource) {
          try {
            if (typeof imageSource === 'string') {
              if (imageSource.startsWith('[')) {
                const parsed = JSON.parse(imageSource);
                productImage = Array.isArray(parsed) ? parsed[0] : parsed;
              } else if (imageSource.startsWith('http')) {
                productImage = imageSource;
              } else {
                productImage = imageSource;
              }
            } else if (Array.isArray(imageSource)) {
              productImage = imageSource[0];
            }
          } catch (e) {
            productImage = null;
          }
        }
        
        // Calculate refund availability
        let refundAvailable = false;
        let refundDeadline = null;
        let daysLeft = 0;
        
        if (order.order_status === 'delivered' && order.payment_held_until) {
          const releaseDate = new Date(order.payment_held_until);
          const now = new Date();
          daysLeft = Math.ceil((releaseDate - now) / (1000 * 60 * 60 * 24));
          refundAvailable = daysLeft > 0 && daysLeft <= 5;
          refundDeadline = releaseDate;
        } else if (order.order_status === 'paid' || order.order_status === 'processing' || order.order_status === 'shipped') {
          refundAvailable = true;
        }
        
        processedOrders.push({
          id: order.id,
          product_id: order.product_id,
          product_name: order.product_name || order.product_title || 'Product',
          product_image: productImage,
          quantity: parseInt(order.quantity) || 1,
          price: parseFloat(order.price) || 0,
          total_amount: parseFloat(order.total_amount) || 0,
          order_status: order.order_status || 'pending_seller_approval',
          payment_status: order.payment_status || 'pending',
          seller_name: order.seller_name || 'Seller',
          seller_id: order.seller_id,
          created_at: order.created_at,
          shipping_address: order.shipping_address,
          delivery_phone: order.delivery_phone,
          city: order.city,
          state: order.state,
          country: order.country,
          estimated_delivery_days: order.estimated_delivery_days || 7,
          payment_collected_at: order.payment_collected_at,
          payment_held_until: order.payment_held_until,
          refund_requested_at: order.refund_requested_at,
          refund_processed_at: order.refund_processed_at,
          delivered_at: order.delivered_at,
          completed_at: order.completed_at,
          platform_fee: parseFloat(order.platform_fee) || 0,
          seller_earnings: parseFloat(order.seller_earnings) || 0,
          refund_available: refundAvailable,
          refund_deadline: refundDeadline,
          refund_days_left: daysLeft
        });
      }
    }
    
    res.json({
      success: true,
      orders: processedOrders,
      counts: counts,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: orders.length,
        has_more: offset + parsedLimit < orders.length
      }
    });
    
  } catch (err) {
    console.error("❌ Error fetching my orders:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      orders: [],
      counts: {}
    });
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
      redirect_url: "https://coreinsightmarket.com/payment-callback.html",
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
          <p>You can track your order here: <a href="https://coreinsightmarket.com/order-tracking.html?orderId=${orderId}">Track Order</a></p>
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

// ============================================
// REQUEST REFUND - UPDATED (Works with your schema)
// ============================================
app.post("/api/physical-orders/:orderId/refund", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });

    const orderId = req.params.orderId;
    const { reason, return_option, pickup_address } = req.body;

    if (!reason || reason.length < 10) {
      return res.status(400).json({ error: "Please provide a detailed reason for refund (min 10 characters)" });
    }

    // Get order with all details
    const orderResult = await db.query(
      `SELECT o.*, p.title as product_name, p.condition_type, p.condition_description,
              u_seller.email as seller_email, u_seller.username as seller_name,
              u_buyer.email as buyer_email, u_buyer.username as buyer_name,
              o.seller_earnings, o.total_amount, o.payment_held_until
       FROM physical_orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN users u_seller ON o.seller_id = u_seller.id
       LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
       WHERE o.id = ? AND o.buyer_id = ?`,
      [orderId, req.session.user.id]
    );

    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult[0];
    
    // Check if already refunded
    if (order.order_status === 'refunded') {
      return res.status(400).json({ error: "This order has already been refunded" });
    }
    
    if (order.order_status === 'refund_requested') {
      return res.status(400).json({ error: "Refund already requested. Please wait for seller response." });
    }
    
    const isDelivered = order.order_status === 'delivered';
    const isShipped = order.order_status === 'shipped';
    const isPaid = order.order_status === 'paid';
    
    // Calculate refund window
    let refundWindowRemaining = 0;
    if (order.payment_collected_at) {
      const paymentDate = new Date(order.payment_collected_at);
      const now = new Date();
      const daysSincePayment = (now - paymentDate) / (1000 * 60 * 60 * 24);
      refundWindowRemaining = Math.max(0, 5 - daysSincePayment);
    }
    
    // SCENARIO 1: Before delivery - Auto-refund (no questions asked)
    if (!isDelivered && (isPaid || isShipped)) {
      console.log(`🔄 Auto-refunding order #${orderId} - Product not delivered`);
      
      // Process refund through payment gateway
      const refundSuccess = await processPaymentRefund(order);
      
      if (refundSuccess) {
        await db.query(
          `UPDATE physical_orders 
           SET order_status = 'refunded',
               refund_requested_at = NOW(),
               refund_processed_at = NOW(),
               refund_reason = ?,
               refund_type = 'auto_before_delivery',
               payment_held_until = NULL,
               funds_released_at = NULL
           WHERE id = ?`,
          [reason, orderId]
        );
        
        // Notify seller
        await sendEmail(order.seller_email, `Order #${orderId} Auto-Refunded`, `
          <h2>Order #${orderId} has been automatically refunded</h2>
          <p><strong>Reason:</strong> ${reason}</p>
          <p>The customer was refunded because the product was not delivered.</p>
          <p>No action needed from you.</p>
        `);
        
        // Notify buyer
        await sendEmail(order.buyer_email, `Refund Processed for Order #${orderId}`, `
          <h2>✅ Refund Processed</h2>
          <p>Your refund for order #${orderId} has been processed.</p>
          <p><strong>Amount:</strong> $${parseFloat(order.total_amount).toFixed(2)}</p>
          <p>Please allow 5-10 business days for the refund to appear in your account.</p>
        `);
        
        return res.json({
          success: true,
          message: "Refund processed automatically. Money returned to your account.",
          refund_amount: order.total_amount,
          refund_type: "auto"
        });
      } else {
        return res.status(500).json({ error: "Auto-refund failed. Please contact support." });
      }
    }
    
    // SCENARIO 2: After delivery - Return options
    else if (isDelivered) {
      console.log(`📦 Processing return for delivered order #${orderId}`);
      
      // Check if within 5-day refund window
      if (refundWindowRemaining <= 0) {
        return res.status(400).json({ 
          error: "Refund window has closed. Refunds can only be requested within 5 days of payment.",
          refund_window_expired: true
        });
      }
      
      if (return_option === 'dropoff') {
        // Customer drops off product - full refund after seller inspection
        const returnCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        await db.query(
          `UPDATE physical_orders 
           SET order_status = 'refund_requested',
               refund_requested_at = NOW(),
               refund_reason = ?,
               refund_type = 'dropoff_return',
               return_option = 'dropoff',
               pickup_confirmation_code = ?
           WHERE id = ?`,
          [reason, returnCode, orderId]
        );
        
        await db.query(
          `INSERT INTO refund_pickup_requests (order_id, pickup_code, pickup_address, status, created_at)
           VALUES (?, ?, 'Customer dropoff - no pickup needed', 'pending', NOW())`,
          [orderId, returnCode]
        );
        
        // Notify seller
        await sendEmail(order.seller_email, `Return Request #${orderId} - Customer Dropoff`, `
          <h2>📦 Return Request - Customer Will Drop Off</h2>
          <p><strong>Order #${orderId}</strong></p>
          <p><strong>Product:</strong> ${order.product_name}</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p><strong>Return Code:</strong> <span style="font-size:24px;font-weight:bold;">${returnCode}</span></p>
          <p><strong>Expected Product Condition (as listed):</strong></p>
          <ul>
            <li>Condition: ${order.condition_type || 'Not specified'}</li>
            <li>Description: ${order.condition_description || 'N/A'}</li>
          </ul>
          <p><strong>Instructions:</strong></p>
          <ol>
            <li>Customer will drop off the product at your location</li>
            <li>INSPECT the product against the listed condition</li>
            <li>If product matches description, enter the return code in your dashboard</li>
            <li>Customer will be automatically refunded</li>
            <li>If product doesn't match description, reject the return</li>
          </ol>
          <p><strong>⚠️ Important:</strong> You have 7 days to inspect. After 7 days, auto-refund will process.</p>
        `);
        
        return res.json({
          success: true,
          message: "Return request submitted. Please drop off the product at the seller's location.",
          return_code: returnCode,
          refund_type: "dropoff",
          instructions: "Drop off the product at the seller's address. Provide the return code."
        });
        
      } else if (return_option === 'pickup') {
        // Seller picks up - 3% transport fee deducted
        if (!pickup_address) {
          return res.status(400).json({ error: "Pickup address is required for seller pickup option" });
        }
        
        const pickupCode = Math.floor(100000 + Math.random() * 900000).toString();
        const transportFee = order.total_amount * 0.03;
        const refundAmount = order.total_amount - transportFee;
        
        await db.query(
          `UPDATE physical_orders 
           SET order_status = 'refund_requested',
               refund_requested_at = NOW(),
               refund_reason = ?,
               refund_type = 'pickup_return',
               return_option = 'pickup',
               pickup_address = ?,
               pickup_confirmation_code = ?,
               refund_amount = ?
           WHERE id = ?`,
          [reason, pickup_address, pickupCode, refundAmount, orderId]
        );
        
        await db.query(
          `INSERT INTO refund_pickup_requests (order_id, pickup_code, pickup_address, status, created_at)
           VALUES (?, ?, ?, 'pending', NOW())`,
          [orderId, pickupCode, pickup_address]
        );
        
        // Notify seller
        await sendEmail(order.seller_email, `📦 Pickup Required for Order #${orderId}`, `
          <h2>Pickup Required for Return</h2>
          <p><strong>Order #${orderId}</strong></p>
          <p><strong>Product:</strong> ${order.product_name}</p>
          <p><strong>Customer Address for Pickup:</strong></p>
          <p>${pickup_address}</p>
          <p><strong>Pickup Code:</strong> <span style="font-size:24px;font-weight:bold;">${pickupCode}</span></p>
          <p><strong>Transport Compensation:</strong> $${transportFee.toFixed(2)} (3% of order value)</p>
          <p><strong>Customer Refund Amount:</strong> $${refundAmount.toFixed(2)}</p>
          <p><strong>Instructions:</strong></p>
          <ol>
            <li>Pick up the product from the customer's address</li>
            <li>INSPECT the product against the listed condition</li>
            <li>If product matches, enter the pickup code in your dashboard</li>
            <li>Customer receives refund MINUS 3% transport fee</li>
            <li>You receive the 3% transport fee</li>
          </ol>
        `);
        
        return res.json({
          success: true,
          message: `Return request submitted. Seller will pick up from your address.`,
          pickup_code: pickupCode,
          transport_fee: transportFee,
          refund_amount: refundAmount,
          refund_type: "pickup"
        });
      } else {
        return res.status(400).json({ error: "Invalid return option. Choose 'dropoff' or 'pickup'" });
      }
    } else {
      return res.status(400).json({ 
        error: `Cannot request refund for order with status: ${order.order_status}`,
        allowed_statuses: ['paid', 'shipped', 'delivered']
      });
    }
    
  } catch (err) {
    console.error("❌ Refund request error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// HELPER: PROCESS PAYMENT REFUND
// ============================================
async function processPaymentRefund(order) {
  try {
    console.log(`🔄 Processing refund for order #${order.id} via ${order.payment_provider || 'flutterwave'}`);
    
    const refundAmount = parseFloat(order.refund_amount) || parseFloat(order.total_amount);
    const paymentProvider = order.payment_provider || 'flutterwave';
    
    if (paymentProvider === 'flutterwave') {
      // First get the transaction ID if we only have reference
      let transactionId = order.transaction_ref;
      
      // If transaction_ref is a reference string, get the actual transaction ID
      if (transactionId && !transactionId.match(/^\d+$/)) {
        try {
          const verifyResponse = await axios.get(
            `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${transactionId}`,
            {
              headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
              timeout: 10000
            }
          );
          if (verifyResponse.data.status === 'success') {
            transactionId = verifyResponse.data.data.id;
          }
        } catch (err) {
          console.error('Error getting transaction ID:', err.message);
        }
      }
      
      const refundResponse = await axios.post(
        'https://api.flutterwave.com/v3/transactions/refund',
        {
          transaction_id: transactionId,
          amount: refundAmount,
          full_refund: refundAmount >= order.total_amount,
          narration: `Refund for order #${order.id} - ${order.product_name || 'Product'}`
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
        console.log(`✅ Flutterwave refund processed: $${refundAmount}`);
        return true;
      } else {
        console.error('Flutterwave refund failed:', refundResponse.data.message);
        return false;
      }
    } 
    else if (paymentProvider === 'paystack') {
      const refundResponse = await axios.post(
        'https://api.paystack.co/transaction/refund',
        {
          transaction: order.transaction_ref,
          amount: Math.round(refundAmount * 100)
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
        console.log(`✅ Paystack refund processed: $${refundAmount}`);
        return true;
      } else {
        console.error('Paystack refund failed:', refundResponse.data.message);
        return false;
      }
    }
    
    return false;
    
  } catch (err) {
    console.error('❌ Payment refund error:', err.response?.data || err.message);
    return false;
  }
}


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
      const totalAmount = parseFloat(order.total_amount);
      
      // ✅ SIMPLE 10% PLATFORM FEE - NO BULK CALCULATION
      const platformFee = totalAmount * 0.10;
      const sellerEarnings = totalAmount - platformFee;
      
      const feeBreakdown = {
        type: "standard",
        total_amount: totalAmount,
        platform_fee: platformFee,
        seller_earnings: sellerEarnings,
        note: `Flat 10% platform fee: $${platformFee.toFixed(2)} (10% of $${totalAmount.toFixed(2)})`
      };
      
      console.log(`💰 Order #${orderId} earnings:`, feeBreakdown);
      
      // Update order to accepted status
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'seller_accepted',
             seller_accepted_at = NOW(),
             platform_fee = ?,
             seller_earnings = ?,
             fee_breakdown = ?,
             payment_held_until = NULL
         WHERE id = ?`,
        [platformFee, sellerEarnings, JSON.stringify(feeBreakdown), orderId]
      );
      
      // Record acceptance
      await db.query(`
        INSERT INTO order_acceptances (order_id, seller_id, status, response_message, responded_at)
        VALUES (?, ?, 'accepted', ?, NOW())
      `, [orderId, req.session.user.id, message || null]);
      
      // Send notification to buyer
      const paymentLink = `https://coreinsightmarket.com/pay-order.html?orderId=${orderId}`;
      
      await db.query(`
        INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message, created_at)
        VALUES (?, ?, 'payment_required', 'Payment Required ✅', 
                CONCAT('Your order for ', ?, ' has been accepted! Please complete payment to confirm. Total: $', ?), NOW())
      `, [order.buyer_id, orderId, order.product_name, totalAmount.toFixed(2)]);
      
      // Add status history
      await db.query(
        `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
         VALUES (?, 'seller_accepted', 'Seller accepted the order', ?, NOW())`,
        [orderId, req.session.user.id]
      );
      
      // Send email notification to buyer
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
              <p style="font-size:12px;color:#f59e0b;">Platform fee: 10% ($${platformFee.toFixed(2)})</p>
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
      
      // Add status history
      await db.query(
        `INSERT INTO order_status_history (order_id, status, notes, created_by, created_at)
         VALUES (?, 'cancelled', 'Order rejected by seller', ?, NOW())`,
        [orderId, req.session.user.id]
      );
      
      // Send email notification to buyer
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
            <a href="https://coreinsightmarket.com/products.html" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:20px;">Browse Products</a>
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


// ============================================
// CHECK REFUND STATUS - BUYER
// ============================================
app.get("/api/orders/:orderId/refund-status", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const orderId = req.params.orderId;
    
    const orderResult = await db.query(`
      SELECT o.order_status, o.refund_reason, o.refund_requested_at, 
             o.refund_processed_at, o.refund_notes, o.refund_approved_by,
             o.payment_collected_at, o.total_amount, o.refund_amount, o.return_option,
             o.pickup_address, o.pickup_confirmation_code,
             u.username as processed_by_name,
             TIMESTAMPDIFF(DAY, o.payment_collected_at, NOW()) as days_since_payment,
             TIMESTAMPDIFF(DAY, o.refund_requested_at, NOW()) as days_since_request
      FROM physical_orders o
      LEFT JOIN users u ON o.refund_approved_by = u.id
      WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)
    `, [orderId, req.session.user.id, req.session.user.id]);
    
    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const order = orderResult[0];
    let refundStatus = 'none';
    let message = '';
    
    // Calculate refund window
    let refundWindowRemaining = null;
    let canRequestRefund = false;
    
    if (order.payment_collected_at && order.order_status !== 'refunded' && order.order_status !== 'refund_requested') {
      const paymentDate = new Date(order.payment_collected_at);
      const now = new Date();
      const daysSincePayment = (now - paymentDate) / (1000 * 60 * 60 * 24);
      const remainingDays = Math.max(0, 5 - daysSincePayment);
      refundWindowRemaining = remainingDays;
      canRequestRefund = remainingDays > 0 && (order.order_status === 'paid' || order.order_status === 'shipped' || order.order_status === 'delivered');
    }
    
    if (order.order_status === 'refund_requested') {
      refundStatus = 'pending';
      const pendingDays = Math.floor(order.days_since_request || 0);
      message = `Your refund request is pending review. The seller has 48 hours to respond. ${pendingDays > 0 ? `Pending for ${pendingDays} days.` : ''}`;
      
      if (pendingDays >= 3) {
        message += " This request has been escalated to admin for review.";
      }
    } 
    else if (order.order_status === 'refunded') {
      refundStatus = 'approved';
      const refundAmount = parseFloat(order.refund_amount) || parseFloat(order.total_amount);
      message = `Refund approved and processed on ${new Date(order.refund_processed_at).toLocaleDateString()}. Amount: $${refundAmount.toFixed(2)}. Please allow 5-10 business days for the refund to appear in your account.`;
    } 
    else if (order.order_status === 'completed' && order.refund_denied_at) {
      refundStatus = 'denied';
      message = order.refund_notes || 'Refund request was denied because the product condition did not match the listing.';
    }
    else if (order.order_status === 'delivered' && order.payment_collected_at) {
      const paymentDate = new Date(order.payment_collected_at);
      const now = new Date();
      const daysSincePayment = (now - paymentDate) / (1000 * 60 * 60 * 24);
      const remainingDays = Math.max(0, 5 - daysSincePayment);
      
      if (remainingDays > 0) {
        message = `You have ${Math.ceil(remainingDays)} days remaining to request a refund. Refund window: 5 days from payment date.`;
        canRequestRefund = true;
      } else {
        message = 'Refund window has closed (5 days from payment). Please contact support if you have issues.';
      }
    }
    
    res.json({
      success: true,
      refundStatus: refundStatus,
      refundReason: order.refund_reason,
      requestedAt: order.refund_requested_at,
      processedAt: order.refund_processed_at,
      message: message,
      notes: order.refund_notes,
      refundWindowRemaining: refundWindowRemaining,
      canRequestRefund: canRequestRefund,
      refundAmount: order.refund_amount ? parseFloat(order.refund_amount) : null,
      returnOption: order.return_option,
      pickupCode: order.pickup_confirmation_code,
      pickupAddress: order.pickup_address,
      daysSinceRequest: order.days_since_request
    });
    
  } catch (err) {
    console.error("❌ Error checking refund status:", err);
    res.status(500).json({ error: err.message });
  }
});



// ============================================
// GET PENDING REFUNDS - SELLER/ADMIN DASHBOARD
// ============================================
app.get("/api/refunds/pending", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const isAdmin = req.session.user.role === 'admin';
    let query = `
      SELECT 
        o.id,
        o.product_name,
        o.quantity,
        o.total_amount,
        o.refund_reason,
        o.refund_requested_at,
        o.order_status,
        o.payment_provider,
        o.transaction_ref,
        o.return_option,
        o.pickup_address,
        o.pickup_confirmation_code,
        o.refund_amount,
        u_buyer.id as buyer_id,
        u_buyer.username as buyer_name,
        u_buyer.email as buyer_email,
        u_seller.id as seller_id,
        u_seller.username as seller_name,
        u_seller.email as seller_email,
        TIMESTAMPDIFF(HOUR, o.refund_requested_at, NOW()) as hours_pending,
        TIMESTAMPDIFF(DAY, o.refund_requested_at, NOW()) as days_pending
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
    
    // Check for stale refunds (pending > 3 days)
    const staleRefunds = (refundRequests || []).filter(r => r.days_pending >= 3);
    
    res.json({
      success: true,
      refunds: (refundRequests || []).map(r => ({
        ...r,
        total_amount: parseFloat(r.total_amount || 0),
        refund_amount: parseFloat(r.refund_amount) || parseFloat(r.total_amount || 0),
        hours_pending: parseInt(r.hours_pending) || 0,
        days_pending: parseInt(r.days_pending) || 0,
        is_stale: (r.days_pending || 0) >= 3,
        requires_admin: (r.days_pending || 0) >= 3 && !isAdmin
      })),
      summary: {
        total_pending: (refundRequests || []).length,
        stale_count: staleRefunds.length,
        requires_attention: staleRefunds.length
      }
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
app.post("/api/seller/confirm-return/:orderId", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    const { return_code, inspection_result, damage_notes } = req.body;
    
    const orderResult = await db.query(
      `SELECT o.*, p.condition_type, p.condition_description, p.visible_defects,
              u_buyer.email as buyer_email, u_buyer.username as buyer_name
       FROM physical_orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
       WHERE o.id = ? AND o.seller_id = ? AND o.order_status = 'refund_requested'`,
      [orderId, req.session.user.id]
    );
    
    const order = orderResult[0];
    
    // Verify return code
    const pickupRequest = await db.query(
      `SELECT * FROM refund_pickup_requests WHERE order_id = ? AND pickup_code = ?`,
      [orderId, return_code]
    );
    
    if (!pickupRequest || pickupRequest.length === 0) {
      return res.status(400).json({ error: "Invalid return code" });
    }
    
    if (inspection_result === 'accept') {
      // Product matches description - process refund
      let refundAmount = order.total_amount;
      let sellerTransportFee = 0;
      
      if (order.return_option === 'pickup') {
        sellerTransportFee = order.total_amount * 0.03;
        refundAmount = order.total_amount - sellerTransportFee;
      }
      
      // Process refund through payment gateway
      const refundSuccess = await processPaymentRefund(order);
      
      if (refundSuccess) {
        await db.query(
          `UPDATE physical_orders 
           SET order_status = 'refunded',
               refund_processed_at = NOW(),
               refund_approved_by = ?,
               seller_transport_fee = ?,
               refund_amount = ?,
               inspection_passed = 1
           WHERE id = ?`,
          [req.session.user.id, sellerTransportFee, refundAmount, orderId]
        );
        
        await db.query(
          `UPDATE refund_pickup_requests 
           SET status = 'completed', completed_at = NOW()
           WHERE order_id = ?`,
          [orderId]
        );
        
        // Notify customer
        await sendEmail(order.buyer_email, `Refund Processed for Order #${orderId}`, `
          <h2>✅ Refund Processed After Inspection</h2>
          <p>Your refund of $${refundAmount.toFixed(2)} has been processed.</p>
          ${order.return_option === 'pickup' ? `<p>3% ($${sellerTransportFee.toFixed(2)}) was deducted for seller transport.</p>` : ''}
          <p>Please allow 5-10 business days for the refund to appear.</p>
        `);
        
        return res.json({
          success: true,
          message: `Refund processed. Customer received $${refundAmount.toFixed(2)}`,
          refund_amount: refundAmount
        });
      }
      
    } else if (inspection_result === 'reject') {
      // Product doesn't match description - dispute
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'refund_disputed',
             admin_review_requested_at = NOW(),
             refund_notes = ?
         WHERE id = ?`,
        [damage_notes || 'Product condition does not match listing', orderId]
      );
      
      // Create dispute record
      await db.query(
        `INSERT INTO refund_disputes (order_id, customer_id, seller_id, dispute_reason, customer_evidence, seller_evidence, status, created_at)
         VALUES (?, ?, ?, 'Product condition mismatch', NULL, ?, 'pending', NOW())`,
        [orderId, order.buyer_id, req.session.user.id, damage_notes || 'Product damaged or not as described']
      );
      
      // Notify admin
      const admins = await db.query("SELECT email FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await sendEmail(admin.email, `⚠️ Refund Dispute Needs Review - Order #${orderId}`, `
          <h2>Refund Dispute Requires Admin Review</h2>
          <p><strong>Order #${orderId}</strong></p>
          <p><strong>Seller:</strong> ${req.session.user.username}</p>
          <p><strong>Customer:</strong> ${order.buyer_name}</p>
          <p><strong>Product:</strong> ${order.product_name}</p>
          <p><strong>Listed Condition:</strong> ${order.condition_type} - ${order.condition_description}</p>
          <p><strong>Seller's Rejection Reason:</strong> ${damage_notes || 'Product does not match description'}</p>
          <p><strong>Action Required:</strong> Please review this dispute within 3 days.</p>
          <a href="https://coreinsightmarket.com/admin/disputes/${orderId}">Review Dispute</a>
        `);
      }
      
      return res.json({
        success: true,
        message: "Return rejected. Case has been escalated to admin for review.",
        dispute_id: insertId
      });
    }
    
  } catch (err) {
    console.error("Return confirmation error:", err);
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

// index.js - COMPLETE CORRECTED VERSION WITH AFFILIATE FIX
app.post("/api/upload-product", checkSellerVerification, uploadProduct, async (req, res) => {
  try {
    console.log("📤 PRODUCT UPLOAD STARTED");
    
    // ========== AUTHENTICATION CHECK ==========
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in to upload products." });
    }

    // ========== EXTRACT FORM DATA ==========
    const { 
      title, description, price, category, type, affiliate_link, paymentProvider,
      delivery_days, product_cost, delivery_locations, delivery_type, payment_option,
      businessName, businessEmail, businessPhone, country, bankName, bankCode, 
      accountNumber, accountName, delivery_countries, delivery_states,
      pickup_address, pickup_hours, is_virtual_account
    } = req.body;

    console.log("📦 Product data:", { title, price, type, paymentProvider });

    // ========== VALIDATION - FIXED FOR AFFILIATE ==========
    if (!title || !price || !type) {
      return res.status(400).json({ error: "Title, price, and type are required." });
    }
    
    // Only validate paymentProvider for non-affiliate products
    if (type !== 'affiliate' && !paymentProvider) {
      return res.status(400).json({ error: "Payment provider is required for physical/digital products." });
    }

    const userId = req.session.user.id;
    const listedPrice = parseFloat(price);
    
    // ========== HANDLE DIGITAL PRODUCT FILE ==========
    let fileUrl = null;
    
    if (type === 'digital') {
      // Check if file was uploaded
      if (!req.files || !req.files.file || !req.files.file[0]) {
        console.error("❌ No file uploaded for digital product");
        return res.status(400).json({ error: "Digital product requires a file. Please upload the file." });
      }
      
      const productFile = req.files.file[0];
      console.log(`📁 Processing digital file: ${productFile.originalname}, size: ${productFile.size} bytes`);
      
      try {
        fileUrl = await uploadFile(productFile.path, productFile.originalname);
        console.log(`✅ Digital file uploaded successfully to: ${fileUrl.substring(0, 80)}...`);
        
        if (!fileUrl || fileUrl === '') {
          throw new Error('Upload returned empty URL');
        }
      } catch (fileError) {
        console.error(`❌ Digital file upload failed: ${fileError.message}`);
        return res.status(500).json({ error: `File upload failed: ${fileError.message}` });
      }
    }
    
    // ========== HANDLE AFFILIATE PRODUCT LINK ==========
    if (type === 'affiliate' && affiliate_link) {
      fileUrl = affiliate_link;
      console.log(`🔗 Affiliate product detected. Link: ${affiliate_link.substring(0, 50)}...`);
    }
    
    // ========== CREATE FLUTTERWAVE SUBACCOUNT (ONLY FOR NON-AFFILIATE) ==========
    let subaccountResult = null;
    
    // Only create subaccount for physical/digital products with Flutterwave
    if (type !== 'affiliate' && paymentProvider === 'flutterwave') {
      const isVirtual = (is_virtual_account === '1' || is_virtual_account === 'true');
      const accountNameToUse = isVirtual ? (businessName || accountName) : businessName;
      
      subaccountResult = await createFlutterwaveSubaccount(userId, {
        bank_code: bankCode,
        account_number: accountNumber,
        business_name: accountNameToUse,
        business_email: businessEmail,
        business_phone: businessPhone,
        country: country || 'NG',
        is_virtual: isVirtual
      });
      
      if (!subaccountResult.success) {
        console.warn(`⚠️ Flutterwave subaccount creation issue: ${subaccountResult.error}`);
        // Continue anyway - product can still be listed
      } else {
        console.log(`✅ Subaccount created: ${subaccountResult.subaccount_id}`);
      }
    } else if (type === 'affiliate') {
      console.log("🔗 Affiliate product - skipping subaccount creation");
    }
    
    // ========== UPLOAD PRODUCT IMAGES ==========
    let imageUrls = [];
    if (req.files?.['images[]']?.length) {
      console.log(`📸 Uploading ${req.files['images[]'].length} images...`);
      for (const file of req.files['images[]']) {
        try {
          const url = await uploadToImgbb(file.path, file.originalname);
          imageUrls.push(url);
          console.log(`  ✅ Image uploaded: ${url.substring(0, 50)}...`);
        } catch (imgError) {
          console.error(`  ❌ Image upload failed: ${imgError.message}`);
        }
      }
    }

    // If no images uploaded for non-affiliate products, return error
    if (type !== 'affiliate' && imageUrls.length === 0) {
      return res.status(400).json({ error: "At least one product image is required." });
    }
    
    // For affiliate products, allow no images if external image URL provided
    if (type === 'affiliate' && imageUrls.length === 0 && !req.body.external_image) {
      // Use a placeholder image
      imageUrls = ['https://placehold.co/400x250/1e293b/3b82f6/png?text=Affiliate+Product'];
    }
    
    // ========== VERIFY FILE URL FOR DIGITAL PRODUCTS ==========
    if (type === 'digital' && !fileUrl) {
      console.error("❌ No file URL available for digital product");
      return res.status(500).json({ error: "File upload failed. No URL returned." });
    }
    
    // ========== CALCULATE FEES ==========
    const platformFee = (type === 'digital' || type === 'physical') ? listedPrice * 0.10 : 0;
    const sellerEarnings = (type === 'digital' || type === 'physical') ? listedPrice * 0.90 : listedPrice;
    
    console.log(`💰 Fee calculation: Customer pays $${listedPrice}, Platform fee: $${platformFee}, Seller earns: $${sellerEarnings}`);

    // ========== INSERT PRODUCT INTO DATABASE ==========
    const result = await db.query(
      `INSERT INTO products (
        user_id, title, description, price, original_price, platform_fee, product_cost,
        category, type, file_url, image_urls, affiliate_link, 
        seller_payment_provider, delivery_type, delivery_locations, 
        delivery_countries, delivery_states, pickup_address, pickup_hours,
        payment_option, estimated_delivery_days, is_virtual_account,
        rating, review_count, status, sales_count, favorite_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId, 
        title?.trim() || '', 
        description?.trim() || '', 
        listedPrice, 
        listedPrice, 
        (type === 'digital' || type === 'physical') ? listedPrice * 0.10 : 0,
        type === 'physical' ? (parseFloat(product_cost) || 3.00) : null,
        category?.trim() || 'Uncategorized', 
        type, 
        fileUrl,
        imageUrls.length ? JSON.stringify(imageUrls) : null, 
        affiliate_link || null, 
        paymentProvider || 'affiliate',  // Default to 'affiliate' for affiliate products
        type === 'physical' ? (delivery_type || 'delivery') : null,
        type === 'physical' ? (delivery_locations || 'Worldwide') : null,
        type === 'physical' ? (delivery_countries || 'Worldwide') : null,
        type === 'physical' ? (delivery_states || '') : null,
        type === 'physical' ? (pickup_address || '') : null,
        type === 'physical' ? (pickup_hours || '') : null,
        type === 'physical' ? (payment_option || 'pay_before_delivery') : null,
        type === 'physical' ? (parseInt(delivery_days) || 7) : null,
        (is_virtual_account === '1' || is_virtual_account === 'true') ? 1 : 0,
        0.00,  // rating
        0,    // review_count
        'active', 
        0,    // sales_count 
        0,    // favorite_count
      ]
    );
    
    const productId = result.insertId;
    console.log(`✅ Product uploaded successfully! ID: ${productId}`);
    console.log(`📁 File URL saved to database: ${fileUrl ? 'YES' : 'NO'}`);
    if (fileUrl) {
      console.log(`🔗 File URL: ${fileUrl.substring(0, 100)}...`);
    }
    
    // ========== SEND SUCCESS RESPONSE ==========
    res.json({ 
      success: true,
      message: type === 'digital' 
        ? "✅ Digital product uploaded successfully! Customers will receive download links after purchase."
        : type === 'affiliate'
        ? "✅ Affiliate product uploaded successfully! Customers will be redirected to your affiliate link."
        : "✅ Physical product uploaded successfully!",
      productId: productId,
      type: type,
      file_url: fileUrl,
      subaccount_created: subaccountResult?.success || false,
      subaccount_id: subaccountResult?.subaccount_id || subaccountResult?.subaccount_code,
      images_uploaded: imageUrls.length,
      pricing: {
        customer_price: listedPrice,
        platform_fee: platformFee,
        seller_earnings: sellerEarnings,
        split_ratio: "90/10"
      }
    });
    
  } catch (err) {
    console.error('❌ Product upload error:', err);
    console.error('❌ Error stack:', err.stack);
    
    // Clean up any temporary files that might still exist
    if (req.files) {
      const allFiles = [];
      if (req.files.file) allFiles.push(...req.files.file);
      if (req.files['images[]']) allFiles.push(...req.files['images[]']);
      for (const file of allFiles) {
        try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch(e) {}
      }
    }
    
    res.status(500).json({ 
      error: "Error uploading product: " + err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});
// Debug endpoint - Check subaccount creation status
app.get("/api/debug/subaccount-status", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const user = await db.query(
      `SELECT id, username, 
              flutterwave_subaccount_id, paystack_subaccount_code,
              subaccount_created_at, subaccount_status,
              bank_code, account_number
       FROM users WHERE id = ?`,
      [req.session.user.id]
    );
    
    res.json({
      success: true,
      user_id: req.session.user.id,
      subaccount: user[0] || null,
      has_flutterwave: !!(user[0]?.flutterwave_subaccount_id),
      has_paystack: !!(user[0]?.paystack_subaccount_code),
      created_at: user[0]?.subaccount_created_at,
      status: user[0]?.subaccount_status || 'not_created'
    });
    
  } catch (err) {
    console.error("Subaccount status error:", err);
    res.status(500).json({ error: err.message });
  }
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
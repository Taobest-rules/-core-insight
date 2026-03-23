// index.js - PRODUCTION VERSION (COMPLETE WITH REVIEWS)
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
// SUBACCOUNT CREATION FUNCTIONS
// ============================================

// Flutterwave Subaccount Creation
async function createFlutterwaveSubaccount(sellerData) {
  try {
    const { user_id, business_name, email, account_number, bank_code, country, phone, bank_name } = sellerData;
    
    console.log(`🏦 Creating Flutterwave subaccount for seller ${user_id}...`);
    
    if (!account_number) {
      console.error('❌ Account number is required');
      return null;
    }
    
    const payload = {
      account_bank: bank_code || "044",
      account_number: account_number,
      business_name: business_name || `Seller ${user_id}`,
      business_email: email,
      business_mobile: phone || "",
      country: country || "NG",
      split_type: "percentage",
      split_value: 10
    };
    
    const response = await axios.post(
      'https://api.flutterwave.com/v3/subaccounts',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    if (response.data.status === 'success') {
      const subaccountId = response.data.data.subaccount_id;
      
      await db.query(
        `INSERT INTO sellers (user_id, bank_code, account_number, business_name, flutterwave_subaccount_id, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
         bank_code = VALUES(bank_code),
         account_number = VALUES(account_number),
         business_name = VALUES(business_name),
         flutterwave_subaccount_id = VALUES(flutterwave_subaccount_id)`,
        [user_id, bank_code, account_number, business_name, subaccountId]
      );
      
      console.log(`✅ Flutterwave subaccount created: ${subaccountId}`);
      return subaccountId;
    }
    return null;
  } catch (err) {
    console.error('❌ Flutterwave subaccount error:', err.response?.data || err.message);
    return null;
  }
}

// Paystack Subaccount Creation
async function createPaystackSubaccount(sellerData) {
  try {
    const { user_id, business_name, email, account_number, bank_code, bank_name, percentage_charge } = sellerData;
    
    console.log(`🏦 Creating Paystack subaccount for seller ${user_id}...`);
    
    if (!account_number || !bank_code) {
      console.error('❌ Account number and bank code are required for Paystack');
      return null;
    }
    
    const payload = {
      business_name: business_name || `Seller ${user_id}`,
      settlement_bank: bank_code,
      account_number: account_number,
      percentage_charge: percentage_charge || 10
    };
    
    const response = await axios.post(
      'https://api.paystack.co/subaccount',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    if (response.data.status === true) {
      const subaccountCode = response.data.data.subaccount_code;
      
      await db.query(
        `INSERT INTO sellers (user_id, bank_code, account_number, business_name, paystack_subaccount_code, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
         bank_code = VALUES(bank_code),
         account_number = VALUES(account_number),
         business_name = VALUES(business_name),
         paystack_subaccount_code = VALUES(paystack_subaccount_code)`,
        [user_id, bank_code, account_number, business_name, subaccountCode]
      );
      
      console.log(`✅ Paystack subaccount created: ${subaccountCode}`);
      return subaccountCode;
    }
    return null;
  } catch (err) {
    console.error('❌ Paystack subaccount error:', err.response?.data || err.message);
    return null;
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
          .status-badge { background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; display: inline-block; font-size: 12px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #94a3b8; text-align: center; }
          .btn { background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎉 Order Confirmed!</h1>
          <p>Hello ${escapeHtml(name)},</p>
          <p>Thank you for your order! We've received your order and it's now being processed.</p>
          
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
    
    if (BREVO_API_KEY) {
      await axios({
        method: 'POST',
        url: 'https://api.brevo.com/v3/smtp/email',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        data: {
          sender: { email: "coreinsightmail@gmail.com", name: "Core Insight" },
          to: [{ email: email }],
          subject: `Order Confirmation #${orderId} - Core Insight`,
          htmlContent: emailHtml
        },
        timeout: 15000
      });
    } else if (transporter) {
      await transporter.sendMail({
        from: `"Core Insight Orders" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Order Confirmation #${orderId} - Core Insight`,
        html: emailHtml
      });
    }
    
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
    
    if (BREVO_API_KEY) {
      await axios({
        method: 'POST',
        url: 'https://api.brevo.com/v3/smtp/email',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        data: {
          sender: { email: "coreinsightmail@gmail.com", name: "Core Insight" },
          to: [{ email: email }],
          subject: `New Order #${orderId} - Requires Approval`,
          htmlContent: emailHtml
        },
        timeout: 15000
      });
    } else if (transporter) {
      await transporter.sendMail({
        from: `"Core Insight Orders" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `New Order #${orderId} - Requires Approval`,
        html: emailHtml
      });
    }
    
    console.log(`✅ Seller notification email sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Seller notification email error:', error.message);
    return { success: false, error: error.message };
  }
}
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

async function sendSupportEmail(name, email, subject, message, orderId = null) {
  if (!transporter && !BREVO_API_KEY) return { success: false, error: "Email service not configured" };

  try {
    const htmlBody = `
      <!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;}</style></head>
      <body><div style="max-width:600px;margin:0 auto;padding:20px;">
        <h2>📝 New Support Request from ${escapeHtml(name)}</h2>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        ${orderId ? `<p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>` : ''}
        <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        <hr><small>Submitted: ${new Date().toLocaleString()}</small>
      </div></body></html>
    `;

    if (BREVO_API_KEY) {
      await axios({
        method: 'POST',
        url: 'https://api.brevo.com/v3/smtp/email',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        data: {
          sender: { email: "coreinsightmail@gmail.com", name: "Core Insight Support" },
          to: [{ email: SUPPORT_EMAIL }],
          replyTo: { email: email, name: name },
          subject: `[Support] ${subject} - from ${name}`,
          htmlContent: htmlBody
        },
        timeout: 15000
      });
    } else if (transporter) {
      await transporter.sendMail({
        from: `"Core Insight Support" <${process.env.EMAIL_USER}>`,
        to: SUPPORT_EMAIL,
        subject: `[Support] ${subject} - from ${name}`,
        html: htmlBody,
        replyTo: email
      });
    }
    console.log(`✅ Support email sent to ${SUPPORT_EMAIL}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Brevo support email error:", error.message);
    return { success: false, error: error.message };
  }
}

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

Object.values(uploadDirs).forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const courseStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDirs.courses),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    cb(null, `${timestamp}-${random}-${baseName}${ext}`);
  }
});

const productStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDirs.products),
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + "-" + sanitizedName);
  }
});

const upload = multer({ storage: courseStorage });
const productUpload = multer({ storage: productStorage });

// ============================================
// MIDDLEWARE FUNCTIONS
// ============================================
const checkCourseAccess = async (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login to access this course" });
  try {
    const courseId = req.params.id;
    const userId = req.session.user.id;
    const accessCheck = await db.query(
      `SELECT c.*, uc.payment_status FROM courses c LEFT JOIN user_courses uc ON c.id = uc.course_id AND uc.user_id = ?
       WHERE c.id = ? AND (c.price = 0 OR uc.payment_status = 'completed')`,
      [userId, courseId]
    );
    const hasAccess = extractRows(accessCheck).length > 0;
    if (!hasAccess) return res.status(403).json({ error: "You don't have access to this course. Please purchase it first." });
    next();
  } catch (err) {
    res.status(500).json({ error: "Error checking course access" });
  }
};

const checkFreelancerSubscription = async (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login" });
  if (req.session.user.role === 'client') return next();
  if (req.session.user.role === 'admin') return next();

  try {
    const userId = req.session.user.id;
    const userResult = await db.query(
      `SELECT subscription_status, subscription_end_date, trial_end_date FROM users WHERE id = ?`,
      [userId]
    );
    const user = extractRows(userResult)[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const today = new Date();
    const trialEnd = user.trial_end_date ? new Date(user.trial_end_date) : null;
    const subEnd = user.subscription_end_date ? new Date(user.subscription_end_date) : null;

    let isActive = false;
    if (user.subscription_status === 'active') {
      if ((trialEnd && today <= trialEnd) || (subEnd && today <= subEnd)) {
        isActive = true;
      } else {
        await db.query("UPDATE users SET subscription_status = 'expired' WHERE id = ?", [userId]);
        req.session.user.subscription_status = 'expired';
      }
    }

    if (!isActive) {
      return res.status(403).json({
        error: "Your freelancer subscription has expired. Please renew to continue offering services.",
        requiresSubscription: true,
        expired: true
      });
    }
    next();
  } catch (err) {
    console.error("Subscription check error:", err);
    res.status(500).json({ error: "Error checking subscription" });
  }
};

// ============================================
// ROUTES - HEALTH & BASIC
// ============================================
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1 as healthy");
    res.json({ status: "healthy", database: "connected", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

app.get("/api/currency-rates", (req, res) => {
  res.json({
    base: 'NGN',
    rates: { NGN: 1, USD: 0.0011, EUR: 0.0010, GBP: 0.00085, KES: 0.15, GHS: 0.013, ZAR: 0.021 },
    timestamp: new Date().toISOString()
  });
});

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
// ROUTES - PRODUCTS (FIXED WITH IMAGES)
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
      // Convert price to number
      product.price = parseFloat(product.price || 0);
      product.original_price = parseFloat(product.original_price) || product.price;
      product.platform_fee = parseFloat(product.platform_fee) || (product.type === 'physical' ? product.original_price * 0.1 : 0);
      product.seller_price = product.type === 'physical' ? product.original_price - product.platform_fee : product.price;
      product.rating = parseFloat(product.rating) || 0;
      product.review_count = parseInt(product.review_count) || 0;
      
      // Add delivery locations (important for country filter)
      product.delivery_locations = product.delivery_locations || 'Worldwide';
      product.estimated_delivery_days = product.estimated_delivery_days || 7;

      // Handle image_urls properly
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
      
      // Fallback to legacy images field
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
      
      // Default image if none found
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
// DIGITAL PRODUCT BUY WITH SUBACCOUNT SPLIT
// ============================================
app.post("/api/buy-product", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to buy products." });
  }

  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: "Product ID is required." });

    // Get product with seller subaccounts (both providers)
    const productResult = await db.query(
      `SELECT p.*, u.email as seller_email, u.username as seller_name,
              s.flutterwave_subaccount_id, s.paystack_subaccount_code
       FROM products p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN sellers s ON p.user_id = s.user_id
       WHERE p.id = ? AND (p.is_deleted = 0 OR p.is_deleted IS NULL)`,
      [productId]
    );

    let product = null;
    if (productResult && productResult.length > 0) product = productResult[0];
    if (!product) return res.status(404).json({ error: "Product not found." });

    if (product.type === "affiliate" && product.affiliate_link) {
      return res.json({ type: "affiliate", link: product.affiliate_link });
    }

    // For digital products - use appropriate payment provider
    if (product.type === "digital") {
      const paymentProvider = product.seller_payment_provider || 'flutterwave';
      
      if (paymentProvider === 'flutterwave' && !process.env.FLW_SECRET_KEY) {
        return res.status(500).json({ error: "Flutterwave not configured." });
      }
      if (paymentProvider === 'paystack' && !process.env.PAYSTACK_SECRET_KEY) {
        return res.status(500).json({ error: "Paystack not configured." });
      }

      const totalAmount = parseFloat(product.original_price || product.price);
      const platformFee = totalAmount * 0.10;
      const sellerAmount = totalAmount - platformFee;

      console.log(`💰 Digital product payment:
        Product: ${product.title}
        Provider: ${paymentProvider}
        Total: $${totalAmount}
        Platform (10%): $${platformFee}
        Seller (90%): $${sellerAmount}
      `);

      const txRef = `digital-${product.id}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      
      let paymentLink = null;
      
      if (paymentProvider === 'flutterwave') {
        const payload = {
          tx_ref: txRef,
          amount: totalAmount,
          currency: "USD",
          redirect_url: "https://core-insight-7.onrender.com/payment-callback.html",
          customer: {
            email: req.session.user.email,
            name: req.session.user.username,
          },
          customizations: {
            title: "Core Insight",
            description: `Digital Product: ${product.title}`,
          },
          meta: {
            product_id: product.id,
            seller_id: product.user_id,
            buyer_id: req.session.user.id,
            type: 'digital',
            platform_fee: platformFee,
            seller_earnings: sellerAmount
          }
        };

        if (product.flutterwave_subaccount_id) {
          payload.subaccounts = [{
            id: product.flutterwave_subaccount_id,
            transaction_split_ratio: 90
          }];
          console.log(`✅ Using Flutterwave subaccount: ${product.flutterwave_subaccount_id}`);
        }

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
          paymentLink = response.data.data.link;
        }
        
      } else if (paymentProvider === 'paystack') {
        const amountInKobo = Math.round(totalAmount * 100);
        
        const payload = {
          email: req.session.user.email,
          amount: amountInKobo,
          currency: "NGN",
          reference: txRef,
          callback_url: "https://core-insight-7.onrender.com/payment-callback.html",
          metadata: {
            product_id: product.id,
            seller_id: product.user_id,
            buyer_id: req.session.user.id,
            type: 'digital',
            platform_fee: platformFee,
            seller_earnings: sellerAmount
          }
        };

        if (product.paystack_subaccount_code) {
          payload.subaccount = product.paystack_subaccount_code;
          payload.transaction_charge = Math.round(platformFee * 100);
          console.log(`✅ Using Paystack subaccount: ${product.paystack_subaccount_code}`);
        }

        const response = await axios.post(
          'https://api.paystack.co/transaction/initialize',
          payload,
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );

        if (response.data.status && response.data.data && response.data.data.authorization_url) {
          paymentLink = response.data.data.authorization_url;
        }
      }

      if (paymentLink) {
        await db.query(
          `INSERT INTO orders 
           (user_id, product_id, tx_ref, amount, status, provider, seller_id, platform_fee, seller_earnings)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
          [req.session.user.id, product.id, txRef, totalAmount, paymentProvider, product.user_id, platformFee, sellerAmount]
        );

        res.json({
          type: "payment",
          provider: paymentProvider,
          link: paymentLink,
          tx_ref: txRef
        });
      } else {
        throw new Error("Payment initialization failed");
      }
    }

  } catch (err) {
    console.error('❌ Buy product error:', err);
    res.status(500).json({ error: "Payment failed: " + err.message });
  }
});
// ============================================
// CHECK SELLER SUBACCOUNT STATUS
// ============================================
app.get("/api/seller/subaccount-status", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }
    
    const result = await db.query(
      "SELECT flutterwave_subaccount_id, paystack_subaccount_code FROM sellers WHERE user_id = ?",
      [req.session.user.id]
    );
    
    if (result && result.length > 0) {
      res.json({
        success: true,
        flutterwave: {
          hasSubaccount: !!result[0].flutterwave_subaccount_id,
          subaccountId: result[0].flutterwave_subaccount_id
        },
        paystack: {
          hasSubaccount: !!result[0].paystack_subaccount_code,
          subaccountCode: result[0].paystack_subaccount_code
        }
      });
    } else {
      res.json({
        success: true,
        flutterwave: { hasSubaccount: false },
        paystack: { hasSubaccount: false },
        message: "No subaccounts found. Add bank details when uploading a product."
      });
    }
    
  } catch (err) {
    console.error('❌ Error checking subaccount status:', err);
    res.status(500).json({ error: err.message });
  }
});
// ============================================
// REFUND PROCESSING (Admin/Seller)
// ============================================

app.post("/api/refunds/:orderId/process", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });
    
    const orderId = req.params.orderId;
    const { action, admin_notes } = req.body; // action: 'approve' or 'deny'
    
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
    
    // Check if refund is still within window
    const paymentDate = new Date(order.payment_collected_at);
    const now = new Date();
    const daysSincePayment = (now - paymentDate) / (1000 * 60 * 60 * 24);
    
    if (daysSincePayment > 5 && order.order_status !== 'refund_requested') {
      return res.status(400).json({ error: "Refund window has closed (5 days after payment)" });
    }
    
    if (action === 'approve') {
      // Process refund based on payment provider
      let refundSuccess = false;
      let refundError = null;
      
      if (paymentProvider === 'flutterwave') {
        try {
          // Get transaction reference
          const transactionRef = order.transaction_ref;
          
          const refundResponse = await axios.post(
            'https://api.flutterwave.com/v3/transactions/refund',
            {
              transaction_id: transactionRef,
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
        
      } else if (paymentProvider === 'paystack') {
        try {
          // Get transaction reference
          const transactionRef = order.transaction_ref;
          
          const refundResponse = await axios.post(
            'https://api.paystack.co/transaction/refund',
            {
              transaction: transactionRef,
              amount: Math.round(order.total_amount * 100) // Convert to kobo
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
        // Update order status
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
        
        // Notify seller
        await db.query(
          `INSERT INTO seller_notifications (seller_id, order_id, notification_type, title, message, created_at)
           VALUES (?, ?, 'refund_processed', 'Refund Processed', 
                   CONCAT('Refund for order #', ?, ' has been processed. Funds have been returned to the buyer.'), NOW())`,
          [order.seller_id, orderId, orderId]
        );
        
        res.json({
          success: true,
          message: "Refund approved and processed successfully",
          refundId: refundSuccess
        });
        
      } else {
        res.status(500).json({ 
          success: false, 
          error: `Refund failed: ${refundError}` 
        });
      }
      
    } else if (action === 'deny') {
      // Deny refund
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'completed',
             refund_denied_at = NOW(),
             refund_denied_by = ?,
             refund_notes = ?
         WHERE id = ?`,
        [req.session.user.id, admin_notes || 'Refund denied', orderId]
      );
      
      // Notify buyer
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
// Add this endpoint to show sellers their earnings breakdown:
// ============================================
// GET REFUND REQUESTS (Admin/Seller)
// ============================================

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
// ============================================
// SELLER EARNINGS BREAKDOWN
// ============================================

app.get("/api/seller/orders/:orderId/earnings", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });

    const orderId = req.params.orderId;
    
    const orderResult = await db.query(
      `SELECT o.*, p.product_cost, p.original_price
       FROM physical_orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.id = ? AND o.seller_id = ?`,
      [orderId, req.session.user.id]
    );

    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult[0];
    const productPrice = order.original_price;
    const qty = order.quantity;
    const totalAmount = order.total_amount;
    const baseFee = productPrice * 0.10;
    const isBulkOrder = qty >= 6;
    const bulkFee = isBulkOrder ? totalAmount * 0.10 : 0;
    const totalFee = baseFee + bulkFee;
    const sellerEarnings = totalAmount - totalFee;
    
    // Parse stored fee breakdown if available
    let feeBreakdown = null;
    if (order.fee_breakdown) {
      try {
        feeBreakdown = JSON.parse(order.fee_breakdown);
      } catch (e) {
        feeBreakdown = null;
      }
    }

    res.json({
      success: true,
      order: {
        id: order.id,
        product_name: order.product_name,
        quantity: qty,
        unit_price: productPrice,
        total_amount: totalAmount,
        order_status: order.order_status,
        payment_status: order.payment_status,
        created_at: order.created_at,
        payment_collected_at: order.payment_collected_at,
        funds_released_at: order.funds_released_at
      },
      earnings_breakdown: feeBreakdown || {
        customer_pays: totalAmount,
        platform_fee: {
          total: totalFee,
          breakdown: isBulkOrder ? {
            base_fee: baseFee,
            bulk_fee: bulkFee,
            note: `Bulk order (${qty} units): Base fee (10% of product) + 10% of total order value`
          } : {
            base_fee: totalFee,
            note: `Standard order (${qty} units): 10% of product price`
          }
        },
        product_cost: order.product_cost || 0,
        your_earnings: sellerEarnings,
        formula: isBulkOrder 
          ? `${totalAmount} - (${baseFee} + ${bulkFee}) = ${sellerEarnings}`
          : `${totalAmount} - ${totalFee} = ${sellerEarnings}`
      }
    });

  } catch (err) {
    console.error("❌ Error getting earnings breakdown:", err);
    res.status(500).json({ error: err.message });
  }
});
// ============================================
// FAVORITES ENDPOINTS (ADD THESE)
// ============================================

// Get user's favorites and favorite counts
app.get("/api/favorites", async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (!req.session.user) {
    return res.json({ favorites: [], favoriteCounts: {} });
  }

  try {
    // Get user's favorites
    const userFavs = await db.query(
      "SELECT product_id FROM favorites WHERE user_id = ?",
      [req.session.user.id]
    );

    let userFavorites = [];
    if (userFavs && userFavs.length > 0) {
      userFavorites = userFavs.map(row => row.product_id);
    }

    // Get favorite counts for all products
    const countResults = await db.query(`
      SELECT product_id, COUNT(*) as count 
      FROM favorites 
      GROUP BY product_id
    `);

    let favoriteCounts = {};
    if (countResults && countResults.length > 0) {
      countResults.forEach(row => {
        favoriteCounts[row.product_id] = parseInt(row.count) || 0;
      });
    }

    res.json({ 
      favorites: userFavorites,
      favoriteCounts: favoriteCounts
    });
  } catch (err) {
    console.error("Error loading favorites:", err);
    res.status(500).json({ error: "Error loading favorites: " + err.message });
  }
});

// Toggle favorite
app.post("/api/favorites/toggle", async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to favorite products." });
  }

  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "Product ID is required." });
    }

    // Check if already favorited
    const result = await db.query(
      "SELECT id FROM favorites WHERE user_id = ? AND product_id = ?",
      [req.session.user.id, productId]
    );

    let existing = result && result.length > 0 ? result : [];

    if (existing.length > 0) {
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
      
      let count = countResult && countResult.length > 0 ? (countResult[0].count || 0) : 0;
      
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
      
      let count = countResult && countResult.length > 0 ? (countResult[0].count || 0) : 0;
      
      return res.json({ 
        success: true, 
        action: "added",
        favoriteCount: count
      });
    }
  } catch (err) {
    console.error("Favorite toggle error:", err);
    res.status(500).json({ error: "Error updating favorites: " + err.message });
  }
});

// ============================================
// REVIEWS ENDPOINTS (ADDED - CRITICAL)
// ============================================

// Submit a product review
app.post("/api/reviews", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to submit a review." });
  }

  try {
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
    console.error("Error submitting review:", err);
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
    
    res.json({ 
      reviews: safeReviews,
      count: safeReviews.length
    });

  } catch (err) {
    console.error("Error loading reviews:", err);
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
    console.error("Error checking user review:", err);
    res.json({ hasReviewed: false });
  }
});

// ============================================
// PRODUCT UPLOAD ENDPOINT (COMPLETE WITH SUBACCOUNTS)
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
// ROUTES - PHYSICAL ORDER SYSTEM
// ============================================

// 1. Create physical order
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

    const productResult = await db.query(
      `SELECT user_id as seller_id, original_price, product_cost, title, platform_fee FROM products WHERE id = ?`,
      [productId]
    );

    if (!productResult || productResult.length === 0) return res.status(404).json({ error: "Product not found" });

    const sellerId = productResult[0].seller_id;
    const buyerId = req.session.user.id;
    const productPrice = parseFloat(productResult[0].original_price);
    const totalAmount = qty * productPrice;

    const result = await db.query(
      `INSERT INTO physical_orders (
        product_id, seller_id, buyer_id,
        product_name, product_type, quantity, 
        price, total_amount,
        customer_name, customer_email, customer_phone,
        shipping_address, city, state, country,
        payment_method, payment_status, order_status,
        notes, estimated_delivery_days,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        productId, sellerId, buyerId,
        productResult[0].title,
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
        'pending_seller_approval',
        notes || '',
        7
      ]
    );

    const orderId = result.insertId;
    console.log(`✅ Order #${orderId} created, awaiting seller approval`);

    await db.query(
      `INSERT INTO seller_notifications 
       (seller_id, order_id, notification_type, title, message, created_at)
       VALUES (?, ?, 'new_order', 'New Order Requires Approval', 
               CONCAT('Order #', ?, ' for ', ?, ' (x', ?, ') needs your approval before payment'), NOW())`,
      [sellerId, orderId, orderId, productResult[0].title, qty]
    );

    // ================= SEND EMAIL CONFIRMATION TO BUYER =================
    try {
      await sendOrderConfirmationEmail({
        email: req.session.user.email,
        name: req.session.user.username,
        orderId: orderId,
        productName: productResult[0].title,
        quantity: qty,
        totalAmount: totalAmount,
        deliveryAddress: deliveryAddress,
        estimatedDays: 7
      });
    } catch (emailError) {
      console.error('❌ Order confirmation email failed:', emailError.message);
    }

    // ================= SEND EMAIL NOTIFICATION TO SELLER =================
    try {
      const sellerInfo = await db.query(
        "SELECT email, username FROM users WHERE id = ?",
        [sellerId]
      );
      
      if (sellerInfo && sellerInfo.length > 0) {
        await sendSellerNotificationEmail({
          email: sellerInfo[0].email,
          name: sellerInfo[0].username,
          orderId: orderId,
          productName: productResult[0].title,
          quantity: qty,
          totalAmount: totalAmount
        });
      }
    } catch (emailError) {
      console.error('❌ Seller notification email failed:', emailError.message);
    }

    res.json({
      success: true,
      message: "Order created! The seller will review and confirm availability.",
      orderId: orderId,
      status: "pending_seller_approval"
    });

  } catch (err) {
    console.error("❌ Order creation error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// 2. Seller accepts or rejects order
app.post("/api/physical-orders/:orderId/respond", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });

    const orderId = req.params.orderId;
    const { action, message } = req.body;

    const orderResult = await db.query(
      `SELECT o.*, p.title as product_name 
       FROM physical_orders o
       LEFT JOIN products p ON o.product_id = p.id
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
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'seller_accepted',
             seller_accepted_at = NOW()
         WHERE id = ?`,
        [orderId]
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

      // ================= SEND PAYMENT LINK EMAIL TO BUYER =================
      try {
        const buyerInfo = await db.query(
          "SELECT email, username FROM users WHERE id = ?",
          [order.buyer_id]
        );
        
        if (buyerInfo && buyerInfo.length > 0) {
          const paymentLink = `https://core-insight-7.onrender.com/pay-order.html?orderId=${orderId}`;
          
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Payment Required - Core Insight</title></head>
            <body style="font-family:Arial;background:#0a192f;color:#e6f1ff;padding:20px;">
              <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:16px;padding:30px;">
                <h1 style="color:#3b82f6;">💰 Payment Required</h1>
                <p>Hello ${escapeHtml(buyerInfo[0].username)},</p>
                <p>The seller has accepted your order! Please complete payment to confirm.</p>
                <a href="${paymentLink}" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin:20px 0;">Pay Now</a>
                <p>Order #${orderId} - ${order.product_name} (x${order.quantity})</p>
                <p>Total: $${order.total_amount}</p>
              </div>
            </body>
            </html>
          `;
          
          await sendVerificationEmail(buyerInfo[0].email, `Payment Required for Order #${orderId}`, emailHtml);
        }
      } catch (emailError) {
        console.error('❌ Payment link email failed:', emailError.message);
      }

      res.json({
        success: true,
        message: "Order accepted! The buyer will now be prompted to complete payment.",
        requiresPayment: true,
        orderId: orderId
      });

    } else if (action === 'reject') {
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'seller_rejected',
             order_status = 'cancelled'
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
// ============================================
// COLLECT PAYMENT AFTER SELLER ACCEPTANCE
// ============================================

app.post("/api/physical-orders/:orderId/pay", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login" });

    const orderId = req.params.orderId;

    // Get order details with product info
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

    const productPrice = parseFloat(order.original_price);
    const totalAmount = parseFloat(order.total_amount);
    const qty = order.quantity;
    
    // ================= NEW FEE STRUCTURE =================
    // Base fee = 10% of single product price
    const baseFee = productPrice * 0.10;
    
    let platformFee = 0;
    let sellerEarnings = 0;
    let feeBreakdown = {};
    
    if (qty <= 5) {
      // Standard order (1-5 units): Only base fee
      platformFee = baseFee;
      sellerEarnings = totalAmount - platformFee;
      feeBreakdown = {
        type: "standard",
        baseFee: baseFee,
        bulkFee: 0,
        totalFee: platformFee,
        formula: `${totalAmount} - ${baseFee} = ${sellerEarnings}`,
        sellerNote: `Standard order (${qty} unit${qty > 1 ? 's' : ''}): Platform fee is $${baseFee.toFixed(2)} (10% of single product price)`
      };
      console.log(`📊 STANDARD ORDER - Order #${orderId}: Customer pays $${totalAmount} | Platform: $${platformFee} | Seller: $${sellerEarnings}`);
    } else {
      // Bulk order (6+ units): Base fee + 10% of total order
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
      console.log(`📊 BULK ORDER - Order #${orderId}: Customer pays $${totalAmount} | Platform: $${platformFee} | Seller: $${sellerEarnings}`);
    }
    // ================= END NEW FEE STRUCTURE =================

    // Generate transaction reference
    const transactionRef = `physical_${orderId}_${Date.now()}`;

    // Update order with pending payment and fee breakdown
    await db.query(
      `UPDATE physical_orders 
       SET order_status = 'pending_payment',
           payment_status = 'pending',
           platform_fee = ?,
           seller_earnings = ?,
           fee_breakdown = ?
       WHERE id = ?`,
      [platformFee, sellerEarnings, JSON.stringify(feeBreakdown), orderId]
    );

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
        description: `Order #${orderId}: ${order.product_name} (x${qty})`,
      },
      meta: {
        order_id: orderId,
        product_id: order.product_id,
        buyer_id: req.session.user.id,
        seller_id: order.seller_id,
        type: 'physical_order',
        is_escrow: true,
        escrow_days: 5,
        quantity: qty,
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
        `UPDATE physical_orders SET transaction_ref = ? WHERE id = ?`,
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
      // Revert order status if payment creation fails
      await db.query(
        `UPDATE physical_orders 
         SET order_status = 'seller_accepted',
             payment_status = 'pending'
         WHERE id = ?`,
        [orderId]
      );
      throw new Error(response.data.message || "Payment initialization failed");
    }

  } catch (err) {
    console.error("❌ Payment collection error:", err);
    res.status(500).json({ error: "Failed to process payment: " + err.message });
  }
});

// ============================================
// CREATE PHYSICAL ORDER PAYMENT (AFTER SELLER ACCEPTS)
// ============================================

app.post("/api/create-physical-order-payment", async (req, res) => {
  try {
    console.log("💰 Creating physical order payment...");
    console.log("📦 Request body:", JSON.stringify(req.body, null, 2));
    
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in to place an order" });
    }

    const {
      productId,
      productTitle,
      price,
      quantity = 1,
      deliveryAddress,
      city,
      state,
      country,
      deliveryPhone,
      deliveryDays = 7,
      notes = ''
    } = req.body;

    // Validate
    if (!productId) return res.status(400).json({ error: "Product ID is required" });
    if (!deliveryAddress) return res.status(400).json({ error: "Delivery address is required" });
    if (!deliveryPhone) return res.status(400).json({ error: "Delivery phone is required" });
    
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 100) {
      return res.status(400).json({ error: "Quantity must be between 1 and 100" });
    }

    // Get product details
    const productResult = await db.query(
      `SELECT user_id as seller_id, original_price, product_cost, title 
       FROM products WHERE id = ?`,
      [productId]
    );

    if (!productResult || productResult.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const sellerId = productResult[0].seller_id;
    const buyerId = req.session.user.id;
    const productPrice = parseFloat(productResult[0].original_price);
    const productCost = parseFloat(productResult[0].product_cost) || 0;
    
    // Calculate total amount customer pays
    const totalAmount = qty * productPrice;
    
    // ================= NEW FEE STRUCTURE =================
    // Base fee = 10% of single product price
    const baseFee = productPrice * 0.10;
    
    let platformFee = 0;
    let feeBreakdown = {};
    let sellerEarnings = 0;
    
    if (qty <= 5) {
      // Standard order (1-5 units): Only base fee
      platformFee = baseFee;
      sellerEarnings = totalAmount - platformFee;
      feeBreakdown = {
        type: "standard",
        baseFee: baseFee,
        bulkFee: 0,
        totalFee: platformFee,
        formula: `${totalAmount} - ${baseFee} = ${sellerEarnings}`,
        sellerNote: `Standard order (${qty} unit${qty > 1 ? 's' : ''}): Platform fee is $${baseFee.toFixed(2)} (10% of single product price)`
      };
      console.log(`📊 STANDARD ORDER (${qty} units): Customer pays $${totalAmount} | Platform fee: $${platformFee} | Seller gets: $${sellerEarnings}`);
    } else {
      // Bulk order (6+ units): Base fee + 10% of total order
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
      console.log(`📊 BULK ORDER (${qty} units): Customer pays $${totalAmount} | Platform fee: $${platformFee} | Seller gets: $${sellerEarnings}`);
    }
    // ================= END NEW FEE STRUCTURE =================

    // Generate transaction reference
    const transactionRef = `physical_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Insert order into database
    const result = await db.query(
      `INSERT INTO physical_orders (
        product_id, seller_id, buyer_id,
        product_name, product_type, quantity, 
        price, total_amount, platform_fee, seller_earnings,
        customer_name, customer_email, customer_phone,
        shipping_address, city, state, country,
        payment_method, payment_status, order_status,
        notes, estimated_delivery_days,
        transaction_ref, fee_breakdown
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId, sellerId, buyerId,
        productTitle || productResult[0].title,
        'physical', qty,
        productPrice,
        totalAmount,
        platformFee,
        sellerEarnings,
        req.session.user.username || 'Buyer',
        req.session.user.email,
        deliveryPhone,
        deliveryAddress,
        city || '',
        state || '',
        country || '',
        'pay_online',
        'pending',
        'pending',
        notes || '',
        parseInt(deliveryDays) || 7,
        transactionRef,
        JSON.stringify(feeBreakdown)
      ]
    );

    let orderId = result.insertId;
    if (!orderId) {
      throw new Error("Failed to insert order");
    }

    console.log(`✅ Created pending order #${orderId}`);

    // Initialize Flutterwave payment
    if (!process.env.FLW_SECRET_KEY) {
      await db.query("DELETE FROM physical_orders WHERE id = ?", [orderId]);
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
        title: "Core Insight - Physical Product Order",
        description: `${productTitle || productResult[0].title} (x${qty})`,
      },
      meta: {
        order_id: orderId,
        product_id: productId,
        buyer_id: buyerId,
        seller_id: sellerId,
        type: 'physical_order',
        quantity: qty,
        platform_fee: platformFee,
        seller_earnings: sellerEarnings,
        fee_breakdown: JSON.stringify(feeBreakdown)
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

    if (response.data.status === "success" && response.data.data && response.data.data.link) {
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
      await db.query("DELETE FROM physical_orders WHERE id = ?", [orderId]);
      throw new Error(response.data.message || "Payment initialization failed");
    }

  } catch (err) {
    console.error("❌ Payment creation error:", err);
    res.status(500).json({ 
      error: "Failed to create payment",
      details: err.message 
    });
  }
});

// 4. Verify payment and hold in escrow
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
      const platformFee = amount * 0.10;
      const sellerAmount = amount - platformFee;

      const escrowReleaseDate = new Date();
      escrowReleaseDate.setDate(escrowReleaseDate.getDate() + 5);

      await db.query(
        `UPDATE physical_orders 
         SET payment_status = 'paid',
             order_status = 'paid',
             payment_collected_at = NOW(),
             payment_held_until = ?,
             platform_fee = ?,
             seller_earnings = ?
         WHERE id = ? AND transaction_ref = ?`,
        [escrowReleaseDate, platformFee, sellerAmount, orderId, transaction_ref]
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

// 5. Buyer requests refund
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
// RELEASE ESCROW FUNDS (Cron Job - Both Providers)
// ============================================

app.get("/api/cron/release-escrow-funds", async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Find orders where escrow period has ended and no refund requested
    const ordersToRelease = await db.query(
      `SELECT o.*, s.flutterwave_subaccount_id, s.paystack_subaccount_code
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
        const paymentProvider = order.payment_provider || 'flutterwave';
        let transferSuccess = false;
        
        if (paymentProvider === 'flutterwave') {
          // Flutterwave: Transfer to seller's bank account
          try {
            const transferResponse = await axios.post(
              'https://api.flutterwave.com/v3/transfers',
              {
                account_bank: order.bank_code || "044",
                account_number: order.account_number,
                amount: order.seller_earnings,
                narration: `Payment for order #${order.id}`,
                currency: "USD",
                reference: `release_${order.id}_${Date.now()}`
              },
              {
                headers: {
                  Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            if (transferResponse.data.status === 'success') {
              transferSuccess = true;
              console.log(`✅ Flutterwave transfer for order #${order.id}: $${order.seller_earnings}`);
            }
          } catch (err) {
            console.error(`❌ Flutterwave transfer failed for order #${order.id}:`, err.message);
          }
          
        } else if (paymentProvider === 'paystack') {
          // Paystack: Transfer to seller's bank account
          try {
            const transferResponse = await axios.post(
              'https://api.paystack.co/transfer',
              {
                source: 'balance',
                amount: Math.round(order.seller_earnings * 100),
                recipient: order.recipient_code,
                reason: `Payment for order #${order.id}`
              },
              {
                headers: {
                  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            if (transferResponse.data.status === true) {
              transferSuccess = true;
              console.log(`✅ Paystack transfer for order #${order.id}: $${order.seller_earnings}`);
            }
          } catch (err) {
            console.error(`❌ Paystack transfer failed for order #${order.id}:`, err.message);
          }
        }
        
        // Update order status regardless of transfer success (for now)
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

// 7. Cron status endpoint
app.get("/api/cron/status", async (req, res) => {
  try {
    const waitingOrders = await db.query(`
      SELECT COUNT(*) as count, 
             MIN(payment_held_until) as next_release_date
      FROM physical_orders 
      WHERE payment_status = 'paid' 
        AND order_status = 'paid'
        AND funds_released_at IS NULL
        AND payment_held_until > NOW()
    `);

    const readyOrders = await db.query(`
      SELECT COUNT(*) as count
      FROM physical_orders 
      WHERE payment_status = 'paid' 
        AND order_status = 'paid'
        AND funds_released_at IS NULL
        AND payment_held_until <= NOW()
    `);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      orders_waiting: waitingOrders[0]?.count || 0,
      orders_ready_for_release: readyOrders[0]?.count || 0,
      next_release_date: waitingOrders[0]?.next_release_date,
      cron_last_run: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Get seller's physical orders
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

    res.json({
      success: true,
      orders: extractRows(orders),
      counts: counts[0] || {},
      pagination: { page: parseInt(page), limit: parseInt(limit) }
    });

  } catch (err) {
    console.error("❌ Error fetching seller orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});
// ============================================
// CHECK REFUND STATUS
// ============================================

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
// 9. Get buyer's physical orders
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

    res.json({
      success: true,
      orders: extractRows(orders),
      pagination: { page: parseInt(page), limit: parseInt(limit) }
    });

  } catch (err) {
    console.error("❌ Error fetching buyer orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});
// ============================================
// DIGITAL PRODUCT DOWNLOAD
// ============================================

app.get("/api/download-digital/:productId", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login to download" });
    }
    
    const productId = req.params.productId;
    const userId = req.session.user.id;
    
    // Check if user purchased this product
    const purchaseCheck = await db.query(
      "SELECT * FROM orders WHERE user_id = ? AND product_id = ? AND status = 'completed'",
      [userId, productId]
    );
    
    if (!purchaseCheck || purchaseCheck.length === 0) {
      return res.status(403).json({ error: "You have not purchased this product" });
    }
    
    // Get product file URL
    const product = await db.query(
      "SELECT file_url, title FROM products WHERE id = ?",
      [productId]
    );
    
    if (!product || product.length === 0 || !product[0].file_url) {
      return res.status(404).json({ error: "Product file not found" });
    }
    
    const fileUrl = product[0].file_url;
    const title = product[0].title;
    
    // If it's a Cloudinary URL, redirect to it
    if (fileUrl.includes('cloudinary.com')) {
      return res.redirect(fileUrl);
    }
    
    // If it's a local file, send it
    const filePath = path.join(__dirname, 'uploads', 'products', 'files', path.basename(fileUrl));
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const ext = path.extname(filePath);
    const safeFilename = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ext;
    
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.sendFile(filePath);
    
  } catch (err) {
    console.error('❌ Download error:', err);
    res.status(500).json({ error: err.message });
  }
});
// ============================================
// ROUTES - COURSES
// ============================================
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT c.*, u.username as author_name,
        COALESCE(c.file_url, c.file_path) as file_path_combined,
        COALESCE(c.thumbnail_url, c.thumbnail_path) as thumbnail_path_combined
      FROM courses c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC
    `);

    const processedCourses = extractRows(courses).map(course => {
      if (course.id && typeof course.id === 'bigint') course.id = Number(course.id);
      if (course.user_id && typeof course.user_id === 'bigint') course.user_id = Number(course.user_id);
      course.thumbnail_url = course.thumbnail_url || course.thumbnail_path;
      course.file_url = course.file_url || course.file_path;
      course.download_url = `/api/download/${course.id}`;
      return course;
    });

    res.json(processedCourses);
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ error: "Error fetching courses", details: err.message });
  }
});

app.get('/api/download/:courseId', checkCourseAccess, async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    if (!courses || courses.length === 0) return res.status(404).json({ error: 'Course not found' });

    const course = courses[0];
    const dbFilePath = course.file_url || course.file_path;
    if (!dbFilePath) return res.status(404).json({ error: 'No file associated with this course' });

    const filename = path.basename(dbFilePath);
    const expectedPath = path.join(uploadDirs.courses, filename);

    if (!fs.existsSync(expectedPath)) {
      return res.status(404).json({ error: 'File not found on server', message: 'Please contact support.' });
    }

    sendFile(res, expectedPath, course.title);
  } catch (error) {
    console.error('❌ Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

function sendFile(res, filePath, title) {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath);
  const safeFilename = title ? title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ext : path.basename(filePath);

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.sendFile(filePath);
}

// My courses endpoint
app.get("/api/my-courses", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login to view your courses" });

  try {
    const courses = await db.query(`
      SELECT c.*, uc.purchased_at 
      FROM courses c 
      INNER JOIN user_courses uc ON c.id = uc.course_id 
      WHERE uc.user_id = ? AND uc.payment_status = 'completed'
      ORDER BY uc.purchased_at DESC
    `, [req.session.user.id]);

    res.json(extractRows(courses));
  } catch (err) {
    res.status(500).json({ error: "Error fetching your courses" });
  }
});

// ============================================
// ROUTES - PAYMENT INITIATION
// ============================================
app.post("/api/initiate-payment", async (req, res) => {
  console.log('💳 Payment initiation request received');
  
  if (!req.session.user) return res.status(401).json({ error: "Please login to make payment" });

  try {
    const { courseId } = req.body;
    if (!courseId) return res.status(400).json({ error: "Course ID is required" });

    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    let course = null;
    if (courses && courses.length > 0) course = courses[0];

    if (!course) return res.status(404).json({ error: "Course not found" });
    if (course.price <= 0) return res.status(400).json({ error: "This course is free. No payment required." });

    if (!process.env.FLW_SECRET_KEY) {
      return res.status(500).json({ error: "Payment system not configured. Please contact support." });
    }
    
    const transaction_ref = "coreinsight_" + Date.now() + "_" + courseId;
    const amount = parseFloat(course.price);
    
    const payload = {
      tx_ref: transaction_ref,
      amount: amount,
      currency: "USD",
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
      res.status(500).json({ error: response.data.message || "Payment initiation failed" });
    }
    
  } catch (err) {
    console.error('❌ Payment error:', err.message);
    res.status(500).json({ error: "Error initiating payment: " + err.message });
  }
});

app.get("/api/verify-payment/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;
    
    console.log('🔍 Verifying payment:', transaction_id);
    
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
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
      res.status(400).json({ status: "failed", message: "Payment not successful" });
    }
  } catch (err) {
    console.error('❌ Verification error:', err.message);
    res.status(500).json({ error: "Error verifying payment: " + err.message });
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
    if (paymentResult && paymentResult.length > 0) payment = paymentResult[0];
    
    if (payment && payment.status === 'completed') {
      const courseResult = await db.query("SELECT title FROM courses WHERE id = ?", [payment.course_id]);
      let courseTitle = 'Your course';
      if (courseResult && courseResult.length > 0) courseTitle = courseResult[0].title;
      
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
        headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
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
      
      const courseResult = await db.query("SELECT title FROM courses WHERE id = ?", [courseId]);
      let courseTitle = 'Your course';
      if (courseResult && courseResult.length > 0) courseTitle = courseResult[0].title;
      
      res.json({
        status: "success",
        message: "Payment verified successfully",
        course_id: courseId,
        course_title: courseTitle,
        amount: amount
      });
    } else {
      res.status(400).json({ status: "failed", message: "Payment not successful or not found" });
    }
    
  } catch (err) {
    console.error('❌ Verify by reference error:', err.message);
    res.status(500).json({ status: "error", message: "Error verifying payment: " + err.message });
  }
});

// ============================================
// COMPLAINT ENDPOINT
// ============================================
app.post("/api/send-complaint", async (req, res) => {
  try {
    const { name, email, subject, priority, message, orderId } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "Please fill in all required fields" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    const supportResult = await sendSupportEmail(name, email, subject, message, orderId);
    if (!supportResult.success) {
      return res.json({ success: true, warning: "Complaint received, but email delivery is pending." });
    }

    res.json({ success: true, message: "Your complaint has been submitted successfully!" });
  } catch (error) {
    console.error('❌ Complaint submission error:', error);
    res.status(500).json({ error: "Failed to submit complaint. Please try again later." });
  }
});

// ============================================
// USER DELETE LIMITS ENDPOINT
// ============================================
app.get("/api/user/delete-limits", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const userId = req.session.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    const deleteResult = await db.query(
      `SELECT COUNT(*) as count FROM deleted_services 
       WHERE deleted_by = ? AND DATE(deleted_at) = ?`,
      [userId, today]
    );

    let deleteCount = 0;
    if (deleteResult && deleteResult.length > 0) {
      deleteCount = deleteResult[0]?.count || 0;
    }

    res.json({
      daily_limit: 3,
      remaining_deletes: Math.max(0, 3 - deleteCount),
      used_today: deleteCount,
      last_delete_date: today
    });
    
  } catch (err) {
    console.error("Error getting delete limits:", err);
    res.status(500).json({ error: "Error getting delete limits: " + err.message });
  }
});

// ============================================
// HTML PAGE ROUTES
// ============================================
const htmlRoutes = [
  "/", "/login", "/signup", "/courses", "/admin-files.html", "/admin-migrate",
  "/payment-callback.html", "/payment-verification.html", "/payment-failed.html",
  "/forgot-password.html", "/reset-password.html", "/services-payment-callback",
  "/physical-payment-callback.html"
];

htmlRoutes.forEach(route => {
  const filename = route === "/" ? "index.html" : route;
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, "public", filename));
  });
});

app.get("/api/terms", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "terms.html"));
});

// ============================================
// SERVER START
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Upload directories: ${Object.keys(uploadDirs).join(', ')}`);
  console.log(`✅ Reviews endpoints: /api/reviews and /api/reviews/:productId`);
});
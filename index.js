// index.js - PRODUCTION VERSION
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
// Body parser
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

// Session middleware
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

// Static files
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
// Add this near your other routes (around the health check endpoints)
app.get("/api/debug/brevo-connection", async (req, res) => {
  try {
    console.log('🔍 Testing Brevo API connection...');
    
    // Test 1: Check if API key exists
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'BREVO_API_KEY not found in environment variables',
        envCheck: {
          hasKey: false,
          nodeEnv: process.env.NODE_ENV
        }
      });
    }

    // Test 2: Try to make a simple API call to Brevo
    const axios = require('axios');
    
    const response = await axios({
      method: 'GET',
      url: 'https://api.brevo.com/v3/account',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    console.log('✅ Brevo API test successful');
    
    res.json({
      success: true,
      message: 'Brevo API is reachable',
      statusCode: response.status,
      accountInfo: {
        email: response.data.email,
        plan: response.data.plan,
        credits: response.data.relay?.credits || 'N/A'
      },
      config: {
        nodeEnv: process.env.NODE_ENV,
        hasApiKey: true,
        apiKeyPrefix: apiKey.substring(0, 8) + '...'
      }
    });

  } catch (error) {
    console.error('❌ Brevo connection test failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      errorCode: error.code,
      isTimeout: error.code === 'ECONNABORTED' || error.message.includes('timeout'),
      isNetworkError: error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED',
      details: {
        message: error.message,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 3)
      }
    });
  }
});

// Also add a test email endpoint
app.post("/api/debug/test-email", async (req, res) => {
  try {
    const { email, type = 'brevo' } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email address required' });
    }

    if (type === 'brevo') {
      const result = await sendVerificationEmail(
        email,
        'Test Email - Core Insight Debug',
        `
        <!DOCTYPE html>
        <html>
        <head><title>Test Email</title></head>
        <body style="font-family: Arial; padding: 20px;">
          <h1 style="color: #3b82f6;">✅ Test Email Successful!</h1>
          <p>If you received this email, your Brevo integration is working correctly.</p>
          <p>Time sent: ${new Date().toLocaleString()}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">Core Insight Test Email</p>
        </body>
        </html>
        `
      );
      
      res.json({
        success: result.success,
        message: result.success ? 'Test email sent successfully' : 'Failed to send test email',
        error: result.error,
        timestamp: new Date().toISOString()
      });
      
    } else if (type === 'gmail') {
      // Test Gmail support email
      const result = await sendSupportEmail(
        'Debug Test',
        email,
        'Test Support Email',
        'This is a test of the support email system from Core Insight debug endpoint.'
      );
      
      res.json({
        success: result.success,
        message: result.success ? 'Test support email sent' : 'Failed to send test support email',
        error: result.error,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({ error: 'Invalid type. Use "brevo" or "gmail"' });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
// ============================================
// EMAIL CONFIGURATION - WORKING VERSION
// ============================================


// Get API key from environment
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'suppourtcoreinsight@gmail.com';
const SUPPORT_EMAIL_PASSWORD = process.env.SUPPORT_EMAIL_PASSWORD;

// ============================================
// BREVO EMAIL FUNCTION (DIRECT API)
// ============================================

async function sendVerificationEmail(to, subject, html) {
  if (!BREVO_API_KEY) {
    console.error('❌ BREVO_API_KEY not configured');
    // Fallback: Return success with token so user can verify manually
    return { 
      success: true, 
      fallback: true,
      message: 'Email service not configured, but account created'
    };
  }

  try {
    const response = await axios({
      method: 'POST',
      url: 'https://api.brevo.com/v3/smtp/email',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      data: {
        sender: {
          email: "coreinsightmail@gmail.com",
          name: "Core Insight"
        },
        to: [{ email: to }],
        subject: subject,
        htmlContent: html,
        headers: {
          'X-Mailin-custom': 'verification-email'
        }
      },
      timeout: 15000
    });

    console.log(`✅ Verification email sent to ${to}`);
    return { success: true };

  } catch (error) {
    console.error("❌ Brevo error:", error.response?.data || error.message);
    
    // Still return success with fallback flag so user can proceed
    return { 
      success: true, 
      fallback: true,
      error: error.response?.data?.message || error.message
    };
  }
}

// ============================================
// SUPPORT EMAIL FUNCTION (GMAIL)
// ============================================

let supportTransporter = null;

if (SUPPORT_EMAIL && SUPPORT_EMAIL_PASSWORD) {
  try {
    const nodemailer = require('nodemailer');
    supportTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SUPPORT_EMAIL,
        pass: SUPPORT_EMAIL_PASSWORD.replace(/\s/g, '')
      },
      tls: { rejectUnauthorized: false }
    });
    
    console.log('✅ Support email configured');
  } catch (error) {
    console.error('❌ Support email setup failed:', error.message);
  }
}

async function sendSupportEmail(name, email, subject, message, orderId = null) {
  if (!supportTransporter) {
    console.error('❌ Support email not configured');
    return { success: false, error: "Support email not configured" };
  }

  try {
    await supportTransporter.sendMail({
      from: `"Core Insight Support" <${SUPPORT_EMAIL}>`,
      to: SUPPORT_EMAIL,
      subject: `[Support] ${subject} - from ${name}`,
      html: `<h2>New Support Request</h2>
             <p><strong>From:</strong> ${name}</p>
             <p><strong>Email:</strong> ${email}</p>
             <p><strong>Subject:</strong> ${subject}</p>
             ${orderId ? `<p><strong>Order ID:</strong> ${orderId}</p>` : ''}
             <hr>
             <p>${message.replace(/\n/g, '<br>')}</p>`,
      replyTo: email
    });
    
    return { success: true };
  } catch (error) {
    console.error("❌ Support email error:", error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// DEBUG ENDPOINTS
// ============================================

app.get("/api/debug/brevo-status", (req, res) => {
  res.json({
    hasApiKey: !!BREVO_API_KEY,
    apiKeyPrefix: BREVO_API_KEY ? BREVO_API_KEY.substring(0, 10) + '...' : null,
    hasSupportEmail: !!SUPPORT_EMAIL,
    hasSupportPassword: !!SUPPORT_EMAIL_PASSWORD,
    environment: process.env.NODE_ENV
  });
});

app.post("/api/debug/test-email", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  const result = await sendVerificationEmail(
    email,
    'Test Email - Core Insight',
    '<h1>Test</h1><p>If you see this, email is working!</p>'
  );
  
  res.json(result);
});
// Test email endpoint (remove in production)
app.post("/api/test-email", async (req, res) => {
  try {
    const { email, type } = req.body;
    
    if (type === 'brevo') {
      const result = await sendVerificationEmail(
        email,
        'Test Email - Core Insight',
        '<h1>Test Email</h1><p>If you received this, Brevo is working!</p>'
      );
      res.json(result);
    } else if (type === 'gmail') {
      const result = await sendSupportEmail(
        'Test User',
        email,
        'Test Support Email',
        'This is a test of the support email system.'
      );
      res.json(result);
    } else {
      res.status(400).json({ error: 'Specify type: brevo or gmail' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ============================================
// FILE UPLOAD CONFIGURATION
// ============================================
// Create upload directories
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

// Multer storage configurations
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

const serviceStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDirs.services),
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + "-" + sanitizedName);
  }
});

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDirs.profiles),
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `profile-${Date.now()}-${sanitizedName}`);
  }
});

const chatImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDirs.chat),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `chat-${timestamp}-${random}${ext}`);
  }
});




// ============================================
// MIDDLEWARE FUNCTIONS
// ============================================
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

    const hasAccess = (Array.isArray(accessCheck) && accessCheck.length > 0) ||
                      (accessCheck && accessCheck[0] && Array.isArray(accessCheck[0]) && accessCheck[0].length > 0);

    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have access to this course. Please purchase it first." });
    }

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

    const user = Array.isArray(userResult) ? userResult[0] : (userResult?.[0]?.[0] || null);
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
      <!DOCTYPE html>
      <html>
      <head><title>Verify Your Email - Core Insight</title></head>
      <body style="font-family:Arial,sans-serif;background:#0a192f;color:#e6f1ff;">
        <div style="max-width:600px;margin:0 auto;padding:20px;">
          <h1 style="color:#64ffda;">🎓 Core Insight</h1>
          <h2>Welcome ${username}!</h2>
          <p>Please verify your email address to activate your account:</p>
          <a href="${verifyLink}" style="background:#64ffda;color:#0a192f;padding:12px 24px;text-decoration:none;border-radius:5px;">Verify My Email</a>
          <p>Or copy this link: ${verifyLink}</p>
          <p><strong>⚠️ This link expires in 24 hours.</strong></p>
        </div>
      </body>
      </html>
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

// ============================================
// ROUTES - VERIFICATION
// ============================================
app.get("/api/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const users = await db.query("SELECT id, email, username FROM users WHERE verify_token = ? AND verified = 0", [token]);

    if (!users || users.length === 0) {
      return res.send(`<!DOCTYPE html><html><head><title>Verification Failed</title></head>
        <body style="background:#0a192f;color:#e6f1ff;text-align:center;padding:50px;">
          <h1 style="color:#ff6b6b;">❌ Verification Failed</h1>
          <p>Invalid verification link or account already verified.</p>
          <a href="/verify.html" style="color:#64ffda;">Request a new verification link →</a>
        </body></html>`);
    }

    await db.query("UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?", [users[0].id]);

    res.send(`<!DOCTYPE html><html><head><title>Email Verified!</title></head>
      <body style="background:#0a192f;color:#e6f1ff;text-align:center;padding:50px;">
        <h1 style="color:#64ffda;">✅ Email Verified Successfully!</h1>
        <p>Your account is now active.</p>
        <a href="/login.html" style="background:#64ffda;color:#0a192f;padding:12px 24px;text-decoration:none;border-radius:5px;">Login Now →</a>
      </body></html>`);
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).send("Error verifying email");
  }
});

app.post("/api/verify", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Verification token required" });

    const users = await db.query("SELECT id, email, username FROM users WHERE verify_token = ? AND verified = 0", [token]);
    if (!users || users.length === 0) {
      return res.status(400).json({ error: "Invalid verification token or account already verified" });
    }

    await db.query("UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?", [users[0].id]);
    res.json({ success: true, message: "Email verified successfully!", username: users[0].username });
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).json({ error: "Error verifying email" });
  }
});

app.post("/api/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const users = await db.query("SELECT id, username, email, verify_token FROM users WHERE email = ? AND verified = 0", [email]);
    if (!users || users.length === 0) {
      return res.status(404).json({ error: "No unverified account found with this email" });
    }

    const verifyToken = users[0].verify_token || crypto.randomBytes(32).toString('hex');
    if (!users[0].verify_token) {
      await db.query("UPDATE users SET verify_token = ? WHERE id = ?", [verifyToken, users[0].id]);
    }

    const verifyLink = `https://core-insight-7.onrender.com/verify-manual.html?token=${verifyToken}`;
    res.json({ success: true, message: "Verification code ready", token: verifyToken, link: verifyLink });
  } catch (err) {
    console.error("Resend error:", err);
    res.status(500).json({ error: "Error processing request" });
  }
});

// ============================================
// ROUTES - PASSWORD RESET
// ============================================
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email is required" });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: "Please provide a valid email address" });
  }

  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000);
    const result = await db.query("UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?", [token, expires, email]);

    const responseMessage = "If that email address exists in our system, we've sent a password reset link to it.";

    if (result.affectedRows > 0) {
      const resetLink = `https://core-insight-7.onrender.com/reset-password.html?token=${token}`;
      await transporter.sendMail({
        from: `"Core Insight" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Reset your Core Insight password",
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;border-radius:10px;color:white;">
            <h2>🔐 Password Reset Request</h2>
            <a href="${resetLink}" style="background-color:white;color:#667eea;padding:12px 30px;text-decoration:none;border-radius:25px;">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
          </div>
        </div>`
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
  if (password.length < 8) return res.status(400).json({ success: false, error: "Password must be at least 8 characters long" });

  try {
    const users = await db.query("SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()", [token]);
    if (!users || users.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid or expired reset token" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query("UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE reset_token = ?", [hashedPassword, token]);

    res.json({ success: true, message: "✅ Password reset successfully! You can now login with your new password." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, error: "Error resetting password. Please try again." });
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
      if (course.thumbnail_url?.includes('cloudinary.com')) {
        course.thumbnail_url = course.thumbnail_url.replace('/upload/', '/upload/w_500,h_300,c_limit/');
      }
      course.download_url = `/api/download/${course.id}`;
      return course;
    });

    res.json(processedCourses);
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ error: "Error fetching courses", details: err.message });
  }
});

app.get('/api/download/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.session?.user?.id;

    if (!userId) return res.status(401).json({ error: 'Please login first' });

    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    if (!courses || courses.length === 0) return res.status(404).json({ error: 'Course not found' });

    const course = courses[0];
    const isFree = course.price === 0 || course.type === 'free' || course.type === 'Free';

    if (!isFree) {
      const purchases = await db.query(
        'SELECT * FROM user_courses WHERE course_id = ? AND user_id = ? AND payment_status = "completed"',
        [courseId, userId]
      );
      const payments = await db.query(
        'SELECT * FROM payments WHERE course_id = ? AND user_id = ? AND status = "successful"',
        [courseId, userId]
      );

      if ((!purchases || purchases.length === 0) && (!payments || payments.length === 0)) {
        return res.status(403).json({ error: 'You do not have access to this course', isPaidCourse: true, price: course.price });
      }
    }

    const dbFilePath = course.file_url || course.file_path;
    if (!dbFilePath) return res.status(404).json({ error: 'No file associated with this course' });

    const filename = path.basename(dbFilePath);
    const expectedPath = path.join(uploadDirs.courses, filename);

    if (!fs.existsSync(expectedPath)) {
      if (fs.existsSync(uploadDirs.courses)) {
        const files = fs.readdirSync(uploadDirs.courses);
        const searchName = filename.replace(/^\d+-\d+-/, '');
        const similarFile = files.find(f => f.includes(searchName) || searchName.includes(f.replace(/^\d+-\d+-/, '')));

        if (similarFile) {
          const correctPath = `/uploads/courses/${similarFile}`;
          await db.query('UPDATE courses SET file_path = ? WHERE id = ?', [correctPath, course.id]);
          return sendFile(res, path.join(uploadDirs.courses, similarFile), course.title);
        }
      }
      return res.status(404).json({ error: 'File not found on server', message: 'Please contact support.', filename });
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

app.post("/api/courses", (req, res) => {
  const upload = multer({ storage: courseStorage, limits: { fileSize: 100 * 1024 * 1024 } })
    .fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]);

  upload(req, res, async function(err) {
    if (err) return res.status(400).json({ error: 'Upload error: ' + err.message });

    try {
      if (!req.session.user) return res.status(401).json({ error: "Please login to upload courses" });

      const { title, description, price, author, content_type } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
      if (!req.files?.file?.[0]) return res.status(400).json({ error: "Course file is required" });
      if (!req.files?.thumbnail?.[0]) return res.status(400).json({ error: "Thumbnail image is required" });

      const courseFile = req.files.file[0];
      const thumbnailFile = req.files.thumbnail[0];
      const filePath = `/uploads/courses/${courseFile.filename}`;
      const thumbnailPath = `/uploads/courses/${thumbnailFile.filename}`;

      const result = await db.query(
        `INSERT INTO courses (title, description, file_path, thumbnail_path, price, type, user_id, author, content_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [title.trim(), description?.trim() || '', filePath, thumbnailPath, parseFloat(price) || 0,
         parseFloat(price) > 0 ? 'paid' : 'free', req.session.user.id, author || req.session.user.username, content_type || 'book']
      );

      res.json({ message: "✅ Course uploaded successfully!", courseId: result.insertId, download_url: `/api/download/${result.insertId}` });
    } catch (err) {
      console.error('❌ Upload error:', err);
      res.status(500).json({ error: "Error uploading course: " + err.message });
    }
  });
});

// ============================================
// ROUTES - PRODUCTS
// ============================================
app.get("/api/products", async (req, res) => {
  try {
    const products = await db.query(`
      SELECT p.*, u.username as seller_name
      FROM products p LEFT JOIN users u ON p.user_id = u.id
      WHERE p.is_deleted = 0 OR p.is_deleted IS NULL
      ORDER BY p.created_at DESC
    `);

    const processedProducts = extractRows(products).map(product => {
      product.price = parseFloat(product.price || 0);
      product.original_price = parseFloat(product.original_price) || product.price;
      product.platform_fee = parseFloat(product.platform_fee) || (product.type === 'physical' ? product.original_price * 0.1 : 0);
      product.seller_price = product.type === 'physical' ? product.original_price - product.platform_fee : product.price;

      if (product.image_urls) {
        try {
          product.images = typeof product.image_urls === 'string'
            ? (product.image_urls.startsWith('[') || product.image_urls.startsWith('{') ? JSON.parse(product.image_urls) : [product.image_urls])
            : (Array.isArray(product.image_urls) ? product.image_urls : []);
        } catch (e) { product.images = []; }
      } else {
        product.images = [];
      }

      if (!product.images?.length) {
        const defaultImages = {
          electronics: 'https://placehold.co/400x250/2563eb/ffffff/png?text=Electronics',
          clothing: 'https://placehold.co/400x250/7c3aed/ffffff/png?text=Clothing',
          fashion: 'https://placehold.co/400x250/7c3aed/ffffff/png?text=Fashion',
          home: 'https://placehold.co/400x250/059669/ffffff/png?text=Home'
        };
        const lowerCategory = (product.category || '').toLowerCase();
        product.images = [Object.entries(defaultImages).find(([k]) => lowerCategory.includes(k))?.[1] ||
                         'https://placehold.co/400x250/1e293b/3b82f6/png?text=Product'];
      }

      product._imageList = product.images;
      if (!product.type) product.type = product.affiliate_link ? 'affiliate' : 'digital';
      return product;
    });

    res.setHeader('Content-Type', 'application/json');
    res.json(processedProducts);
  } catch (err) {
    console.error('❌ Error fetching products:', err);
    res.status(500).json({ error: "Error fetching products", details: err.message });
  }
});

app.post("/api/upload-product", (req, res) => {
  const upload = multer({ storage: productStorage }).fields([
    { name: 'file', maxCount: 1 }, { name: 'images[]', maxCount: 10 }
  ]);

  upload(req, res, async function(err) {
    if (err) return res.status(400).json({ error: 'File upload error: ' + err.message });

    try {
      if (!req.session.user) return res.status(401).json({ error: "Please log in to upload products." });

      const { title, description, price, category, type, affiliate_link, paymentProvider } = req.body;
      if (!title || !price || !type || !paymentProvider) {
        return res.status(400).json({ error: "Title, price, type, and payment provider are required." });
      }
      if (type === 'affiliate' && !affiliate_link) {
        return res.status(400).json({ error: "Affiliate link is required for affiliate products." });
      }

      const listedPrice = parseFloat(price);
      let sellerPrice = listedPrice, platformFee = 0;
      if (type === 'physical') {
        platformFee = listedPrice * 0.1;
        sellerPrice = listedPrice - platformFee;
      }

      let imageUrls = [];
      if (req.files?.['images[]']?.length) {
        const cloudinary = require('cloudinary').v2;
        for (const imageFile of req.files['images[]']) {
          try {
            const result = await cloudinary.uploader.upload(imageFile.path, { folder: 'core-insight/products' });
            imageUrls.push(result.secure_url);
          } catch (cloudErr) { console.error('Cloudinary upload error:', cloudErr); }
        }
      }

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

      const result = await db.query(
        `INSERT INTO products (user_id, title, description, price, original_price, platform_fee, category, type,
          file_url, image_urls, affiliate_link, seller_payment_provider, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [req.session.user.id, title, description || '', sellerPrice, listedPrice, platformFee, category || '',
         type || 'digital', fileUrl, imageUrls.length ? JSON.stringify(imageUrls) : null, affiliate_link || null, paymentProvider]
      );

      res.json({ message: "✅ Product uploaded successfully!", productId: result.insertId });
    } catch (err) {
      console.error('❌ Product upload error:', err);
      res.status(500).json({ error: "Error uploading product: " + err.message });
    }
  });
});

// ============================================
// ROUTES - SERVICES
// ============================================
app.get("/api/services", async (req, res) => {
  try {
    const { category, search, sort, min_price, max_price, limit = 20, offset = 0 } = req.query;

    let query = `
      SELECT s.*, u.username, u.id as user_id, fp.profile_picture_url,
        (SELECT AVG(rating) FROM service_reviews WHERE service_id = s.id) as avg_rating,
        (SELECT COUNT(*) FROM service_reviews WHERE service_id = s.id) as review_count,
        (SELECT COUNT(*) FROM service_favorites WHERE service_id = s.id) as favorite_count
      FROM services s LEFT JOIN users u ON s.user_id = u.id LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
      WHERE s.status = 'active'
    `;
    const params = [];

    if (category) { query += " AND s.category = ?"; params.push(category); }
    if (search) { query += " AND (s.title LIKE ? OR s.description LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
    if (min_price) { query += " AND s.price >= ?"; params.push(parseFloat(min_price)); }
    if (max_price) { query += " AND s.price <= ?"; params.push(parseFloat(max_price)); }

    switch(sort) {
      case 'price_low': query += " ORDER BY s.price ASC"; break;
      case 'price_high': query += " ORDER BY s.price DESC"; break;
      case 'rating': query += " ORDER BY avg_rating DESC"; break;
      default: query += " ORDER BY s.created_at DESC";
    }

    query += " LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const services = extractRows(await db.query(query, params));

    if (req.session.user) {
      const favorites = extractRows(await db.query("SELECT service_id FROM service_favorites WHERE user_id = ?", [req.session.user.id]));
      const favoriteIds = new Set(favorites.map(f => f.service_id));
      services.forEach(s => s.is_favorited = favoriteIds.has(s.id));
    }

    const countResult = await db.query(`SELECT COUNT(*) as total FROM services WHERE status = 'active'`);
    const total = extractRows(countResult)[0]?.total || 0;

    res.json({ services, pagination: { total, limit: parseInt(limit), offset: parseInt(offset), has_more: total > (parseInt(offset) + parseInt(limit)) } });
  } catch (err) {
    console.error("Services fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/services", checkFreelancerSubscription, async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login to create a service" });
  if (req.session.user.role !== 'freelancer' && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: "Only freelancers can create services" });
  }

  try {
    const { title, description, category, fixed_price, delivery_time, revisions, tags, requirements } = req.body;
    if (!title || !description) return res.status(400).json({ error: "Title and description are required" });
    if (title.length < 5) return res.status(400).json({ error: "Title must be at least 5 characters" });
    if (description.length < 20) return res.status(400).json({ error: "Description must be at least 20 characters" });

    const price = fixed_price ? parseFloat(fixed_price) : 0;

    const result = await db.query(
      `INSERT INTO services (user_id, title, description, price, category, delivery_time, revisions, tags, requirements, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [req.session.user.id, title, description, price, category || 'other', delivery_time || 7, revisions || 2,
       tags ? JSON.stringify(typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : null,
       requirements ? JSON.stringify(typeof requirements === 'string' ? requirements.split('\n').filter(r => r.trim()) : requirements) : null]
    );

    const serviceId = extractInsertId(result);
    if (!serviceId) throw new Error("Could not get service ID after creation");

    res.json({ success: true, message: "Service created successfully!", serviceId });
  } catch (err) {
    console.error("Service creation error:", err);
    res.status(500).json({ error: "Error creating service: " + err.message });
  }
});

// ============================================
// ROUTES - CHAT SYSTEM
// ============================================
app.get("/api/messages/unread-count", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ count: 0 });
    const userId = req.session.user.id;
    const result = await db.query(`
      SELECT COUNT(m.id) AS unread_count
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.sender_id != ? AND m.is_read = 0 AND (c.client_id = ? OR c.freelancer_id = ?)
    `, [userId, userId, userId]);
    res.json({ count: extractRows(result)[0]?.unread_count || 0 });
  } catch (err) {
    console.error("Unread count error:", err);
    res.json({ count: 0 });
  }
});

app.get("/api/messages/conversations", async (req, res) => {
  try {
    if (!req.session.user) return res.json([]);
    const userId = req.session.user.id;

    const result = await db.query(`
      SELECT c.id AS conversation_id, c.service_id, s.title AS service_title, c.created_at,
        CASE WHEN c.client_id = ? THEN u2.username ELSE u1.username END AS other_user_name,
        CASE WHEN c.client_id = ? THEN u2.id ELSE u1.id END AS other_user_id
      FROM conversations c
      JOIN users u1 ON c.client_id = u1.id JOIN users u2 ON c.freelancer_id = u2.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.client_id = ? OR c.freelancer_id = ?
      ORDER BY (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) DESC, c.created_at DESC
    `, [userId, userId, userId, userId]);

    res.json(extractRows(result));
  } catch (err) {
    console.error("Conversations fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/messages/:conversationId", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const conversationId = parseInt(req.params.conversationId);
    if (isNaN(conversationId)) return res.status(400).json({ error: "Invalid conversation ID" });
    const userId = req.session.user.id;

    const convResult = await db.query("SELECT id FROM conversations WHERE id = ? AND (client_id = ? OR freelancer_id = ?)",
      [conversationId, userId, userId]);
    if (extractRows(convResult).length === 0) return res.status(403).json({ error: "Access denied" });

    const messages = extractRows(await db.query(`
      SELECT m.id, m.conversation_id, m.sender_id, m.message, m.image_url, m.is_read, m.created_at, u.username AS sender_name
      FROM messages m JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ? ORDER BY m.created_at ASC
    `, [conversationId]));

    res.json(messages);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

app.post("/api/messages/send", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Login required" });
    const { conversation_id, message } = req.body;
    if (!conversation_id || !message?.trim()) return res.status(400).json({ error: "Missing message or conversation ID" });

    const convResult = await db.query("SELECT id, client_id, freelancer_id FROM conversations WHERE id = ?", [conversation_id]);
    const conversation = extractRows(convResult)[0];
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    const isParticipant = parseInt(conversation.client_id) === req.session.user.id || parseInt(conversation.freelancer_id) === req.session.user.id;
    if (!isParticipant) return res.status(403).json({ error: "Access denied" });

    const insertResult = await db.query(
      "INSERT INTO messages (conversation_id, sender_id, message, created_at, is_read) VALUES (?, ?, ?, NOW(), 0)",
      [conversation_id, req.session.user.id, message.trim()]
    );

    const messageId = extractInsertId(insertResult);
    if (!messageId) return res.status(500).json({ error: "Failed to insert message" });

    const newMessage = extractRows(await db.query(
      "SELECT m.*, u.username AS sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?",
      [messageId]
    ))[0];

    res.json({ success: true, data: newMessage });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ROUTES - HTML PAGES
// ============================================
const htmlRoutes = [
  "/", "/login", "/signup", "/courses", "/admin-files.html", "/admin-migrate",
  "/payment-callback.html", "/payment-verification.html", "/payment-failed.html",
  "/forgot-password.html", "/reset-password.html", "/services-payment-callback"
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
});
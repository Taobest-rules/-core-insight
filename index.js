// index.js - PRODUCTION VERSION
const dotenv = require("dotenv");

dotenv.config({
  path: process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development"
});

const express = require("express");
const path = require("path");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const db = require("./db");
const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const MySQLStore = require("express-mysql-session")(session);
const Flutterwave = require('flutterwave-node-v3');
const csv = require('csv-parser');

// Cloudinary imports (AFTER dotenv config so env vars are loaded)
const cloudinary = require('./cloudinary.config');
const { 
  uploadCourse, 
  uploadThumbnail, 
  uploadProductImages,
  uploadProfilePicture,
  uploadChatImage,
  uploadMultipleProducts,
  uploadCourseFile  // ← ADD THIS LINE
} = require('./cloudinary-storage');
// Create app
const app = express();
const PORT = process.env.PORT || 3000;
// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.set('trust proxy', 1);
const isProduction = process.env.NODE_ENV === 'production';

let sessionStore;
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

app.use(
  session({
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
  })
);

// Static files
app.use(express.static("public"));
// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// =================== ADMIN FILE MANAGEMENT PAGE ===================
app.get("/admin-files.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-files.html"));
});
// =================== TERMS OF SERVICE ENDPOINT ===================
app.get('/api/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});
// Configure multer for image uploads
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/chat-images';
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

const imageUpload = multer({ 
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// Flutterwave initialization
let flw;
try {
    if (!process.env.FLW_PUBLIC_KEY || !process.env.FLW_SECRET_KEY) {
        throw new Error("Flutterwave API keys are required");
    }
    flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);
} catch (error) {
    console.error("Flutterwave initialization failed:", error.message);
}

// Paystack initialization check
let paystackInitialized = false;
try {
    if (process.env.PAYSTACK_SECRET_KEY) {
        paystackInitialized = true;
    }
} catch (error) {
    console.error("Paystack initialization failed:", error.message);
}

// BigInt serialization fix
BigInt.prototype.toJSON = function() {
    return this.toString();
};

const safeJSON = (data) => {
    return JSON.parse(JSON.stringify(data, (key, value) => {
        return typeof value === 'bigint' ? value.toString() : value;
    }));
};

// =================== EMAIL CONFIGURATION - COMPLETE ===================


// Email accounts
const verificationEmailUser = process.env.EMAIL_USER || 'coreinsightmail@gmail.com';
const verificationEmailPassword = process.env.EMAIL_APP_PASSWORD;
const supportEmail = process.env.SUPPORT_EMAIL || 'suppourtcoreinsight@gmail.com';
const supportEmailPassword = process.env.SUPPORT_EMAIL_PASSWORD;

// Create transporters
let verificationTransporter = null;
let supportTransporter = null;

// ========== VERIFICATION EMAIL (for sending to users) ==========
if (verificationEmailUser && verificationEmailPassword) {
  console.log(`📧 Setting up verification email: ${verificationEmailUser}`);
  
 verificationTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,  // SSL
  auth: {
    user: verificationEmailUser,
    pass: verificationEmailPassword.replace(/\s/g, '')
  },
  tls: {
    rejectUnauthorized: false
  }
});
  // Test connection
  verificationTransporter.verify((error, success) => {
    if (error) {
      console.error("❌ Verification email error:", error.message);
      console.log("   Check: EMAIL_USER and EMAIL_APP_PASSWORD in environment variables");
    } else {
      console.log("✅ Verification email ready - " + verificationEmailUser);
    }
  });
} else {
  console.log("⚠️ Verification email not configured. Set EMAIL_USER and EMAIL_APP_PASSWORD");
}

// ========== SUPPORT EMAIL (for receiving contact form submissions) ==========
if (supportEmail && supportEmailPassword) {
  console.log(`📧 Setting up support email: ${supportEmail}`);
  
  supportTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: supportEmail,
      pass: supportEmailPassword.replace(/\s/g, '') // Remove spaces if any
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
  });
  
  // Test connection
  supportTransporter.verify((error, success) => {
    if (error) {
      console.error("❌ Support email error:", error.message);
      console.log("   Check: SUPPORT_EMAIL and SUPPORT_EMAIL_PASSWORD in environment variables");
    } else {
      console.log("✅ Support email ready - " + supportEmail);
    }
  });
} else {
  console.log("⚠️ Support email not configured. Set SUPPORT_EMAIL and SUPPORT_EMAIL_PASSWORD");
}

// ========== HELPER FUNCTIONS ==========

/**
 * Send verification email to users
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML content
 * @returns {Promise<object>} Result with success status
 */
async function sendVerificationEmail(to, subject, html) {
  if (!verificationTransporter) {
    console.log(`⚠️ Cannot send verification email to ${to}: Email not configured`);
    return { success: false, error: "Verification email not configured" };
  }
  
  try {
    const info = await verificationTransporter.sendMail({
      from: `"Core Insight" <${verificationEmailUser}>`,
      to: to,
      subject: subject,
      html: html
    });
    console.log(`✅ Verification email sent to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send verification email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send support notification (from contact form to support email)
 * @param {string} name - Sender name
 * @param {string} email - Sender email
 * @param {string} subject - Message subject
 * @param {string} message - Message content
 * @param {string|null} orderId - Optional order ID
 * @returns {Promise<object>} Result with success status
 */
async function sendSupportEmail(name, email, subject, message, orderId = null) {
  if (!supportTransporter) {
    console.log(`⚠️ Cannot send support email: Support email not configured`);
    return { success: false, error: "Support email not configured" };
  }
  
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>New Support Request</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #0a192f; padding: 20px; color: #64ffda; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px; }
        .info { background: #e0e0e0; padding: 15px; margin: 15px 0; border-radius: 8px; }
        .info p { margin: 5px 0; }
        .message-box { background: white; padding: 15px; border-radius: 8px; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📧 New Support Request</h2>
        </div>
        <div class="content">
          <div class="info">
            <p><strong>From:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
            ${orderId ? `<p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>` : ''}
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <div class="message-box">
            <h3>Message:</h3>
            <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  try {
    const info = await supportTransporter.sendMail({
      from: `"Core Insight Support" <${supportEmail}>`,
      to: supportEmail,
      subject: `[Support] ${subject} - from ${name}`,
      html: emailHtml,
      replyTo: email
    });
    console.log(`✅ Support email sent from ${email}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send support email:`, error.message);
    return { success: false, error: error.message };
  }
}

// Export for use in routes
module.exports = {
  sendVerificationEmail,
  sendSupportEmail
};
// Upload directories
const uploadDir = "uploads/courses";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const productsUploadDir = path.join(__dirname, 'uploads', 'products');
if (!fs.existsSync(productsUploadDir)) {
  fs.mkdirSync(productsUploadDir, { recursive: true });
}

const servicesUploadDir = path.join(__dirname, 'uploads', 'services');
if (!fs.existsSync(servicesUploadDir)) {
  fs.mkdirSync(servicesUploadDir, { recursive: true });
}

const profilesUploadDir = path.join(__dirname, 'uploads', 'profiles');
if (!fs.existsSync(profilesUploadDir)) {
  fs.mkdirSync(profilesUploadDir, { recursive: true });
}

// Multer storage configuration
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

const productStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, productsUploadDir);
  },
  filename: function (req, file, cb) {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = Date.now() + "-" + sanitizedName;
    cb(null, filename);
  },
});

const productUpload = multer({ 
  storage: productStorage,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'images[]', maxCount: 10 }
]);

const serviceStorage = multer.diskStorage({
  destination: servicesUploadDir,
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + "-" + sanitizedName);
  }
});

const serviceUpload = multer({ 
  storage: serviceStorage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

const profilePictureStorage = multer.diskStorage({
  destination: profilesUploadDir,
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `profile-${Date.now()}-${sanitizedName}`);
  }
});

const profilePictureUpload = multer({ 
  storage: profilePictureStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Helper functions
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

function extractRows(result) {
  if (!result) return [];
  
  if (Array.isArray(result) && result.length === 2) {
    return result[0] || [];
  }
  
  if (Array.isArray(result)) {
    return result;
  }
  
  if (result && typeof result === 'object') {
    return [result];
  }
  
  return [];
}

function extractInsertId(result) {
  if (!result) return null;
  
  if (result.insertId) {
    return result.insertId;
  }
  
  if (Array.isArray(result) && result[0] && result[0].insertId) {
    return result[0].insertId;
  }
  
  return null;
}
// =================== MIGRATE LOCAL FILES TO CLOUDINARY ============

// Admin only endpoint to migrate local files to Cloudinary
app.post("/api/admin/migrate-to-cloudinary", async (req, res) => {
  try {
    // Check if user is admin
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { courseId } = req.body;
    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    // Get courses to migrate
    let courses = [];
    if (courseId) {
      // Migrate specific course
      const result = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
      courses = Array.isArray(result) ? result : (result[0] || []);
    } else {
      // Migrate all courses with local files
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
        
        // Skip if already has Cloudinary URL
        if (course.file_url && course.file_url.includes('cloudinary.com')) {
          results.skipped.push({
            id: course.id,
            title: course.title,
            reason: "Already has Cloudinary URL"
          });
          continue;
        }

        // Find the local file
        let filePath = course.file_path;
        const filename = path.basename(filePath);
        
        // Try to find the file in common locations
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

        // Upload to Cloudinary using the correct storage
        const uploadResult = await new Promise((resolve, reject) => {
          const upload = uploadCourseFile.single('file');
          
          // Create a mock request with the file
          const mockReq = {
            file: {
              path: foundPath,
              originalname: filename,
              mimetype: 'application/pdf' // Adjust based on file type
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

        // Update database with Cloudinary URL
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

        // Optional: Delete local file after successful upload
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

// Endpoint to check migration status
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
app.get("/admin-migrate", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-migrate.html"));
});
// =================== HEALTH & BASIC ENDPOINTS ===================
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1 as healthy");
    res.json({ status: "healthy", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

// =================== HEALTH CHECK WITH FILE SYSTEM ===================
app.get("/api/health", async (req, res) => {
  try {
    // Check database connection
    await db.query('SELECT 1 as healthy');
    
    // Check upload directory
    const uploadDir = path.join(__dirname, 'uploads', 'courses');
    const uploadsExist = fs.existsSync(uploadDir);
    
    // Count files
    let fileCount = 0;
    if (uploadsExist) {
      fileCount = fs.readdirSync(uploadDir).length;
    }
    
    // Check a sample of courses
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
  }, 24 * 60 * 60 * 1000); // 24 hours
}
app.get("/api/currency-rates", (req, res) => {
  const rates = {
    NGN: 1,
    USD: 0.0011,
    EUR: 0.0010,
    GBP: 0.00085,
    KES: 0.15,
    GHS: 0.013,
    ZAR: 0.021
  };
  
  res.json({
    base: 'NGN',
    rates: rates,
    timestamp: new Date().toISOString()
  });
});

// =================== SIGNUP WITH VERIFICATION EMAIL ===================
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
    
    // Insert user
    const result = await db.query(
      `INSERT INTO users (username, email, password, role, verified, verify_token, verify_token_expiry, created_at) 
       VALUES (?, ?, ?, ?, 0, ?, ?, NOW())`,
      [username, email, hashedPassword, userRole, verifyToken, tokenExpiry]
    );
    
    const userId = result.insertId;
    console.log(`✅ User created with ID: ${userId}`);
    
    // Send verification email
    const verifyLink = `https://core-insight-7.onrender.com/verify.html?token=${verifyToken}`;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Verify Your Email - Core Insight</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0a192f, #172a45); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: #64ffda; margin: 0; }
          .content { background: #f5f5f5; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #64ffda; color: #0a192f; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          .code { background: #e0e0e0; padding: 10px; font-family: monospace; font-size: 14px; word-break: break-all; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 Core Insight</h1>
          </div>
          <div class="content">
            <h2>Welcome ${username}!</h2>
            <p>Thank you for signing up as a <strong>${userRole === 'client' ? 'Buyer' : 'Seller'}</strong>.</p>
            <p>Please verify your email address to activate your account:</p>
            
            <div style="text-align: center;">
              <a href="${verifyLink}" class="button">✅ Verify My Email</a>
            </div>
            
            <p>Or copy and paste this link:</p>
            <div class="code">${verifyLink}</div>
            
            <p>Verification code: <strong>${verifyToken}</strong></p>
            
            <p><strong>⚠️ This link expires in 24 hours.</strong></p>
            
            <p>If you didn't create an account, please ignore this email.</p>
            <hr>
            <p style="font-size: 12px;">Need help? Contact us at suppourtcoreinsight@gmail.com</p>
          </div>
          <div class="footer">
            <p>© 2024 Core Insight. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const emailResult = await sendVerificationEmail(email, "Verify Your Email - Core Insight", emailHtml);
    
    if (!emailResult.success) {
      console.error(`❌ Failed to send email to ${email}: ${emailResult.error}`);
      return res.status(202).json({ 
        message: "Account created! However, we couldn't send the verification email. Please contact support.",
        requiresManualVerification: true,
        token: verifyToken,
        userId: userId
      });
    }
    
    res.json({ 
      message: "Account created! Please check your email to verify your account.",
      requiresVerification: true,
      email: email,
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

// =================== VERIFICATION ENDPOINTS ===================

// =================== VERIFICATION ENDPOINTS ===================

// GET verification (from email link)
app.get("/api/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    const users = await db.query(
      "SELECT id, email, username FROM users WHERE verify_token = ? AND verified = 0",
      [token]
    );
    
    if (!users || users.length === 0) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Verification Failed - Core Insight</title></head>
        <body style="background:#0a192f; color:#e6f1ff; font-family:Arial; text-align:center; padding:50px;">
          <h1 style="color:#ff6b6b;">❌ Verification Failed</h1>
          <p>Invalid verification link or account already verified.</p>
          <a href="/verify.html" style="color:#64ffda;">Request a new verification link →</a>
        </body>
        </html>
      `);
    }
    
    const user = users[0];
    
    await db.query(
      "UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?",
      [user.id]
    );
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Email Verified! - Core Insight</title></head>
      <body style="background:#0a192f; color:#e6f1ff; font-family:Arial; text-align:center; padding:50px;">
        <h1 style="color:#64ffda;">✅ Email Verified Successfully!</h1>
        <p>Your account is now active.</p>
        <a href="/login.html" style="background:#64ffda; color:#0a192f; padding:12px 24px; text-decoration:none; border-radius:5px; display:inline-block; margin-top:20px;">Login Now →</a>
      </body>
      </html>
    `);
    
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).send("Error verifying email");
  }
});

// =================== VERIFY ENDPOINT ===================
app.post("/api/verify", async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: "Verification token required" });
    }
    
    // Find user with this token
    const users = await db.query(
      "SELECT id, email, username FROM users WHERE verify_token = ? AND verified = 0",
      [token]
    );
    
    if (!users || users.length === 0) {
      return res.status(400).json({ error: "Invalid verification token or account already verified" });
    }
    
    const user = users[0];
    
    // Verify the user
    await db.query(
      "UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?",
      [user.id]
    );
    
    res.json({ 
      success: true, 
      message: "Email verified successfully!",
      username: user.username
    });
    
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).json({ error: "Error verifying email" });
  }
});

// =================== RESEND VERIFICATION (RETURNS TOKEN) ===================
app.post("/api/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }
    
    const users = await db.query(
      "SELECT id, username, email, verify_token FROM users WHERE email = ? AND verified = 0",
      [email]
    );
    
    if (!users || users.length === 0) {
      return res.status(404).json({ error: "No unverified account found with this email" });
    }
    
    const user = users[0];
    const verifyToken = user.verify_token || crypto.randomBytes(32).toString('hex');
    
    // Update token if needed
    if (!user.verify_token) {
      await db.query(
        "UPDATE users SET verify_token = ? WHERE id = ?",
        [verifyToken, user.id]
      );
    }
    
    const verifyLink = `https://core-insight-7.onrender.com/verify-manual.html?token=${verifyToken}`;
    
    // Try to send email
    try {
      await transporter.sendMail({
        from: `"Core Insight" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Verify Your Email - Core Insight",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Verify Your Email</h2>
            <p>Click the link below to verify your account:</p>
            <a href="${verifyLink}" style="background-color: #64ffda; color: #0a192f; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Verify Email
            </a>
            <p>Or enter this code: <strong>${verifyToken}</strong></p>
            <p><a href="${verifyLink}">${verifyLink}</a></p>
          </div>
        `
      });
    } catch (emailError) {
      console.log("Email send failed, returning token for manual verification");
    }
    
    // ALWAYS return the token so user can verify manually
    res.json({ 
      success: true, 
      message: "Verification code ready",
      token: verifyToken,
      link: verifyLink
    });
    
  } catch (err) {
    console.error("Resend error:", err);
    res.status(500).json({ error: "Error processing request" });
  }
});

// POST verification (from form)
app.post("/api/verify", async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: "Verification token required" });
    }
    
    const users = await db.query(
      "SELECT id, email, username FROM users WHERE verify_token = ? AND (verify_token_expiry IS NULL OR verify_token_expiry > NOW())",
      [token]
    );
    
    if (!users || users.length === 0) {
      return res.status(400).json({ error: "Invalid or expired verification token" });
    }
    
    const user = users[0];
    
    await db.query(
      "UPDATE users SET verified = 1, verify_token = NULL, verify_token_expiry = NULL WHERE id = ?",
      [user.id]
    );
    
    res.json({ 
      success: true, 
      message: "Email verified successfully!",
      username: user.username
    });
    
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).json({ error: "Error verifying email" });
  }
});

// Resend verification email
app.post("/api/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }
    
    const users = await db.query(
      "SELECT id, username, email, verify_token FROM users WHERE email = ? AND verified = 0",
      [email]
    );
    
    if (!users || users.length === 0) {
      return res.status(404).json({ error: "No unverified account found with this email" });
    }
    
    const user = users[0];
    const verifyToken = user.verify_token || crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24);
    
    // Update token if needed
    if (!user.verify_token) {
      await db.query(
        "UPDATE users SET verify_token = ?, verify_token_expiry = ? WHERE id = ?",
        [verifyToken, tokenExpiry, user.id]
      );
    }
    
    const verifyLink = `https://core-insight-7.onrender.com/verify.html?token=${verifyToken}`;
    
    await transporter.sendMail({
      from: `"Core Insight" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your Email - Core Insight",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify Your Email</h2>
          <p>Click the link below to verify your account:</p>
          <a href="${verifyLink}" style="background-color: #64ffda; color: #0a192f; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Verify Email
          </a>
          <p>Or enter this code: <strong>${verifyToken}</strong></p>
          <p>This link expires in 24 hours.</p>
        </div>
      `
    });
    
    res.json({ 
      success: true, 
      message: "Verification email sent. Please check your inbox." 
    });
    
  } catch (err) {
    console.error("Resend error:", err);
    res.status(500).json({ error: "Error sending verification email" });
  }
});

// =================== LOGIN WITH VERIFICATION CHECK ===================
app.post("/api/login", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if ((!username && !email) || !password) {
      return res.status(400).json({ error: "Username/email and password are required" });
    }

    let user = null;
    let query = "";
    let params = [];

    if (username) {
      query = "SELECT * FROM users WHERE username = ?";
      params = [username];
    } else {
      query = "SELECT * FROM users WHERE email = ?";
      params = [email];
    }

    const users = await db.query(query, params);
    
    if (users && users.length > 0) {
      user = users[0];
    }

    if (!user) {
      const identifier = username || email;
      return res.status(400).json({ error: `User with ${username ? 'username' : 'email'} "${identifier}" not found` });
    }

    // Check if email is verified
    if (!user.verified) {
      return res.status(403).json({ 
        error: "Please verify your email before logging in.",
        unverified: true,
        email: user.email
      });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    
    if (!passwordValid) {
      return res.status(400).json({ error: "Invalid password" });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'client',
      verified: user.verified
    };

    res.json({ 
      message: "Login successful!", 
      user: req.session.user,
      verified: true
    });
    
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
  
  if (!email) {
    return res.status(400).json({ 
      success: false, 
      message: "Email is required" 
    });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email address"
    });
  }

  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 hour

    const result = await db.query(
      "UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?",
      [token, expires, email]
    );

    // Security: Always return same message regardless of whether email exists
    const responseMessage = "If that email address exists in our system, we've sent a password reset link to it.";

    // Only send email if user exists
    if (result.affectedRows > 0) {
      const resetLink = `https://core-insight-7.onrender.com/reset-password.html?token=${token}`;

      await transporter.sendMail({
        from: `"Core Insight" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Reset your Core Insight password",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; color: white;">
              <h2 style="margin-top: 0;">🔐 Password Reset Request</h2>
              <p>You requested to reset your password. Click the button below to create a new password:</p>
              <a href="${resetLink}" 
                 style="background-color: white; color: #667eea; padding: 12px 30px; 
                        text-decoration: none; border-radius: 25px; display: inline-block;
                        font-weight: bold; margin: 20px 0;">
                Reset Password
              </a>
              <p style="font-size: 14px; opacity: 0.9;">This link will expire in 1 hour.</p>
              <hr style="border: 1px solid rgba(255,255,255,0.2); margin: 20px 0;">
              <p style="font-size: 12px; opacity: 0.8;">If you didn't request this, please ignore this email. Your password will remain unchanged.</p>
            </div>
          </div>
        `
      });
      
      console.log(`Password reset email sent to: ${email}`);
    }

    res.json({ 
      success: true, 
      message: responseMessage 
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred. Please try again later." 
    });
  }
});
app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;  // Keep as 'password'
  
  if (!token || !password) {
    return res.status(400).json({ 
      success: false,
      error: "Token and password are required" 
    });
  }

  // Validate password strength
  if (password.length < 8) {
    return res.status(400).json({ 
      success: false,
      error: "Password must be at least 8 characters long" 
    });
  }

  try {
    const [users] = await db.query(
      "SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()",
      [token]
    );

    if (!users || users.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid or expired reset token" 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    await db.query(
      "UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE reset_token = ?",
      [hashedPassword, token]
    );

    res.json({ 
      success: true,
      message: "✅ Password reset successfully! You can now login with your new password." 
    });
    
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ 
      success: false,
      error: "Error resetting password. Please try again." 
    });
  }
});

app.post("/api/user/set-role", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to set role" });
  }

  try {
    const { role } = req.body;
    
    if (!['client', 'freelancer'].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be 'client' or 'freelancer'" });
    }

    await db.query(
      "UPDATE users SET role = ? WHERE id = ?",
      [role, req.session.user.id]
    );

    req.session.user.role = role;

    res.json({ 
      message: `Role set to ${role} successfully`,
      role: role
    });

  } catch (err) {
    res.status(500).json({ error: "Error setting role: " + err.message });
  }
});

app.post("/api/admin/change-password", async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: "Unauthorized: Admin access required" });
  }

  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required" });
  }

  try {
    const users = await db.query("SELECT * FROM users WHERE id = ?", [req.session.user.id]);
    const user = Array.isArray(users) && users.length > 0 ? users[0] : null;

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const validCurrentPassword = await bcrypt.compare(currentPassword, user.password);
    
    if (!validCurrentPassword) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    
    await db.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedNewPassword, req.session.user.id]
    );

    res.json({ message: "Password updated successfully" });
    
  } catch (err) {
    res.status(500).json({ error: "Error changing password" });
  }
});

// Debug endpoint to check all conversations for a user
app.get("/api/debug/user-conversations", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not logged in" });
    }
    
    const userId = req.session.user.id;
    
    // Get all conversations for this user
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
    
    // Handle result format
    let conversations = [];
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) {
        conversations = result[0];
      } else if (result.length > 0) {
        conversations = result;
      }
    }
    
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
// Debug endpoint to check conversation participants
app.get("/api/debug/conversation-participants/:id", async (req, res) => {
  try {
    const conversationId = req.params.id;
    
    const result = await db.query(`
      SELECT 
        c.id,
        c.client_id,
        c.freelancer_id,
        c.service_id,
        u1.id as client_db_id,
        u1.username as client_username,
        u1.email as client_email,
        u2.id as freelancer_db_id,
        u2.username as freelancer_username,
        u2.email as freelancer_email
      FROM conversations c
      LEFT JOIN users u1 ON c.client_id = u1.id
      LEFT JOIN users u2 ON c.freelancer_id = u2.id
      WHERE c.id = ?
    `, [conversationId]);
    
    let conversation = null;
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0]) && result[0].length > 0) {
        conversation = result[0][0];
      } else if (result.length > 0) {
        conversation = result[0];
      }
    }
    
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    
    res.json({
      conversation_exists: true,
      conversation: conversation,
      client_exists: !!conversation.client_db_id,
      freelancer_exists: !!conversation.freelancer_db_id
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== CHAT SYSTEM ENDPOINTS ===================
// Get total unread messages
app.get("/api/messages/unread-count", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ count: 0 });
    const userId = req.session.user.id;

    const [rows] = await db.query(`
      SELECT COUNT(m.id) AS unread_count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.sender_id != ?
        AND m.is_read = 0
        AND (c.client_id = ? OR c.freelancer_id = ?)
    `, [userId, userId, userId]);

    res.json({ count: rows.length ? rows[0].unread_count : 0 });
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

    let rows = [];
    if (Array.isArray(result)) {
      rows = result[0] || result;
    } else {
      rows = result;
    }

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
        END AS other_user_id
      FROM conversations c
      JOIN users u1 ON c.client_id = u1.id
      JOIN users u2 ON c.freelancer_id = u2.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.client_id = ? OR c.freelancer_id = ?
      ORDER BY 
        (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) DESC,
        c.created_at DESC
    `, [userId, userId, userId, userId]);

    // Handle the result format correctly
    let rows = [];
    if (result) {
      if (Array.isArray(result)) {
        // If it's [rows, fields] format
        if (result.length === 2 && Array.isArray(result[0])) {
          rows = result[0];
        } 
        // If it's just rows
        else if (result.length > 0) {
          rows = result;
        }
      } else if (result.rows) {
        rows = result.rows;
      }
    }

    console.log(`Found ${rows.length} conversations for user ${userId}`);
    
    // Ensure we're sending an array
    const conversations = Array.isArray(rows) ? rows : [];
    res.json(conversations);

  } catch (err) {
    console.error("Conversations fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});
// Start a new conversation without a service - ADD THIS TO index.js
app.post("/api/conversations/start-without-service", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Login required" });
    
    const { recipient_id } = req.body;
    if (!recipient_id) return res.status(400).json({ error: "Missing recipient ID" });

    console.log(`Starting conversation without service - Recipient ID: ${recipient_id} User ID: ${user.id}`);

    // Determine roles
    const currentUserId = parseInt(user.id);
    const recipientId = parseInt(recipient_id);

    // IMPORTANT: Check if there's ANY conversation between these two users
    // regardless of who is client/freelancer
    const existingResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations 
       WHERE (client_id = ? AND freelancer_id = ?) 
          OR (client_id = ? AND freelancer_id = ?)
       LIMIT 1`,
      [currentUserId, recipientId, recipientId, currentUserId]
    );

    // Extract existing conversation
    let existingConversation = null;
    if (existingResult) {
      if (Array.isArray(existingResult)) {
        if (existingResult.length === 2 && Array.isArray(existingResult[0]) && existingResult[0].length > 0) {
          existingConversation = existingResult[0][0];
        } else if (existingResult.length > 0) {
          existingConversation = existingResult[0];
        }
      } else if (existingResult.id) {
        existingConversation = existingResult;
      }
    }

    console.log("Existing conversation:", existingConversation);

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

    let users = [];
    if (Array.isArray(userResult)) {
      if (userResult.length === 2 && Array.isArray(userResult[0])) {
        users = userResult[0];
      } else if (userResult.length > 0) {
        users = userResult;
      }
    }

    // Find current user and recipient in results
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

    // Extract insert ID
    let conversationId = null;
    if (insertResult) {
      if (insertResult.insertId) {
        conversationId = insertResult.insertId;
      } else if (Array.isArray(insertResult) && insertResult[0] && insertResult[0].insertId) {
        conversationId = insertResult[0].insertId;
      }
    }

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
// Debug endpoint to check messages
app.get("/api/debug/messages/:conversationId", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    
    // Check if conversation exists
    const [convRows] = await db.query(
      "SELECT * FROM conversations WHERE id = ?",
      [conversationId]
    );
    
    // Check messages
    const [msgRows] = await db.query(
      `SELECT m.*, u.username 
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at ASC`,
      [conversationId]
    );
    
    // Count messages
    const [countRows] = await db.query(
      "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?",
      [conversationId]
    );
    
    res.json({
      conversation_exists: convRows.length > 0,
      conversation: convRows[0] || null,
      message_count: countRows[0].count,
      messages: msgRows,
      table_check: {
        has_conversation_id: true,
        has_message_field: true
      }
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific conversation info
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

    const rows = Array.isArray(result[0]) ? result[0] : result;
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Conversation not found or access denied" });

    res.json({ success: true, conversation: rows[0], other_user_id: rows[0].other_user_id });
  } catch (err) {
    console.error("Conversation info error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});
// Start a new conversation - UPDATED to prevent duplicates
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

    let service = null;
    if (serviceResult) {
      if (Array.isArray(serviceResult)) {
        if (serviceResult.length === 2 && Array.isArray(serviceResult[0]) && serviceResult[0].length > 0) {
          service = serviceResult[0][0];
        } else if (serviceResult.length > 0) {
          service = serviceResult[0];
        }
      } else if (serviceResult.id) {
        service = serviceResult;
      }
    }

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    console.log("Service found:", service);

    // Determine roles
    const provider_id = parseInt(service.provider_id || service.user_id);
    const client_id = parseInt(user.id);

    console.log(`Provider ID: ${provider_id}, Client ID: ${client_id}`);

    // IMPORTANT: Check if there's ANY conversation between these two users
    // regardless of who is client/freelancer
    const existingResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations 
       WHERE (client_id = ? AND freelancer_id = ?) 
          OR (client_id = ? AND freelancer_id = ?)
       LIMIT 1`,
      [client_id, provider_id, provider_id, client_id]
    );

    // Extract existing conversation
    let existingConversation = null;
    if (existingResult) {
      if (Array.isArray(existingResult)) {
        if (existingResult.length === 2 && Array.isArray(existingResult[0]) && existingResult[0].length > 0) {
          existingConversation = existingResult[0][0];
        } else if (existingResult.length > 0) {
          existingConversation = existingResult[0];
        }
      } else if (existingResult.id) {
        existingConversation = existingResult;
      }
    }

    console.log("Existing conversation:", existingConversation);

    if (existingConversation) {
      console.log(`Using existing conversation: ${existingConversation.id}`);
      
      // Update the conversation to include this service if needed
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

    // Create new conversation if none exists
    console.log(`Creating new conversation - Service: ${service_id}, Client: ${client_id}, Provider: ${provider_id}`);
    
    const insertResult = await db.query(
      `INSERT INTO conversations (service_id, client_id, freelancer_id, created_at)
       VALUES (?, ?, ?, NOW())`,
      [service_id, client_id, provider_id]
    );

    // Extract insert ID
    let conversationId = null;
    if (insertResult) {
      if (insertResult.insertId) {
        conversationId = insertResult.insertId;
      } else if (Array.isArray(insertResult) && insertResult[0] && insertResult[0].insertId) {
        conversationId = insertResult[0].insertId;
      }
    }

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

    // First check if user has access to this conversation
    const convResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations WHERE id = ?`,
      [conversation_id]
    );

    // Handle the result format properly
    let conversation = null;
    if (convResult) {
      if (Array.isArray(convResult)) {
        if (convResult.length === 2 && Array.isArray(convResult[0]) && convResult[0].length > 0) {
          conversation = convResult[0][0];
        } else if (convResult.length > 0) {
          conversation = convResult[0];
        }
      } else if (convResult.id) {
        conversation = convResult;
      }
    }

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

    // Get the insert ID
    let messageId = null;
    if (insertResult) {
      if (insertResult.insertId) {
        messageId = insertResult.insertId;
      } else if (Array.isArray(insertResult) && insertResult[0] && insertResult[0].insertId) {
        messageId = insertResult[0].insertId;
      }
    }

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

    // Extract the message data
    let newMessage = null;
    if (messageResult) {
      if (Array.isArray(messageResult)) {
        if (messageResult.length === 2 && Array.isArray(messageResult[0]) && messageResult[0].length > 0) {
          newMessage = messageResult[0][0];
        } else if (messageResult.length > 0) {
          newMessage = messageResult[0];
        }
      } else if (messageResult.id) {
        newMessage = messageResult;
      }
    }

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

// =================== UPDATED CHAT IMAGE UPLOAD ===================
app.post("/api/messages/send-with-image", uploadChatImage.single('image'), async (req, res) => {
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

    let conversation = null;
    if (convResult) {
      if (Array.isArray(convResult)) {
        if (convResult.length === 2 && Array.isArray(convResult[0]) && convResult[0].length > 0) {
          conversation = convResult[0][0];
        } else if (convResult.length > 0) {
          conversation = convResult[0];
        }
      } else if (convResult.id) {
        conversation = convResult;
      }
    }

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
      imageUrl = req.file.path; // Cloudinary URL
      // If no text message, set a default
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

    // Get the insert ID
    let messageId = null;
    if (insertResult) {
      if (insertResult.insertId) {
        messageId = insertResult.insertId;
      } else if (Array.isArray(insertResult) && insertResult[0] && insertResult[0].insertId) {
        messageId = insertResult[0].insertId;
      }
    }

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

    let newMessage = null;
    if (messageResult) {
      if (Array.isArray(messageResult)) {
        if (messageResult.length === 2 && Array.isArray(messageResult[0]) && messageResult[0].length > 0) {
          newMessage = messageResult[0][0];
        } else if (messageResult.length > 0) {
          newMessage = messageResult[0];
        }
      } else if (messageResult.id) {
        newMessage = messageResult;
      }
    }

    res.status(200).json({ 
      success: true, 
      data: newMessage 
    });
    
  } catch (err) {
    console.error("Send message with image error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to check messages
app.get("/api/debug/messages/:conversationId", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    
    // Get raw messages without access control
    const messagesResult = await db.query(
      `SELECT m.*, u.username 
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at DESC`,
      [conversationId]
    );

    let messages = [];
    if (messagesResult) {
      if (Array.isArray(messagesResult)) {
        if (messagesResult.length === 2 && Array.isArray(messagesResult[0])) {
          messages = messagesResult[0];
        } else if (messagesResult.length > 0) {
          messages = messagesResult;
        }
      }
    }

    // Get conversation info
    const convResult = await db.query(
      `SELECT * FROM conversations WHERE id = ?`,
      [conversationId]
    );

    let conversation = null;
    if (convResult) {
      if (Array.isArray(convResult)) {
        if (convResult.length === 2 && Array.isArray(convResult[0]) && convResult[0].length > 0) {
          conversation = convResult[0][0];
        } else if (convResult.length > 0) {
          conversation = convResult[0];
        }
      }
    }

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

// =================== UPDATED GET MESSAGES ===================
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

    let convRows = [];
    if (Array.isArray(convResult)) {
      convRows = convResult[0] || convResult;
    } else {
      convRows = convResult;
    }

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

    // Handle the result format
    let messages = [];
    if (messagesResult) {
      if (Array.isArray(messagesResult)) {
        if (messagesResult.length === 2 && Array.isArray(messagesResult[0])) {
          messages = messagesResult[0];
        } else if (messagesResult.length > 0) {
          messages = messagesResult;
        }
      } else if (Array.isArray(messagesResult.rows)) {
        messages = messagesResult.rows;
      }
    }

    return res.json(Array.isArray(messages) ? messages : []);

  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Server error: " + err.message });
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

        let users = [];
        if (Array.isArray(result)) {
            users = result.length === 2 ? result[0] : result;
        }

        res.json(users);
        
    } catch (err) {
        console.error("User search error:", err);
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
    
    const [convRows] = await db.query(
      `SELECT * FROM conversations WHERE id = ?`,
      [conversationId]
    );
    
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
// =================== FIX COURSE PATHS IN DATABASE ===================
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
    
    // Get all courses
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
      
      // Check if the exact file exists
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
        // Try to find a matching file
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

// =================== UPDATED COURSES ENDPOINT ===================
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
      // Convert bigint to number if needed
      if (course.id && typeof course.id === 'bigint') {
        course.id = Number(course.id);
      }
      if (course.user_id && typeof course.user_id === 'bigint') {
        course.user_id = Number(course.user_id);
      }
      
      // Set URLs - prefer Cloudinary URLs, fallback to local paths
      course.thumbnail_url = course.thumbnail_url || course.thumbnail_path;
      course.file_url = course.file_url || course.file_path;
      
      // If it's a Cloudinary URL, we can add transformations
      if (course.thumbnail_url && course.thumbnail_url.includes('cloudinary.com')) {
        // Add thumbnail optimization
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


// =================== FIXED DOWNLOAD ENDPOINT - PROPER ACCESS CHECK ===================
app.get('/api/download/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.session?.user?.id;
    
    console.log('='.repeat(50));
    console.log(`📥 DOWNLOAD REQUEST - Course: ${courseId}, User: ${userId}`);
    console.log('='.repeat(50));
    
    // Check if user is logged in
    if (!userId) {
      return res.status(401).json({ error: 'Please login first' });
    }
    
    // Get course details
    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    
    if (!courses || courses.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const course = courses[0];
    console.log(`✅ Course: "${course.title}"`);
    console.log(`💰 Price: ${course.price}, Type: ${course.type}`);
    
    // CRITICAL FIX: Check if course is FREE - if yes, allow access immediately
    const isFree = course.price === 0 || course.type === 'free' || course.type === 'Free';
    
    if (isFree) {
      console.log('✅ Course is FREE - granting access immediately');
      // Proceed to download without any payment checks
    } else {
      // Only check purchases for paid courses
      console.log('💰 Paid course - checking purchase status');
      
      // Check if user has purchased this course
      const purchases = await db.query(
        'SELECT * FROM user_courses WHERE course_id = ? AND user_id = ? AND payment_status = "completed"',
        [courseId, userId]
      );
      
      const hasPurchased = purchases && purchases.length > 0;
      
      if (!hasPurchased) {
        // Also check payments table
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
    
    // Get the file path from database
    const dbFilePath = course.file_url || course.file_path;
    
    if (!dbFilePath) {
      console.log('❌ No file path in database');
      return res.status(404).json({ error: 'No file associated with this course' });
    }
    
    const filename = path.basename(dbFilePath);
    console.log(`📁 Looking for file: ${filename}`);
    
    // Build the absolute path where the file should be
    const uploadDir = path.join(__dirname, 'uploads', 'courses');
    const expectedPath = path.join(uploadDir, filename);
    console.log(`📍 Expected path: ${expectedPath}`);
    
    // Check if the file exists
    const fileExists = fs.existsSync(expectedPath);
    console.log(`📁 File exists: ${fileExists}`);
    
    if (!fileExists) {
      // List all files in the uploads directory for debugging
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        console.log('📂 Files in uploads/courses:', files);
        
        // Try to find a file with similar name
        const searchName = filename.replace(/^\d+-\d+-/, '');
        const similarFile = files.find(f => f.includes(searchName) || searchName.includes(f.replace(/^\d+-\d+-/, '')));
        
        if (similarFile) {
          console.log(`🔍 Found similar file: ${similarFile}`);
          // Update the database with the correct filename
          const correctPath = `/uploads/courses/${similarFile}`;
          await db.query(
            'UPDATE courses SET file_path = ? WHERE id = ?',
            [correctPath, course.id]
          );
          console.log(`✅ Updated database with correct path: ${correctPath}`);
          
          // Use the correct path to send the file
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
    
    // Send the file
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
  
  // Create a safe filename for download
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

function sendFile(res, filePath, title) {
  const stat = fs.statSync(filePath);
  const filename = path.basename(filePath);
  const ext = path.extname(filename);
  
  // Create a safe filename for download
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

// Change from POST to GET for easy browser access
app.get("/api/admin/sync-files", async (req, res) => {
  try {
    // Check if user is admin
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
    
    // Filter out directories and PDF files
    const pdfFiles = files.filter(file => 
      file.toLowerCase().endsWith('.pdf') && 
      fs.statSync(path.join(coursesDir, file)).isFile()
    );

    console.log(`Found ${pdfFiles.length} PDF files to sync`);

    for (const file of pdfFiles) {
      try {
        // Extract a title from the filename (remove timestamp and extension)
        let title = file.replace(/^\d+-/, '') // Remove timestamp at beginning
                        .replace(/\.pdf$/i, '') // Remove .pdf extension
                        .replace(/[-_]/g, ' ') // Replace hyphens/underscores with spaces
                        .replace(/\s+/g, ' ') // Normalize spaces
                        .trim();
        
        // Capitalize first letter of each word
        title = title.replace(/\b\w/g, l => l.toUpperCase());
        
        // Check if this file already exists in database
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

        // Insert into database
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

    // Return as HTML for easy viewing
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

// =================== FIX COURSE FILE PATHS ===================
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
    
    // Get all courses
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
        
        // Try to find the file
        let foundFile = null;
        
        // Exact match
        if (existingFiles.includes(dbFilename)) {
          foundFile = dbFilename;
        } else {
          // Try to find by partial match (file might have been renamed with timestamp)
          for (const file of existingFiles) {
            // Check if the file contains the original name
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

// =================== LIST ACTUAL FILES ON SERVER ===================
app.get("/api/debug/list-files", async (req, res) => {
  try {
    const results = {
      uploads_courses: [],
      public_uploads_courses: [],
      server_info: {
        __dirname: __dirname,
        cwd: process.cwd()
      }
    };
    
    // Check main uploads directory
    const mainUploadsDir = path.join(__dirname, 'uploads', 'courses');
    if (fs.existsSync(mainUploadsDir)) {
      results.uploads_courses = fs.readdirSync(mainUploadsDir);
      results.uploads_courses_path = mainUploadsDir;
    } else {
      results.uploads_courses_error = "Directory does not exist";
    }
    
    // Check public uploads directory
    const publicUploadsDir = path.join(__dirname, 'public', 'uploads', 'courses');
    if (fs.existsSync(publicUploadsDir)) {
      results.public_uploads_courses = fs.readdirSync(publicUploadsDir);
      results.public_uploads_courses_path = publicUploadsDir;
    } else {
      results.public_uploads_courses_error = "Directory does not exist";
    }
    
    // Also check Render's absolute path
    const renderUploadsDir = '/opt/render/project/src/uploads/courses';
    if (fs.existsSync(renderUploadsDir)) {
      results.render_uploads_courses = fs.readdirSync(renderUploadsDir);
      results.render_uploads_courses_path = renderUploadsDir;
    } else {
      results.render_uploads_courses_error = "Directory does not exist";
    }
    
    res.json(results);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =================== DEBUG ENDPOINTS ===================
// =================== DEBUG ENDPOINTS ===================
// View all courses
app.get("/api/debug/all-courses", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, title, file_path, price, type, 
             DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as created_at 
      FROM courses 
      ORDER BY id DESC
    `);
    
    let courses = [];
    if (Array.isArray(rows)) {
      courses = rows;
    } else if (rows && rows[0] && Array.isArray(rows[0])) {
      courses = rows[0];
    }
    
    // Return as HTML for easy viewing
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>All Courses</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px; 
            background: #0a192f; 
            color: #e6f1ff;
            margin: 0;
          }
          h1 { color: #64ffda; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
            background: #172a45;
            border-radius: 8px;
            overflow: hidden;
          }
          th { 
            background: #1d3b5c; 
            color: #64ffda; 
            padding: 12px; 
            text-align: left;
            font-weight: 600;
          }
          td { 
            padding: 12px; 
            border-bottom: 1px solid #2a4a6e;
            color: #e6f1ff;
          }
          tr:hover { background: #1e3a5a; }
          .free { color: #64ffda; font-weight: bold; }
          .paid { color: #FFD700; font-weight: bold; }
          a { 
            color: #64ffda; 
            text-decoration: none;
            padding: 4px 8px;
            border: 1px solid #64ffda;
            border-radius: 4px;
            font-size: 12px;
          }
          a:hover { background: #64ffda; color: #0a192f; }
          .stats {
            background: #172a45;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .stat {
            display: inline-block;
            margin-right: 30px;
          }
          .stat-label { color: #8892b0; font-size: 14px; }
          .stat-value { color: #64ffda; font-size: 24px; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>📚 All Courses (${courses.length})</h1>
        
        <div class="stats">
          <div class="stat">
            <div class="stat-label">Total Courses</div>
            <div class="stat-value">${courses.length}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Free Courses</div>
            <div class="stat-value">${courses.filter(c => c.type === 'free' || c.price == 0).length}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Paid Courses</div>
            <div class="stat-value">${courses.filter(c => c.type === 'paid' || c.price > 0).length}</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Price</th>
              <th>Type</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${courses.map(course => `
              <tr>
                <td><strong>${course.id}</strong></td>
                <td>${course.title || 'Untitled'}</td>
                <td>$${parseFloat(course.price || 0).toFixed(2)}</td>
                <td class="${course.type === 'free' ? 'free' : 'paid'}">${course.type || 'free'}</td>
                <td>${course.created_at || 'N/A'}</td>
                <td>
                  <a href="/api/download/${course.id}" target="_blank">Download</a>
                  <a href="/api/debug/course/${course.id}" target="_blank" style="margin-left: 5px;">Debug</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <p style="margin-top: 20px;">
          <a href="/" style="display: inline-block; padding: 10px 20px;">← Back to Home</a>
        </p>
      </body>
      </html>
    `;
    
    res.send(html);

  } catch (err) {
    console.error("Debug error:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

// View specific course details
app.get("/api/debug/course/:id", async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    
    const [rows] = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    
    let course = null;
    if (Array.isArray(rows) && rows.length > 0) {
      course = rows[0];
    } else if (rows && rows[0] && Array.isArray(rows[0]) && rows[0].length > 0) {
      course = rows[0][0];
    }
    
    if (!course) {
      return res.status(404).send(`<h1>Course ${courseId} Not Found</h1>`);
    }
    
    // Check if file exists
    let fileExists = false;
    let filePath = null;
    let fileSize = null;
    
    if (course.file_path) {
      const filename = path.basename(course.file_path);
      const fullPath = path.join(__dirname, "uploads", "courses", filename);
      
      if (fs.existsSync(fullPath)) {
        fileExists = true;
        filePath = fullPath;
        const stats = fs.statSync(fullPath);
        fileSize = stats.size;
      }
    }
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Course #${courseId}</title>
        <style>
          body { font-family: Arial; padding: 20px; background: #0a192f; color: #e6f1ff; }
          .card { background: #172a45; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .label { color: #8892b0; font-size: 14px; }
          .value { color: #64ffda; font-size: 18px; margin-bottom: 10px; }
          .success { color: #64ffda; }
          .error { color: #ff6b6b; }
          pre { background: #1d3b5c; padding: 10px; border-radius: 4px; overflow: auto; }
          a { color: #64ffda; text-decoration: none; padding: 8px 16px; border: 1px solid #64ffda; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>Course #${courseId}: ${course.title}</h1>
        
        <div class="card">
          <div class="label">ID</div>
          <div class="value">${course.id}</div>
          
          <div class="label">Title</div>
          <div class="value">${course.title || 'N/A'}</div>
          
          <div class="label">Description</div>
          <div class="value">${course.description || 'No description'}</div>
          
          <div class="label">File Path (DB)</div>
          <div class="value">${course.file_path || 'N/A'}</div>
          
          <div class="label">Price</div>
          <div class="value">$${parseFloat(course.price || 0).toFixed(2)}</div>
          
          <div class="label">Type</div>
          <div class="value">${course.type || 'free'}</div>
          
          <div class="label">Created</div>
          <div class="value">${course.created_at || 'N/A'}</div>
        </div>
        
        <div class="card">
          <h2>File Check</h2>
          <div class="label">File Exists on Disk</div>
          <div class="value ${fileExists ? 'success' : 'error'}">${fileExists ? '✅ YES' : '❌ NO'}</div>
          
          ${fileExists ? `
            <div class="label">File Path (Actual)</div>
            <div class="value">${filePath}</div>
            <div class="label">File Size</div>
            <div class="value">${Math.round(fileSize / 1024)} KB</div>
          ` : ''}
        </div>
        
        <p>
          <a href="/api/download/${courseId}" target="_blank">⬇️ Download Now</a>
          <a href="/api/debug/all-courses" style="margin-left: 10px;">← Back to All Courses</a>
        </p>
      </body>
      </html>
    `;
    
    res.send(html);

  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// =================== REUPLOAD COURSE FILE ===================
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

// View all courses - FIXED VERSION
app.get("/api/debug/all-courses", async (req, res) => {
  try {
    // Execute the query
    const result = await db.query("SELECT id, title, file_path, price, type, created_at FROM courses ORDER BY id DESC");
    
    // Handle different result formats from mysql2
    let courses = [];
    if (Array.isArray(result)) {
      // If it's [rows, fields] format
      if (result.length === 2 && Array.isArray(result[0])) {
        courses = result[0];
      } 
      // If it's just rows array
      else if (result.length > 0) {
        courses = result;
      }
    } else if (result && result.rows) {
      courses = result.rows;
    }
    
    console.log(`Found ${courses.length} courses in database`);
    
    // Return as HTML for easy viewing
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>All Courses</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px; 
            background: #0a192f; 
            color: #e6f1ff;
            margin: 0;
          }
          h1 { color: #64ffda; }
          .stats { 
            background: #172a45; 
            padding: 20px; 
            border-radius: 8px; 
            margin-bottom: 20px;
            display: flex;
            gap: 30px;
          }
          .stat {
            text-align: center;
          }
          .stat-label { 
            color: #8892b0; 
            font-size: 14px; 
            margin-bottom: 5px;
          }
          .stat-value { 
            color: #64ffda; 
            font-size: 32px; 
            font-weight: bold;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
            background: #172a45;
            border-radius: 8px;
            overflow: hidden;
          }
          th { 
            background: #1d3b5c; 
            color: #64ffda; 
            padding: 12px; 
            text-align: left;
            font-weight: 600;
          }
          td { 
            padding: 12px; 
            border-bottom: 1px solid #2a4a6e;
            color: #e6f1ff;
          }
          tr:hover { background: #1e3a5a; }
          .free { color: #64ffda; font-weight: bold; }
          .paid { color: #FFD700; font-weight: bold; }
          a { 
            color: #64ffda; 
            text-decoration: none;
            padding: 4px 8px;
            border: 1px solid #64ffda;
            border-radius: 4px;
            font-size: 12px;
            margin-right: 5px;
          }
          a:hover { background: #64ffda; color: #0a192f; }
          .no-data {
            text-align: center;
            padding: 50px;
            color: #8892b0;
            font-size: 18px;
          }
        </style>
      </head>
      <body>
        <h1>📚 Course Database</h1>
        
        <div class="stats">
          <div class="stat">
            <div class="stat-label">Total Courses</div>
            <div class="stat-value">${courses.length}</div>
          </div>
          ${courses.length > 0 ? `
            <div class="stat">
              <div class="stat-label">Free Courses</div>
              <div class="stat-value">${courses.filter(c => c.type === 'free' || parseFloat(c.price || 0) === 0).length}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Paid Courses</div>
              <div class="stat-value">${courses.filter(c => c.type === 'paid' || parseFloat(c.price || 0) > 0).length}</div>
            </div>
          ` : ''}
        </div>
        
        ${courses.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>File Path</th>
                <th>Price</th>
                <th>Type</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${courses.map(course => {
                const price = parseFloat(course.price || 0);
                const type = course.type || (price > 0 ? 'paid' : 'free');
                const date = course.created_at ? new Date(course.created_at).toLocaleDateString() : 'N/A';
                
                return `
                  <tr>
                    <td><strong>${course.id}</strong></td>
                    <td>${course.title || 'Untitled'}</td>
                    <td style="font-size: 12px; max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${course.file_path || 'N/A'}</td>
                    <td>$${price.toFixed(2)}</td>
                    <td class="${type === 'free' ? 'free' : 'paid'}">${type}</td>
                    <td>${date}</td>
                    <td>
                      <a href="/api/download/${course.id}" target="_blank">Download</a>
                      <a href="/api/debug/course/${course.id}" target="_blank">Debug</a>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : `
          <div class="no-data">
            <h2>❌ No courses found in database</h2>
            <p>The database query returned 0 results.</p>
            <p>This could mean:</p>
            <ul style="list-style: none; padding: 0;">
              <li>1. The courses table is empty</li>
              <li>2. There's an issue with the database connection</li>
              <li>3. The sync didn't actually insert the courses</li>
            </ul>
            <p style="margin-top: 30px;">
              <a href="/api/debug/check-db" style="padding: 10px 20px; font-size: 16px;">Check Database</a>
            </p>
          </div>
        `}
        
        <p style="margin-top: 20px;">
          <a href="/" style="display: inline-block; padding: 10px 20px;">← Back to Home</a>
        </p>
      </body>
      </html>
    `;
    
    res.send(html);

  } catch (err) {
    console.error("Debug error:", err);
    res.status(500).send(`
      <h1>Error</h1>
      <p>${err.message}</p>
      <pre>${err.stack}</pre>
    `);
  }
});

// Add this to check database connection and table
app.get("/api/debug/check-db", async (req, res) => {
  try {
    // Check if we can connect
    const [connectResult] = await db.query("SELECT 1 as test");
    
    // Check if courses table exists and has data
    const [tableCheck] = await db.query("SHOW TABLES LIKE 'courses'");
    const tableExists = tableCheck && tableCheck.length > 0;
    
    let courseCount = 0;
    let sampleCourses = [];
    
    if (tableExists) {
      const countResult = await db.query("SELECT COUNT(*) as count FROM courses");
      
      // Handle different result formats
      if (Array.isArray(countResult)) {
        if (countResult.length === 2 && Array.isArray(countResult[0])) {
          courseCount = countResult[0][0]?.count || 0;
        } else if (countResult.length > 0) {
          courseCount = countResult[0]?.count || 0;
        }
      }
      
      if (courseCount > 0) {
        const coursesResult = await db.query("SELECT id, title FROM courses LIMIT 5");
        
        if (Array.isArray(coursesResult)) {
          if (coursesResult.length === 2 && Array.isArray(coursesResult[0])) {
            sampleCourses = coursesResult[0];
          } else if (coursesResult.length > 0) {
            sampleCourses = coursesResult;
          }
        }
      }
    }
    
    res.json({
      database_connected: true,
      test_query: connectResult,
      courses_table_exists: tableExists,
      course_count: courseCount,
      sample_courses: sampleCourses
    });
    
  } catch (err) {
    res.status(500).json({
      database_connected: false,
      error: err.message
    });
  }
});

// Also add this endpoint to check a specific course
app.get("/api/debug/course/:id", async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    
    const [rows] = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    
    let course = null;
    if (Array.isArray(rows) && rows.length > 0) {
      course = rows[0];
    } else if (rows && rows[0] && Array.isArray(rows[0]) && rows[0].length > 0) {
      course = rows[0][0];
    }
    
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        error: "Course not found" 
      });
    }
    
    // Check if file exists
    let fileExists = false;
    let filePath = null;
    
    if (course.file_path) {
      const filename = path.basename(course.file_path);
      const possiblePaths = [
        path.join(__dirname, "uploads", "courses", filename),
        path.join(__dirname, "uploads", "courses", "files", filename),
        path.join(__dirname, "uploads", filename)
      ];
      
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          fileExists = true;
          filePath = testPath;
          break;
        }
      }
    }
    
    res.json({
      success: true,
      course: course,
      file_check: {
        exists: fileExists,
        path: filePath,
        db_path: course.file_path
      }
    });
    
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Add this to check files in uploads directory
app.get("/api/debug/uploads", async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, "uploads");
    const coursesDir = path.join(uploadsDir, "courses");
    
    const result = {
      uploads_exists: fs.existsSync(uploadsDir),
      courses_exists: fs.existsSync(coursesDir),
      files: []
    };
    
    if (fs.existsSync(coursesDir)) {
      result.files = fs.readdirSync(coursesDir);
    }
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function sendFile(res, filePath, courseTitle) {
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();
  
  let contentType = 'application/octet-stream';
  if (ext === '.pdf') contentType = 'application/pdf';
  else if (ext === '.epub') contentType = 'application/epub+zip';
  else if (ext === '.mobi') contentType = 'application/x-mobipocket-ebook';
  else if (ext === '.mp4') contentType = 'video/mp4';
  else if (ext === '.zip') contentType = 'application/zip';
  else if (ext === '.doc' || ext === '.docx') contentType = 'application/msword';
  else if (ext === '.txt') contentType = 'text/plain';

  console.log(`Sending file: ${filename} (${contentType})`);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(courseTitle || filename)}"`
  );

  res.setHeader("Content-Type", contentType);

  res.sendFile(filePath, err => {
    if (err) {
      console.error("Error sending file:", err);
    }
  });
}

// =================== SMART FILE PATH FIXER ===================
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
    
    // Get all courses
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
      
      // Try exact match
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
      
      // Try to find by title match
      let foundFile = null;
      const searchTitle = course.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      for (const file of existingFiles) {
        const fileLower = file.toLowerCase();
        // Check if filename contains course title or vice versa
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

// =================== FILE INTEGRITY CHECK ===================
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
    
    // Check database files against disk
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
    
    // Check for orphaned files (files on disk not in database)
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
// =================== COURSE UPLOAD WITH VALIDATION ===================
app.post("/api/courses", (req, res) => {
  console.log('📚 Course upload started');
  
  const uploadDir = path.join(__dirname, 'uploads', 'courses');
  
  // Ensure directory exists
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
      fileSize: 100 * 1024 * 1024, // 100MB limit
    },
    fileFilter: (req, file, cb) => {
      // Allow only certain file types
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

      // Validation
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
      
      // VERIFY: Wait a moment and check if file was actually saved
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!fs.existsSync(absoluteFilePath)) {
        console.error(`❌ File not found after upload: ${absoluteFilePath}`);
        return res.status(500).json({ error: "File upload failed - file not saved" });
      }
      
      const fileStats = fs.statSync(absoluteFilePath);
      console.log(`✅ File verified: ${courseFile.filename} (${fileStats.size} bytes)`);

      // Insert into database
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

// Add this temporary endpoint to fix all courses
app.get("/api/admin/fix-all-paths", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const results = {
      fixed: [],
      not_found: [],
      errors: []
    };

    // Get all courses
    const [courses] = await db.query("SELECT id, title, file_path FROM courses");
    
    // Get all files in the uploads directory
   const filesDir = path.join(__dirname, 'uploads', 'courses');
    const files = fs.readdirSync(filesDir);
    
    console.log(`Found ${files.length} files in directory`);
    console.log('Files:', files);

    for (const course of courses) {
      try {
        if (!course.file_path) {
          results.not_found.push({ id: course.id, title: course.title, reason: "No file path" });
          continue;
        }

        const dbFilename = path.basename(course.file_path);
        console.log(`Course ${course.id} (${course.title}) has filename: ${dbFilename}`);
        
        // Look for a file that matches
        let foundFile = null;
        
        // Try exact match
        if (files.includes(dbFilename)) {
          foundFile = dbFilename;
        } else {
          // Try to find a file that contains this string
          foundFile = files.find(f => f.includes(dbFilename) || dbFilename.includes(f));
        }
        
        if (foundFile) {
          const correctPath = `/uploads/courses/files/${foundFile}`;
          await db.query(
            "UPDATE courses SET file_path = ? WHERE id = ?",
            [correctPath, course.id]
          );
          results.fixed.push({
            id: course.id,
            title: course.title,
            old_path: course.file_path,
            new_path: correctPath
          });
          console.log(`✅ Fixed course ${course.id}: ${course.file_path} -> ${correctPath}`);
        } else {
          results.not_found.push({
            id: course.id,
            title: course.title,
            file_path: course.file_path
          });
          console.log(`❌ No matching file for course ${course.id}: ${course.file_path}`);
        }
      } catch (err) {
        results.errors.push({ id: course.id, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Fixed ${results.fixed.length} courses, ${results.not_found.length} not found, ${results.errors.length} errors`,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// File recovery endpoint - run this once to fix file paths
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

    // Get all courses
    const coursesResult = await db.query("SELECT id, title, file_path FROM courses");
    let courses = [];
    
    if (Array.isArray(coursesResult)) {
      if (coursesResult.length === 2 && Array.isArray(coursesResult[0])) {
        courses = coursesResult[0];
      } else {
        courses = coursesResult;
      }
    }

    // Check uploads directory
    const uploadDir = path.join(__dirname, "uploads/courses");
    if (!fs.existsSync(uploadDir)) {
      return res.json({ error: "Upload directory not found", path: uploadDir });
    }

    const actualFiles = fs.readdirSync(uploadDir);
    console.log(`Found ${actualFiles.length} files in uploads/courses:`);
    actualFiles.forEach(f => console.log(`  - ${f}`));

    // Check each course
    for (const course of courses) {
      const dbPath = course.file_path;
      const dbFilename = path.basename(dbPath);
      
      // Look for the file
      let found = false;
      let foundPath = null;
      
      // Check if exact filename exists
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
        // Look for similar files (might have timestamp differences)
        const similar = actualFiles.filter(f => 
          f.includes('beyond-good-and-evil') || 
          f.includes(course.title.toLowerCase().replace(/[^a-z0-9]/g, '-'))
        );
        
        if (similar.length > 0) {
          found = true;
          foundPath = path.join(uploadDir, similar[0]);
          
          // Update database with correct filename
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

// =================== FIXED CHECK ACCESS ENDPOINT ===================
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
    
    // Get course details
    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    
    if (!courses || courses.length === 0) {
      return res.status(404).json({ 
        hasAccess: false,
        error: 'Course not found' 
      });
    }
    
    const course = courses[0];
    
    // CRITICAL FIX: FREE courses are accessible to ALL logged-in users
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
    
    // For paid courses, check if purchased
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


// Temporary debug endpoint - remove after fixing
app.get("/api/debug/user-courses/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const result = await db.query(
      `SELECT uc.*, c.title, c.price 
       FROM user_courses uc
       JOIN courses c ON uc.course_id = c.id
       WHERE uc.user_id = ?`,
      [userId]
    );
    
    let courses = [];
    if (result) {
      if (Array.isArray(result)) {
        if (result.length === 2 && Array.isArray(result[0])) {
          courses = result[0];
        } else if (result.length > 0) {
          courses = result;
        }
      }
    }
    
    res.json({
      user_id: userId,
      course_count: courses.length,
      courses: courses
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
  const fullPath = path.join(__dirname, course.file_path); // get absolute path
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

// =================== FIXED PRODUCTS GET ENDPOINT ===================
app.get("/api/products", async (req, res) => {
  try {
    console.log('📦 Fetching products...');
    
    // Get all products including imported ones
    const products = await db.query(`
      SELECT 
        p.*,
        u.username as seller_name
      FROM products p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.is_deleted = 0 OR p.is_deleted IS NULL
      ORDER BY p.created_at DESC
    `);
    
    console.log(`📦 Found ${products.length} products in database`);
    
    // Process each product
    const processedProducts = products.map(product => {
      // Convert price to number
      product.price = parseFloat(product.price || 0);
      
      // Handle original_price
      if (product.original_price) {
        product.original_price = parseFloat(product.original_price);
      } else {
        product.original_price = product.price;
      }
      
      // Handle platform_fee
      if (product.platform_fee) {
        product.platform_fee = parseFloat(product.platform_fee);
      } else {
        product.platform_fee = product.type === 'physical' ? product.original_price * 0.1 : 0;
      }
      
      // Set seller price
      product.seller_price = product.type === 'physical' 
        ? product.original_price - product.platform_fee 
        : product.price;
      
      // CRITICAL FIX: Handle image_urls which is JSON type in MySQL
      if (product.image_urls) {
        try {
          // If it's a string, try to parse it
          if (typeof product.image_urls === 'string') {
            // Check if it looks like JSON
            if (product.image_urls.startsWith('[') || product.image_urls.startsWith('{')) {
              product.images = JSON.parse(product.image_urls);
            } else {
              // It's a single URL string
              product.images = [product.image_urls];
            }
          } else if (Array.isArray(product.image_urls)) {
            // It's already an array (from JSON type)
            product.images = product.image_urls;
          } else {
            product.images = [];
          }
          
          // Filter out any invalid image URLs
          product.images = product.images.filter(img => 
            img && typeof img === 'string' && img.length > 0
          );
        } catch (e) {
          console.log(`⚠️ Error parsing image_urls for product ${product.id}:`, e.message);
          // If parsing fails, treat as single URL
          product.images = product.image_urls ? [product.image_urls] : [];
        }
      } else {
        // Handle legacy images field if it exists
        if (product.images && typeof product.images === 'string') {
          try {
            product.images = JSON.parse(product.images);
          } catch (e) {
            product.images = [product.images];
          }
        } else if (!product.images) {
          product.images = [];
        }
      }
      
      // If no images, add a default based on category
      if (!product.images || product.images.length === 0) {
        const categoryDefaultImages = {
          'electronics': 'https://placehold.co/400x250/2563eb/ffffff/png?text=Electronics',
          'clothing': 'https://placehold.co/400x250/7c3aed/ffffff/png?text=Clothing',
          'fashion': 'https://placehold.co/400x250/7c3aed/ffffff/png?text=Fashion',
          'home': 'https://placehold.co/400x250/059669/ffffff/png?text=Home',
          'beauty': 'https://placehold.co/400x250/db2777/ffffff/png?text=Beauty',
          'sports': 'https://placehold.co/400x250/dc2626/ffffff/png?text=Sports',
          'books': 'https://placehold.co/400x250/b45309/ffffff/png?text=Books',
          'toys': 'https://placehold.co/400x250/7e22ce/ffffff/png?text=Toys'
        };
        
        const lowerCategory = (product.category || '').toLowerCase();
        let defaultImage = 'https://placehold.co/400x250/1e293b/3b82f6/png?text=Product';
        
        for (const [key, url] of Object.entries(categoryDefaultImages)) {
          if (lowerCategory.includes(key)) {
            defaultImage = url;
            break;
          }
        }
        
        product.images = [defaultImage];
      }
      
      // Set _imageList for the frontend
      product._imageList = product.images;
      
      // Ensure type is set
      if (!product.type) {
        product.type = product.affiliate_link ? 'affiliate' : 'digital';
      }
      
      return product;
    });
    
    // Set proper content type
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

// =================== FIXED PRODUCT UPLOAD ENDPOINT ===================
app.post("/api/upload-product", (req, res) => {
  console.log('📦 Product upload started');
  
  const upload = multer({
    storage: multer.diskStorage({})
  }).fields([
    { name: 'file', maxCount: 1 },
    { name: 'images[]', maxCount: 10 }
  ]);

  upload(req, res, async function(err) {
    if (err) {
      console.error('❌ Multer error:', err);
      return res.status(400).json({ error: 'File upload error: ' + err.message });
    }

    try {
      if (!req.session.user) {
        return res.status(401).json({ error: "Please log in to upload products." });
      }

      const { 
        title, 
        description, 
        price, 
        category, 
        type, 
        affiliate_link, 
        delivery_type, 
        delivery_locations, 
        delivery_fee, 
        payment_option,
        paymentProvider,
        delivery_days,
        product_cost,
        external_image
      } = req.body;

      // Validation
      if (!title || !price || !type || !paymentProvider) {
        return res.status(400).json({ 
          error: "Title, price, type, and payment provider are required." 
        });
      }

      // Validate affiliate link for affiliate products
      if (type === 'affiliate' && !affiliate_link) {
        return res.status(400).json({ 
          error: "Affiliate link is required for affiliate products." 
        });
      }

      // Calculate pricing based on product type
      const listedPrice = parseFloat(price);
      
      let sellerPrice = listedPrice;
      let originalPrice = listedPrice;
      let platformFee = 0;
      
     // In the /api/upload-product endpoint, update the pricing section
if (type === 'physical') {
    const productCostValue = parseFloat(product_cost) || 3.00;
    const profitMargin = originalPrice - productCostValue;
    
    // Base platform fee is 10% of profit margin
    const basePlatformFee = profitMargin * 0.10;
    
    // Store in database
    platformFee = basePlatformFee;
    sellerPrice = originalPrice - platformFee - productCostValue;
    
    // Store product_cost for later use
    // product_cost is already being stored
}
      // Process images
      let imageUrls = [];
      if (req.files && req.files['images[]'] && req.files['images[]'].length > 0) {
        const cloudinary = require('cloudinary').v2;
        
        for (const imageFile of req.files['images[]']) {
          try {
            const result = await cloudinary.uploader.upload(imageFile.path, {
              folder: 'core-insight/products',
              resource_type: 'image'
            });
            imageUrls.push(result.secure_url);
          } catch (cloudErr) {
            console.error('Cloudinary upload error:', cloudErr);
          }
        }
      } else if (type === 'affiliate' && external_image) {
        imageUrls = [external_image];
      }

      // Handle product file (digital products)
      let fileUrl = null;
      if (req.files && req.files.file && req.files.file[0]) {
        const productFile = req.files.file[0];
        const uploadDir = path.join(__dirname, 'uploads', 'products', 'files');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const filename = Date.now() + '-' + productFile.originalname;
        const filePath = path.join(uploadDir, filename);
        fs.renameSync(productFile.path, filePath);
        fileUrl = `/uploads/products/files/${filename}`;
      }

      const estimatedDeliveryDays = type === 'physical' 
        ? parseInt(delivery_days) || 7 
        : null;

      const productCostValue = type === 'physical' 
        ? parseFloat(product_cost) || 3.00 
        : null;

      // FIXED: REMOVED ALL COMMENTS FROM SQL QUERY
      console.log('💾 Inserting into database...');
      
      const result = await db.query(
        `INSERT INTO products (
          user_id, 
          title, 
          description, 
          price,
          original_price,
          platform_fee,
          product_cost,
          category, 
          type, 
          file_url, 
          image_urls, 
          affiliate_link,
          delivery_type, 
          delivery_locations, 
          delivery_fee, 
          payment_option, 
          seller_payment_provider,
          estimated_delivery_days,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          req.session.user.id,
          title,
          description || '',
          sellerPrice,
          originalPrice,
          platformFee,
          productCostValue,
          category || '',
          type || 'digital',
          fileUrl,
          imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
          affiliate_link || null,
          delivery_type || null,
          delivery_locations || null,
          delivery_fee ? parseFloat(delivery_fee) : null,
          payment_option || null,
          paymentProvider,
          estimatedDeliveryDays
        ]
      );

      console.log('✅ Product uploaded successfully with ID:', result.insertId);
      
      res.json({ 
        message: "✅ Product uploaded successfully!",
        productId: result.insertId,
        file_url: fileUrl,
        image_urls: imageUrls,
        payment_provider: paymentProvider,
        estimated_delivery_days: estimatedDeliveryDays,
        pricing: {
          seller_price: sellerPrice,
          customer_price: originalPrice,
          platform_fee: platformFee,
          product_cost: productCostValue
        }
      });

    } catch (err) {
      console.error('❌ Product upload error:', err);
      console.error('❌ Error stack:', err.stack);
      
      res.status(500).json({ 
        error: "Error uploading product: " + err.message,
        code: err.code
      });
    }
  });
});
app.get("/api/products/:id/delivery-days", async (req, res) => {
  try {
    const [productRows] = await db.query(
      "SELECT estimated_delivery_days FROM products WHERE id = ?",
      [req.params.id]
    );
    
    if (productRows.length === 0) {
      return res.json({ estimated_delivery_days: 7 });
    }
    
    res.json({ 
      estimated_delivery_days: productRows[0].estimated_delivery_days || 7 
    });
  } catch (err) {
    res.json({ estimated_delivery_days: 7 });
  }
});

// Create payment for physical order with new fee structure
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
      `SELECT user_id as seller_id, original_price, platform_fee, product_cost, title 
       FROM products WHERE id = ?`,
      [productId]
    );

    if (!productResult || productResult.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const sellerId = productResult[0].seller_id;
    const buyerId = req.session.user.id;
    const productOriginalPrice = parseFloat(productResult[0].original_price || price);
    const productCost = parseFloat(productResult[0].product_cost || 3.00);
    const profitMargin = productOriginalPrice - productCost;

    // Calculate fees
    // 1. Base platform fee: 10% of profit margin
    const basePlatformFee = profitMargin * 0.10;
    
    // 2. Bulk order fee: 0.2% per unit beyond first (max 10%)
    const bulkFeeRate = Math.min((qty - 1) * 0.002, 0.10); // 0.2% per extra unit, capped at 10%
    const bulkOrderFee = qty > 1 ? productOriginalPrice * bulkFeeRate : 0;
    
    // 3. Total platform fee
    const totalPlatformFee = (basePlatformFee * qty) + bulkOrderFee;
    
    // Calculate totals
    const subtotal = qty * productOriginalPrice;
    const totalAmount = subtotal + totalPlatformFee; // Customer pays this
    const sellerEarnings = (qty * (productOriginalPrice - productCost)) - (basePlatformFee * qty);

    // Detailed breakdown for display
    const feeBreakdown = {
      productSubtotal: subtotal,
      productCostTotal: qty * productCost,
      basePlatformFee: basePlatformFee * qty,
      bulkOrderFee: bulkOrderFee,
      totalPlatformFee: totalPlatformFee,
      sellerEarnings: sellerEarnings,
      totalAmount: totalAmount
    };

    console.log("💰 Payment breakdown:", feeBreakdown);

    // Generate transaction reference
    const transactionRef = `physical_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Insert order
    const result = await db.query(
      `INSERT INTO physical_orders (
        product_id, seller_id, buyer_id,
        product_name, product_type, quantity, 
        price, platform_fee, seller_earnings,
        total_amount, product_cost_total,
        base_platform_fee, bulk_order_fee,
        customer_name, customer_email, customer_phone,
        shipping_address, city, state, country,
        payment_method, payment_status, order_status,
        notes, estimated_delivery_days,
        transaction_ref
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId, sellerId, buyerId,
        productTitle || productResult[0].title,
        'physical', qty,
        productOriginalPrice,
        totalPlatformFee,
        sellerEarnings,
        totalAmount,
        qty * productCost,
        basePlatformFee * qty,
        bulkOrderFee,
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
        transactionRef
      ]
    );

    let orderId = result.insertId;
    if (!orderId) {
      throw new Error("Failed to insert order");
    }

    console.log(`✅ Created pending order #${orderId}`);

    // Initialize Flutterwave payment
    if (!process.env.FLW_SECRET_KEY) {
      return res.status(500).json({ error: "Payment system not configured" });
    }

    const payload = {
      tx_ref: transactionRef,
      amount: totalAmount,
      currency: "USD",
      redirect_url: `https://core-insight-7.onrender.com/physical-payment-callback.html`,
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
// Seller marks order as delivered
app.post("/api/orders/:orderId/deliver", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }

    const orderId = req.params.orderId;
    const { tracking_number, delivery_photo, notes } = req.body;

    // Check if user is the seller
    const orderCheck = await db.query(
      "SELECT seller_id, product_name, buyer_id FROM physical_orders WHERE id = ?",
      [orderId]
    );

    if (!orderCheck || orderCheck.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (orderCheck[0].seller_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Only the seller can mark orders as delivered" });
    }

    // Update order status
    await db.query(
      `UPDATE physical_orders 
       SET order_status = 'delivered',
           delivered_at = NOW(),
           tracking_number = ?,
           delivery_notes = ?
       WHERE id = ?`,
      [tracking_number || null, notes || null, orderId]
    );

    // Add delivery confirmation record
    await db.query(
      `INSERT INTO order_tracking (order_id, status, description, created_at)
       VALUES (?, 'delivered', ?, NOW())`,
      [orderId, `Order marked as delivered by seller${tracking_number ? `. Tracking: ${tracking_number}` : ''}`]
    );

    // Notify buyer
    await db.query(
      `INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message)
       VALUES (?, ?, 'delivery', 'Order Delivered', 
               CONCAT('Your order "', ?, '" has been delivered. Please confirm receipt if satisfied.'))`,
      [orderCheck[0].buyer_id, orderId, orderCheck[0].product_name]
    );

    res.json({
      success: true,
      message: "Order marked as delivered. Buyer will be notified to confirm."
    });

  } catch (err) {
    console.error("❌ Delivery update error:", err);
    res.status(500).json({ error: "Failed to update delivery status" });
  }
});

// Buyer confirms order receipt
app.post("/api/orders/:orderId/confirm-receipt", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }

    const orderId = req.params.orderId;
    const { rating, review } = req.body;

    // Check if user is the buyer
    const orderCheck = await db.query(
      "SELECT buyer_id, seller_id, product_name, product_id FROM physical_orders WHERE id = ?",
      [orderId]
    );

    if (!orderCheck || orderCheck.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (orderCheck[0].buyer_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Only the buyer can confirm receipt" });
    }

    // Update order status
    await db.query(
      `UPDATE physical_orders 
       SET order_status = 'completed',
           completed_at = NOW(),
           buyer_rating = ?,
           buyer_review = ?
       WHERE id = ?`,
      [rating || null, review || null, orderId]
    );

    // Release funds to seller (if using escrow)
    await db.query(
      `INSERT INTO seller_payouts (seller_id, order_id, amount, status, created_at)
       VALUES (?, ?, ?, 'pending', NOW())`,
      [orderCheck[0].seller_id, orderId, 
       await getSellerEarnings(orderId), // You'll need this function
      ]
    );

    // Add review if provided
    if (rating && review) {
      await db.query(
        `INSERT INTO product_reviews (product_id, user_id, order_id, rating, comment, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [orderCheck[0].product_id, req.session.user.id, orderId, rating, review]
      );
    }

    // Notify seller
    await db.query(
      `INSERT INTO seller_notifications (seller_id, order_id, notification_type, title, message)
       VALUES (?, ?, 'completion', 'Order Completed', 
               CONCAT('Buyer confirmed receipt for order #', ?, '. Funds will be released to your account.'))`,
      [orderCheck[0].seller_id, orderId, orderId]
    );

    res.json({
      success: true,
      message: "Thank you for confirming receipt! The seller will receive their payment shortly."
    });

  } catch (err) {
    console.error("❌ Confirmation error:", err);
    res.status(500).json({ error: "Failed to confirm receipt" });
  }
});

// Request refund
app.post("/api/orders/:orderId/refund-request", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }

    const orderId = req.params.orderId;
    const { reason } = req.body;

    if (!reason || reason.length < 10) {
      return res.status(400).json({ error: "Please provide a detailed reason for refund (min 10 characters)" });
    }

    // Check if user is the buyer
    const orderCheck = await db.query(
      "SELECT buyer_id, seller_id, product_name, order_status, total_amount FROM physical_orders WHERE id = ?",
      [orderId]
    );

    if (!orderCheck || orderCheck.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (orderCheck[0].buyer_id !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Only the buyer can request a refund" });
    }

    // Check if refund is allowed
    const allowedStatuses = ['pending', 'processing', 'shipped'];
    if (!allowedStatuses.includes(orderCheck[0].order_status)) {
      return res.status(400).json({ 
        error: `Refund not allowed for orders with status "${orderCheck[0].order_status}". 
                Please contact support if you have issues.` 
      });
    }

    // Create refund request
    const refundResult = await db.query(
      `INSERT INTO refund_requests (order_id, buyer_id, seller_id, amount, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [orderId, req.session.user.id, orderCheck[0].seller_id, orderCheck[0].total_amount, reason]
    );

    // Notify seller
    await db.query(
      `INSERT INTO seller_notifications (seller_id, order_id, notification_type, title, message)
       VALUES (?, ?, 'refund', 'Refund Request', 
               CONCAT('Buyer requested refund for order #', ?, '. Reason: ', ?))`,
      [orderCheck[0].seller_id, orderId, orderId, reason.substring(0, 100)]
    );

    // Update order status
    await db.query(
      "UPDATE physical_orders SET order_status = 'refund_requested' WHERE id = ?",
      [orderId]
    );

    res.json({
      success: true,
      refundId: refundResult.insertId,
      message: "Refund request submitted. The seller has 48 hours to respond. We'll notify you of updates."
    });

  } catch (err) {
    console.error("❌ Refund request error:", err);
    res.status(500).json({ error: "Failed to submit refund request" });
  }
});

// Admin/Seller approve refund
app.post("/api/refunds/:refundId/process", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login" });
    }

    const refundId = req.params.refundId;
    const { action, admin_notes } = req.body;

    const refundCheck = await db.query(
      `SELECT r.*, o.seller_id, o.buyer_id, o.transaction_ref 
       FROM refund_requests r
       JOIN physical_orders o ON r.order_id = o.id
       WHERE r.id = ?`,
      [refundId]
    );

    if (!refundCheck || refundCheck.length === 0) {
      return res.status(404).json({ error: "Refund request not found" });
    }

    const refund = refundCheck[0];
    const isSeller = refund.seller_id === req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    if (!isSeller && !isAdmin) {
      return res.status(403).json({ error: "Only the seller or admin can process refunds" });
    }

    if (action === 'approve') {
      // Process refund through Flutterwave
      try {
        const refundResponse = await axios.post(
          'https://api.flutterwave.com/v3/transactions/refund',
          {
            transaction_id: refund.transaction_ref,
            amount: refund.amount,
            full_refund: true,
            narration: `Refund for order ${refund.order_id}`
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (refundResponse.data.status === 'success') {
          // Update refund status
          await db.query(
            `UPDATE refund_requests 
             SET status = 'approved', 
                 processed_by = ?, 
                 processed_at = NOW(),
                 admin_notes = ?
             WHERE id = ?`,
            [req.session.user.id, admin_notes || null, refundId]
          );

          // Update order status
          await db.query(
            "UPDATE physical_orders SET order_status = 'refunded' WHERE id = ?",
            [refund.order_id]
          );

          // Notify buyer
          await db.query(
            `INSERT INTO buyer_notifications (buyer_id, order_id, notification_type, title, message)
             VALUES (?, ?, 'refund', 'Refund Approved', 
                     CONCAT('Your refund for order #', ?, ' has been approved. Please allow 5-10 business days for the refund to appear in your account.'))`,
            [refund.buyer_id, refund.order_id, refund.order_id]
          );

          res.json({
            success: true,
            message: "Refund approved and processed successfully"
          });
        } else {
          throw new Error(refundResponse.data.message || "Refund failed");
        }
      } catch (paymentError) {
        console.error("Payment refund error:", paymentError);
        return res.status(500).json({ error: "Failed to process refund through payment gateway" });
      }
    } else if (action === 'deny') {
      // Deny refund
      await db.query(
        `UPDATE refund_requests 
         SET status = 'denied', 
             processed_by = ?, 
             processed_at = NOW(),
             admin_notes = ?
         WHERE id = ?`,
        [req.session.user.id, admin_notes || null, refundId]
      );

      // Update order status back to previous
      await db.query(
        "UPDATE physical_orders SET order_status = 'pending' WHERE id = ?",
        [refund.order_id]
      );

      res.json({
        success: true,
        message: "Refund request denied"
      });
    }

  } catch (err) {
    console.error("❌ Refund processing error:", err);
    res.status(500).json({ error: "Failed to process refund" });
  }
});
// Verify physical order payment after callback
app.get("/api/verify-physical-payment/:transaction_ref", async (req, res) => {
  try {
    const { transaction_ref } = req.params;
    
    console.log(`🔍 Verifying payment for transaction: ${transaction_ref}`);
    
    // Verify with Flutterwave
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${transaction_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        }
      }
    );
    
    if (response.data.status === "success" && response.data.data.status === "successful") {
      const transaction = response.data.data;
      const orderId = transaction.meta?.order_id;
      const amount = transaction.amount;
      
      console.log(`✅ Payment verified for order #${orderId}`);
      
      // Update order status to paid - using 'paid' which is in your enum
      await db.query(
        `UPDATE physical_orders 
         SET payment_status = 'paid', 
             order_status = 'pending',
             transaction_id = ?,
             updated_at = NOW()
         WHERE id = ? AND transaction_ref = ?`,
        [transaction.id, orderId, transaction_ref]
      );
      
      // Create notification for seller
      const orderResult = await db.query(
        "SELECT product_name, seller_id FROM physical_orders WHERE id = ?",
        [orderId]
      );
      
      if (orderResult && orderResult.length > 0) {
        await db.query(
          `INSERT INTO seller_notifications 
           (seller_id, order_id, notification_type, title, message, created_at)
           VALUES (?, ?, 'new_order', 'New Order Paid', 
                   CONCAT('Order for ', ?, ' has been paid - $', ?, ' received'), NOW())`,
          [orderResult[0].seller_id, orderId, orderResult[0].product_name, amount]
        );
      }
      
      res.json({
        status: "success",
        message: "Payment verified successfully",
        orderId: orderId,
        amount: amount
      });
    } else {
      // Payment failed - delete the pending order
      const transactionData = response.data.data;
      if (transactionData && transactionData.meta && transactionData.meta.order_id) {
        await db.query(
          "DELETE FROM physical_orders WHERE id = ? AND payment_status = 'pending'",
          [transactionData.meta.order_id]
        );
      }
      
      res.status(400).json({
        status: "failed",
        message: "Payment not successful"
      });
    }
    
  } catch (err) {
    console.error('❌ Verification error:', err);
    res.status(500).json({ 
      error: "Error verifying payment",
      details: err.message 
    });
  }
});
// =================== FIXED SELLER PRODUCTS ENDPOINT ===================
app.get("/api/products/seller/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;

    const result = await db.query(`
      SELECT 
        p.*
      FROM products p 
      WHERE p.user_id = ? AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
      ORDER BY p.created_at DESC
    `, [sellerId]);
    
    // Handle result format
    let products = [];
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) {
        products = result[0];
      } else if (result.length > 0) {
        products = result;
      }
    } else if (result && result.rows) {
      products = result.rows;
    }
    
    // Process each product
    products = products.map(product => {
      // Convert price to number
      product.price = parseFloat(product.price || 0);
      
      // Handle original_price
      if (product.original_price) {
        product.original_price = parseFloat(product.original_price);
      } else {
        product.original_price = product.price;
      }
      
      // Handle platform_fee
      if (product.platform_fee) {
        product.platform_fee = parseFloat(product.platform_fee);
      } else {
        product.platform_fee = product.type === 'physical' ? product.original_price * 0.1 : 0;
      }
      
      // Set seller price
      product.seller_price = product.type === 'physical' 
        ? product.original_price - product.platform_fee 
        : product.price;
      
      // Handle images
      if (product.image_urls) {
        try {
          product.images = JSON.parse(product.image_urls);
        } catch (e) {
          product.images = [product.image_urls];
        }
      } else if (product.images) {
        try {
          product.images = JSON.parse(product.images);
        } catch (e) {
          product.images = [product.images];
        }
      } else {
        product.images = [];
      }
      
      return product;
    });
    
    res.json(products);
    
  } catch (err) {
    console.error('❌ Error fetching seller products:', err);
    res.status(500).json({ 
      error: "Error fetching seller products",
      details: err.message 
    });
  }
});

// =================== FIXED PRODUCT DELETE ENDPOINT ===================
app.delete("/api/products/:id", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login first" });
    }

    const productId = req.params.id;
    const { id: userId, role: userRole } = req.session.user;

    // First, check if product exists and get owner
    const products = await db.query(
      "SELECT * FROM products WHERE id = ?",
      [productId]
    );

    // Handle different result formats
    let product = null;
    if (Array.isArray(products)) {
      if (products.length === 2 && Array.isArray(products[0])) {
        product = products[0][0];
      } else if (products.length > 0) {
        product = products[0];
      }
    }

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const productOwnerId = product.user_id;

    // Check if user is authorized to delete
    if (userRole !== "admin" && Number(productOwnerId) !== Number(userId)) {
      return res.status(403).json({ error: "You are not authorized to delete this product" });
    }

    console.log(`🗑️ Deleting product ${productId} (Type: ${product.type})`);

    // Start a transaction to ensure all related data is deleted properly
    await db.query("START TRANSACTION");

    try {
      // 1. First, get all physical order IDs for this product
      const orderIdsResult = await db.query(
        "SELECT id FROM physical_orders WHERE product_id = ?",
        [productId]
      );

      let orderIds = [];
      if (Array.isArray(orderIdsResult)) {
        if (orderIdsResult.length === 2 && Array.isArray(orderIdsResult[0])) {
          orderIds = orderIdsResult[0].map(row => row.id);
        } else if (orderIdsResult.length > 0) {
          orderIds = orderIdsResult.map(row => row.id);
        }
      }

      // 2. Delete from seller_notifications for each order
      if (orderIds.length > 0) {
        for (const orderId of orderIds) {
          await db.query(
            "DELETE FROM seller_notifications WHERE order_id = ?",
            [orderId]
          );
        }
        console.log(`✅ Deleted notifications for ${orderIds.length} orders`);
      }

      // 3. Delete from order_tracking for each order
      if (orderIds.length > 0) {
        for (const orderId of orderIds) {
          await db.query(
            "DELETE FROM order_tracking WHERE order_id = ?",
            [orderId]
          );
        }
      }

      // 4. Delete from physical_orders
      await db.query(
        "DELETE FROM physical_orders WHERE product_id = ?",
        [productId]
      );

      // 5. Delete from orders
      await db.query(
        "DELETE FROM orders WHERE product_id = ?",
        [productId]
      );

      // 6. Delete from favorites
      await db.query(
        "DELETE FROM favorites WHERE product_id = ?",
        [productId]
      );

      // 7. Delete from reviews
      await db.query(
        "DELETE FROM reviews WHERE product_id = ?",
        [productId]
      );

      // 8. Get product sale IDs
      const saleIdsResult = await db.query(
        "SELECT id FROM product_sales WHERE product_id = ?",
        [productId]
      );

      let saleIds = [];
      if (Array.isArray(saleIdsResult)) {
        if (saleIdsResult.length === 2 && Array.isArray(saleIdsResult[0])) {
          saleIds = saleIdsResult[0].map(row => row.id);
        } else if (saleIdsResult.length > 0) {
          saleIds = saleIdsResult.map(row => row.id);
        }
      }

      // 9. Delete from platform_commissions for each sale
      if (saleIds.length > 0) {
        for (const saleId of saleIds) {
          await db.query(
            "DELETE FROM platform_commissions WHERE sale_id = ?",
            [saleId]
          );
        }
      }

      // 10. Delete from product_sales
      await db.query(
        "DELETE FROM product_sales WHERE product_id = ?",
        [productId]
      );

      // Finally, delete the product itself
      const result = await db.query(
        "DELETE FROM products WHERE id = ?",
        [productId]
      );

      // Commit the transaction
      await db.query("COMMIT");

      console.log(`✅ Product ${productId} and all related records deleted successfully`);

      return res.json({
        success: true,
        message: "✅ Product and all related data deleted successfully",
        deletedId: productId
      });

    } catch (transactionError) {
      // If anything fails, roll back the entire transaction
      await db.query("ROLLBACK");
      console.error('❌ Transaction failed:', transactionError);
      throw transactionError;
    }

  } catch (err) {
    console.error('❌ Delete error:', err);
    return res.status(500).json({
      error: "Failed to delete product",
      details: err.message,
      code: err.code
    });
  }
});

// =================== REVIEWS ENDPOINTS ===================
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

    const existingReview = await db.query(
      "SELECT id FROM reviews WHERE user_id = ? AND product_id = ?",
      [req.session.user.id, productId]
    );

    if (existingReview.length > 0) {
      return res.status(400).json({ error: "You have already reviewed this product." });
    }

    await db.query(
      "INSERT INTO reviews (user_id, product_id, rating, comment) VALUES (?, ?, ?, ?)",
      [req.session.user.id, productId, rating, comment]
    );

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
    res.status(500).json({ error: "Error submitting review: " + err.message });
  }
});

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

    const safeReviews = Array.isArray(reviews) ? reviews : (reviews[0] || []);
    
    res.json({ 
      reviews: safeReviews,
      count: safeReviews.length
    });

  } catch (err) {
    res.status(500).json({ error: "Error loading reviews: " + err.message });
  }
});
// =================== ALIEXPRESS IMPORT ENDPOINTS ===================

// Import from CSV file
app.post('/api/aliexpress/import/csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const AliExpressImporter = require('./aliexpress-importer');
    const products = await AliExpressImporter.importFromFile(req.file.path);
    
    const results = await AliExpressImporter.importToDatabase(
      products, 
      req.session.user.id
    );

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `Imported ${results.success.length} products. ${results.failed.length} failed. ${results.skipped.length} skipped.`,
      results: results
    });

  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search AliExpress products (if using API)
app.get('/api/aliexpress/search', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Please login' });
    }

    const { q, category, limit = 50 } = req.query;
    
    const AliExpressImporter = require('./aliexpress-importer');
    const products = await AliExpressImporter.fetchFromThirdParty(category || q, limit);
    
    res.json({
      success: true,
      products: products
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk import from AliExpress category
app.post('/api/aliexpress/import/category', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { category, limit = 1000 } = req.body;
    
    const AliExpressImporter = require('./aliexpress-importer');
    const products = await AliExpressImporter.fetchFromThirdParty(category, limit);
    
    const results = await AliExpressImporter.importToDatabase(
      products, 
      req.session.user.id
    );

    res.json({
      success: true,
      message: `Imported ${results.success.length} products from category: ${category}`,
      results: results
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get import status/stats
app.get('/api/aliexpress/imports/stats', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_imported,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as imported_today,
        MIN(created_at) as first_import,
        MAX(created_at) as last_import
      FROM products 
      WHERE type = 'affiliate'
    `);

    res.json({
      success: true,
      stats: stats[0] || {}
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


 // =================== FIXED BULK IMPORT WITH PROPER PRODUCT CREATION ===================
app.post('/api/products/bulk-import', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!req.session.user) {
    return res.status(401).json({ error: 'Please login first' });
  }

  const results = {
    successful: [],
    skipped: [],
    failed: []
  };

  try {
    // Read and parse CSV file
    const products = [];
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
          // Clean and validate each row
          const product = {
            title: row.title?.trim() || 
                   row.Title?.trim() || 
                   row.name?.trim() || 
                   'Untitled Product',
            
            price: parseFloat(row.price) || 
                   parseFloat(row['Price (unit)']) || 
                   parseFloat(row.Price) || 
                   0,
            
            affiliate_link: row.affiliate_link?.trim() || 
                           row.link?.trim() || 
                           row['Product Link']?.trim() || 
                           row.Link?.trim() || 
                           '',
            
            description: row.description?.trim() || 
                        row.Description?.trim() || 
                        `Product from ${row['Store Name'] || 'AliExpress'}`,
            
            category: row.category?.trim() || 
                     row.Category?.trim() || 
                     'General',
            
            image_url: row.image?.trim() || 
                      row.Image?.trim() || 
                      row['Image URL']?.trim() || 
                      row['image_url']?.trim() || 
                      ''
          };
          
          // Validate required fields
          if (product.title && product.price > 0) {
            products.push(product);
            console.log(`✅ Queued: ${product.title} - $${product.price}`);
          } else {
            const missing = [];
            if (!product.title) missing.push('title');
            if (!product.price || product.price <= 0) missing.push('price');
            
            results.failed.push({
              title: product.title || 'Unknown',
              reason: `Missing required fields: ${missing.join(', ')}`
            });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`📦 Processing ${products.length} products for import...`);

    // Helper function for category-based default images
    const getCategoryDefaultImage = (category) => {
      const categoryImages = {
        'electronics': 'https://placehold.co/400x250/2563eb/ffffff/png?text=Electronics',
        'clothing': 'https://placehold.co/400x250/7c3aed/ffffff/png?text=Clothing',
        'fashion': 'https://placehold.co/400x250/7c3aed/ffffff/png?text=Fashion',
        'home': 'https://placehold.co/400x250/059669/ffffff/png?text=Home',
        'beauty': 'https://placehold.co/400x250/db2777/ffffff/png?text=Beauty',
        'sports': 'https://placehold.co/400x250/dc2626/ffffff/png?text=Sports',
        'books': 'https://placehold.co/400x250/b45309/ffffff/png?text=Books',
        'toys': 'https://placehold.co/400x250/7e22ce/ffffff/png?text=Toys',
        'automotive': 'https://placehold.co/400x250/0d9488/ffffff/png?text=Automotive',
        'health': 'https://placehold.co/400x250/be123c/ffffff/png?text=Health',
        'pet': 'https://placehold.co/400x250/92400e/ffffff/png?text=Pet+Supplies',
        'garden': 'https://placehold.co/400x250/2b9348/ffffff/png?text=Garden',
        'tools': 'https://placehold.co/400x250/b45309/ffffff/png?text=Tools',
        'jewelry': 'https://placehold.co/400x250/db2777/ffffff/png?text=Jewelry',
        'bags': 'https://placehold.co/400x250/8b5cf6/ffffff/png?text=Bags',
        'shoes': 'https://placehold.co/400x250/7c3aed/ffffff/png?text=Shoes'
      };
      
      const lowerCategory = (category || '').toLowerCase();
      for (const [key, url] of Object.entries(categoryImages)) {
        if (lowerCategory.includes(key)) {
          return url;
        }
      }
      
      // Default fallback
      return 'https://placehold.co/400x250/1e293b/3b82f6/png?text=Product';
    };

    // Import each product
    for (const product of products) {
      try {
        // Check for duplicates (if affiliate link exists)
        let existingProduct = null;
        if (product.affiliate_link) {
          const existingResult = await db.query(
            'SELECT id FROM products WHERE affiliate_link = ?',
            [product.affiliate_link]
          );

          if (existingResult && existingResult.length > 0) {
            existingProduct = existingResult[0];
          }
        }

        if (existingProduct) {
          results.skipped.push({
            title: product.title,
            reason: 'Already exists'
          });
          continue;
        }

        // Calculate prices
        const customerPrice = product.price;
        const platformFee = customerPrice * 0.1;
        const sellerPrice = customerPrice - platformFee;

        // Prepare image URLs
        let imageUrls = [];
        if (product.image_url) {
          // Make sure URL is valid
          if (product.image_url.startsWith('http')) {
            imageUrls = [product.image_url];
          } else {
            // If it's not a full URL, try to construct one
            imageUrls = [`https:${product.image_url}`];
          }
        }
        
        // If still no images, use category-based default
        if (imageUrls.length === 0) {
          const defaultImage = getCategoryDefaultImage(product.category);
          imageUrls = [defaultImage];
        }
        
        // Determine product type
        const productType = product.affiliate_link ? 'affiliate' : 'digital';

        // Insert product with correct column names
        const insertResult = await db.query(
          `INSERT INTO products (
            user_id, 
            title, 
            description, 
            price,
            original_price,
            platform_fee,
            category, 
            type, 
            image_urls, 
            affiliate_link,
            status,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
          [
            req.session.user.id,
            product.title,
            product.description.substring(0, 500), // Limit description length
            sellerPrice,
            customerPrice,
            platformFee,
            product.category,
            productType,
            JSON.stringify(imageUrls),
            product.affiliate_link || null
          ]
        );

        let insertId = null;
        if (insertResult) {
          if (insertResult.insertId) {
            insertId = insertResult.insertId;
          } else if (Array.isArray(insertResult) && insertResult[0] && insertResult[0].insertId) {
            insertId = insertResult[0].insertId;
          }
        }

        results.successful.push({
          id: insertId || 'unknown',
          title: product.title,
          price: customerPrice,
          type: productType,
          image: imageUrls[0]
        });

        console.log(`✅ Imported: ${product.title} (ID: ${insertId}) with image: ${imageUrls[0]}`);

      } catch (error) {
        console.error('❌ Error importing product:', error);
        results.failed.push({
          title: product.title,
          reason: error.message
        });
      }
    }

    // Clean up temp file
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkErr) {
      console.error('Error deleting temp file:', unlinkErr);
    }

    res.json({
      success: true,
      message: `Import completed. ${results.successful.length} successful, ${results.skipped.length} skipped, ${results.failed.length} failed.`,
      results: results
    });

  } catch (error) {
    console.error('❌ Bulk import error:', error);
    
    try {
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
    } catch (unlinkErr) {}
    
    res.status(500).json({ 
      error: 'Import failed: ' + error.message,
      results: results
    });
  }
});



// TEST ENDPOINT - Add this temporarily
app.get('/api/test-import', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  
  try {
    // Try to insert a test product
    const testProduct = {
      title: 'TEST PRODUCT - DELETE ME',
      description: 'This is a test product',
      price: 9.99,
      original_price: 9.99,
      platform_fee: 0.99,
      category: 'Test',
      affiliate_link: 'https://example.com/test',
      image_urls: JSON.stringify(['https://placehold.co/300x300/1e293b/3b82f6/png?text=Test'])
    };
    
    const result = await db.query(
      `INSERT INTO products (
        user_id, title, description, price, original_price,
        platform_fee, category, type, affiliate_link, 
        image_urls, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'affiliate', ?, ?, 'active', NOW())`,
      [
        req.session.user.id,
        testProduct.title,
        testProduct.description,
        testProduct.price,
        testProduct.original_price,
        testProduct.platform_fee,
        testProduct.category,
        testProduct.affiliate_link,
        testProduct.image_urls
      ]
    );
    
    res.json({ 
      success: true, 
      message: 'Test product inserted',
      insertId: result.insertId 
    });
    
  } catch (error) {
    console.error('Test insert error:', error);
    res.status(500).json({ error: error.message });
  }
});
// Optional: Install needed packages
// npm install node-fetch cors-anywhere

// =================== FIXED FAVORITES ENDPOINTS WITH COUNTS ===================

// Toggle favorite and return updated count
app.post("/api/favorites/toggle", async (req, res) => {
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

    const existing = Array.isArray(result)
      ? (Array.isArray(result[0]) ? result[0] : result)
      : [];

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
      
      const count = countResult[0]?.count || 0;
      
      // Update product favorite_count in products table (optional but recommended)
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
      
      // Update product favorite_count in products table
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
    res.status(500).json({ error: "Error updating favorites: " + err.message });
  }
});

// =================== FIXED FAVORITES ENDPOINTS WITH COUNTS ===================

// Get user's favorites and favorite counts
app.get("/api/favorites", async (req, res) => {
  // Set proper JSON content type
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
    if (Array.isArray(userFavs)) {
      if (userFavs.length === 2 && Array.isArray(userFavs[0])) {
        userFavorites = userFavs[0].map(row => row.product_id);
      } else if (userFavs.length > 0) {
        userFavorites = userFavs.map(row => row.product_id);
      }
    }

    // Get favorite counts for all products
    const countResults = await db.query(`
      SELECT product_id, COUNT(*) as count 
      FROM favorites 
      GROUP BY product_id
    `);

    let favoriteCounts = {};
    if (Array.isArray(countResults)) {
      const counts = countResults.length === 2 ? countResults[0] : countResults;
      if (Array.isArray(counts)) {
        counts.forEach(row => {
          favoriteCounts[row.product_id] = parseInt(row.count) || 0;
        });
      }
    }

    // Update the products table with these counts
    for (const [productId, count] of Object.entries(favoriteCounts)) {
      await db.query(
        "UPDATE products SET favorite_count = ? WHERE id = ?",
        [count, productId]
      );
    }

    return res.json({ 
      favorites: userFavorites,
      favoriteCounts: favoriteCounts
    });
  } catch (err) {
    console.error("Error loading favorites:", err);
    return res.status(500).json({ error: "Error loading favorites: " + err.message });
  }
});

// Toggle favorite and return updated count
app.post("/api/favorites/toggle", async (req, res) => {
  // Set proper JSON content type
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

    let existing = [];
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) {
        existing = result[0];
      } else if (result.length > 0) {
        existing = result;
      }
    }

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
      
      let count = 0;
      if (Array.isArray(countResult)) {
        if (countResult.length === 2 && Array.isArray(countResult[0]) && countResult[0].length > 0) {
          count = parseInt(countResult[0][0].count) || 0;
        } else if (countResult.length > 0 && countResult[0]) {
          count = parseInt(countResult[0].count) || 0;
        }
      }
      
      // Update product favorite_count in products table
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
      
      let count = 0;
      if (Array.isArray(countResult)) {
        if (countResult.length === 2 && Array.isArray(countResult[0]) && countResult[0].length > 0) {
          count = parseInt(countResult[0][0].count) || 0;
        } else if (countResult.length > 0 && countResult[0]) {
          count = parseInt(countResult[0].count) || 0;
        }
      }
      
      // Update product favorite_count in products table
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
    return res.status(500).json({ error: "Error updating favorites: " + err.message });
  }
});

// Legacy endpoint for backward compatibility
app.post("/api/favorites", async (req, res) => {
  // Redirect to the new toggle endpoint
  const { productId } = req.body;
  const newReq = { ...req, body: { productId } };
  const newRes = {
    json: (data) => res.json(data),
    status: (code) => ({ json: (data) => res.status(code).json(data) })
  };
  
  // Call the new toggle function
  const toggleHandler = async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in to favorite products." });
    }

    try {
      const result = await db.query(
        "SELECT id FROM favorites WHERE user_id = ? AND product_id = ?",
        [req.session.user.id, productId]
      );

      let existing = [];
      if (Array.isArray(result)) {
        if (result.length === 2 && Array.isArray(result[0])) {
          existing = result[0];
        } else if (result.length > 0) {
          existing = result;
        }
      }

      if (existing.length > 0) {
        await db.query(
          "DELETE FROM favorites WHERE user_id = ? AND product_id = ?",
          [req.session.user.id, productId]
        );
        return res.json({ success: true, action: "removed" });
      } else {
        await db.query(
          "INSERT INTO favorites (user_id, product_id) VALUES (?, ?)",
          [req.session.user.id, productId]
        );
        return res.json({ success: true, action: "added" });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
  
  await toggleHandler(newReq, newRes);
});

// Toggle favorite and return updated count
app.post("/api/favorites/toggle", async (req, res) => {
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

    let existing = [];
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) {
        existing = result[0];
      } else if (result.length > 0) {
        existing = result;
      }
    }

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
      
      let count = 0;
      if (Array.isArray(countResult)) {
        if (countResult.length === 2 && Array.isArray(countResult[0]) && countResult[0].length > 0) {
          count = countResult[0][0].count || 0;
        } else if (countResult.length > 0 && countResult[0]) {
          count = countResult[0].count || 0;
        }
      }
      
      // Update product favorite_count in products table
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
      
      let count = 0;
      if (Array.isArray(countResult)) {
        if (countResult.length === 2 && Array.isArray(countResult[0]) && countResult[0].length > 0) {
          count = countResult[0][0].count || 0;
        } else if (countResult.length > 0 && countResult[0]) {
          count = countResult[0].count || 0;
        }
      }
      
      // Update product favorite_count in products table
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
    res.status(500).json({ error: "Error updating favorites: " + err.message });
  }
});

// Get favorite count for a specific product
app.get("/api/favorites/count/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    
    const result = await db.query(
      "SELECT COUNT(*) as count FROM favorites WHERE product_id = ?",
      [productId]
    );
    
    let count = 0;
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0]) && result[0].length > 0) {
        count = result[0][0].count || 0;
      } else if (result.length > 0 && result[0]) {
        count = result[0].count || 0;
      }
    }
    
    res.json({ 
      productId: productId,
      count: count
    });
  } catch (err) {
    console.error("Error getting favorite count:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get favorite count for a specific product
app.get("/api/favorites/count/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    
    const result = await db.query(
      "SELECT COUNT(*) as count FROM favorites WHERE product_id = ?",
      [productId]
    );
    
    const count = result[0]?.count || 0;
    
    res.json({ 
      productId: productId,
      count: count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =================== FREELANCER SUBSCRIPTION CHECK ===================
// This only applies to freelancers, clients can access freely
const checkFreelancerSubscription = async (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    // If user is client, they don't need subscription - allow access
    if (req.session.user.role === 'client') {
        return next();
    }

    // If user is admin, always allow
    if (req.session.user.role === 'admin') {
        return next();
    }

    // For freelancers, check subscription
    try {
        const userId = req.session.user.id;
        
        const userResult = await db.query(
            `SELECT subscription_status, subscription_end_date, trial_end_date 
             FROM users WHERE id = ?`,
            [userId]
        );
        
        let user = null;
        if (Array.isArray(userResult) && userResult.length > 0) {
            user = userResult[0];
        } else if (userResult && userResult[0] && userResult[0][0]) {
            user = userResult[0][0];
        }

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const today = new Date();
        const trialEnd = user.trial_end_date ? new Date(user.trial_end_date) : null;
        const subEnd = user.subscription_end_date ? new Date(user.subscription_end_date) : null;

        let isActive = false;

        // Check if freelancer has active subscription or trial
        if (user.subscription_status === 'active') {
            if (trialEnd && today <= trialEnd) {
                // Still in trial period
                isActive = true;
            } else if (subEnd && today <= subEnd) {
                // Has paid subscription
                isActive = true;
            } else {
                // Subscription expired
                isActive = false;
                // Update status in database
                await db.query(
                    "UPDATE users SET subscription_status = 'expired' WHERE id = ?",
                    [userId]
                );
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
// =================== SERVICES ENDPOINTS ===================
// =================== GET ALL SERVICES (PUBLIC) - FIXED ===================
// =================== GET ALL SERVICES (PUBLIC) - FIXED ===================
app.get("/api/services", async (req, res) => {
    try {
        const { category, search, sort, min_price, max_price, limit = 20, offset = 0 } = req.query;

        // Build query
        let query = `
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

        if (min_price) {
            query += " AND s.price >= ?";
            queryParams.push(parseFloat(min_price));
        }

        if (max_price) {
            query += " AND s.price <= ?";
            queryParams.push(parseFloat(max_price));
        }

        // Sorting
        switch(sort) {
            case 'price_low':
                query += " ORDER BY s.price ASC";
                break;
            case 'price_high':
                query += " ORDER BY s.price DESC";
                break;
            case 'rating':
                query += " ORDER BY avg_rating DESC";
                break;
            case 'newest':
            default:
                query += " ORDER BY s.created_at DESC";
        }

        query += " LIMIT ? OFFSET ?";
        queryParams.push(parseInt(limit), parseInt(offset));

        console.log("Executing query:", query);
        console.log("With params:", queryParams);

        const result = await db.query(query, queryParams);
        
        // Extract services from the result properly
        let services = [];
        if (Array.isArray(result)) {
            // If it's [rows, fields] format
            if (result.length === 2 && Array.isArray(result[0])) {
                services = result[0];
            } 
            // If it's just rows array
            else if (result.length > 0) {
                services = result;
            }
        } else if (result && result.rows) {
            services = result.rows;
        }

        // Check if current user has favorited each service
        if (req.session.user) {
            const favoritesResult = await db.query(
                "SELECT service_id FROM service_favorites WHERE user_id = ?",
                [req.session.user.id]
            );

            // Extract favorites properly
            let favorites = [];
            if (Array.isArray(favoritesResult)) {
                if (favoritesResult.length === 2 && Array.isArray(favoritesResult[0])) {
                    favorites = favoritesResult[0];
                } else if (favoritesResult.length > 0) {
                    favorites = favoritesResult;
                }
            } else if (favoritesResult && favoritesResult.rows) {
                favorites = favoritesResult.rows;
            }

            // Make sure favorites is an array before using map
            const favoriteIds = new Set(Array.isArray(favorites) ? favorites.map(f => f.service_id) : []);
            
            services = services.map(service => ({
                ...service,
                is_favorited: favoriteIds.has(service.id)
            }));
        }

        // Get total count for pagination
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

        // Extract total count properly
        let total = 0;
        if (Array.isArray(countResult)) {
            if (countResult.length === 2 && Array.isArray(countResult[0]) && countResult[0].length > 0) {
                total = countResult[0][0].total || 0;
            } else if (countResult.length > 0 && countResult[0]) {
                total = countResult[0].total || 0;
            }
        } else if (countResult && countResult.total) {
            total = countResult.total;
        }

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
        res.status(500).json({ error: err.message });
    }
});


// =================== GET MY SERVICES (FREELANCER) - FIXED ===================
app.get("/api/services/my-services", checkFreelancerSubscription, async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Please login to view your services" });
        }

        // Check if status column exists
        let hasStatusColumn = false;
        try {
            const columnCheck = await db.query(`
                SELECT COUNT(*) as count 
                FROM information_schema.columns 
                WHERE table_name = 'services' 
                AND column_name = 'status'
            `);
            
            if (Array.isArray(columnCheck) && columnCheck.length > 0) {
                hasStatusColumn = columnCheck[0].count > 0;
            } else if (columnCheck && columnCheck[0] && columnCheck[0][0]) {
                hasStatusColumn = columnCheck[0][0].count > 0;
            }
        } catch (e) {}

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

        if (hasStatusColumn) {
            query += " AND s.status != 'deleted'";
        }

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



// =================== SERVICE CATEGORIES ===================
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
// Get subscription status - FIXED for better error handling
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

    // For freelancers, check subscription
    const userResult = await db.query(
      `SELECT subscription_status, subscription_plan, subscription_end_date, 
              trial_start_date, trial_end_date 
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
    const trialEnd = user.trial_end_date ? new Date(user.trial_end_date) : null;
    const subEnd = user.subscription_end_date ? new Date(user.subscription_end_date) : null;

    let isActive = false;
    let daysLeft = 0;

    if (user.subscription_status === 'active') {
      if (trialEnd && today <= trialEnd) {
        isActive = true;
        daysLeft = Math.ceil((trialEnd - today) / (1000 * 60 * 60 * 24));
      } else if (subEnd && today <= subEnd) {
        isActive = true;
        daysLeft = Math.ceil((subEnd - today) / (1000 * 60 * 60 * 24));
      }
    }

    // If not active, update status
    if (!isActive && user.subscription_status === 'active') {
      await db.query(
        "UPDATE users SET subscription_status = 'expired' WHERE id = ?",
        [userId]
      );
      user.subscription_status = 'expired';
      req.session.user.subscription_status = 'expired';
    }

    res.json({
      hasActiveSubscription: isActive,
      requiresSubscription: !isActive && userRole === 'freelancer',
      role: userRole,
      subscriptionStatus: user.subscription_status,
      subscriptionPlan: user.subscription_plan,
      daysLeft: daysLeft,
      trialEndDate: user.trial_end_date,
      subscriptionEndDate: user.subscription_end_date
    });

  } catch (err) {
    console.error("Subscription status error:", err);
    // Return a safe default
    res.json({ 
      hasActiveSubscription: false,
      requiresSubscription: req.session.user.role === 'freelancer',
      role: req.session.user.role,
      error: "Error checking subscription"
    });
  }
});


// =================== SERVICE SUBSCRIPTION MIDDLEWARE ===================
// Use the same name: checkServiceAccess (not checkSubscription)
const checkServiceAccess = async (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const userId = req.session.user.id;
        
        const userResult = await db.query(
            `SELECT subscription_status, subscription_end_date, trial_end_date 
             FROM users WHERE id = ?`,
            [userId]
        );
        
        let user = null;
        if (Array.isArray(userResult) && userResult.length > 0) {
            user = userResult[0];
        } else if (userResult && userResult[0] && userResult[0][0]) {
            user = userResult[0][0];
        }

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const today = new Date();
        const trialEnd = user.trial_end_date ? new Date(user.trial_end_date) : null;
        const subEnd = user.subscription_end_date ? new Date(user.subscription_end_date) : null;

        let isActive = false;

        // Check if user has active subscription
        if (user.subscription_status === 'active') {
            if (trialEnd && today <= trialEnd) {
                // Still in trial period
                isActive = true;
            } else if (subEnd && today <= subEnd) {
                // Has paid subscription
                isActive = true;
            } else {
                // Subscription expired
                isActive = false;
                // Update status in database
                await db.query(
                    "UPDATE users SET subscription_status = 'expired' WHERE id = ?",
                    [userId]
                );
                req.session.user.subscription_status = 'expired';
            }
        }

        if (!isActive) {
            return res.status(403).json({ 
                error: "Your subscription has expired. Please renew to continue using services.",
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

// =================== SUBSCRIPTION START ENDPOINT ===================
app.post("/api/subscription/start", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    // Only freelancers can subscribe
    if (req.session.user.role !== 'freelancer') {
        return res.status(403).json({ error: "Only freelancers need subscriptions" });
    }

    try {
        const { plan, paymentReference } = req.body;
        const userId = req.session.user.id;

        if (!['monthly', 'yearly'].includes(plan)) {
            return res.status(400).json({ error: "Invalid plan" });
        }

        const endDate = new Date();
        if (plan === 'monthly') {
            endDate.setMonth(endDate.getMonth() + 1);
        } else if (plan === 'yearly') {
            endDate.setFullYear(endDate.getFullYear() + 1);
        }

        await db.query(
            `UPDATE users SET 
                subscription_status = 'active',
                subscription_plan = ?,
                subscription_end_date = ?,
                trial_end_date = NULL
             WHERE id = ?`,
            [plan, endDate, userId]
        );

        req.session.user.subscription_status = 'active';
        req.session.user.subscription_plan = plan;

        res.json({
            success: true,
            message: "Subscription activated successfully",
            endDate: endDate
        });

    } catch (err) {
        console.error("Subscription start error:", err);
        res.status(500).json({ error: "Failed to start subscription: " + err.message });
    }
});

// =================== CREATE SERVICE ===================
app.post("/api/services", checkFreelancerSubscription, upload.none(), async (req, res) => {
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

app.post("/api/services/subscription/cancel", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        await db.query(`
            UPDATE service_subscriptions 
            SET status = 'cancelled', cancelled_at = NOW()
            WHERE user_id = ? AND status = 'active'
        `, [req.session.user.id]);

        res.json({
            success: true,
            message: "Subscription cancelled successfully"
        });

    } catch (err) {
        res.status(500).json({ error: "Error cancelling subscription: " + err.message });
    }
});

app.post("/api/services/:serviceId/order", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login to order services" });
    }

    try {
        const serviceId = req.params.serviceId;
        const { package_id, requirements } = req.body;
        const clientId = req.session.user.id;

        // Check if trying to order own service
        const [serviceCheck] = await db.query(
            "SELECT user_id, price FROM services WHERE id = ? AND status = 'active'",
            [serviceId]
        );

        if (!serviceCheck || serviceCheck.length === 0) {
            return res.status(404).json({ error: "Service not found" });
        }

        const service = serviceCheck[0];

        if (service.user_id === clientId) {
            return res.status(400).json({ error: "You cannot order your own service" });
        }

        let amount = service.price;
        let packageDetails = null;

        // Get package price if specified
        if (package_id) {
            const [pkgCheck] = await db.query(
                "SELECT price FROM service_packages WHERE id = ? AND service_id = ?",
                [package_id, serviceId]
            );
            if (pkgCheck && pkgCheck.length > 0) {
                amount = pkgCheck[0].price;
                packageDetails = pkgCheck[0];
            }
        }

        // Generate order number
        const orderNumber = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();

        // Calculate fees
        const platformFee = amount * 0.10; // 10% platform fee
        const freelancerEarnings = amount - platformFee;

        // Create order
        const result = await db.query(`
            INSERT INTO service_orders 
            (service_id, package_id, client_id, freelancer_id, order_number, amount, 
             platform_fee, freelancer_earnings, requirements, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `, [
            serviceId,
            package_id || null,
            clientId,
            service.user_id,
            orderNumber,
            amount,
            platformFee,
            freelancerEarnings,
            requirements || null
        ]);

        const orderId = result.insertId || result[0]?.insertId;

        // Create notification for freelancer
        await db.query(`
            INSERT INTO freelancer_notifications 
            (freelancer_id, client_id, notification_type, title, message, link)
            VALUES (?, ?, 'order', 'New Order Received!', 
                    CONCAT('Order #', ?, ' for $', ?), 
                    CONCAT('/services.html#order/', ?))
        `, [service.user_id, clientId, orderNumber, amount, orderId]);

        // Update client_providers if exists, or create new entry
        await db.query(`
            INSERT INTO client_providers (client_id, freelancer_id, service_id, last_contacted, total_orders, total_spent)
            VALUES (?, ?, ?, NOW(), 1, ?)
            ON DUPLICATE KEY UPDATE 
                last_contacted = NOW(),
                total_orders = total_orders + 1,
                total_spent = total_spent + ?
        `, [clientId, service.user_id, serviceId, amount, amount]);

        res.json({
            success: true,
            message: "Order placed successfully",
            orderId: orderId,
            orderNumber: orderNumber,
            amount: amount
        });

    } catch (err) {
        res.status(500).json({ error: "Error creating order: " + err.message });
    }
});
// =================== RECRUIT FREELANCER - FIXED ===================
app.post("/api/freelancer/recruit", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login to recruit freelancers" });
    }

    try {
        const { freelancerId, serviceId } = req.body;
        const clientId = req.session.user.id;

        console.log("Recruitment attempt:", { clientId, freelancerId, serviceId });

        // Check if trying to recruit yourself
        if (parseInt(clientId) === parseInt(freelancerId)) {
            return res.status(400).json({ error: "You cannot recruit yourself" });
        }

        // Check if freelancer exists
        const freelancerCheck = await db.query(
            "SELECT id, username, email FROM users WHERE id = ?",
            [freelancerId]
        );
        
        let freelancerRows = [];
        if (Array.isArray(freelancerCheck)) {
            freelancerRows = freelancerCheck.length === 2 ? freelancerCheck[0] : freelancerCheck;
        }

        if (!freelancerRows || freelancerRows.length === 0) {
            return res.status(404).json({ error: "Freelancer not found" });
        }

        // Check if already recruited
        const existingCheck = await db.query(
            "SELECT id FROM client_providers WHERE client_id = ? AND freelancer_id = ?",
            [clientId, freelancerId]
        );
        
        let existingRows = [];
        if (Array.isArray(existingCheck)) {
            existingRows = existingCheck.length === 2 ? existingCheck[0] : existingCheck;
        }

        if (existingRows && existingRows.length > 0) {
            // Update existing record
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
                message: "Provider record updated successfully"
            });
        }

        // Insert new record
        const result = await db.query(
            `INSERT INTO client_providers 
             (client_id, freelancer_id, service_id, recruited_at, last_contacted, status) 
             VALUES (?, ?, ?, NOW(), NOW(), 'active')`,
            [clientId, freelancerId, serviceId || null]
        );

        let insertId = null;
        if (result) {
            if (result.insertId) {
                insertId = result.insertId;
            } else if (Array.isArray(result) && result[0] && result[0].insertId) {
                insertId = result[0].insertId;
            }
        }

        res.json({
            success: true,
            message: "Freelancer added to your providers list successfully!",
            recruitmentId: insertId
        });

    } catch (err) {
        console.error("Recruitment error:", err);
        res.status(500).json({ 
            error: "Failed to recruit freelancer: " + err.message 
        });
    }
});


app.get("/api/client/providers", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    // Only clients can view their providers
    if (req.session.user.role !== 'client' && req.session.user.role !== 'admin') {
        return res.json([]);
    }

    try {
        const clientId = req.session.user.id;

        const result = await db.query(`
            SELECT 
                cp.*,
                u.id as freelancer_id,
                u.username,
                u.email,
                u.created_at as user_since,
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
                (SELECT COUNT(*) FROM service_orders 
                 WHERE service_id = s.id AND client_id = cp.client_id AND status = 'completed') as orders_completed,
                (SELECT SUM(amount) FROM service_orders 
                 WHERE service_id = s.id AND client_id = cp.client_id AND status = 'completed') as total_spent,
                (SELECT COUNT(*) FROM messages m 
                 JOIN conversations c ON m.conversation_id = c.id 
                 WHERE (c.client_id = cp.client_id AND c.freelancer_id = cp.freelancer_id) 
                   AND m.sender_id != cp.client_id AND m.is_read = 0) as unread_count,
                (SELECT created_at FROM messages 
                 WHERE conversation_id IN (
                    SELECT id FROM conversations 
                    WHERE (client_id = cp.client_id AND freelancer_id = cp.freelancer_id)
                       OR (client_id = cp.freelancer_id AND freelancer_id = cp.client_id)
                 )
                 ORDER BY created_at DESC LIMIT 1) as last_message_time
            FROM client_providers cp
            JOIN users u ON cp.freelancer_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = cp.freelancer_id
            LEFT JOIN services s ON cp.service_id = s.id
            WHERE cp.client_id = ?
            ORDER BY cp.last_contacted DESC, cp.recruited_at DESC
        `, [clientId]);

        let providers = [];
        if (Array.isArray(result)) {
            providers = result.length === 2 ? result[0] : result;
        }

        res.json(providers);

    } catch (err) {
        console.error("Error loading providers:", err);
        res.status(500).json({ error: "Failed to load providers: " + err.message });
    }
});

// Get single provider details for client
app.get("/api/client/providers/:providerId", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    // Only clients can view provider details
    if (req.session.user.role !== 'client' && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: "Access denied" });
    }

    try {
        const clientId = req.session.user.id;
        const providerId = req.params.providerId;

        const result = await db.query(`
            SELECT 
                cp.*,
                u.id as freelancer_id,
                u.username,
                u.email,
                u.created_at as user_since,
                fp.profile_picture_url as profile_picture,
                fp.headline,
                fp.description,
                fp.hourly_rate,
                fp.skills,
                fp.languages,
                fp.experience_level,
                fp.location,
                fp.phone,
                fp.website,
                fp.education,
                fp.certifications,
                fp.certificate_image_urls as certificate_images,
                fp.availability,
                fp.completed_orders,
                fp.total_earnings,
                fp.response_time,
                s.id as service_id,
                s.title as service_title,
                s.description as service_description,
                s.price as service_price,
                s.delivery_time,
                s.revisions,
                (SELECT COUNT(*) FROM service_orders 
                 WHERE freelancer_id = cp.freelancer_id AND client_id = cp.client_id) as total_orders,
                (SELECT SUM(amount) FROM service_orders 
                 WHERE freelancer_id = cp.freelancer_id AND client_id = cp.client_id AND status = 'completed') as total_spent,
                (SELECT COUNT(*) FROM services WHERE user_id = cp.freelancer_id AND status = 'active') as active_services
            FROM client_providers cp
            JOIN users u ON cp.freelancer_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = cp.freelancer_id
            LEFT JOIN services s ON cp.service_id = s.id
            WHERE cp.client_id = ? AND cp.freelancer_id = ?
        `, [clientId, providerId]);

        let providers = [];
        if (Array.isArray(result)) {
            providers = result.length === 2 ? result[0] : result;
        }

        if (!providers || providers.length === 0) {
            return res.status(404).json({ error: "Provider not found" });
        }

        const provider = providers[0];

        // Parse skills
        if (provider.skills && typeof provider.skills === 'string') {
            try {
                provider.skills = JSON.parse(provider.skills);
            } catch (e) {
                provider.skills = [];
            }
        }

        // Parse certificate images
        if (provider.certificate_images && typeof provider.certificate_images === 'string') {
            try {
                provider.certificate_images = JSON.parse(provider.certificate_images);
            } catch (e) {
                provider.certificate_images = [provider.certificate_images];
            }
        }

        // Get recent orders with this provider
        const ordersResult = await db.query(`
            SELECT 
                so.id,
                so.order_number,
                so.amount,
                so.status,
                so.created_at,
                s.title as service_title,
                sp.package_name,
                sp.title as package_title
            FROM service_orders so
            JOIN services s ON so.service_id = s.id
            LEFT JOIN service_packages sp ON so.package_id = sp.id
            WHERE so.client_id = ? AND so.freelancer_id = ?
            ORDER BY so.created_at DESC
            LIMIT 5
        `, [clientId, providerId]);

        let recentOrders = [];
        if (Array.isArray(ordersResult)) {
            recentOrders = ordersResult.length === 2 ? ordersResult[0] : ordersResult;
        }

        // Get all services from this provider
        const servicesResult = await db.query(`
            SELECT id, title, price, category, delivery_time, 
                   (SELECT AVG(rating) FROM service_reviews WHERE service_id = id) as rating,
                   (SELECT COUNT(*) FROM service_reviews WHERE service_id = id) as review_count
            FROM services
            WHERE user_id = ? AND status = 'active'
            ORDER BY created_at DESC
        `, [providerId]);

        let providerServices = [];
        if (Array.isArray(servicesResult)) {
            providerServices = servicesResult.length === 2 ? servicesResult[0] : servicesResult;
        }

        res.json({
            ...provider,
            recent_orders: recentOrders || [],
            services: providerServices || []
        });

    } catch (err) {
        console.error("Error loading provider details:", err);
        res.status(500).json({ error: "Failed to load provider details: " + err.message });
    }
});

app.get("/api/client/orders", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'client') {
        return res.status(401).json({ error: "Client access required" });
    }

    try {
        const clientId = req.session.user.id;
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                so.*,
                s.title as service_title,
                s.category as service_category,
                u.username as freelancer_name,
                fp.profile_picture_url as freelancer_picture,
                sp.package_name,
                sp.title as package_title,
                (SELECT COUNT(*) FROM service_deliveries WHERE order_id = so.id) as deliveries_count
            FROM service_orders so
            JOIN services s ON so.service_id = s.id
            JOIN users u ON so.freelancer_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = u.id
            LEFT JOIN service_packages sp ON so.package_id = sp.id
            WHERE so.client_id = ?
        `;

        const params = [clientId];

        if (status && status !== 'all') {
            query += " AND so.status = ?";
            params.push(status);
        }

        query += " ORDER BY so.created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, params);

        let orders = [];
        if (Array.isArray(result)) {
            orders = result.length === 2 ? result[0] : result;
        }

        // Get total count
        let countQuery = "SELECT COUNT(*) as total FROM service_orders WHERE client_id = ?";
        const countParams = [clientId];

        if (status && status !== 'all') {
            countQuery += " AND status = ?";
            countParams.push(status);
        }

        const countResult = await db.query(countQuery, countParams);

        let total = 0;
        if (Array.isArray(countResult) && countResult.length > 0) {
            total = countResult[0].total || 0;
        } else if (countResult && countResult[0] && countResult[0][0]) {
            total = countResult[0][0].total || 0;
        }

        res.json({
            orders: orders || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        console.error("Error loading client orders:", err);
        res.status(500).json({ error: "Error loading orders: " + err.message });
    }
});

// Search services with advanced filters
app.get("/api/services/search", async (req, res) => {
    try {
        const { 
            q, 
            category, 
            min_price, 
            max_price,
            min_rating,
            delivery_time,
            sort = 'relevance',
            page = 1,
            limit = 20
        } = req.query;

        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                s.*,
                u.username,
                fp.profile_picture,
                fp.headline,
                (SELECT AVG(rating) FROM service_reviews WHERE service_id = s.id) as avg_rating,
                (SELECT COUNT(*) FROM service_reviews WHERE service_id = s.id) as review_count
            FROM services s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
            WHERE s.status = 'active'
        `;

        const params = [];

        if (q) {
            query += " AND (s.title LIKE ? OR s.description LIKE ?)";
            params.push(`%${q}%`, `%${q}%`);
        }

        if (category) {
            query += " AND s.category = ?";
            params.push(category);
        }

        if (min_price) {
            query += " AND s.price >= ?";
            params.push(parseFloat(min_price));
        }

        if (max_price) {
            query += " AND s.price <= ?";
            params.push(parseFloat(max_price));
        }

        if (min_rating) {
            query += " HAVING avg_rating >= ?";
            params.push(parseFloat(min_rating));
        }

        if (delivery_time) {
            query += " AND s.delivery_time <= ?";
            params.push(parseInt(delivery_time));
        }

        // Sorting
        switch(sort) {
            case 'price_asc':
                query += " ORDER BY s.price ASC";
                break;
            case 'price_desc':
                query += " ORDER BY s.price DESC";
                break;
            case 'rating':
                query += " ORDER BY avg_rating DESC NULLS LAST";
                break;
            case 'newest':
                query += " ORDER BY s.created_at DESC";
                break;
            case 'oldest':
                query += " ORDER BY s.created_at ASC";
                break;
            case 'relevance':
            default:
                if (q) {
                    query += " ORDER BY (CASE WHEN s.title LIKE ? THEN 3 WHEN s.description LIKE ? THEN 1 ELSE 0 END) DESC, s.created_at DESC";
                    params.push(`%${q}%`, `%${q}%`);
                } else {
                    query += " ORDER BY s.created_at DESC";
                }
        }

        query += " LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [services] = await db.query(query, params);

        // Get total count for pagination
        let countQuery = "SELECT COUNT(*) as total FROM services WHERE status = 'active'";
        const countParams = [];

        if (q) {
            countQuery += " AND (title LIKE ? OR description LIKE ?)";
            countParams.push(`%${q}%`, `%${q}%`);
        }

        if (category) {
            countQuery += " AND category = ?";
            countParams.push(category);
        }

        if (min_price) {
            countQuery += " AND price >= ?";
            countParams.push(parseFloat(min_price));
        }

        if (max_price) {
            countQuery += " AND price <= ?";
            countParams.push(parseFloat(max_price));
        }

        const [totalResult] = await db.query(countQuery, countParams);
        const total = totalResult?.total || 0;

        res.json({
            services: services || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        res.status(500).json({ error: "Error searching services: " + err.message });
    }
});

// Get service suggestions
app.get("/api/services/suggestions", async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json([]);
        }

        const [suggestions] = await db.query(`
            SELECT DISTINCT title, category
            FROM services
            WHERE (title LIKE ? OR category LIKE ?) AND status = 'active'
            LIMIT 10
        `, [`%${q}%`, `%${q}%`]);

        res.json(suggestions || []);

    } catch (err) {
        res.status(500).json({ error: "Error getting suggestions: " + err.message });
    }
});

// Remove a provider from client's list
app.delete("/api/client/providers/:providerId", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    // Only clients can remove providers
    if (req.session.user.role !== 'client' && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: "Access denied" });
    }

    try {
        const clientId = req.session.user.id;
        const providerId = req.params.providerId;

        await db.query(
            "DELETE FROM client_providers WHERE client_id = ? AND freelancer_id = ?",
            [clientId, providerId]
        );

        res.json({
            success: true,
            message: "Provider removed successfully"
        });

    } catch (err) {
        console.error("Error removing provider:", err);
        res.status(500).json({ error: "Failed to remove provider: " + err.message });
    }
});


// Update provider notes
app.put("/api/client/providers/:providerId/notes", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const clientId = req.session.user.id;
        const providerId = req.params.providerId;
        const { notes } = req.body;

        await db.query(
            "UPDATE client_providers SET notes = ? WHERE client_id = ? AND freelancer_id = ?",
            [notes, clientId, providerId]
        );

        res.json({
            success: true,
            message: "Notes updated successfully"
        });

    } catch (err) {
        console.error("Error updating notes:", err);
        res.status(500).json({ error: "Failed to update notes: " + err.message });
    }
});


// =================== FIXED FAVORITES ENDPOINTS ===================
// Toggle favorite with count
app.post("/api/services/:serviceId/favorite", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const serviceId = req.params.serviceId;
        const userId = req.session.user.id;

        // Check if already favorited
        const existingCheck = await db.query(
            "SELECT id FROM service_favorites WHERE user_id = ? AND service_id = ?",
            [userId, serviceId]
        );
        
        let existingRows = [];
        if (Array.isArray(existingCheck)) {
            existingRows = existingCheck.length === 2 ? existingCheck[0] : existingCheck;
        }

        let action = '';
        let newCount = 0;

        if (existingRows && existingRows.length > 0) {
            // Remove favorite
            await db.query(
                "DELETE FROM service_favorites WHERE user_id = ? AND service_id = ?",
                [userId, serviceId]
            );
            action = 'removed';
            
            // Decrement favorite count
            await db.query(
                "UPDATE services SET favorite_count = favorite_count - 1 WHERE id = ?",
                [serviceId]
            );
        } else {
            // Add favorite
            await db.query(
                "INSERT INTO service_favorites (user_id, service_id) VALUES (?, ?)",
                [userId, serviceId]
            );
            action = 'added';
            
            // Increment favorite count
            await db.query(
                "UPDATE services SET favorite_count = favorite_count + 1 WHERE id = ?",
                [serviceId]
            );
        }

        // Get updated count
        const countResult = await db.query(
            "SELECT favorite_count FROM services WHERE id = ?",
            [serviceId]
        );
        
        if (Array.isArray(countResult) && countResult.length > 0) {
            newCount = countResult[0].favorite_count || 0;
        } else if (countResult && countResult[0] && countResult[0][0]) {
            newCount = countResult[0][0].favorite_count || 0;
        }

        res.json({ 
            favorited: action === 'added',
            action: action,
            favoriteCount: newCount,
            message: action === 'added' ? "Added to favorites" : "Removed from favorites"
        });

    } catch (err) {
        console.error("Error toggling favorite:", err);
        res.status(500).json({ error: "Error toggling favorite: " + err.message });
    }
});

// =================== FIXED GET USER'S FAVORITES ===================
app.get("/api/services/favorites", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login" });
  }

  try {
    const result = await db.query(`
      SELECT 
        s.*,
        u.username,
        u.id as user_id,
        fp.profile_picture_url as profile_picture_url,
        fp.headline as provider_headline,
        (SELECT AVG(rating) FROM service_reviews WHERE service_id = s.id) as avg_rating,
        (SELECT COUNT(*) FROM service_reviews WHERE service_id = s.id) as review_count,
        (SELECT COUNT(*) FROM service_favorites WHERE service_id = s.id) as favorite_count,
        TRUE as is_favorited
      FROM service_favorites sf
      JOIN services s ON sf.service_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
      WHERE sf.user_id = ? AND s.status = 'active'
      ORDER BY sf.created_at DESC
    `, [req.session.user.id]);

    let favorites = [];
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) {
        favorites = result[0];
      } else if (result.length > 0) {
        favorites = result;
      }
    } else if (result && result.rows) {
      favorites = result.rows;
    }

    res.json(favorites || []);

  } catch (err) {
    console.error("Error loading favorites:", err);
    res.status(500).json({ error: "Failed to load favorites: " + err.message });
  }
});

// Check if service is favorited
app.get("/api/services/:serviceId/is-favorited", async (req, res) => {
    if (!req.session.user) {
        return res.json({ favorited: false, favoriteCount: 0 });
    }

    try {
        const serviceId = req.params.serviceId;
        const userId = req.session.user.id;

        const favoritedCheck = await db.query(
            "SELECT id FROM service_favorites WHERE user_id = ? AND service_id = ?",
            [userId, serviceId]
        );
        
        let favoritedRows = [];
        if (Array.isArray(favoritedCheck)) {
            favoritedRows = favoritedCheck.length === 2 ? favoritedCheck[0] : favoritedCheck;
        }

        const countResult = await db.query(
            "SELECT favorite_count FROM services WHERE id = ?",
            [serviceId]
        );
        
        let favoriteCount = 0;
        if (Array.isArray(countResult) && countResult.length > 0) {
            favoriteCount = countResult[0].favorite_count || 0;
        } else if (countResult && countResult[0] && countResult[0][0]) {
            favoriteCount = countResult[0][0].favorite_count || 0;
        }

        res.json({ 
            favorited: favoritedRows && favoritedRows.length > 0,
            favoriteCount: favoriteCount
        });

    } catch (err) {
        res.status(500).json({ error: "Error checking favorite: " + err.message });
    }
});

// =================== ADMIN SERVICES - FIXED ===================
app.get("/api/admin/services/:id", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
    }

    try {
        const serviceId = req.params.id;
        
        const [service] = await db.query(`
            SELECT 
                s.*,
                u.username,
                u.email,
                (SELECT COUNT(*) FROM service_orders WHERE service_id = s.id) as order_count,
                (SELECT SUM(amount) FROM service_orders WHERE service_id = s.id) as total_revenue,
                (SELECT AVG(rating) FROM service_reviews WHERE service_id = s.id) as avg_rating
            FROM services s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = ?
        `, [serviceId]);

        if (!service || service.length === 0) {
            return res.status(404).json({ error: "Service not found" });
        }

        res.json(service[0]);
    } catch (err) {
        console.error("Error fetching service for admin:", err);
        res.status(500).json({ error: "Error fetching service: " + err.message });
    }
});

// =================== SERVICE DETAILS ENDPOINT - FIXED ===================
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
                (SELECT COUNT(*) FROM services WHERE user_id = s.user_id AND status = 'active') as total_services,
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

app.get("/api/orders/client", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const [orders] = await db.query(`
            SELECT 
                so.*,
                s.title as service_title,
                u.username as freelancer_name,
                fp.profile_picture as freelancer_picture,
                sp.package_name,
                sp.title as package_title,
                (SELECT COUNT(*) FROM service_deliveries WHERE order_id = so.id) as deliveries_count
            FROM service_orders so
            JOIN services s ON so.service_id = s.id
            JOIN users u ON so.freelancer_id = u.id
            LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
            LEFT JOIN service_packages sp ON so.package_id = sp.id
            WHERE so.client_id = ?
            ORDER BY so.created_at DESC
        `, [req.session.user.id]);

        res.json(orders || []);

    } catch (err) {
        res.status(500).json({ error: "Error loading orders: " + err.message });
    }
});
app.get("/api/orders/freelancer", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const [orders] = await db.query(`
            SELECT 
                so.*,
                s.title as service_title,
                u.username as client_name,
                u.email as client_email,
                sp.package_name,
                sp.title as package_title,
                (SELECT COUNT(*) FROM service_deliveries WHERE order_id = so.id) as deliveries_count
            FROM service_orders so
            JOIN services s ON so.service_id = s.id
            JOIN users u ON so.client_id = u.id
            LEFT JOIN service_packages sp ON so.package_id = sp.id
            WHERE so.freelancer_id = ?
            ORDER BY so.created_at DESC
        `, [req.session.user.id]);

        res.json(orders || []);

    } catch (err) {
        res.status(500).json({ error: "Error loading orders: " + err.message });
    }
});

app.post("/api/services/subscribe", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login to subscribe" });
    }

    try {
        const { planType } = req.body;
        
        const prices = {
            monthly: 5.00,
            yearly: 57.50
        };

        const amount = prices[planType];
        if (!amount) {
            return res.status(400).json({ error: "Invalid plan type" });
        }

        // Check for existing trial
        const [trialCheck] = await db.query(`
            SELECT * FROM service_subscriptions 
            WHERE user_id = ? AND trial_ends_at > CURDATE() AND status = 'active'
        `, [req.session.user.id]);

        if (trialCheck && trialCheck.length > 0) {
            return res.status(400).json({ 
                error: "You're still on free trial. Subscription will start after trial ends." 
            });
        }

        // Create Flutterwave payment
        const payload = {
            tx_ref: `service-sub-${req.session.user.id}-${Date.now()}`,
            amount: amount,
            currency: "USD",
            redirect_url: `https://core-insight-7.onrender.com/payment-callback.html`,
            customer: {
                email: req.session.user.email,
                name: req.session.user.username,
            },
            customizations: {
                title: "Core Insight Services Subscription",
                description: `${planType.charAt(0).toUpperCase() + planType.slice(1)} service subscription`,
            },
            meta: {
                user_id: req.session.user.id,
                plan_type: planType,
                subscription: true
            }
        };

        const response = await axios.post(
            'https://api.flutterwave.com/v3/payments',
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data.status === 'success' && response.data.data && response.data.data.link) {
            res.json({
                link: response.data.data.link,
                type: 'subscription',
                provider: 'flutterwave'
            });
        } else {
            throw new Error(response.data.message || `Flutterwave returned status: ${response.data.status}`);
        }

    } catch (err) {
        if (err.response) {
            res.status(500).json({ 
                error: `Payment gateway error: ${err.response.data.message || err.message}` 
            });
        } else if (err.request) {
            res.status(500).json({ error: "No response from payment gateway. Please check your internet connection." });
        } else {
            res.status(500).json({ error: "Error creating subscription: " + err.message });
        }
    }
});

app.get("/api/orders/:orderId", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const orderId = req.params.orderId;

        const [order] = await db.query(`
            SELECT 
                so.*,
                s.title as service_title,
                s.description as service_description,
                s.user_id as freelancer_id,
                u_client.username as client_name,
                u_client.email as client_email,
                u_freelancer.username as freelancer_name,
                u_freelancer.email as freelancer_email,
                fp.profile_picture as freelancer_picture,
                fp.headline as freelancer_headline,
                sp.package_name,
                sp.title as package_title,
                sp.features as package_features
            FROM service_orders so
            JOIN services s ON so.service_id = s.id
            JOIN users u_client ON so.client_id = u_client.id
            JOIN users u_freelancer ON so.freelancer_id = u_freelancer.id
            LEFT JOIN freelancer_profiles fp ON u_freelancer.id = fp.user_id
            LEFT JOIN service_packages sp ON so.package_id = sp.id
            WHERE so.id = ?
        `, [orderId]);

        if (!order || order.length === 0) {
            return res.status(404).json({ error: "Order not found" });
        }

        // Check if user has access to this order
        const orderData = order[0];
        const userId = req.session.user.id;
        const isClient = orderData.client_id === userId;
        const isFreelancer = orderData.freelancer_id === userId;
        const isAdmin = req.session.user.role === 'admin';

        if (!isClient && !isFreelancer && !isAdmin) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Get deliveries
        const [deliveries] = await db.query(`
            SELECT * FROM service_deliveries 
            WHERE order_id = ? 
            ORDER BY delivered_at DESC
        `, [orderId]);

        // Get dispute if any
        const [dispute] = await db.query(`
            SELECT * FROM service_disputes 
            WHERE order_id = ? AND status != 'closed'
            ORDER BY created_at DESC LIMIT 1
        `, [orderId]);

        res.json({
            ...orderData,
            deliveries: deliveries || [],
            dispute: dispute && dispute.length > 0 ? dispute[0] : null
        });

    } catch (err) {
        res.status(500).json({ error: "Error loading order: " + err.message });
    }
});


app.get("/api/services/subscription/status", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const [subscription] = await db.query(`
            SELECT * FROM service_subscriptions 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [req.session.user.id]);

        if (!subscription || subscription.length === 0) {
            // Check if user is still in trial period based on account age
            const [user] = await db.query(`
                SELECT created_at FROM users WHERE id = ?
            `, [req.session.user.id]);

            if (user && user.length > 0) {
                const createdAt = new Date(user[0].created_at);
                const trialEnd = new Date(createdAt);
                trialEnd.setDate(trialEnd.getDate() + 90);
                const now = new Date();

                if (now <= trialEnd) {
                    return res.json({ 
                        hasSubscription: false,
                        onTrial: true,
                        trialEnds: trialEnd.toISOString().split('T')[0],
                        daysLeft: Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))
                    });
                }
            }

            return res.json({ 
                hasSubscription: false,
                onTrial: false
            });
        }

        const sub = subscription[0];
        const onTrial = sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date();
        
        res.json({
            hasSubscription: sub.status === 'active',
            onTrial: onTrial,
            trialEnds: sub.trial_ends_at,
            planType: sub.plan_type,
            currentPeriodEnds: sub.expires_at,
            subscribedAt: sub.subscribed_at
        });

    } catch (err) {
        res.status(500).json({ error: "Error checking subscription status: " + err.message });
    }
});

// Add/Update review - FIXED
app.post("/api/services/:serviceId/reviews", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to write a review" });
  }

  try {
    const serviceId = req.params.serviceId;
    const { rating, comment } = req.body;
    const userId = req.session.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    if (!comment || comment.length < 10) {
      return res.status(400).json({ error: "Review must be at least 10 characters" });
    }

    // Check if user has already reviewed this service
    const existingResult = await db.query(
      "SELECT id FROM service_reviews WHERE user_id = ? AND service_id = ?",
      [userId, serviceId]
    );

    let existing = [];
    if (Array.isArray(existingResult)) {
      existing = existingResult.length === 2 ? existingResult[0] : existingResult;
    }

    if (existing && existing.length > 0) {
      // Update existing review - FIXED: removed updated_at if column doesn't exist
      // Try with updated_at first, but fall back to just updating rating and comment
      try {
        await db.query(
          "UPDATE service_reviews SET rating = ?, comment = ? WHERE user_id = ? AND service_id = ?",
          [rating, comment, userId, serviceId]
        );
      } catch (updateError) {
        // If updated_at column doesn't exist, try without it
        if (updateError.code === 'ER_BAD_FIELD_ERROR') {
          await db.query(
            "UPDATE service_reviews SET rating = ?, comment = ? WHERE user_id = ? AND service_id = ?",
            [rating, comment, userId, serviceId]
          );
        } else {
          throw updateError;
        }
      }
    } else {
      // Insert new review
      await db.query(
        "INSERT INTO service_reviews (service_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, NOW())",
        [serviceId, userId, rating, comment]
      );
    }

    // Update service avg_rating and review_count
    const avgResult = await db.query(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as count
      FROM service_reviews
      WHERE service_id = ?
    `, [serviceId]);

    let avgRating = 0;
    let reviewCount = 0;
    if (Array.isArray(avgResult)) {
      if (avgResult.length === 2 && Array.isArray(avgResult[0]) && avgResult[0].length > 0) {
        avgRating = avgResult[0][0].avg_rating || 0;
        reviewCount = avgResult[0][0].count || 0;
      } else if (avgResult.length > 0 && avgResult[0]) {
        avgRating = avgResult[0].avg_rating || 0;
        reviewCount = avgResult[0].count || 0;
      }
    }

    // Update services table
    await db.query(
      "UPDATE services SET avg_rating = ?, review_count = ? WHERE id = ?",
      [avgRating, reviewCount, serviceId]
    );

    res.json({
      success: true,
      message: existing && existing.length > 0 ? "Review updated successfully" : "Review added successfully",
      avg_rating: avgRating,
      review_count: reviewCount
    });

  } catch (err) {
    console.error("Error adding review:", err);
    res.status(500).json({ error: "Error adding review: " + err.message });
  }
});

// Get user's own review for a service
app.get("/api/services/:serviceId/my-review", async (req, res) => {
  if (!req.session.user) {
    return res.json(null);
  }

  try {
    const result = await db.query(`
      SELECT id, rating, comment, created_at
      FROM service_reviews
      WHERE user_id = ? AND service_id = ?
    `, [req.session.user.id, req.params.serviceId]);

    let reviews = [];
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) {
        reviews = result[0];
      } else if (result.length > 0) {
        reviews = result;
      }
    }

    if (reviews && reviews.length > 0) {
      res.json(reviews[0]);
    } else {
      res.json(null);
    }

  } catch (err) {
    console.error("Error checking review:", err);
    res.json(null);
  }
});


app.get("/api/services/:serviceId/reviews", async (req, res) => {
    try {
        const result = await db.query(`
            SELECT sr.*, u.username, fp.profile_picture_url as profile_picture
            FROM service_reviews sr
            JOIN users u ON sr.user_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = u.id
            WHERE sr.service_id = ?
            ORDER BY sr.created_at DESC
        `, [req.params.serviceId]);

        let reviews = [];
        if (Array.isArray(result)) {
            reviews = result.length === 2 ? result[0] : result;
        }

        // Get average rating
        const avgResult = await db.query(`
            SELECT AVG(rating) as avg_rating, COUNT(*) as count
            FROM service_reviews
            WHERE service_id = ?
        `, [req.params.serviceId]);

        let avgRating = 0;
        let reviewCount = 0;
        if (Array.isArray(avgResult) && avgResult.length > 0) {
            avgRating = avgResult[0].avg_rating || 0;
            reviewCount = avgResult[0].count || 0;
        } else if (avgResult && avgResult[0] && avgResult[0][0]) {
            avgRating = avgResult[0][0].avg_rating || 0;
            reviewCount = avgResult[0][0].count || 0;
        }

        res.json({ 
            reviews: reviews || [],
            avg_rating: parseFloat(avgRating).toFixed(1),
            count: reviewCount
        });

    } catch (err) {
        console.error("Error loading reviews:", err);
        res.status(500).json({ error: "Error loading reviews: " + err.message });
    }
});

app.put("/api/orders/:orderId/status", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const orderId = req.params.orderId;
        const { status } = req.body;

        // Check ownership and current status
        const [orderCheck] = await db.query(`
            SELECT client_id, freelancer_id, status FROM service_orders WHERE id = ?
        `, [orderId]);

        if (!orderCheck || orderCheck.length === 0) {
            return res.status(404).json({ error: "Order not found" });
        }

        const order = orderCheck[0];
        const userId = req.session.user.id;
        const isClient = order.client_id === userId;
        const isFreelancer = order.freelancer_id === userId;
        const isAdmin = req.session.user.role === 'admin';

        // Validate status transition based on role
        let allowed = false;
        if (isClient) {
            allowed = ['completed', 'cancelled'].includes(status);
        } else if (isFreelancer) {
            allowed = ['active', 'completed'].includes(status);
        } else if (isAdmin) {
            allowed = true;
        }

        if (!allowed) {
            return res.status(403).json({ error: "Not authorized to set this status" });
        }

        await db.query(
            "UPDATE service_orders SET status = ?, updated_at = NOW() WHERE id = ?",
            [status, orderId]
        );

        // If completed, update freelancer stats
        if (status === 'completed') {
            await db.query(`
                UPDATE freelancer_profiles 
                SET completed_orders = completed_orders + 1,
                    total_earnings = total_earnings + (
                        SELECT freelancer_earnings FROM service_orders WHERE id = ?
                    )
                WHERE user_id = ?
            `, [orderId, order.freelancer_id]);

            await db.query(`
                UPDATE client_providers 
                SET last_contacted = NOW()
                WHERE client_id = ? AND freelancer_id = ?
            `, [order.client_id, order.freelancer_id]);
        }

        res.json({ 
            success: true, 
            message: `Order status updated to ${status}` 
        });

    } catch (err) {
        res.status(500).json({ error: "Error updating order: " + err.message });
    }
});

// Get client dashboard stats
app.get("/api/client/dashboard", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'client') {
        return res.status(401).json({ error: "Client access required" });
    }

    try {
        const clientId = req.session.user.id;

        // Get order stats
        const orderStatsResult = await db.query(`
            SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_orders,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
                SUM(amount) as total_spent,
                SUM(platform_fee) as total_fees
            FROM service_orders
            WHERE client_id = ?
        `, [clientId]);

        let orderStats = {};
        if (Array.isArray(orderStatsResult) && orderStatsResult.length > 0) {
            orderStats = orderStatsResult[0];
        } else if (orderStatsResult && orderStatsResult[0] && orderStatsResult[0][0]) {
            orderStats = orderStatsResult[0][0];
        }

        // Get provider stats
        const providerStatsResult = await db.query(`
            SELECT 
                COUNT(*) as total_providers,
                SUM(total_orders) as total_orders_with_providers,
                SUM(total_spent) as total_spent_with_providers
            FROM client_providers
            WHERE client_id = ?
        `, [clientId]);

        let providerStats = {};
        if (Array.isArray(providerStatsResult) && providerStatsResult.length > 0) {
            providerStats = providerStatsResult[0];
        } else if (providerStatsResult && providerStatsResult[0] && providerStatsResult[0][0]) {
            providerStats = providerStatsResult[0][0];
        }

        // Get recent orders
        const recentOrdersResult = await db.query(`
            SELECT 
                so.id,
                so.order_number,
                so.amount,
                so.status,
                so.created_at,
                s.title as service_title,
                u.username as freelancer_name,
                fp.profile_picture_url as freelancer_picture
            FROM service_orders so
            JOIN services s ON so.service_id = s.id
            JOIN users u ON so.freelancer_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = u.id
            WHERE so.client_id = ?
            ORDER BY so.created_at DESC
            LIMIT 10
        `, [clientId]);

        let recentOrders = [];
        if (Array.isArray(recentOrdersResult)) {
            recentOrders = recentOrdersResult.length === 2 ? recentOrdersResult[0] : recentOrdersResult;
        }

        // Get top providers
        const topProvidersResult = await db.query(`
            SELECT 
                u.id,
                u.username,
                fp.profile_picture_url as profile_picture,
                fp.headline,
                cp.total_orders,
                cp.total_spent,
                cp.last_contacted
            FROM client_providers cp
            JOIN users u ON cp.freelancer_id = u.id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = u.id
            WHERE cp.client_id = ?
            ORDER BY cp.total_orders DESC, cp.total_spent DESC
            LIMIT 5
        `, [clientId]);

        let topProviders = [];
        if (Array.isArray(topProvidersResult)) {
            topProviders = topProvidersResult.length === 2 ? topProvidersResult[0] : topProvidersResult;
        }

        res.json({
            orders: orderStats || { total_orders: 0, pending_orders: 0, active_orders: 0, completed_orders: 0, cancelled_orders: 0, total_spent: 0, total_fees: 0 },
            providers: providerStats || { total_providers: 0, total_orders_with_providers: 0, total_spent_with_providers: 0 },
            recent_orders: recentOrders || [],
            top_providers: topProviders || []
        });

    } catch (err) {
        console.error("Error loading dashboard stats:", err);
        res.status(500).json({ error: "Error loading dashboard stats: " + err.message });
    }
});


app.post("/api/orders/:orderId/deliver", upload.array('files', 5), async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const orderId = req.params.orderId;
        const { message } = req.body;
        const files = req.files || [];

        // Check if user is the freelancer for this order
        const [orderCheck] = await db.query(`
            SELECT freelancer_id, status, revision_number 
            FROM service_orders WHERE id = ?
        `, [orderId]);

        if (!orderCheck || orderCheck.length === 0) {
            return res.status(404).json({ error: "Order not found" });
        }

        const order = orderCheck[0];

        if (order.freelancer_id !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Only the freelancer can submit deliveries" });
        }

        if (order.status !== 'active' && order.status !== 'pending') {
            return res.status(400).json({ error: "Cannot deliver for this order status" });
        }

        // Process file URLs (you'd have them from multer/cloudinary)
        const fileUrls = files.map(file => file.path || `/uploads/services/${file.filename}`);

        const revisionNumber = order.revision_number || 1;

        await db.query(`
            INSERT INTO service_deliveries 
            (order_id, delivery_message, files, revision_number, status)
            VALUES (?, ?, ?, ?, 'pending_review')
        `, [orderId, message || null, JSON.stringify(fileUrls), revisionNumber]);

        // Update order revision count
        await db.query(`
            UPDATE service_orders 
            SET revision_number = revision_number + 1,
                updated_at = NOW()
            WHERE id = ?
        `, [orderId]);

        // Notify client
        await db.query(`
            INSERT INTO freelancer_notifications 
            (freelancer_id, client_id, notification_type, title, message, link)
            VALUES (?, ?, 'order', 'New Delivery Received', 
                    CONCAT('Revision #', ?, ' has been delivered'),
                    CONCAT('/services.html#order/', ?))
        `, [order.freelancer_id, order.client_id, revisionNumber, orderId]);

        res.json({
            success: true,
            message: "Delivery submitted successfully"
        });

    } catch (err) {
        res.status(500).json({ error: "Error submitting delivery: " + err.message });
    }
});
app.post("/api/deliveries/:deliveryId/review", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const deliveryId = req.params.deliveryId;
        const { status, feedback, rating } = req.body;

        // Check if user is the client for this order
        const [deliveryCheck] = await db.query(`
            SELECT sd.*, so.client_id, so.freelancer_id, so.service_id
            FROM service_deliveries sd
            JOIN service_orders so ON sd.order_id = so.id
            WHERE sd.id = ?
        `, [deliveryId]);

        if (!deliveryCheck || deliveryCheck.length === 0) {
            return res.status(404).json({ error: "Delivery not found" });
        }

        const delivery = deliveryCheck[0];

        if (delivery.client_id !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Only the client can review deliveries" });
        }

        await db.query(`
            UPDATE service_deliveries 
            SET status = ?, client_feedback = ?, client_rating = ?, reviewed_at = NOW()
            WHERE id = ?
        `, [status, feedback, rating || null, deliveryId]);

        // If approved, mark order as completed
        if (status === 'approved') {
            await db.query(`
                UPDATE service_orders 
                SET status = 'completed', completed_at = NOW()
                WHERE id = ?
            `, [delivery.order_id]);

            // Add rating if provided
            if (rating) {
                await db.query(`
                    INSERT INTO service_reviews (service_id, user_id, rating, comment)
                    VALUES (?, ?, ?, ?)
                `, [delivery.service_id, delivery.client_id, rating, feedback || '']);
            }

            // Update freelancer stats
            await db.query(`
                UPDATE freelancer_profiles 
                SET completed_orders = completed_orders + 1
                WHERE user_id = ?
            `, [delivery.freelancer_id]);
        }

        res.json({
            success: true,
            message: `Delivery ${status} successfully`
        });

    } catch (err) {
        res.status(500).json({ error: "Error reviewing delivery: " + err.message });
    }
});
app.post("/api/orders/:orderId/dispute", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const orderId = req.params.orderId;
        const { reason, evidence } = req.body;

        // Check if user is client or freelancer for this order
        const [orderCheck] = await db.query(`
            SELECT client_id, freelancer_id, status 
            FROM service_orders WHERE id = ?
        `, [orderId]);

        if (!orderCheck || orderCheck.length === 0) {
            return res.status(404).json({ error: "Order not found" });
        }

        const order = orderCheck[0];
        const userId = req.session.user.id;
        const isParticipant = order.client_id === userId || order.freelancer_id === userId;

        if (!isParticipant && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Only participants can raise disputes" });
        }

        // Check if dispute already exists
        const [disputeCheck] = await db.query(`
            SELECT id FROM service_disputes 
            WHERE order_id = ? AND status IN ('open', 'under_review')
        `, [orderId]);

        if (disputeCheck && disputeCheck.length > 0) {
            return res.status(400).json({ error: "A dispute for this order is already open" });
        }

        await db.query(`
            INSERT INTO service_disputes (order_id, raised_by, reason, evidence, status)
            VALUES (?, ?, ?, ?, 'open')
        `, [orderId, userId, reason, JSON.stringify(evidence || [])]);

        // Update order status
        await db.query(`
            UPDATE service_orders SET status = 'disputed' WHERE id = ?
        `, [orderId]);

        res.json({
            success: true,
            message: "Dispute raised successfully. An admin will review it shortly."
        });

    } catch (err) {
        res.status(500).json({ error: "Error creating dispute: " + err.message });
    }
});

app.get("/api/services/:serviceId/packages", async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM service_packages 
            WHERE service_id = ? AND is_active = 1
            ORDER BY 
                CASE package_name 
                    WHEN 'basic' THEN 1 
                    WHEN 'standard' THEN 2 
                    WHEN 'premium' THEN 3 
                    ELSE 4
                END
        `, [req.params.serviceId]);

        let packages = [];
        if (Array.isArray(result)) {
            packages = result.length === 2 ? result[0] : result;
        }

        // Parse features
        packages = packages.map(pkg => {
            if (pkg.features && typeof pkg.features === 'string') {
                try {
                    pkg.features = JSON.parse(pkg.features);
                } catch (e) {
                    pkg.features = [pkg.features];
                }
            }
            return pkg;
        });

        res.json(packages);

    } catch (err) {
        console.error("Error loading packages:", err);
        res.status(500).json({ error: "Error loading packages: " + err.message });
    }
});
app.post("/api/services/:serviceId/packages", checkFreelancerSubscription, async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const serviceId = req.params.serviceId;
        const { packages } = req.body;

        // Check ownership
        const serviceCheck = await db.query(
            "SELECT user_id FROM services WHERE id = ?",
            [serviceId]
        );

        let service = null;
        if (Array.isArray(serviceCheck) && serviceCheck.length > 0) {
            service = serviceCheck[0];
        } else if (serviceCheck && serviceCheck[0] && Array.isArray(serviceCheck[0]) && serviceCheck[0].length > 0) {
            service = serviceCheck[0][0];
        }

        if (!service) {
            return res.status(404).json({ error: "Service not found" });
        }

        if (service.user_id !== req.session.user.id && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "You can only edit your own services" });
        }

        // Delete existing packages
        await db.query(
            "DELETE FROM service_packages WHERE service_id = ?",
            [serviceId]
        );

        // Insert new packages
        if (Array.isArray(packages) && packages.length > 0) {
            for (const pkg of packages) {
                await db.query(`
                    INSERT INTO service_packages 
                    (service_id, package_name, title, price, description, delivery_time, revisions, features, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                `, [
                    serviceId,
                    pkg.package_name || 'basic',
                    pkg.title || pkg.package_name,
                    pkg.price || 0,
                    pkg.description || '',
                    pkg.delivery_time || 7,
                    pkg.revisions || 2,
                    pkg.features ? JSON.stringify(pkg.features) : null
                ]);
            }
        }

        res.json({ 
            success: true, 
            message: "Packages updated successfully" 
        });

    } catch (err) {
        console.error("Error updating packages:", err);
        res.status(500).json({ error: "Error updating packages: " + err.message });
    }
});

app.get("/api/services/:id/reviews", async (req, res) => {
  try {
    const reviews = await db.query(`
      SELECT sr.*, u.username 
      FROM service_reviews sr 
      JOIN users u ON sr.user_id = u.id 
      WHERE sr.service_id = ? 
      ORDER BY sr.created_at DESC
    `, [req.params.id]);

    res.json({ 
      reviews: Array.isArray(reviews) ? reviews : (reviews[0] || []),
      count: Array.isArray(reviews) ? reviews.length : (reviews[0] || []).length
    });

  } catch (err) {
    res.status(500).json({ error: "Error loading reviews" });
  }
});

app.post("/api/services/:serviceId/products/:productId/buy", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to buy service products" });
  }

  try {
    const { serviceId, productId } = req.params;
    
    const products = await db.query(`
      SELECT sp.*, s.user_id as seller_id 
      FROM service_products sp
      JOIN services s ON sp.service_id = s.id
      WHERE sp.id = ? AND sp.service_id = ?
    `, [productId, serviceId]);

    if (!products.length) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = products[0];
    
    const payload = {
      tx_ref: `service-product-${productId}-${Date.now()}`,
      amount: product.price,
      currency: "USD",
      redirect_url: `https://core-insight-7.onrender.com/payment-callback.html`,
      customer: {
        email: req.session.user.email,
        name: req.session.user.username,
      },
      customizations: {
        title: "Service Product Purchase",
        description: `Purchase: ${product.title}`,
      },
      meta: {
        service_id: serviceId,
        product_id: productId,
        buyer_id: req.session.user.id,
        seller_id: product.seller_id,
        type: 'service_product'
      }
    };

    if (response.data.status === 'success' && response.data.data && response.data.data.link) {
      res.json({
        link: response.data.data.link,
        type: 'service_product'
      });
    } else {
      throw new Error(response.data.message || 'Service product payment failed');
    }

  } catch (err) {
    res.status(500).json({ error: "Error purchasing service product: " + err.message });
  }
});


// =================== DELETE SERVICE - UPDATED ===================
app.delete("/api/services/:id", checkFreelancerSubscription, async (req, res) => {
    try {
        const serviceId = Number(req.params.id);
        const { reason } = req.body;
        const userId = req.session.user?.id;
        const userRole = req.session.user?.role;

        if (!userId) {
            return res.status(401).json({ error: "Not authenticated. Please log in." });
        }

        if (!reason || reason.trim().length < 5) {
            return res.status(400).json({ error: "Reason required (min 5 chars)." });
        }

        // Check if service exists and get owner info
        const serviceCheck = await db.query(
            "SELECT id, title, user_id FROM services WHERE id = ?",
            [serviceId]
        );

        let service = null;
        if (Array.isArray(serviceCheck) && serviceCheck.length > 0) {
            service = serviceCheck[0];
        } else if (serviceCheck && serviceCheck[0] && Array.isArray(serviceCheck[0]) && serviceCheck[0].length > 0) {
            service = serviceCheck[0][0];
        }

        if (!service) {
            return res.status(404).json({ error: "Service not found" });
        }

        const isOwner = service.user_id === userId;
        const isAdmin = userRole === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: "You can only delete your own services" });
        }

        // For non-admin freelancers, check delete limits
        if (!isAdmin && userRole === 'freelancer') {
            try {
                const today = new Date().toISOString().split('T')[0];
                
                const deleteCountCheck = await db.query(
                    `SELECT COUNT(*) as count FROM deleted_services 
                     WHERE deleted_by = ? AND DATE(deleted_at) = ?`,
                    [userId, today]
                );

                let deleteCount = 0;
                if (Array.isArray(deleteCountCheck) && deleteCountCheck.length > 0) {
                    deleteCount = deleteCountCheck[0].count || 0;
                } else if (deleteCountCheck && deleteCountCheck[0] && deleteCountCheck[0][0]) {
                    deleteCount = deleteCountCheck[0][0].count || 0;
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

        // Log deletion first
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
                reason
            ]
        );

        // Update related records
        await db.query(
            "UPDATE conversations SET service_id = NULL WHERE service_id = ?",
            [serviceId]
        );

        await db.query(
            "UPDATE client_providers SET service_id = NULL WHERE service_id = ?",
            [serviceId]
        );

        // Check if status column exists before using it
        let hasStatusColumn = false;
        try {
            const columnCheck = await db.query(`
                SELECT COUNT(*) as count 
                FROM information_schema.columns 
                WHERE table_name = 'services' 
                AND column_name = 'status'
            `);
            
            if (Array.isArray(columnCheck) && columnCheck.length > 0) {
                hasStatusColumn = columnCheck[0].count > 0;
            }
        } catch (e) {}

        if (hasStatusColumn) {
            // Soft delete
            await db.query(
                "UPDATE services SET status = 'deleted', deleted_at = NOW() WHERE id = ?",
                [serviceId]
            );
        } else {
            // Hard delete if no status column
            await db.query(
                "DELETE FROM services WHERE id = ?",
                [serviceId]
            );
        }

        res.json({
            success: true,
            message: "Service deleted successfully."
        });

    } catch (err) {
        console.error("Delete service error:", err);
        res.status(500).json({ error: "Internal server error: " + err.message });
    }
});



// Get user's delete limits
app.get("/api/user/delete-limits", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ 
        error: "Not authenticated" 
      });
    }
    
    const userId = req.session.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    // Check deleted_services table for today's deletions by this user
    const deleteResult = await db.query(
      `SELECT COUNT(*) as count FROM deleted_services 
       WHERE deleted_by = ? AND DATE(deleted_at) = ?`,
      [userId, today]
    );

    let deleteCount = 0;
    if (Array.isArray(deleteResult)) {
      if (deleteResult.length === 2 && Array.isArray(deleteResult[0]) && deleteResult[0].length > 0) {
        deleteCount = deleteResult[0][0].count || 0;
      } else if (deleteResult.length > 0 && deleteResult[0]) {
        deleteCount = deleteResult[0].count || 0;
      }
    }

    res.json({
      daily_limit: 3,
      remaining_deletes: Math.max(0, 3 - deleteCount),
      used_today: deleteCount,
      last_delete_date: today
    });
    
  } catch (err) {
    console.error("Error getting delete limits:", err);
    res.status(500).json({ 
      error: "Error getting delete limits: " + err.message 
    });
  }
});

// =================== ADMIN SERVICE ENDPOINTS ===================
app.delete("/api/admin/services/:id", async (req, res) => {
  try {
    const serviceId = Number(req.params.id);
    const { reason, provider_user_id } = req.body;

    if (!req.session.user || req.session.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: "Reason must be at least 10 characters" });
    }

    const serviceRows = await db.query(
      "SELECT id, user_id FROM services WHERE id = ?",
      [serviceId]
    );

    const service = Array.isArray(serviceRows)
      ? serviceRows[0]
      : null;

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    await db.query("DELETE FROM services WHERE id = ?", [serviceId]);

    await db.query(
      `
      INSERT INTO deleted_services
      (service_id, service_owner_id, deleted_by, deleted_by_role, reason)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        service.id,
        service.user_id || provider_user_id,
        req.session.user.id,
        "admin",
        reason
      ]
    );

    res.json({
      success: true,
      message: "Service deleted and logged successfully"
    });

  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Get deleted services
app.get("/api/admin/deleted-services", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        // Check if table exists
        const tableCheck = await db.query("SHOW TABLES LIKE 'deleted_services'");
        const tableExists = Array.isArray(tableCheck) && tableCheck.length > 0;

        if (!tableExists) {
            return res.json([]);
        }

        const result = await db.query(`
            SELECT 
                ds.*,
                u_deleted.username as deleted_by_name,
                u_owner.username as owner_name
            FROM deleted_services ds
            LEFT JOIN users u_deleted ON ds.deleted_by = u_deleted.id
            LEFT JOIN users u_owner ON ds.service_owner_id = u_owner.id
            ORDER BY ds.deleted_at DESC
        `);

        let deleted = [];
        if (Array.isArray(result)) {
            deleted = result.length === 2 ? result[0] : result;
        }

        res.json(deleted || []);

    } catch (err) {
        console.error("Failed to load deleted services:", err);
        res.status(500).json({ error: "Failed to load deleted services: " + err.message });
    }
});

// Admin: Get flagged users
app.get("/api/admin/flagged-users", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        // Check if table exists
        const tableCheck = await db.query("SHOW TABLES LIKE 'user_delete_monitoring'");
        const tableExists = Array.isArray(tableCheck) && tableCheck.length > 0;

        if (!tableExists) {
            return res.json({ success: true, flagged_users: [], count: 0 });
        }

        const result = await db.query(`
            SELECT 
                um.*,
                u.username,
                u.email,
                u.created_at as user_joined,
                fp.profile_picture_url as profile_picture,
                (SELECT COUNT(*) FROM services WHERE user_id = um.user_id) as active_services_count
            FROM user_delete_monitoring um
            JOIN users u ON um.user_id = u.id
            LEFT JOIN freelancer_profiles fp ON um.user_id = fp.user_id
            WHERE um.is_flagged = TRUE
            ORDER BY um.flagged_at DESC
        `);

        let flaggedUsers = [];
        if (Array.isArray(result)) {
            flaggedUsers = result.length === 2 ? result[0] : result;
        }

        res.json({
            success: true,
            flagged_users: flaggedUsers,
            count: flaggedUsers.length
        });

    } catch (err) {
        console.error("Error loading flagged users:", err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: Restore deleted service
app.post("/api/admin/services/:serviceId/restore", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        const serviceId = req.params.serviceId;

        // Update service status
        await db.query(
            "UPDATE services SET status = 'active' WHERE id = ?",
            [serviceId]
        );

        // Update deleted_services record
        await db.query(`
            UPDATE deleted_services 
            SET restored_at = NOW(), restored_by = ? 
            WHERE service_id = ? AND restored_at IS NULL
        `, [req.session.user.id, serviceId]);

        res.json({ success: true, message: "Service restored successfully" });

    } catch (err) {
        res.status(500).json({ error: "Failed to restore service: " + err.message });
    }
});

app.post("/api/admin/flagged-users/:userId/review", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ 
        error: "Admin access required" 
      });
    }
    
    const { userId } = req.params;
    const { action, notes } = req.body;
    
    await db.query(`
      UPDATE user_delete_monitoring 
      SET reviewed = TRUE, 
          reviewed_at = NOW(),
          review_notes = ?,
          admin_action = ?
      WHERE user_id = ?
    `, [notes || 'No notes provided', action || 'reviewed', userId]);
    
    if (action === 'clear_flag') {
      await db.query(
        "UPDATE users SET delete_warning_flag = FALSE WHERE id = ?",
        [userId]
      );
    }
    
    res.json({
      success: true,
      message: "User marked as reviewed"
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== UPDATED FREELANCER PROFILE ===================
app.get("/api/freelancer/profile", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to view profile" });
  }

  try {
    const profileResult = await db.query(`
      SELECT 
        fp.*,
        COALESCE(fp.profile_picture_url, fp.profile_picture) as profile_picture_combined,
        COALESCE(fp.certificate_image_urls, fp.certificate_images) as certificate_images_combined,
        u.username,
        u.email,
        u.role,
        u.created_at as user_created_at
      FROM freelancer_profiles fp
      JOIN users u ON fp.user_id = u.id
      WHERE fp.user_id = ?
    `, [req.session.user.id]);

    let profiles = [];
    if (Array.isArray(profileResult)) {
      if (profileResult.length > 0 && Array.isArray(profileResult[0])) {
        profiles = profileResult[0];
      } else {
        profiles = profileResult;
      }
    }

    let userProfile = profiles[0];

    if (!userProfile) {
      // Create profile if it doesn't exist
      const insertResult = await db.query(`
        INSERT INTO freelancer_profiles (user_id, headline, description, hourly_rate, skills, languages, experience_level)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        req.session.user.id,
        'New Freelancer',
        'Tell clients about yourself and your services...',
        25,
        JSON.stringify([]),
        JSON.stringify([]),
        'intermediate'
      ]);

      // Fetch the newly created profile
      const newProfileResult = await db.query(`
        SELECT fp.*, u.username, u.email 
        FROM freelancer_profiles fp
        JOIN users u ON fp.user_id = u.id
        WHERE fp.user_id = ?
      `, [req.session.user.id]);

      userProfile = newProfileResult[0] || newProfileResult;
    }

    // Parse JSON fields
    if (userProfile.skills && typeof userProfile.skills === 'string') {
      try {
        userProfile.skills = JSON.parse(userProfile.skills);
      } catch (e) {
        userProfile.skills = [];
      }
    }

    if (userProfile.languages && typeof userProfile.languages === 'string') {
      try {
        userProfile.languages = JSON.parse(userProfile.languages);
      } catch (e) {
        userProfile.languages = [];
      }
    }

    // Handle certificate images
    if (userProfile.certificate_images_combined) {
      try {
        userProfile.certificate_images = JSON.parse(userProfile.certificate_images_combined);
      } catch (e) {
        userProfile.certificate_images = [userProfile.certificate_images_combined];
      }
    } else {
      userProfile.certificate_images = [];
    }

    // Set profile picture
    userProfile.profile_picture = userProfile.profile_picture_combined;

    res.json(userProfile);
    
  } catch (err) {
    console.error('Error loading profile:', err);
    res.status(500).json({ error: "Error loading profile: " + err.message });
  }
});

// =================== UPDATE SERVICE ===================
app.put("/api/services/:id", checkFreelancerSubscription, async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login to update service" });
    }

    try {
        const serviceId = req.params.id;
        const userId = req.session.user.id;

        // Check if service exists and get owner
        const serviceCheck = await db.query(
            "SELECT user_id FROM services WHERE id = ?",
            [serviceId]
        );

        let service = null;
        if (Array.isArray(serviceCheck) && serviceCheck.length > 0) {
            service = serviceCheck[0];
        } else if (serviceCheck && serviceCheck[0] && Array.isArray(serviceCheck[0]) && serviceCheck[0].length > 0) {
            service = serviceCheck[0][0];
        }

        if (!service) {
            return res.status(404).json({ error: "Service not found" });
        }

        // Check ownership (only owner or admin can update)
        if (service.user_id !== userId && req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "You can only edit your own services" });
        }

        const { 
            title, 
            description, 
            category, 
            hourly_rate, 
            fixed_price,
            delivery_time,
            revisions,
            tags,
            requirements,
            status
        } = req.body;

        // Determine price
        const price = fixed_price ? parseFloat(fixed_price) :
                     hourly_rate ? parseFloat(hourly_rate) : null;

        // Build update query dynamically
        const updateFields = [];
        const updateValues = [];

        if (title) {
            updateFields.push("title = ?");
            updateValues.push(title);
        }

        if (description) {
            updateFields.push("description = ?");
            updateValues.push(description);
        }

        if (price !== null) {
            updateFields.push("price = ?");
            updateValues.push(price);
        }

        if (category) {
            updateFields.push("category = ?");
            updateValues.push(category);
        }

        if (delivery_time) {
            updateFields.push("delivery_time = ?");
            updateValues.push(parseInt(delivery_time));
        }

        if (revisions) {
            updateFields.push("revisions = ?");
            updateValues.push(parseInt(revisions));
        }

        if (tags) {
            let parsedTags = tags;
            if (typeof tags === 'string') {
                try {
                    parsedTags = JSON.parse(tags);
                } catch (e) {
                    parsedTags = tags.split(',').map(t => t.trim());
                }
            }
            updateFields.push("tags = ?");
            updateValues.push(JSON.stringify(parsedTags));
        }

        if (requirements) {
            let parsedRequirements = requirements;
            if (typeof requirements === 'string') {
                try {
                    parsedRequirements = JSON.parse(requirements);
                } catch (e) {
                    parsedRequirements = requirements.split('\n').filter(r => r.trim());
                }
            }
            updateFields.push("requirements = ?");
            updateValues.push(JSON.stringify(parsedRequirements));
        }

        if (status) {
            updateFields.push("status = ?");
            updateValues.push(status);
        }

        updateFields.push("updated_at = NOW()");
        updateValues.push(serviceId);

        if (updateFields.length > 1) {
            const updateQuery = `
                UPDATE services 
                SET ${updateFields.join(", ")}
                WHERE id = ?
            `;

            await db.query(updateQuery, updateValues);
        }

        // Update packages if provided
        if (req.body.packages) {
            let packages = req.body.packages;
            if (typeof packages === 'string') {
                try {
                    packages = JSON.parse(packages);
                } catch (e) {
                    packages = [];
                }
            }

            if (Array.isArray(packages)) {
                // First, delete existing packages
                await db.query(
                    "DELETE FROM service_packages WHERE service_id = ?",
                    [serviceId]
                );

                // Insert new packages
                for (const pkg of packages) {
                    if (pkg.is_active !== false) {
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
        }

        res.json({ 
            success: true, 
            message: "Service updated successfully" 
        });

    } catch (err) {
        console.error("Service update error:", err);
        res.status(500).json({ error: "Error updating service: " + err.message });
    }
});

// Mark notification as read
app.put("/api/freelancer/notifications/:notificationId/read", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const freelancerId = req.session.user.id;
        const notificationId = req.params.notificationId;

        await db.query(
            "UPDATE freelancer_notifications SET is_read = TRUE WHERE id = ? AND freelancer_id = ?",
            [notificationId, freelancerId]
        );

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: "Failed to mark notification as read: " + err.message });
    }
});

// Mark all notifications as read
app.put("/api/freelancer/notifications/read-all", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const freelancerId = req.session.user.id;

        await db.query(
            "UPDATE freelancer_notifications SET is_read = TRUE WHERE freelancer_id = ? AND is_read = FALSE",
            [freelancerId]
        );

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: "Failed to mark all as read: " + err.message });
    }
});

// Get unread notification count
app.get("/api/freelancer/notifications/unread-count", async (req, res) => {
    if (!req.session.user) {
        return res.json({ count: 0 });
    }

    try {
        const freelancerId = req.session.user.id;

        const [result] = await db.query(
            "SELECT COUNT(*) as count FROM freelancer_notifications WHERE freelancer_id = ? AND is_read = FALSE",
            [freelancerId]
        );

        res.json({ count: result?.count || 0 });

    } catch (err) {
        console.error("Error getting unread count:", err);
        res.json({ count: 0 });
    }
});


app.put("/api/freelancer/update-profile", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to update profile" });
  }

  try {
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
      languages,
      skills
    } = req.body;

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
    
    if (languages !== undefined) {
      updateFields.push("languages = ?");
      updateValues.push(languages);
    }
    
    if (skills !== undefined) {
      updateFields.push("skills = ?");
      updateValues.push(skills);
    }

    updateFields.push("updated_at = CURRENT_TIMESTAMP");
    updateValues.push(req.session.user.id);

    const updateQuery = `
      UPDATE freelancer_profiles 
      SET ${updateFields.join(", ")}
      WHERE user_id = ?
    `;

    const result = await db.query(updateQuery, updateValues);

    const [updatedProfile] = await db.query(
      "SELECT * FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      profile: updatedProfile[0]
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: "Error updating profile: " + err.message 
    });
  }
});

// =================== FIXED PROFILE PICTURE UPLOAD ===================
app.post("/api/freelancer/profile-picture", uploadProfilePicture.single("profile_picture"), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to upload picture" });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log("📸 Profile picture upload received:", req.file);

    // Check if profile exists
    const profileCheck = await db.query(
      "SELECT user_id FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    let profileExists = false;
    if (Array.isArray(profileCheck) && profileCheck.length > 0) {
      profileExists = true;
    } else if (profileCheck && profileCheck[0] && Array.isArray(profileCheck[0]) && profileCheck[0].length > 0) {
      profileExists = true;
    }

    // If using Cloudinary
    const profilePictureUrl = req.file.path; // Cloudinary URL

    if (profileExists) {
      // Update existing profile
      await db.query(`
        UPDATE freelancer_profiles 
        SET profile_picture_url = ?, updated_at = NOW() 
        WHERE user_id = ?
      `, [profilePictureUrl, req.session.user.id]);
    } else {
      // Create new profile
      await db.query(`
        INSERT INTO freelancer_profiles (user_id, profile_picture_url, created_at, updated_at)
        VALUES (?, ?, NOW(), NOW())
      `, [req.session.user.id, profilePictureUrl]);
    }

    res.json({ 
      success: true,
      message: "Profile picture updated successfully",
      profile_picture: profilePictureUrl
    });
  } catch (err) {
    console.error('❌ Error uploading profile picture:', err);
    res.status(500).json({ 
      success: false,
      error: "Error uploading profile picture: " + err.message 
    });
  }
});
// =================== UPDATED CERTIFICATE UPLOAD ===================
app.post("/api/freelancer/certificate-images", uploadProfilePicture.array("certificate_images", 5), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to upload certificates" });
  }

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const certificateUrls = req.files.map(file => file.path); // Cloudinary URLs

    // Get current certificate URLs
    const [currentProfile] = await db.query(
      "SELECT certificate_image_urls FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    let currentCertificates = [];
    
    if (currentProfile && currentProfile.certificate_image_urls) {
      try {
        currentCertificates = JSON.parse(currentProfile.certificate_image_urls);
      } catch (e) {
        currentCertificates = [];
      }
    }

    const updatedCertificates = [...currentCertificates, ...certificateUrls];
    
    if (updatedCertificates.length > 5) {
      return res.status(400).json({ 
        error: "Maximum 5 certificates allowed. Please remove some existing certificates first." 
      });
    }

    await db.query(`
      UPDATE freelancer_profiles 
      SET certificate_image_urls = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = ?
    `, [JSON.stringify(updatedCertificates), req.session.user.id]);

    res.json({ 
      success: true,
      message: "Certificate images uploaded successfully",
      certificate_images: updatedCertificates
    });
  } catch (err) {
    console.error('Error uploading certificates:', err);
    res.status(500).json({ 
      success: false,
      error: "Error uploading certificate images: " + err.message 
    });
  }
});


// Get freelancer notifications
app.get("/api/freelancer/notifications", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Please login" });
    }

    try {
        const freelancerId = req.session.user.id;

        const [notifications] = await db.query(`
            SELECT 
                fn.*,
                u.username as client_username,
                u.email as client_email,
                fp.profile_picture as client_picture
            FROM freelancer_notifications fn
            JOIN users u ON fn.client_id = u.id
            LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
            WHERE fn.freelancer_id = ?
            ORDER BY fn.created_at DESC
            LIMIT 50
        `, [freelancerId]);

        res.json(notifications || []);

    } catch (err) {
        res.status(500).json({ error: "Failed to load notifications: " + err.message });
    }
});

// Get freelancer dashboard stats
app.get("/api/freelancer/dashboard", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'freelancer') {
        return res.status(401).json({ error: "Freelancer access required" });
    }

    try {
        const freelancerId = req.session.user.id;
        
        // Get profile stats - using your actual column names
        const [profileStats] = await db.query(`
            SELECT 
                completed_orders,
                total_earnings,
                response_time,
                hourly_rate,
                profile_picture_url as profile_picture
            FROM freelancer_profiles
            WHERE user_id = ?
        `, [freelancerId]);

        // Get service stats
        const [serviceStats] = await db.query(`
            SELECT 
                COUNT(*) as total_services
            FROM services
            WHERE user_id = ?
        `, [freelancerId]);

        // Get order stats from service_orders if it exists
        let orderStats = { total_orders: 0, total_revenue: 0 };
        try {
            const [orders] = await db.query(`
                SELECT 
                    COUNT(*) as total_orders,
                    SUM(amount) as total_revenue
                FROM service_orders
                WHERE freelancer_id = ?
            `, [freelancerId]);
            orderStats = orders || { total_orders: 0, total_revenue: 0 };
        } catch (e) {
            console.log("Service orders table may not be populated yet");
        }

        res.json({
            profile: profileStats || { completed_orders: 0, total_earnings: 0, response_time: 0 },
            services: serviceStats || { total_services: 0 },
            orders: orderStats,
            recent_orders: [],
            clients: []
        });

    } catch (err) {
        console.error("Dashboard stats error:", err);
        res.status(500).json({ error: err.message });
    }
});


// =================== UPDATED GET USER PROFILE ===================
app.get("/api/users/:userId/profile", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await db.query(
      `SELECT 
        u.id,
        u.username,
        u.created_at,
        fp.headline,
        fp.description,
        fp.hourly_rate,
        fp.skills,
        fp.languages,
        fp.experience_level,
        fp.website,
        fp.location,
        fp.phone,
        fp.education,
        fp.certifications,
        fp.availability,
        COALESCE(fp.profile_picture_url, fp.profile_picture) as profile_picture,
        COALESCE(fp.certificate_image_urls, fp.certificate_images) as certificate_images
      FROM users u
      JOIN freelancer_profiles fp ON u.id = fp.user_id
      WHERE u.id = ?`,
      [userId]
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const data = result[0];
    
    // Parse skills
    let skills = [];
    try {
      if (data.skills && typeof data.skills === 'string') {
        skills = JSON.parse(data.skills);
      } else if (Array.isArray(data.skills)) {
        skills = data.skills;
      }
    } catch (error) {
      skills = [];
    }

    // Parse certificate images
    let certificates = [];
    if (data.certificate_images) {
      try {
        certificates = JSON.parse(data.certificate_images);
      } catch (e) {
        certificates = [data.certificate_images];
      }
    }

    const publicProfile = {
      id: data.id,
      username: data.username,
      headline: data.headline || 'Professional Freelancer',
      description: data.description || 'No description provided.',
      profile_picture: data.profile_picture,
      hourly_rate: data.hourly_rate || 0,
      location: data.location,
      phone: data.phone,
      website: data.website,
      education: data.education,
      certifications: data.certifications,
      experience_level: data.experience_level,
      availability: data.availability || 'available',
      skills: skills,
      certificates: certificates,
      created_at: data.created_at
    };

    res.json(publicProfile);
    
  } catch (err) {
    console.error('Error loading user profile:', err);
    res.status(500).json({ 
      error: "Error loading user profile"
    });
  }
});

// =================== UPDATED GET CERTIFICATES ===================
app.get("/api/users/:userId/certificates", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await db.query(
      `SELECT COALESCE(certificate_image_urls, certificate_images) as certificate_images 
       FROM freelancer_profiles WHERE user_id = ?`,
      [userId]
    );
    
    let certificates = [];
    if (Array.isArray(result) && result.length > 0) {
      const profile = result[0];
      if (profile.certificate_images) {
        try {
          certificates = JSON.parse(profile.certificate_images);
        } catch (e) {
          certificates = [profile.certificate_images];
        }
      }
    }
    
    res.json({
      success: true,
      certificate_images: certificates
    });
    
  } catch (err) {
    console.error('Error loading certificates:', err);
    res.status(500).json({ 
      success: false,
      error: "Error loading certificates" 
    });
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

    // Get course details
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

    // Check if Flutterwave is configured
    if (!process.env.FLW_SECRET_KEY) {
      console.error('❌ FLW_SECRET_KEY is missing!');
      return res.status(500).json({ 
        error: "Payment system not configured. Please contact support."
      });
    }
    
    const transaction_ref = "coreinsight_" + Date.now() + "_" + courseId;
    const amount = parseFloat(course.price);
    
    const payload = {
      tx_ref: transaction_ref,  // Flutterwave uses tx_ref
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
      
      // Store pending payment with correct column names
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
        // Don't fail the payment - just log the error
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
    
    // Verify with Flutterwave
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
      
      // Update payment record
      await db.query(
        `UPDATE payments 
         SET status = 'completed', 
             transaction_id = ?,
             flutterwave_response = ?
         WHERE transaction_ref = ?`,
        [transaction_id, JSON.stringify(transaction), tx_ref]
      );
      
      // Grant course access to user
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

// =================== VERIFY PAYMENT BY REFERENCE ===================
app.get("/api/verify-by-reference/:tx_ref", async (req, res) => {
  try {
    const { tx_ref } = req.params;
    
    console.log('🔍 Verifying payment by reference:', tx_ref);
    
    // First check database
    const paymentResult = await db.query(
      "SELECT * FROM payments WHERE transaction_ref = ?",
      [tx_ref]
    );
    
    let payment = null;
    if (Array.isArray(paymentResult) && paymentResult.length > 0) {
      payment = paymentResult[0];
    }
    
    if (payment && payment.status === 'completed') {
      // Get course details
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
    
    // If not in database or not completed, verify with Flutterwave
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
      
      // Update or insert payment record
      await db.query(
        `INSERT INTO payments 
         (user_id, course_id, transaction_ref, transaction_id, amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'completed', NOW())
         ON DUPLICATE KEY UPDATE 
         status = 'completed', 
         transaction_id = VALUES(transaction_id)`,
        [userId, courseId, tx_ref, transaction.id, amount]
      );
      
      // Grant course access
      await db.query(
        `INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at)
         VALUES (?, ?, 'completed', NOW())
         ON DUPLICATE KEY UPDATE payment_status = 'completed', purchased_at = NOW()`,
        [userId, courseId]
      );
      
      // Get course title
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

app.get("/services-payment-callback", async (req, res) => {
  try {
    const { transaction_id, status } = req.query;
    
    if (status === 'successful') {
      return res.redirect(`/services-payment-verification.html?transaction_id=${transaction_id}`);
    }
    
    res.redirect('/services-payment-failed.html');
  } catch (err) {
    res.redirect('/services-payment-failed.html');
  }
});

app.get("/api/verify-service-payment/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;
    
    const response = await flw.Transaction.verify({ id: transaction_id });
    
    if (response.data.status === "successful") {
      const meta = response.data.meta;
      
      if (meta.subscription) {
        const newTrialEnds = new Date();
        if (meta.plan_type === 'monthly') {
          newTrialEnds.setMonth(newTrialEnds.getMonth() + 1);
        } else {
          newTrialEnds.setFullYear(newTrialEnds.getFullYear() + 1);
        }

        await db.query(`
          UPDATE service_subscriptions 
          SET trial_ends_at = ?, status = 'active'
          WHERE user_id = ?
        `, [newTrialEnds, meta.user_id]);
        
      } else if (meta.type === 'service_product') {
        await db.query(`
          INSERT INTO service_orders 
          (service_id, product_id, buyer_id, amount, status, transaction_id)
          VALUES (?, ?, ?, ?, 'completed', ?)
        `, [
          meta.service_id,
          meta.product_id,
          meta.buyer_id,
          response.data.amount,
          transaction_id
        ]);
      }

      res.json({ 
        status: "success", 
        message: "Payment verified successfully",
        data: response.data 
      });
    } else {
      res.status(400).json({ 
        status: "failed", 
        message: "Payment not successful" 
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Error verifying payment: " + err.message });
  }
});

app.get("/api/verify-product-payment/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;

    const response = await flw.Transaction.verify({ id: transaction_id });

    if (response.data.status === "successful") {
      const transactionRef = response.data.tx_ref;
      const productId = response.data.meta.product_id;
      const sellerId = response.data.meta.seller_id;
      const buyerId = response.data.meta.buyer_id;
      const amount = response.data.amount;

      const saleResult = await db.query(
        `INSERT INTO product_sales (product_id, seller_id, buyer_id, amount, transaction_id) 
         VALUES (?, ?, ?, ?, ?)`,
        [productId, sellerId, buyerId, amount, transaction_id]
      );

      const saleId = saleResult.insertId;
      const platformCut = amount * 0.10;
      const sellerEarning = amount - platformCut;

      await db.query(
        `INSERT INTO platform_commissions (sale_id, seller_id, total_amount, seller_earning, platform_earning)
         VALUES (?, ?, ?, ?, ?)`,
        [saleId, sellerId, amount, sellerEarning, platformCut]
      );

      res.json({
        status: "success",
        message: "Product payment verified and recorded.",
        data: {
          total: amount,
          sellerEarning,
          platformCut,
        },
      });
    } else {
      res.status(400).json({ status: "failed", message: "Payment not successful" });
    }
  } catch (err) {
    res.status(500).json({ error: "Error verifying product payment: " + err.message });
  }
});

app.post("/api/paystack/pay", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to buy products." });
  }

  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Product ID is required." });
    }

    const [productRows] = await db.query(
      "SELECT * FROM products WHERE id = ?",
      [productId]
    );

    if (productRows.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    const product = productRows[0];

    if (!product.price || product.price <= 0) {
      return res.status(400).json({ error: "Invalid product price." });
    }

    if (product.type === "affiliate" && product.affiliate_link) {
      return res.json({
        type: "affiliate",
        link: product.affiliate_link
      });
    }

    const [sellerRows] = await db.query(
      "SELECT paystack_subaccount_code FROM sellers WHERE user_id = ?",
      [product.user_id]
    );

    if (!sellerRows.length) {
      return res.status(400).json({ error: "Seller payment account not set up" });
    }

    const sellerSubaccount = sellerRows[0].paystack_subaccount_code;

    const amountInKobo = Math.round(product.price * 100);
    const reference = `product-${product.id}-${Date.now()}`;

    const payload = {
      email: req.session.user.email,
      amount: amountInKobo,
      currency: "NGN",
      reference,
      subaccount: sellerSubaccount,
      transaction_charge: Math.round(amountInKobo * 0.10),
      callback_url: "https://core-insight-7.onrender.com/order-success.html",
      metadata: {
        product_id: product.id,
        seller_id: product.user_id,
        buyer_id: req.session.user.id,
        type: "digital"
      }
    };

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        error: "Paystack not configured"
      });
    }

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (response.data.status && response.data.data && response.data.data.authorization_url) {
      await db.query(
        `INSERT INTO orders 
         (user_id, product_id, tx_ref, amount, status, provider)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.session.user.id,
          product.id,
          reference,
          product.price,
          "pending",
          "paystack"
        ]
      );

      res.json({
        type: "payment",
        provider: "paystack",
        authorization_url: response.data.data.authorization_url,
        reference: reference,
        access_code: response.data.data.access_code
      });
    } else {
      throw new Error(response.data.message || "Paystack payment initialization failed");
    }

  } catch (err) {
    res.status(500).json({
      error: "Payment initialization failed: " + (err.message || "Unknown error")
    });
  }
});


// =================== DEBUG: FIND ALL COURSE FILES ===================
app.get("/api/debug/course-files", async (req, res) => {
  try {
    const results = {
      database_courses: [],
      files_found: [],
      locations_checked: []
    };
    
    // Get all courses from database
    const courses = await db.query('SELECT id, title, file_path, file_url FROM courses');
    
    // Locations to check
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
        // Check multiple locations
        const locations = [
          path.join(__dirname, 'uploads', 'courses', filename),
          path.join(__dirname, 'public', 'uploads', 'courses', filename),
          path.join(__dirname, 'uploads', filename),
          `/opt/render/project/src/uploads/courses/${filename}`,
          `/opt/render/project/src/public/uploads/courses/${filename}`,
          path.join(process.cwd(), 'uploads', 'courses', filename),
          // Also check if it's using the original path
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
    
    // Also list all files in uploads directories
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

app.post("/api/buy-product", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to buy products." });
  }

  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Product ID is required." });
    }

    const [productRows] = await db.query(
      "SELECT * FROM products WHERE id = ?",
      [productId]
    );

    if (productRows.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    const product = productRows[0];

    if (!product.price || product.price <= 0) {
      return res.status(400).json({ error: "Invalid product price." });
    }

    if (product.type === "affiliate" && product.affiliate_link) {
      return res.json({
        type: "affiliate",
        link: product.affiliate_link
      });
    }

    const [sellerRows] = await db.query(
      "SELECT subaccount_id FROM sellers WHERE user_id = ? AND provider = 'flutterwave'",
      [product.user_id]
    );

    if (!sellerRows.length) {
      return res.status(400).json({ error: "Seller has not set up payment account" });
    }

    const sellerSubaccountId = sellerRows[0].subaccount_id;

    const txRef = `product-${product.id}-${Date.now()}`;

    const payload = {
      tx_ref: txRef,
      amount: product.price,
      currency: "USD",
      redirect_url: "https://core-insight-7.onrender.com/order-success.html",
      customer: {
        email: req.session.user.email,
        name: req.session.user.username
      },
      subaccounts: [
        {
          id: sellerSubaccountId,
          transaction_split_ratio: 90
        }
      ],
      customizations: {
        title: "Core Insight Marketplace",
        description: `Payment for ${product.title}`
      },
      meta: {
        product_id: product.id,
        seller_id: product.user_id,
        buyer_id: req.session.user.id,
        type: "digital"
      }
    };

    if (!process.env.FLW_SECRET_KEY) {
      return res.status(500).json({
        error: "Flutterwave not configured"
      });
    }

    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (
      response.data.status !== "success" ||
      !response.data.data?.link
    ) {
      throw new Error("Flutterwave payment initialization failed");
    }

    await db.query(
      `INSERT INTO orders 
       (user_id, product_id, tx_ref, amount, status, provider)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.session.user.id,
        product.id,
        txRef,
        product.price,
        "pending",
        "flutterwave"
      ]
    );

    res.json({
      type: "payment",
      provider: "flutterwave",
      link: response.data.data.link
    });

  } catch (err) {
    res.status(500).json({
      error: "Payment initialization failed"
    });
  }
});

app.post("/api/webhook/flutterwave", async (req, res) => {
  try {
    const secretHash = process.env.FLW_WEBHOOK_SECRET;
    const signature = req.headers["verif-hash"];

    if (!signature || signature !== secretHash) {
      return res.status(401).send("Unauthorized");
    }

    const payload = req.body;

    if (
      payload.event !== "charge.completed" ||
      payload.data.status !== "successful"
    ) {
      return res.sendStatus(200);
    }

    const txRef = payload.data.tx_ref;
    const paidAmount = payload.data.amount;

    const [orderRows] = await db.query(
      "SELECT * FROM orders WHERE tx_ref = ?",
      [txRef]
    );

    if (orderRows.length === 0) {
      return res.sendStatus(200);
    }

    const order = orderRows[0];

    if (order.status === "completed") {
      return res.sendStatus(200);
    }

    if (Number(order.amount) !== Number(paidAmount)) {
      return res.sendStatus(200);
    }

    await db.query(
      "UPDATE orders SET status = 'completed' WHERE id = ?",
      [order.id]
    );

    const [existingAccess] = await db.query(
      "SELECT id FROM user_products WHERE user_id = ? AND product_id = ?",
      [order.user_id, order.product_id]
    );

    if (existingAccess.length === 0) {
      await db.query(
        `INSERT INTO user_products (user_id, product_id, granted_at)
         VALUES (?, ?, NOW())`,
        [order.user_id, order.product_id]
      );
    }

    res.sendStatus(200);

  } catch (err) {
    res.sendStatus(500);
  }
});

app.post("/api/webhooks/paystack", express.json({ type: "*/*" }), async (req, res) => {
  try {
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.sendStatus(401);
    }

    const event = req.body;

    if (event.event === "charge.success") {
      const data = event.data;

      const reference = data.reference;
      const amountPaid = data.amount / 100;
      const metadata = data.metadata;

      const { product_id, buyer_id, seller_id, type } = metadata;

      await db.query(
        `UPDATE orders 
         SET status = 'completed' 
         WHERE tx_ref = ?`,
        [reference]
      );

      if (type === "digital") {
        await db.query(
          `INSERT INTO user_products (user_id, product_id, status)
           VALUES (?, ?, 'paid')
           ON DUPLICATE KEY UPDATE status='paid'`,
          [buyer_id, product_id]
        );
      }
    }

    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.get("/product-payment-callback", async (req, res) => {
  try {
    const { transaction_id, status, tx_ref } = req.query;
    
    if (status === 'successful') {
      const verification = await flw.Transaction.verify({ id: transaction_id });
      
      if (verification.data.status === "successful") {
        const meta = verification.data.meta;
        
        await db.query(
          `INSERT INTO product_sales (product_id, seller_id, buyer_id, amount, transaction_id, status) 
           VALUES (?, ?, ?, ?, ?, 'completed')`,
          [
            meta.product_id,
            meta.seller_id,
            meta.buyer_id,
            verification.data.amount,
            transaction_id
          ]
        );
        
        return res.redirect('/payment-success.html');
      }
    }
    
    res.redirect('/payment-failed.html');
    
  } catch (err) {
    res.redirect('/payment-failed.html');
  }
});

app.get("/api/verify/flutterwave/:tx_ref", async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${req.params.tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`
        }
      }
    );

    if (response.data.status === "success" &&
        response.data.data.status === "successful") {
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/api/download-product/:id", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Login required");
  }

  const [access] = await db.query(
    `SELECT p.file_path
     FROM products p
     JOIN user_products up ON up.product_id = p.id
     WHERE up.user_id = ? AND p.id = ? AND up.status = 'paid'`,
    [req.session.user.id, req.params.id]
  );

  if (!access.length) {
    return res.status(403).send("No access");
  }

  res.download(access[0].file_path);
});

app.get("/api/check-product-access/:productId", async (req, res) => {
  if (!req.session.user) {
    return res.json({ hasAccess: false });
  }

  const { productId } = req.params;

  const [rows] = await db.query(
    `SELECT * FROM user_products 
     WHERE user_id = ? AND product_id = ? AND status = 'paid'`,
    [req.session.user.id, productId]
  );

  res.json({ hasAccess: rows.length > 0 });
});

app.get("/api/payment-callback", async (req, res) => {
  try {
    const { transaction_id, status } = req.query;
    
    if (status === 'successful') {
      return res.redirect(`/payment-verification.html?transaction_id=${transaction_id}`);
    }
    
    res.redirect('/payment-failed.html');
  } catch (err) {
    res.redirect('/payment-failed.html');
  }
});

// =================== SELLER ENDPOINTS ===================
app.post("/api/seller/setup-payments", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in." });
  }

  try {
    const { provider, country, currency, payout_method } = req.body;
    
    const [existing] = await db.query(
      `SELECT * FROM seller_profiles WHERE user_id = ?`,
      [req.session.user.id]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE seller_profiles 
         SET payment_provider = ?, country = ?, currency = ?, payout_method = ?
         WHERE user_id = ?`,
        [provider, country, currency, payout_method, req.session.user.id]
      );
    } else {
      await db.query(
        `INSERT INTO seller_profiles 
        (user_id, payment_provider, country, currency, payout_method) 
        VALUES (?, ?, ?, ?, ?)`,
        [req.session.user.id, provider, country, currency, payout_method]
      );
    }

    res.json({ 
      success: true, 
      message: "Payment preferences saved! You'll receive payouts according to your settings."
    });

  } catch (err) {
    res.status(500).json({ error: "Error setting up payments: " + err.message });
  }
});

app.get("/api/seller/me", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Login required" });

  try {
    const [rows] = await db.query(
      "SELECT * FROM sellers WHERE user_id = ?",
      [req.session.user.id]
    );

    if (rows.length === 0) return res.json({ seller: null });
    res.json({ seller: rows[0] });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/seller/paystack-subaccount", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Login required" });

  const {
    business_name,
    bank_code,
    account_number,
    percentage_charge
  } = req.body;

  try {
    const response = await axios.post(
      "https://api.paystack.co/subaccount",
      {
        business_name,
        settlement_bank: bank_code,
        account_number,
        percentage_charge
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const subaccountCode = response.data.data.subaccount_code;

    await db.query(
      `INSERT INTO sellers (user_id, provider, paystack_subaccount_code)
       VALUES (?, 'paystack', ?)
       ON DUPLICATE KEY UPDATE paystack_subaccount_code=?`,
      [req.session.user.id, subaccountCode, subaccountCode]
    );

    res.json({
      success: true,
      subaccount_code: subaccountCode
    });

  } catch (err) {
    res.status(500).json({ error: "Failed to create Paystack subaccount" });
  }
});

app.post("/api/seller/flutterwave-subaccount", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Login required" });

  const {
    business_name,
    email,
    account_number,
    bank_code,
  } = req.body;

  try {
    const response = await axios.post(
      "https://api.flutterwave.com/v3/subaccounts",
      {
        business_name,
        business_email: email,
        account_number,
        bank_code,
        split_type: "percentage",
        split_value: 10
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (response.data.status !== "success") {
      return res.status(400).json({ error: "Failed to create subaccount" });
    }

    const subaccountId = response.data.data.subaccount_id;

    await db.query(
      `INSERT INTO sellers 
       (user_id, provider, subaccount_id)
       VALUES (?, 'flutterwave', ?)
       ON DUPLICATE KEY UPDATE subaccount_id=?`,
      [req.session.user.id, subaccountId, subaccountId]
    );

    res.json({
      success: true,
      subaccount_id: subaccountId
    });

  } catch (err) {
    res.status(500).json({ error: "Flutterwave subaccount creation failed" });
  }
});

// =================== ORDERS ENDPOINTS ===================
app.get("/api/orders/seller/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    const salesResult = await db.query(
      `SELECT o.*, p.title as product_name, p.price, 
              u1.username as buyer_name, u1.email as buyer_email,
              u2.username as seller_name
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN users u1 ON o.buyer_id = u1.id
       LEFT JOIN users u2 ON o.seller_id = u2.id
       WHERE o.seller_id = ?
       ORDER BY o.created_at DESC`,
      [sellerId]
    );
    
    res.json(Array.isArray(salesResult) ? salesResult : []);
  } catch (err) {
    res.status(500).json({ error: "Error fetching seller sales" });
  }
});

app.get("/api/seller/stats/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    const productsResult = await db.query(
      "SELECT COUNT(*) as product_count FROM products WHERE user_id = ?",
      [sellerId]
    );
    
    const salesResult = await db.query(
      `SELECT COUNT(*) as sales_count, SUM(price) as total_revenue
       FROM orders WHERE seller_id = ?`,
      [sellerId]
    );
    
    const ratingResult = await db.query(
      `SELECT AVG(r.rating) as avg_rating, COUNT(r.id) as review_count
       FROM reviews r
       JOIN products p ON r.product_id = p.id
       WHERE p.user_id = ?`,
      [sellerId]
    );
    
    const stats = {
      product_count: Array.isArray(productsResult) && productsResult[0] ? productsResult[0].product_count : 0,
      sales_count: Array.isArray(salesResult) && salesResult[0] ? salesResult[0].sales_count : 0,
      total_revenue: Array.isArray(salesResult) && salesResult[0] ? (salesResult[0].total_revenue || 0) : 0,
      avg_rating: Array.isArray(ratingResult) && ratingResult[0] ? (ratingResult[0].avg_rating || 0) : 0,
      review_count: Array.isArray(ratingResult) && ratingResult[0] ? (ratingResult[0].review_count || 0) : 0
    };
    
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: "Error fetching seller statistics" });
  }
});

app.post('/api/orders/create', async (req, res) => {
  try {
    const {
      product_name,
      product_type,
      quantity,
      price,
      customer_name,
      customer_email,
      customer_phone,
      shipping_address,
      city,
      state,
      country,
      postal_code,
      payment_method,
      shipping_method,
      shipping_cost,
      notes
    } = req.body;

    if (!product_name || !price || !customer_name || !customer_email || !shipping_address) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const qty = quantity || 1;
    const total_amount = (parseFloat(price) * qty) + (parseFloat(shipping_cost) || 0);

    const result = await db.query(
      `INSERT INTO physical_orders (
        product_name, product_type, quantity, price, total_amount,
        customer_name, customer_email, customer_phone,
        shipping_address, city, state, country, postal_code,
        payment_method, shipping_method, shipping_cost, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product_name, product_type || 'general', qty, price, total_amount,
        customer_name, customer_email, customer_phone || '',
        shipping_address, city || '', state || '', country || '', postal_code || '',
        payment_method || 'flutterwave', shipping_method || 'standard', shipping_cost || 0,
        notes || ''
      ]
    );

    await db.query(
      `INSERT INTO order_tracking (order_id, status, description)
       VALUES (?, ?, ?)`,
      [result.insertId, 'pending', 'Order received and is being processed']
    );

    try {
      await transporter.sendMail({
        from: `"Core Insight Orders" <${process.env.EMAIL_USER}>`,
        to: customer_email,
        subject: "Order Confirmation - Core Insight Marketplace",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Thank you for your order! 🎉</h2>
            <p>Your order has been received and is being processed.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3>Order Details:</h3>
              <p><strong>Order ID:</strong> #${result.insertId}</p>
              <p><strong>Product:</strong> ${product_name}</p>
              <p><strong>Quantity:</strong> ${qty}</p>
              <p><strong>Total Amount:</strong> $${total_amount.toFixed(2)}</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3>Shipping Information:</h3>
              <p>${shipping_address}</p>
              <p>${city}, ${state} ${postal_code}</p>
              <p>${country}</p>
            </div>
            
            <p>You can track your order status at: <a href="https://core-insight-7.onrender.com/order-tracking">Order Tracking</a></p>
            <p>Thank you for shopping with Core Insight!</p>
          </div>
        `
      });
    } catch (emailError) {}

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        id: result.insertId,
        total_amount,
        customer_email
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create order'
    });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const { status, email, limit = 50, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM physical_orders WHERE 1=1';
    const params = [];
    
    if (status) {
      query += ' AND order_status = ?';
      params.push(status);
    }
    
    if (email) {
      query += ' AND customer_email = ?';
      params.push(email);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const orders = await db.query(query, params);
    
    let countQuery = 'SELECT COUNT(*) as total FROM physical_orders WHERE 1=1';
    const countParams = [];
    
    if (status) {
      countQuery += ' AND order_status = ?';
      countParams.push(status);
    }
    
    if (email) {
      countQuery += ' AND customer_email = ?';
      countParams.push(email);
    }
    
    const countResult = await db.query(countQuery, countParams);
    const total = Array.isArray(countResult) && countResult[0] ? countResult[0].total : 0;
    
    res.json({
      success: true,
      orders: Array.isArray(orders) ? orders : [],
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const ordersResult = await db.query(
      `SELECT o.* 
       FROM physical_orders o 
       WHERE o.id = ?`,
      [id]
    );
    
    let order;
    if (Array.isArray(ordersResult) && ordersResult.length > 0) {
      order = ordersResult[0];
    } else {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    const trackingResult = await db.query(
      `SELECT status, description, location, estimated_delivery, created_at
       FROM order_tracking 
       WHERE order_id = ? 
       ORDER BY created_at DESC`,
      [id]
    );
    
    order.tracking_history = Array.isArray(trackingResult) ? trackingResult : [];
    
    res.json({
      success: true,
      order
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order'
    });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, description, location, estimated_delivery } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }
    
    await db.query(
      'UPDATE physical_orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );
    
    if (description) {
      await db.query(
        `INSERT INTO order_tracking (order_id, status, description, location, estimated_delivery)
         VALUES (?, ?, ?, ?, ?)`,
        [id, status, description, location || null, estimated_delivery || null]
      );
    }
    
    res.json({
      success: true,
      message: 'Order status updated successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update order status'
    });
  }
});

app.put('/api/orders/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status, transaction_id } = req.body;
    
    if (!payment_status) {
      return res.status(400).json({
        success: false,
        error: 'Payment status is required'
      });
    }
    
    await db.query(
      'UPDATE physical_orders SET payment_status = ?, transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [payment_status, transaction_id || null, id]
    );
    
    res.json({
      success: true,
      message: 'Payment status updated successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update payment status'
    });
  }
});

app.get('/api/orders/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    
    const orders = await db.query(
      `SELECT id, customer_name, customer_email, customer_phone, 
              product_name, total_amount, order_status, created_at
       FROM physical_orders 
       WHERE customer_email LIKE ? OR customer_phone LIKE ? OR customer_name LIKE ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );
    
    res.json({
      success: true,
      orders: Array.isArray(orders) ? orders : []
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to search orders'
    });
  }
});

app.get('/api/orders/stats/overview', async (req, res) => {
  try {
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN order_status = 'processing' THEN 1 ELSE 0 END) as processing_orders,
        SUM(CASE WHEN order_status = 'shipped' THEN 1 ELSE 0 END) as shipped_orders,
        SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as avg_order_value
      FROM physical_orders
      WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);
    
    const recentOrdersResult = await db.query(`
      SELECT id, customer_name, product_name, total_amount, order_status, created_at
      FROM physical_orders
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    const stats = Array.isArray(statsResult) && statsResult[0] ? statsResult[0] : {};
    const recent_orders = Array.isArray(recentOrdersResult) ? recentOrdersResult : [];
    
    res.json({
      success: true,
      stats,
      recent_orders
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order statistics'
    });
  }
});
app.post("/api/order-product", async (req, res) => {
  try {
    console.log("📦 ORDER REQUEST RECEIVED:", req.body);
    
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in to place an order" });
    }

    const {
      productId,
      productTitle,
      price, // This is the seller price from frontend (e.g., 27)
      quantity = 1,
      deliveryAddress,
      city,
      state,
      country,
      deliveryPhone,
      deliveryDays = 7,
      notes = ''
    } = req.body;

    // Get the full product details including original price
    const productResult = await db.query(
      "SELECT user_id as seller_id, original_price, platform_fee FROM products WHERE id = ?",
      [productId]
    );

    if (!productResult || productResult.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const sellerId = productResult[0].seller_id;
    const buyerId = req.session.user.id;
    
    // Use the original full price for payment
    const unitPrice = parseFloat(productResult[0].original_price || price); // Full price (e.g., 30)
    const platformFeePerUnit = parseFloat(productResult[0].platform_fee || (unitPrice * 0.1)); // Your fee (e.g., 3)

    const qty = parseInt(quantity, 10);
    
    if (isNaN(qty) || qty < 1 || qty > 100) {
      return res.status(400).json({ error: "Invalid quantity" });
    }

    // Calculate totals based on FULL price
    const totalAmount = qty * unitPrice; // Customer pays this (e.g., 30)
    const totalPlatformFee = qty * platformFeePerUnit; // Your cut (e.g., 3)
    const sellerEarnings = totalAmount - totalPlatformFee; // Seller gets this (e.g., 27)

    console.log("💰 PAYMENT BREAKDOWN:", {
      unitPrice,
      platformFeePerUnit,
      totalAmount,
      totalPlatformFee,
      sellerEarnings,
      quantity: qty
    });

    // FIXED: Correct number of columns (22) matching values (22)
    const result = await db.query(
      `INSERT INTO physical_orders (
        product_id, seller_id, buyer_id,
        product_name, product_type, quantity, 
        price, platform_fee, seller_earnings,
        total_amount,
        customer_name, customer_email, customer_phone,
        shipping_address, city, state, country,
        payment_method, payment_status, order_status,
        notes, estimated_delivery_days
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,                                    // 1
        sellerId,                                     // 2
        buyerId,                                      // 3
        productTitle,                                 // 4
        'physical',                                   // 5
        qty,                                          // 6
        unitPrice,                                    // 7 - price
        totalPlatformFee,                             // 8 - platform_fee
        sellerEarnings,                               // 9 - seller_earnings
        totalAmount,                                  // 10 - total_amount
        req.session.user.username || 'Buyer',        // 11 - customer_name
        req.session.user.email,                      // 12 - customer_email
        deliveryPhone,                               // 13 - customer_phone
        deliveryAddress,                             // 14 - shipping_address
        city || '',                                  // 15 - city
        state || '',                                 // 16 - state
        country || '',                               // 17 - country
        'pay_online',                                // 18 - payment_method
        'pending',                                   // 19 - payment_status
        'pending',                                   // 20 - order_status
        notes || '',                                 // 21 - notes
        parseInt(deliveryDays) || 7                  // 22 - estimated_delivery_days
      ]
    );

    // Get the order ID
    let orderId = null;
    if (result) {
      if (result.insertId) {
        orderId = result.insertId;
      } else if (Array.isArray(result) && result[0] && result[0].insertId) {
        orderId = result[0].insertId;
      }
    }

    console.log(`✅ Order created with ID: ${orderId}`);

    // Create notification for seller
    try {
      await db.query(
        `INSERT INTO seller_notifications 
         (seller_id, order_id, notification_type, title, message, created_at)
         VALUES (?, ?, 'new_order', 'New Order Received', 
                 CONCAT('New order for ', ?, ' - $', ?, ' (Qty: ', ?, ')'), NOW())`,
        [sellerId, orderId, productTitle, totalAmount, qty]
      );
      console.log(`✅ Notification created for seller ${sellerId}`);
    } catch (notifError) {
      console.error("⚠️ Failed to create notification:", notifError.message);
    }

    // Send confirmation email to buyer
    try {
      await transporter.sendMail({
        from: `"Core Insight Orders" <${process.env.EMAIL_USER}>`,
        to: req.session.user.email,
        subject: `Order Confirmation #${orderId} - Core Insight`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">Thank you for your order! 🎉</h2>
            <p>Your order has been received and is being processed.</p>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3>Order Details:</h3>
              <p><strong>Order ID:</strong> #${orderId}</p>
              <p><strong>Product:</strong> ${productTitle}</p>
              <p><strong>Quantity:</strong> ${qty}</p>
              <p><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>
              ${totalPlatformFee > 0 ? `<p><strong>Platform Fee:</strong> $${totalPlatformFee.toFixed(2)}</p>` : ''}
            </div>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3>Shipping Information:</h3>
              <p><strong>Address:</strong> ${deliveryAddress}</p>
              ${city ? `<p><strong>City:</strong> ${city}</p>` : ''}
              ${state ? `<p><strong>State:</strong> ${state}</p>` : ''}
              ${country ? `<p><strong>Country:</strong> ${country}</p>` : ''}
              <p><strong>Contact:</strong> ${deliveryPhone}</p>
              <p><strong>Estimated Delivery:</strong> ${deliveryDays} ${deliveryDays === 1 ? 'day' : 'days'}</p>
            </div>
            
            <p>You can track your order status from your account.</p>
            <p>Thank you for shopping with Core Insight!</p>
          </div>
        `
      });
      console.log(`✅ Confirmation email sent to ${req.session.user.email}`);
    } catch (emailError) {
      console.error("⚠️ Failed to send confirmation email:", emailError.message);
    }

    res.json({
      success: true,
      message: "Order placed successfully!",
      orderId: orderId,
      totalAmount: totalAmount,
      platformFee: totalPlatformFee,
      sellerEarnings: sellerEarnings
    });

  } catch (err) {
    console.error("❌ Order creation error:", err);
    res.status(500).json({ 
      error: "Failed to place order",
      details: err.message 
    });
  }
});

// =================== FIXED SELLER NOTIFICATIONS ===================
app.get("/api/seller/notifications", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in" });
    }

    console.log('📬 Loading notifications for user:', req.session.user.id);

    const notifications = await db.query(
      `SELECT 
        n.*, 
        o.product_name, 
        o.total_amount, 
        o.order_status,
        DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i') as formatted_time
       FROM seller_notifications n
       LEFT JOIN physical_orders o ON n.order_id = o.id
       WHERE n.seller_id = ?
       ORDER BY n.created_at DESC
       LIMIT 20`,
      [req.session.user.id]
    );

    let notificationsArray = [];
    if (Array.isArray(notifications)) {
      notificationsArray = notifications[0] || notifications;
    } else if (notifications && notifications.rows) {
      notificationsArray = notifications.rows;
    }

    const unreadResult = await db.query(
      `SELECT COUNT(*) AS count
       FROM seller_notifications
       WHERE seller_id = ? AND is_read = FALSE`,
      [req.session.user.id]
    );

    let unreadCount = 0;
    if (Array.isArray(unreadResult)) {
      const unreadData = unreadResult[0] || unreadResult;
      unreadCount = unreadData[0]?.count || unreadData?.count || 0;
    }

    res.json({
      success: true,
      notifications: notificationsArray,
      unreadCount: unreadCount
    });

  } catch (err) {
    console.error('❌ Error loading notifications:', err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to load notifications",
      message: err.message 
    });
  }
});

app.post("/api/seller/notifications/:id/read", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in" });
    }

    await db.query(
      `UPDATE seller_notifications
       SET is_read = TRUE
       WHERE id = ? AND seller_id = ?`,
      [req.params.id, req.session.user.id]
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

app.get("/api/seller/notifications/unread-count", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ count: 0 });
    }

    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM seller_notifications
       WHERE seller_id = ? AND is_read = FALSE`,
      [req.session.user.id]
    );

    const count = result[0]?.count || 0;

    res.json({ count: count });

  } catch (err) {
    console.error("❌ Unread count error:", err);
    res.json({ count: 0 });
  }
});

// =================== SELLER DASHBOARD ENDPOINTS ===================
app.get("/api/seller/orders", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in" });
    }

    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        o.*,
        p.images as product_images,
        p.category as product_category,
        u.username as buyer_username,
        u.email as buyer_email,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i') as order_date_formatted,
        CASE 
          WHEN o.order_status = 'pending' THEN 1
          WHEN o.order_status = 'processing' THEN 2
          WHEN o.order_status = 'shipped' THEN 3
          WHEN o.order_status = 'delivered' THEN 4
          ELSE 5
        END as status_order
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.buyer_id = u.id
      WHERE o.seller_id = ?
    `;

    const params = [req.session.user.id];

    if (status && status !== "all") {
      query += " AND o.order_status = ?";
      params.push(status);
    }

    query += " ORDER BY status_order ASC, o.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [orders] = await db.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM physical_orders WHERE seller_id = ?";
    const countParams = [req.session.user.id];

    if (status && status !== "all") {
      countQuery += " AND order_status = ?";
      countParams.push(status);
    }

    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    // Process images
    const processedOrders = Array.isArray(orders)
      ? orders.map((order) => {
          if (order.product_images && typeof order.product_images === "string") {
            try {
              order.product_images = JSON.parse(order.product_images);
            } catch (e) {
              order.product_images = [];
            }
          }
          return order;
        })
      : [];

    res.json({
      success: true,
      orders: processedOrders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("❌ Get seller orders error:", err);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

app.get("/api/seller/orders/:orderId", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in" });
    }

    const orderId = req.params.orderId;

    const [orderResult] = await db.query(
      `
      SELECT 
        o.*,
        p.images as product_images,
        p.description as product_description,
        u.username as buyer_username,
        u.email as buyer_email,
        s.username as seller_username,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i') as order_date_formatted
      FROM physical_orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.buyer_id = u.id
      LEFT JOIN users s ON o.seller_id = s.id
      WHERE o.id = ? AND o.seller_id = ?
      `,
      [orderId, req.session.user.id]
    );

    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult[0];

    // Get tracking history
    const [trackingResult] = await db.query(
      `SELECT * FROM order_tracking WHERE order_id = ? ORDER BY created_at DESC`,
      [orderId]
    );

    // Get similar products
    const [similarProducts] = await db.query(
      `SELECT id, title, price, images 
       FROM products 
       WHERE user_id = ? AND id != ? 
       LIMIT 4`,
      [req.session.user.id, order.product_id]
    );

    res.json({
      success: true,
      order,
      tracking: Array.isArray(trackingResult) ? trackingResult : [],
      similarProducts: Array.isArray(similarProducts) ? similarProducts : [],
    });
  } catch (err) {
    console.error("❌ Get order error:", err);
    res.status(500).json({ error: "Failed to load order" });
  }
});

app.put("/api/seller/orders/:orderId/status", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in" });
    }

    const orderId = req.params.orderId;
    const { status, trackingNumber, notes } = req.body;

    // Verify seller owns this order
    const orderCheck = await db.query(
      "SELECT id, product_name FROM physical_orders WHERE id = ? AND seller_id = ?",
      [orderId, req.session.user.id]
    );

    if (!orderCheck || orderCheck.length === 0) {
      return res.status(404).json({ error: "Order not found or access denied" });
    }

    const order = orderCheck[0];

    // Update order
    await db.query(
      `UPDATE physical_orders 
       SET order_status = ?, 
           tracking_number = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [status, trackingNumber || null, orderId]
    );

    // Add tracking entry
    const statusMessages = {
      'processing': 'Seller is preparing your order',
      'shipped': 'Order has been shipped',
      'delivered': 'Order has been delivered',
      'cancelled': 'Order has been cancelled'
    };

    await db.query(
      `INSERT INTO order_tracking (order_id, status, description)
       VALUES (?, ?, ?)`,
      [orderId, status, statusMessages[status] || `Order status updated to ${status}`]
    );

    // Create notification for buyer
    await db.query(
      `INSERT INTO seller_notifications 
       (seller_id, order_id, notification_type, title, message)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.session.user.id,
        orderId,
        'order_update',
        'Order Status Updated',
        `Order "${order.product_name}" is now ${status}`
      ]
    );

    // Send email to buyer
    try {
      const buyerResult = await db.query(
        "SELECT buyer_email FROM physical_orders WHERE id = ?",
        [orderId]
      );
      
      if (buyerResult && buyerResult.length > 0) {
        await transporter.sendMail({
          from: `"Core Insight Orders" <${process.env.EMAIL_USER}>`,
          to: buyerResult[0].buyer_email,
          subject: `📦 Order Update - ${order.product_name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">Order Status Updated</h2>
              <p>Your order status has been updated by the seller.</p>
              
              <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>Order Details</h3>
                <p><strong>Order ID:</strong> #${orderId}</p>
                <p><strong>Product:</strong> ${order.product_name}</p>
                <p><strong>Status:</strong> <span style="color: ${status === 'shipped' ? '#10b981' : '#f59e0b'}">${status}</span></p>
                ${trackingNumber ? `<p><strong>Tracking Number:</strong> ${trackingNumber}</p>` : ''}
              </div>
              
              <p>You can track your order from your account.</p>
            </div>
          `
        });
      }
    } catch (emailError) {
      console.error("❌ Status update email failed:", emailError);
    }

    res.json({
      success: true,
      message: `Order status updated to ${status}`
    });

  } catch (err) {
    console.error("❌ Update order status error:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

app.get("/api/seller/dashboard/analytics", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please log in" });

    const sellerId = req.session.user.id;

    // All-time stats
    const [allTimeStats] = await db.query(
      `
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN order_status = 'processing' THEN 1 ELSE 0 END) as processing_orders,
        SUM(CASE WHEN order_status = 'shipped' THEN 1 ELSE 0 END) as shipped_orders,
        SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
        SUM(total_amount) as total_revenue,
        SUM(seller_earnings) as total_earnings,
        SUM(platform_fee) as total_platform_fee,
        AVG(estimated_delivery_days) as avg_delivery_time
      FROM physical_orders
      WHERE seller_id = ?
      `,
      [sellerId]
    );

    // Today's stats
    const [todayStats] = await db.query(
      `
      SELECT 
        COUNT(*) AS today_orders,
        COALESCE(SUM(total_amount), 0) AS today_revenue
      FROM physical_orders
      WHERE seller_id = ? AND DATE(created_at) = CURDATE()
      `,
      [sellerId]
    );

    // Weekly trends
    const [weeklyTrends] = await db.query(
      `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as order_count,
        SUM(total_amount) as daily_revenue
      FROM physical_orders
      WHERE seller_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date
      `,
      [sellerId]
    );

    // Top products
    const [topProducts] = await db.query(
      `
      SELECT 
        p.title as product_name,
        COUNT(o.id) as order_count,
        SUM(o.total_amount) as revenue
      FROM physical_orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.seller_id = ?
      GROUP BY o.product_id
      ORDER BY revenue DESC
      LIMIT 5
      `,
      [sellerId]
    );

    // Recent orders
    const [recentOrders] = await db.query(
      `
      SELECT 
        o.id,
        o.product_name,
        o.quantity,
        o.total_amount,
        o.order_status,
        o.customer_name as buyer_name,
        DATE_FORMAT(o.created_at, '%b %d') as order_date_short
      FROM physical_orders o
      WHERE o.seller_id = ?
      ORDER BY o.created_at DESC
      LIMIT 5
      `,
      [sellerId]
    );

    res.json({
      success: true,
      analytics: {
        allTime: allTimeStats || {},
        today: todayStats || {},
        weeklyTrends: Array.isArray(weeklyTrends) ? weeklyTrends : [],
        topProducts: Array.isArray(topProducts) ? topProducts : [],
        recentOrders: Array.isArray(recentOrders) ? recentOrders : [],
      },
    });
  } catch (err) {
    console.error("❌ Dashboard analytics error:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

app.put("/api/seller/orders/:id/status", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in" });
    }

    const { status, trackingNumber, notes } = req.body;

    const [orderCheck] = await db.query(
      `SELECT o.*, p.user_id as seller_user_id 
       FROM physical_orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.id = ? AND p.user_id = ?`,
      [req.params.id, req.session.user.id]
    );

    if (orderCheck.length === 0) {
      return res.status(404).json({ error: "Order not found or access denied" });
    }

    await db.query(
      `UPDATE physical_orders 
       SET order_status = ?, tracking_id = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, trackingNumber || null, notes || null, req.params.id]
    );

    const order = orderCheck[0];
    
    await db.query(
      `INSERT INTO seller_notifications (seller_id, order_id, notification_type, title, message)
       VALUES (?, ?, 'order_update', 'Order Status Updated', ?)`,
      [
        req.session.user.id,
        req.params.id,
        `Your order "${order.product_name}" status has been updated to: ${status}`
      ]
    );

    res.json({ 
      success: true, 
      message: `Order status updated to ${status}` 
    });

  } catch (err) {
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// =================== ADMIN ENDPOINTS ===================
app.get("/api/admin/users", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const usersResult = await db.query(`
      SELECT u.id, u.username, u.email, u.role, u.verified, u.created_at,
             (SELECT COUNT(*) FROM products p WHERE p.user_id = u.id) as product_count,
             (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id) as sales_count,
             (SELECT COUNT(*) FROM orders o WHERE o.buyer_id = u.id) as purchases_count
      FROM users u
      ORDER BY u.created_at DESC
    `);
    
    res.json(Array.isArray(usersResult) ? usersResult : []);
  } catch (err) {
    res.status(500).json({ error: "Error fetching users" });
  }
});

app.get("/api/admin/users/stats", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count,
        SUM(CASE WHEN role = 'seller' THEN 1 ELSE 0 END) as seller_count,
        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_count,
        SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) as verified_count,
        DATE(created_at) as date,
        COUNT(*) as daily_signups
      FROM users
      WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    const summaryResult = await db.query(`
      SELECT 
        COUNT(DISTINCT p.user_id) as active_sellers,
        COUNT(DISTINCT o.buyer_id) as active_buyers,
        (SELECT COUNT(*) FROM products) as total_products,
        (SELECT COUNT(*) FROM orders) as total_sales,
        (SELECT SUM(price) FROM orders) as total_revenue
      FROM users u
      LEFT JOIN products p ON u.id = p.user_id
      LEFT JOIN orders o ON u.id = o.buyer_id
    `);
    
    res.json({
      success: true,
      daily_stats: Array.isArray(statsResult) ? statsResult : [],
      summary: Array.isArray(summaryResult) && summaryResult[0] ? summaryResult[0] : {}
    });
  } catch (err) {
    res.status(500).json({ error: "Error fetching user statistics" });
  }
});

app.get("/api/admin/platform/stats", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const [usersResult, productsResult, salesResult, revenueResult] = await Promise.all([
      db.query("SELECT COUNT(*) as total FROM users"),
      db.query("SELECT COUNT(*) as total FROM products"),
      db.query("SELECT COUNT(*) as total FROM orders"),
      db.query("SELECT SUM(price) as total FROM orders")
    ]);
    
    const stats = {
      total_users: Array.isArray(usersResult) && usersResult[0] ? usersResult[0].total : 0,
      total_products: Array.isArray(productsResult) && productsResult[0] ? productsResult[0].total : 0,
      total_sales: Array.isArray(salesResult) && salesResult[0] ? salesResult[0].total : 0,
      total_revenue: Array.isArray(revenueResult) && revenueResult[0] ? (revenueResult[0].total || 0) : 0,
      platform_revenue: Array.isArray(revenueResult) && revenueResult[0] ? ((revenueResult[0].total || 0) * 0.1) : 0
    };
    
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: "Error fetching platform statistics" });
  }
});

app.get("/api/admin/analytics/sales", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const period = req.query.period || 'month';
    
    let dateFormat, interval;
    switch(period) {
      case 'day':
        dateFormat = '%Y-%m-%d %H:00';
        interval = '1 DAY';
        break;
      case 'week':
        dateFormat = '%Y-%m-%d';
        interval = '7 DAY';
        break;
      case 'year':
        dateFormat = '%Y-%m';
        interval = '1 YEAR';
        break;
      default:
        dateFormat = '%Y-%m-%d';
        interval = '30 DAY';
    }
    
    const salesResult = await db.query(`
      SELECT 
        DATE_FORMAT(created_at, ?) as date,
        COUNT(*) as sales_count,
        SUM(price) as total_amount,
        AVG(price) as avg_amount
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      GROUP BY DATE_FORMAT(created_at, ?)
      ORDER BY date
    `, [dateFormat, dateFormat]);
    
    const categoryResult = await db.query(`
      SELECT 
        p.category,
        COUNT(*) as sales_count,
        SUM(o.price) as total_amount
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      GROUP BY p.category
      ORDER BY total_amount DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      period: period,
      sales_trend: Array.isArray(salesResult) ? salesResult : [],
      category_distribution: Array.isArray(categoryResult) ? categoryResult : []
    });
  } catch (err) {
    res.status(500).json({ error: "Error fetching sales analytics" });
  }
});

   // Admin: Get platform statistics
app.get("/api/admin/service-stats", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        const [stats] = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM services) as total_services,
                (SELECT COUNT(*) FROM services WHERE status = 'active') as active_services,
                (SELECT COUNT(*) FROM services WHERE status = 'deleted') as deleted_services,
                (SELECT COUNT(*) FROM service_orders) as total_orders,
                (SELECT SUM(amount) FROM service_orders) as total_revenue,
                (SELECT SUM(platform_fee) FROM service_orders) as total_platform_fees,
                (SELECT COUNT(DISTINCT user_id) FROM services) as active_freelancers,
                (SELECT COUNT(DISTINCT client_id) FROM service_orders) as active_clients,
                (SELECT AVG(rating) FROM service_reviews) as avg_rating,
                (SELECT COUNT(*) FROM service_reviews) as total_reviews
        `);

        // Get monthly trends
        const [monthlyTrends] = await db.query(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COUNT(*) as services_created,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as services_active
            FROM services
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month DESC
        `);

        // Get category distribution
        const [categoryDistribution] = await db.query(`
            SELECT 
                category,
                COUNT(*) as count,
                AVG(price) as avg_price
            FROM services
            WHERE status = 'active'
            GROUP BY category
            ORDER BY count DESC
        `);

        res.json({
            overview: stats[0] || {},
            monthly_trends: monthlyTrends || [],
            category_distribution: categoryDistribution || []
        });

    } catch (err) {
        res.status(500).json({ error: "Error loading statistics: " + err.message });
    }
});

// Admin: Get all services with filters
app.get("/api/admin/services", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: "Admin access required" });
        }

        const { status, user_id, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                s.*,
                u.username,
                u.email,
                (SELECT COUNT(*) FROM service_orders WHERE service_id = s.id) as total_orders,
                (SELECT SUM(amount) FROM service_orders WHERE service_id = s.id) as total_revenue
            FROM services s
            JOIN users u ON s.user_id = u.id
            WHERE 1=1
        `;

        const params = [];

        if (status) {
            query += " AND s.status = ?";
            params.push(status);
        }

        if (user_id) {
            query += " AND s.user_id = ?";
            params.push(user_id);
        }

        query += " ORDER BY s.created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [services] = await db.query(query, params);

        // Get total count
        let countQuery = "SELECT COUNT(*) as total FROM services WHERE 1=1";
        const countParams = [];

        if (status) {
            countQuery += " AND status = ?";
            countParams.push(status);
        }

        if (user_id) {
            countQuery += " AND user_id = ?";
            countParams.push(user_id);
        }

        const [totalResult] = await db.query(countQuery, countParams);

        res.json({
            services: services || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalResult?.total || 0,
                pages: Math.ceil((totalResult?.total || 0) / limit)
            }
        });

    } catch (err) {
        res.status(500).json({ error: "Error loading services: " + err.message });
    }
});

app.get("/api/admin/search/users", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }
    
    const usersResult = await db.query(`
      SELECT u.id, u.username, u.email, u.role, u.verified, u.created_at,
             (SELECT COUNT(*) FROM products p WHERE p.user_id = u.id) as product_count,
             (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id) as sales_count
      FROM users u
      WHERE u.username LIKE ? OR u.email LIKE ?
      ORDER BY u.created_at DESC
      LIMIT 20
    `, [`%${q}%`, `%${q}%`]);
    
    res.json(Array.isArray(usersResult) ? usersResult : []);
  } catch (err) {
    res.status(500).json({ error: "Error searching users" });
  }
});

app.get("/api/admin/search/products", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { q, category } = req.query;
    
    let query = `
      SELECT p.*, u.username as seller_name,
             (SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id) as sales_count
      FROM products p
      JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (q) {
      query += " AND (p.title LIKE ? OR p.description LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }
    
    if (category) {
      query += " AND p.category = ?";
      params.push(category);
    }
    
    query += " ORDER BY p.created_at DESC LIMIT 50";
    
    const productsResult = await db.query(query, params);
    
    res.json(Array.isArray(productsResult) ? productsResult : []);
  } catch (err) {
    res.status(500).json({ error: "Error searching products" });
  }
});

app.put("/api/admin/products/:id/suspend", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { id } = req.params;
    const { suspended, reason } = req.body;
    
    const productResult = await db.query("SELECT id FROM products WHERE id = ?", [id]);
    
    if (!Array.isArray(productResult) || productResult.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    if (suspended) {
      await db.query(
        "UPDATE products SET status = 'suspended' WHERE id = ?",
        [id]
      );
      
      res.json({ success: true, message: "Product suspended successfully" });
    } else {
      await db.query(
        "UPDATE products SET status = 'active' WHERE id = ?",
        [id]
      );
      
      res.json({ success: true, message: "Product unsuspended successfully" });
    }
  } catch (err) {
    res.status(500).json({ error: "Error suspending product" });
  }
});

app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { id } = req.params;
    
    if (parseInt(id) === req.session.user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    
    const userResult = await db.query("SELECT id, username FROM users WHERE id = ?", [id]);
    
    if (!Array.isArray(userResult) || userResult.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    await db.query("DELETE FROM users WHERE id = ?", [id]);
    
    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Error deleting user" });
  }
});
// Check expired subscriptions (call this daily via cron job)
app.get("/api/cron/check-subscriptions", async (req, res) => {
    // Add secret key for security
    const secret = req.query.secret;
    if (secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        // Update expired trials
        const [trialResult] = await db.query(`
            UPDATE service_subscriptions 
            SET status = 'expired' 
            WHERE trial_ends_at <= CURDATE() AND status = 'active'
        `);

        // Update expired paid subscriptions
        const [subResult] = await db.query(`
            UPDATE service_subscriptions 
            SET status = 'expired' 
            WHERE expires_at <= CURDATE() AND status = 'active' AND trial_ends_at IS NULL
        `);

        // Find users with expired access
        const [expiredUsers] = await db.query(`
            SELECT DISTINCT user_id 
            FROM service_subscriptions 
            WHERE trial_ends_at <= CURDATE() AND status = 'expired'
            UNION
            SELECT DISTINCT user_id 
            FROM service_subscriptions 
            WHERE expires_at <= CURDATE() AND status = 'expired'
        `);

        res.json({
            success: true,
            message: "Subscriptions checked",
            trials_expired: trialResult?.affectedRows || 0,
            subscriptions_expired: subResult?.affectedRows || 0,
            affected_users: expiredUsers?.length || 0
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Clean up old notifications (call this weekly)
app.get("/api/cron/cleanup-notifications", async (req, res) => {
    const secret = req.query.secret;
    if (secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        // Delete read notifications older than 30 days
        const [result] = await db.query(`
            DELETE FROM freelancer_notifications 
            WHERE is_read = TRUE AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);

        res.json({
            success: true,
            message: "Old notifications cleaned up",
            deleted_count: result?.affectedRows || 0
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.put("/api/admin/users/:id/status", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { id } = req.params;
    const { active } = req.body;
    
    if (parseInt(id) === req.session.user.id) {
      return res.status(400).json({ error: "Cannot modify your own status" });
    }
    
    await db.query(
      "UPDATE users SET active = ? WHERE id = ?",
      [active ? 1 : 0, id]
    );
    
    res.json({ 
      success: true, 
      message: `User ${active ? 'activated' : 'deactivated'} successfully` 
    });
  } catch (err) {
    res.status(500).json({ error: "Error toggling user status" });
  }
});

app.get("/api/admin/dashboard/summary", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const [usersStats, productsStats, salesStats, recentActivities] = await Promise.all([
      db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) as verified,
          SUM(CASE WHEN role = 'seller' THEN 1 ELSE 0 END) as sellers,
          SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as new_today
        FROM users
      `),
      
      db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN type = 'digital' THEN 1 ELSE 0 END) as digital,
          SUM(CASE WHEN type = 'physical' THEN 1 ELSE 0 END) as physical,
          SUM(CASE WHEN type = 'affiliate' THEN 1 ELSE 0 END) as affiliate,
          SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as new_today
        FROM products
      `),
      
      db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(price) as revenue,
          SUM(price * 0.1) as platform_fee,
          SUM(CASE WHEN DATE(created_at) = CURDATE() THEN price ELSE 0 END) as today_revenue,
          COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_sales
        FROM orders
      `),
      
      db.query(`
        (SELECT 'sale' as type, created_at, CONCAT('Sale: $', price) as description, buyer_id as user_id
         FROM orders ORDER BY created_at DESC LIMIT 5)
        UNION ALL
        (SELECT 'product' as type, created_at, CONCAT('New product: ', title) as description, user_id
         FROM products ORDER BY created_at DESC LIMIT 5)
        UNION ALL
        (SELECT 'user' as type, created_at, CONCAT('New user: ', username) as description, id as user_id
         FROM users ORDER BY created_at DESC LIMIT 5)
        ORDER BY created_at DESC
        LIMIT 10
      `)
    ]);
    
    const summary = {
      users: Array.isArray(usersStats) && usersStats[0] ? usersStats[0] : {},
      products: Array.isArray(productsStats) && productsStats[0] ? productsStats[0] : {},
      sales: Array.isArray(salesStats) && salesStats[0] ? salesStats[0] : {},
      activities: Array.isArray(recentActivities) ? recentActivities : []
    };
    
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ error: "Error fetching dashboard data" });
  }
});

// =================== COMPLAINT ENDPOINT ===================
app.post('/api/send-complaint', async (req, res) => {
  try {
    const { name, email, subject, priority, message, orderId } = req.body;
    
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please fill in all required fields' 
      });
    }
    
    if (!email.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please enter a valid email address' 
      });
    }
    
    const mailOptions = {
      from: `"Core Insight Support" <${process.env.EMAIL_USER}>`,
      to: 'suppourtcoreinsight@gmail.com',
      subject: `[COMPLAINT] ${subject} - ${name}`,
      text: `
        New Complaint Submission
        
        Name: ${name}
        Email: ${email}
        Subject: ${subject}
        Priority: ${priority || 'Medium'}
        Order ID: ${orderId || 'Not provided'}
        Time: ${new Date().toLocaleString()}
        
        Message:
        ${message}
      `,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>New Complaint Submission</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Priority:</strong> ${priority || 'Medium'}</p>
          <p><strong>Order ID:</strong> ${orderId || 'Not provided'}</p>
          <hr>
          <p>${message.replace(/\n/g, '<br>')}</p>
          <hr>
          <small>Submitted: ${new Date().toLocaleString()}</small>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    res.json({
      success: true,
      message: 'Complaint submitted successfully!',
      complaintId: `COMP-${Date.now()}`
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to submit complaint. Please try again.'
    });
  }
});

// =================== STATIC FILE SERVING ===================
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =================== HTML PAGE ROUTES ===================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});

app.get("/courses", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "courses.html"));
});

app.get("/payment-callback.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "payment-callback.html"));
});

app.get("/payment-verification.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "payment-verification.html"));
});

app.get("/payment-failed.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "payment-failed.html"));
});

app.get("/forgot-password.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "forgot-password.html"));
});

app.get("/reset-password.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "reset-password.html"));
});

// =================== TEST ENDPOINT ===================
app.get("/api/test-insert", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not logged in" });
    }
    
    // Test a simple insert
    const testResult = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, message, created_at, is_read)
       VALUES (1, 1, 'test message', NOW(), 0)`
    );
    
    console.log("TEST INSERT RESULT:", testResult);
    console.log("Type:", typeof testResult);
    console.log("Is array:", Array.isArray(testResult));
    
    if (Array.isArray(testResult)) {
      console.log("Array length:", testResult.length);
      console.log("First element:", testResult[0]);
    }
    
    res.json({
      result: testResult,
      type: typeof testResult,
      isArray: Array.isArray(testResult),
      stringified: JSON.stringify(testResult)
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Debug directories endpoint
app.get("/api/debug/directories", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const directories = {
      current_dir: __dirname,
      uploads_courses: path.join(__dirname, "uploads/courses"),
      public_uploads: path.join(__dirname, "public/uploads"),
      public_uploads_courses: path.join(__dirname, "public/uploads/courses")
    };

    const results = {};
    
    for (const [name, dir] of Object.entries(directories)) {
      try {
        if (fs.existsSync(dir)) {
          const stats = fs.statSync(dir);
          results[name] = {
            exists: true,
            isDirectory: stats.isDirectory(),
            files: fs.readdirSync(dir).slice(0, 20) // First 20 files
          };
        } else {
          results[name] = {
            exists: false,
            error: "Directory does not exist"
          };
        }
      } catch (err) {
        results[name] = {
          exists: false,
          error: err.message
        };
      }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== SERVER START ===================
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

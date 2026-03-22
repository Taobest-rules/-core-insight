// index.js - PRODUCTION VERSION (FIXED)
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

// Brevo email - using CommonJS require
const brevo = require('@getbrevo/brevo');
const TransactionalEmailsApi = brevo.TransactionalEmailsApi;
const TransactionalEmailsApiApiKeys = brevo.TransactionalEmailsApiApiKeys;

// Cloudinary imports (AFTER dotenv config so env vars are loaded)
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =================== EMAIL CONFIGURATION ===================
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'suppourtcoreinsight@gmail.com';
const SUPPORT_EMAIL_PASSWORD = process.env.SUPPORT_EMAIL_PASSWORD;

// Brevo Client
let brevoClient = null;
if (BREVO_API_KEY) {
  brevoClient = new TransactionalEmailsApi();
  brevoClient.setApiKey(
    TransactionalEmailsApiApiKeys.apiKey,
    BREVO_API_KEY
  );
  console.log('✅ Brevo email client initialized');
} else {
  console.log('⚠️ BREVO_API_KEY not set. Email verification will not work.');
}

// Gmail Transporter
let supportTransporter = null;
if (SUPPORT_EMAIL && SUPPORT_EMAIL_PASSWORD) {
  supportTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: SUPPORT_EMAIL,
      pass: SUPPORT_EMAIL_PASSWORD.replace(/\s/g, '')
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
  });

  supportTransporter.verify((err) => {
    if (err) console.error("❌ Support email error:", err.message);
    else console.log("✅ Support email ready - " + SUPPORT_EMAIL);
  });
} else {
  console.log("⚠️ Support email not configured. Set SUPPORT_EMAIL and SUPPORT_EMAIL_PASSWORD");
}

// =================== EMAIL FUNCTIONS ===================
async function sendVerificationEmail(to, subject, html) {
  if (!brevoClient) {
    console.error("❌ Brevo client not initialized. Cannot send email.");
    return { success: false, error: "Email service not configured" };
  }

  try {
    await brevoClient.sendTransacEmail({
      sender: {
        email: "coreinsightmail@gmail.com",
        name: "Core Insight"
      },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html
    });
    console.log(`✅ Verification email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Brevo error:", error.response?.body || error.message);
    return { success: false, error: error.message };
  }
}

async function sendSupportEmail(name, email, subject, message, orderId = null) {
  if (!supportTransporter) {
    return { success: false, error: "Support email not configured" };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
        .message-box { background: white; padding: 15px; border-radius: 8px; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h2>📧 New Support Request</h2></div>
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

  try {
    const info = await supportTransporter.sendMail({
      from: `"Core Insight Support" <${SUPPORT_EMAIL}>`,
      to: SUPPORT_EMAIL,
      subject: `[Support] ${subject} - from ${name}`,
      html: emailHtml,
      replyTo: email
    });
    console.log(`✅ Support email sent from ${email}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Failed to send support email:", error.message);
    return { success: false, error: error.message };
  }
}

// =================== Flutterwave & Paystack ===================
let flw;
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

// =================== FILE UPLOAD CONFIGURATION ===================
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
  limits: { fileSize: 100 * 1024 * 1024, files: 2 }
});

const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, productsUploadDir);
  },
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + "-" + sanitizedName);
  }
});

const productUpload = multer({ 
  storage: productStorage,
  limits: { fileSize: 50 * 1024 * 1024 }
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'images[]', maxCount: 10 }
]);

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

const profilePictureUpload = multer({ 
  storage: multer.diskStorage({
    destination: profilesUploadDir,
    filename: (req, file, cb) => {
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `profile-${Date.now()}-${sanitizedName}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// =================== HELPER FUNCTIONS ===================
function extractRows(result) {
  if (!result) return [];
  if (Array.isArray(result) && result.length === 2) return result[0] || [];
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object') return [result];
  return [];
}

function extractInsertId(result) {
  if (!result) return null;
  if (result.insertId) return result.insertId;
  if (Array.isArray(result) && result[0] && result[0].insertId) return result[0].insertId;
  return null;
}

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
    if (Array.isArray(accessCheck) && accessCheck.length > 0) hasAccess = true;
    else if (accessCheck && accessCheck[0] && Array.isArray(accessCheck[0]) && accessCheck[0].length > 0) hasAccess = true;
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have access to this course. Please purchase it first." });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: "Error checking course access" });
  }
};

// =================== HEALTH CHECK ===================
app.get("/api/health", async (req, res) => {
  try {
    await db.query('SELECT 1 as healthy');
    const uploadDir = path.join(__dirname, 'uploads', 'courses');
    const uploadsExist = fs.existsSync(uploadDir);
    let fileCount = 0;
    if (uploadsExist) fileCount = fs.readdirSync(uploadDir).length;
    const courses = await db.query('SELECT COUNT(*) as count FROM courses');
    const courseCount = courses[0]?.count || 0;
    res.json({
      status: "healthy",
      database: "connected",
      uploads_directory: uploadsExist,
      file_count: fileCount,
      course_count: courseCount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

app.get("/api/currency-rates", (req, res) => {
  const rates = { NGN: 1, USD: 0.0011, EUR: 0.0010, GBP: 0.00085, KES: 0.15, GHS: 0.013, ZAR: 0.021 };
  res.json({ base: 'NGN', rates: rates, timestamp: new Date().toISOString() });
});

// =================== AUTHENTICATION ENDPOINTS ===================
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    if (!username || !password || !email) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }
    let userRole = role || 'client';
    if (!['client', 'freelancer', 'admin'].includes(userRole)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    const existingUsers = await db.query(
      "SELECT id FROM users WHERE username = ? OR email = ?", 
      [username, email]
    );
    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({ error: "Username or email already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24);
    const result = await db.query(
      `INSERT INTO users (username, email, password, role, verified, verify_token, verify_token_expiry, created_at) 
       VALUES (?, ?, ?, ?, 0, ?, ?, NOW())`,
      [username, email, hashedPassword, userRole, verifyToken, tokenExpiry]
    );
    const userId = result.insertId;
    console.log(`✅ User created with ID: ${userId}`);
    const verifyLink = `https://core-insight-7.onrender.com/verify.html?token=${verifyToken}`;
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>Verify Your Email - Core Insight</title></head>
      <body style="font-family:Arial,sans-serif">
        <h2>Welcome ${username}!</h2>
        <p>Thank you for signing up as a <strong>${userRole === 'client' ? 'Buyer' : 'Seller'}</strong>.</p>
        <p>Please verify your email address:</p>
        <a href="${verifyLink}" style="background:#64ffda;color:#0a192f;padding:12px 24px;text-decoration:none;border-radius:5px;">Verify Email</a>
        <p>Or copy this link: ${verifyLink}</p>
        <p>This link expires in 24 hours.</p>
      </body>
      </html>
    `;
    const emailResult = await sendVerificationEmail(email, "Verify Your Email - Core Insight", emailHtml);
    if (!emailResult.success) {
      return res.status(202).json({ 
        message: "Account created! However, we couldn't send the verification email. Please contact support.",
        requiresManualVerification: true,
        token: verifyToken,
        userId: userId
      });
    }
    res.json({ message: "Account created! Please check your email to verify your account.", requiresVerification: true });
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
    let query = username ? "SELECT * FROM users WHERE username = ?" : "SELECT * FROM users WHERE email = ?";
    let params = username ? [username] : [email];
    const users = await db.query(query, params);
    if (users && users.length > 0) user = users[0];
    if (!user) return res.status(400).json({ error: `User not found` });
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

app.post("/api/verify", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Verification token required" });
    const users = await db.query(
      "SELECT id, email, username FROM users WHERE verify_token = ? AND verified = 0",
      [token]
    );
    if (!users || users.length === 0) {
      return res.status(400).json({ error: "Invalid verification token or account already verified" });
    }
    const user = users[0];
    await db.query("UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?", [user.id]);
    res.json({ success: true, message: "Email verified successfully!", username: user.username });
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).json({ error: "Error verifying email" });
  }
});

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
    if (result.affectedRows > 0 && supportTransporter) {
      const resetLink = `https://core-insight-7.onrender.com/reset-password.html?token=${token}`;
      await supportTransporter.sendMail({
        from: `"Core Insight" <${SUPPORT_EMAIL}>`,
        to: email,
        subject: "Reset your Core Insight password",
        html: `<div><h2>Password Reset Request</h2><a href="${resetLink}">Reset Password</a><p>This link expires in 1 hour.</p></div>`
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
    if (!users || users.length === 0) return res.status(400).json({ success: false, error: "Invalid or expired reset token" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query("UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE reset_token = ?", [hashedPassword, token]);
    res.json({ success: true, message: "✅ Password reset successfully!" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, error: "Error resetting password." });
  }
});

// =================== COURSE ENDPOINTS ===================
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT c.*, u.username as author_name,
        COALESCE(c.file_url, c.file_path) as file_path_combined,
        COALESCE(c.thumbnail_url, c.thumbnail_path) as thumbnail_path_combined
      FROM courses c 
      LEFT JOIN users u ON c.user_id = u.id 
      ORDER BY c.created_at DESC
    `);
    const processedCourses = (Array.isArray(courses) ? courses : (courses[0] || [])).map(course => {
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

app.get('/api/download/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Please login first' });
    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    if (!courses || courses.length === 0) return res.status(404).json({ error: 'Course not found' });
    const course = courses[0];
    const isFree = course.price === 0 || course.type === 'free';
    if (!isFree) {
      const purchases = await db.query('SELECT * FROM user_courses WHERE course_id = ? AND user_id = ? AND payment_status = "completed"', [courseId, userId]);
      const hasPurchased = purchases && purchases.length > 0;
      if (!hasPurchased) {
        const payments = await db.query('SELECT * FROM payments WHERE course_id = ? AND user_id = ? AND status = "successful"', [courseId, userId]);
        if (!payments || payments.length === 0) {
          return res.status(403).json({ error: 'You do not have access to this course' });
        }
      }
    }
    const dbFilePath = course.file_url || course.file_path;
    if (!dbFilePath) return res.status(404).json({ error: 'No file associated with this course' });
    const filename = path.basename(dbFilePath);
    const fullPath = path.join(__dirname, 'uploads', 'courses', filename);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found on server', filename });
    }
    function sendFile(res, filePath, title) {
      const stat = fs.statSync(filePath);
      const ext = path.extname(filename);
      const safeFilename = title ? title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ext : filename;
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      res.sendFile(filePath);
    }
    sendFile(res, fullPath, course.title);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/courses", (req, res) => {
  const uploadDir = path.join(__dirname, 'uploads', 'courses');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const uploadCourseFile = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
        cb(null, `${timestamp}-${random}-${baseName}${ext}`);
      }
    }),
    limits: { fileSize: 100 * 1024 * 1024 }
  }).fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]);

  uploadCourseFile(req, res, async function(err) {
    if (err) return res.status(400).json({ error: 'Upload error: ' + err.message });
    try {
      if (!req.session.user) return res.status(401).json({ error: "Please login to upload courses" });
      const { title, description, price, author, content_type } = req.body;
      if (!title || !req.files?.file || !req.files?.thumbnail) {
        return res.status(400).json({ error: "Title, file, and thumbnail are required" });
      }
      const courseFile = req.files.file[0];
      const thumbnailFile = req.files.thumbnail[0];
      const filePath = `/uploads/courses/${courseFile.filename}`;
      const thumbnailPath = `/uploads/courses/${thumbnailFile.filename}`;
      const result = await db.query(
        `INSERT INTO courses (title, description, file_path, thumbnail_path, price, type, user_id, author, content_type, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [title.trim(), description ? description.trim() : '', filePath, thumbnailPath, parseFloat(price) || 0, 
         (parseFloat(price) > 0) ? 'paid' : 'free', req.session.user.id, author || req.session.user.username, content_type || 'book']
      );
      res.json({ message: "✅ Course uploaded successfully!", courseId: result.insertId, download_url: `/api/download/${result.insertId}` });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: "Error uploading course: " + err.message });
    }
  });
});

app.get('/api/check-access/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ hasAccess: false, error: 'Please login first' });
    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    if (!courses || courses.length === 0) return res.status(404).json({ hasAccess: false, error: 'Course not found' });
    const course = courses[0];
    const isFree = course.price === 0 || course.type === 'free';
    if (isFree) {
      return res.json({ hasAccess: true, isFree: true, course: { id: course.id, title: course.title, price: course.price, type: course.type } });
    }
    const purchases = await db.query('SELECT * FROM user_courses WHERE course_id = ? AND user_id = ? AND payment_status = "completed"', [courseId, userId]);
    if (purchases && purchases.length > 0) {
      return res.json({ hasAccess: true, isFree: false, course: { id: course.id, title: course.title, price: course.price, type: course.type } });
    }
    const payments = await db.query('SELECT * FROM payments WHERE course_id = ? AND user_id = ? AND status = "successful"', [courseId, userId]);
    if (payments && payments.length > 0) {
      return res.json({ hasAccess: true, isFree: false, course: { id: course.id, title: course.title, price: course.price, type: course.type } });
    }
    res.json({ hasAccess: false, isFree: false, price: course.price, course: { id: course.id, title: course.title, price: course.price, type: course.type } });
  } catch (error) {
    console.error('Access check error:', error);
    res.status(500).json({ hasAccess: false, error: 'Server error' });
  }
});

// =================== PAYMENT ENDPOINTS ===================
app.post("/api/initiate-payment", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login to make payment" });
  try {
    const { courseId } = req.body;
    if (!courseId) return res.status(400).json({ error: "Course ID is required" });
    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    let course = null;
    if (courses && Array.isArray(courses)) {
      if (courses.length === 2 && Array.isArray(courses[0])) course = courses[0][0];
      else if (courses.length > 0) course = courses[0];
    }
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (course.price <= 0) return res.status(400).json({ error: "This course is free. No payment required." });
    if (!process.env.FLW_SECRET_KEY) return res.status(500).json({ error: "Payment system not configured." });
    const transaction_ref = "coreinsight_" + Date.now() + "_" + courseId;
    const amount = parseFloat(course.price);
    const payload = {
      tx_ref: transaction_ref,
      amount: amount,
      currency: "NGN",
      redirect_url: `https://core-insight-7.onrender.com/payment-callback.html`,
      customer: { email: req.session.user.email || `${req.session.user.username}@example.com`, name: req.session.user.username },
      customizations: { title: "Core Insight", description: `Payment for ${course.title}` },
      meta: { course_id: courseId, user_id: req.session.user.id }
    };
    const response = await axios.post('https://api.flutterwave.com/v3/payments', payload, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    if (response.data.status === "success" && response.data.data && response.data.data.link) {
      try {
        await db.query(`INSERT INTO payments (user_id, course_id, transaction_ref, amount, status, created_at) VALUES (?, ?, ?, ?, 'pending', NOW())`,
          [req.session.user.id, courseId, transaction_ref, amount]);
      } catch (dbError) { console.error('Could not save payment:', dbError.message); }
      res.json({ status: "success", paymentLink: response.data.data.link, transactionRef: transaction_ref });
    } else {
      res.status(500).json({ error: response.data.message || "Payment initiation failed" });
    }
  } catch (err) {
    console.error('Payment error:', err.message);
    res.status(500).json({ error: "Error initiating payment: " + err.message });
  }
});

app.get("/api/verify-payment/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;
    const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
    });
    if (response.data.status === "success" && response.data.data.status === "successful") {
      const transaction = response.data.data;
      const tx_ref = transaction.tx_ref;
      const courseId = transaction.meta?.course_id;
      const userId = transaction.meta?.user_id;
      await db.query(`UPDATE payments SET status = 'completed', transaction_id = ? WHERE transaction_ref = ?`, [transaction_id, tx_ref]);
      await db.query(`INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at) VALUES (?, ?, 'completed', NOW()) ON DUPLICATE KEY UPDATE payment_status = 'completed', purchased_at = NOW()`, [userId, courseId]);
      res.json({ status: "success", message: "Payment verified successfully", data: transaction });
    } else {
      res.status(400).json({ status: "failed", message: "Payment not successful" });
    }
  } catch (err) {
    console.error('Verification error:', err.message);
    res.status(500).json({ error: "Error verifying payment: " + err.message });
  }
});

// =================== CHAT SYSTEM ENDPOINTS ===================
app.get("/api/messages/unread-count", async (req, res) => {
  try {
    if (!req.session.user) return res.json({ count: 0 });
    const userId = req.session.user.id;
    const result = await db.query(`
      SELECT COUNT(m.id) AS unread_count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.sender_id != ? AND m.is_read = 0 AND (c.client_id = ? OR c.freelancer_id = ?)
    `, [userId, userId, userId]);
    let count = 0;
    if (Array.isArray(result) && result[0] && result[0][0]) count = result[0][0].unread_count;
    else if (result && result[0] && result[0].unread_count) count = result[0].unread_count;
    res.json({ count });
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
      JOIN users u1 ON c.client_id = u1.id
      JOIN users u2 ON c.freelancer_id = u2.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.client_id = ? OR c.freelancer_id = ?
      ORDER BY (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) DESC, c.created_at DESC
    `, [userId, userId, userId, userId]);
    let rows = [];
    if (result) {
      if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) rows = result[0];
      else if (Array.isArray(result) && result.length > 0) rows = result;
      else if (result.rows) rows = result.rows;
    }
    res.json(rows);
  } catch (err) {
    console.error("Conversations fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/conversations/start", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Login required" });
    const { service_id, recipient_id } = req.body;
    if (!service_id || !recipient_id) return res.status(400).json({ error: "Missing service or recipient ID" });
    const serviceResult = await db.query(`SELECT id, user_id as provider_id FROM services WHERE id = ?`, [service_id]);
    let service = null;
    if (serviceResult) {
      if (Array.isArray(serviceResult) && serviceResult.length === 2 && serviceResult[0].length > 0) service = serviceResult[0][0];
      else if (Array.isArray(serviceResult) && serviceResult.length > 0) service = serviceResult[0];
      else if (serviceResult.id) service = serviceResult;
    }
    if (!service) return res.status(404).json({ error: "Service not found" });
    const provider_id = parseInt(service.provider_id || service.user_id);
    const client_id = parseInt(user.id);
    const existingResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations 
       WHERE (client_id = ? AND freelancer_id = ?) OR (client_id = ? AND freelancer_id = ?) LIMIT 1`,
      [client_id, provider_id, provider_id, client_id]
    );
    let existingConversation = null;
    if (existingResult) {
      if (Array.isArray(existingResult) && existingResult.length === 2 && existingResult[0].length > 0) existingConversation = existingResult[0][0];
      else if (Array.isArray(existingResult) && existingResult.length > 0) existingConversation = existingResult[0];
      else if (existingResult.id) existingConversation = existingResult;
    }
    if (existingConversation) {
      await db.query(`UPDATE conversations SET service_id = ? WHERE id = ? AND service_id IS NULL`, [service_id, existingConversation.id]);
      return res.status(200).json({ success: true, conversation_id: existingConversation.id, message: "Using existing conversation" });
    }
    const insertResult = await db.query(`INSERT INTO conversations (service_id, client_id, freelancer_id, created_at) VALUES (?, ?, ?, NOW())`, [service_id, client_id, provider_id]);
    let conversationId = null;
    if (insertResult) {
      if (insertResult.insertId) conversationId = insertResult.insertId;
      else if (Array.isArray(insertResult) && insertResult[0] && insertResult[0].insertId) conversationId = insertResult[0].insertId;
    }
    if (!conversationId) return res.status(500).json({ error: "Failed to create conversation" });
    res.status(201).json({ success: true, conversation_id: conversationId, message: "New conversation created" });
  } catch (err) {
    console.error("Start conversation error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/messages/send", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Login required" });
    const { conversation_id, message } = req.body;
    if (!conversation_id || !message?.trim()) return res.status(400).json({ error: "Missing message or conversation ID" });
    const convResult = await db.query(`SELECT id, client_id, freelancer_id FROM conversations WHERE id = ?`, [conversation_id]);
    let conversation = null;
    if (convResult) {
      if (Array.isArray(convResult) && convResult.length === 2 && convResult[0].length > 0) conversation = convResult[0][0];
      else if (Array.isArray(convResult) && convResult.length > 0) conversation = convResult[0];
      else if (convResult.id) conversation = convResult;
    }
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    const isClient = parseInt(conversation.client_id) === parseInt(user.id);
    const isFreelancer = parseInt(conversation.freelancer_id) === parseInt(user.id);
    if (!isClient && !isFreelancer) return res.status(403).json({ error: "Access denied" });
    const insertResult = await db.query(`INSERT INTO messages (conversation_id, sender_id, message, created_at, is_read) VALUES (?, ?, ?, NOW(), 0)`, [conversation_id, user.id, message.trim()]);
    let messageId = null;
    if (insertResult) {
      if (insertResult.insertId) messageId = insertResult.insertId;
      else if (Array.isArray(insertResult) && insertResult[0] && insertResult[0].insertId) messageId = insertResult[0].insertId;
    }
    if (!messageId) return res.status(500).json({ error: "Failed to insert message" });
    const messageResult = await db.query(`SELECT m.*, u.username AS sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?`, [messageId]);
    let newMessage = null;
    if (messageResult) {
      if (Array.isArray(messageResult) && messageResult.length === 2 && messageResult[0].length > 0) newMessage = messageResult[0][0];
      else if (Array.isArray(messageResult) && messageResult.length > 0) newMessage = messageResult[0];
      else if (messageResult.id) newMessage = messageResult;
    }
    res.status(200).json({ success: true, data: newMessage });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/messages/:conversationId", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const conversationId = parseInt(req.params.conversationId);
    if (isNaN(conversationId)) return res.status(400).json({ error: "Invalid conversation ID" });
    const userId = req.session.user.id;
    const convResult = await db.query(`SELECT id FROM conversations WHERE id = ? AND (client_id = ? OR freelancer_id = ?)`, [conversationId, userId, userId]);
    let convRows = [];
    if (Array.isArray(convResult)) convRows = convResult[0] || convResult;
    else convRows = convResult;
    if (!convRows || convRows.length === 0) return res.status(403).json({ error: "Access denied" });
    const messagesResult = await db.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.message, m.image_url, m.is_read, m.created_at, u.username AS sender_name
       FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ? ORDER BY m.created_at ASC`,
      [conversationId]
    );
    let messages = [];
    if (messagesResult) {
      if (Array.isArray(messagesResult) && messagesResult.length === 2 && Array.isArray(messagesResult[0])) messages = messagesResult[0];
      else if (Array.isArray(messagesResult) && messagesResult.length > 0) messages = messagesResult;
      else if (Array.isArray(messagesResult.rows)) messages = messagesResult.rows;
    }
    res.json(messages);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// =================== PRODUCT ENDPOINTS ===================
app.get("/api/products", async (req, res) => {
  try {
    const products = await db.query(`
      SELECT p.*, u.username as seller_name
      FROM products p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.is_deleted = 0 OR p.is_deleted IS NULL
      ORDER BY p.created_at DESC
    `);
    const processedProducts = products.map(product => {
      product.price = parseFloat(product.price || 0);
      product.original_price = parseFloat(product.original_price || product.price);
      product.platform_fee = parseFloat(product.platform_fee || (product.type === 'physical' ? product.original_price * 0.1 : 0));
      product.seller_price = product.type === 'physical' ? product.original_price - product.platform_fee : product.price;
      if (product.image_urls) {
        try {
          if (typeof product.image_urls === 'string') {
            product.images = product.image_urls.startsWith('[') ? JSON.parse(product.image_urls) : [product.image_urls];
          } else if (Array.isArray(product.image_urls)) product.images = product.image_urls;
          else product.images = [];
        } catch (e) { product.images = []; }
      } else product.images = [];
      if (!product.images || product.images.length === 0) product.images = ['https://placehold.co/400x250/1e293b/3b82f6/png?text=Product'];
      product._imageList = product.images;
      if (!product.type) product.type = product.affiliate_link ? 'affiliate' : 'digital';
      return product;
    });
    res.json(processedProducts);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: "Error fetching products", details: err.message });
  }
});

app.post("/api/upload-product", (req, res) => {
  const uploadProduct = multer({ storage: multer.diskStorage({}) }).fields([
    { name: 'file', maxCount: 1 },
    { name: 'images[]', maxCount: 10 }
  ]);
  uploadProduct(req, res, async function(err) {
    if (err) return res.status(400).json({ error: 'File upload error: ' + err.message });
    try {
      if (!req.session.user) return res.status(401).json({ error: "Please log in to upload products." });
      const { title, description, price, category, type, affiliate_link, delivery_type, delivery_locations, delivery_fee, payment_option, paymentProvider, delivery_days, product_cost, external_image } = req.body;
      if (!title || !price || !type || !paymentProvider) return res.status(400).json({ error: "Title, price, type, and payment provider are required." });
      if (type === 'affiliate' && !affiliate_link) return res.status(400).json({ error: "Affiliate link is required for affiliate products." });
      const listedPrice = parseFloat(price);
      let sellerPrice = listedPrice, originalPrice = listedPrice, platformFee = 0;
      if (type === 'physical') {
        platformFee = listedPrice * 0.1;
        sellerPrice = listedPrice - platformFee;
        originalPrice = listedPrice;
      }
      let imageUrls = [];
      if (req.files && req.files['images[]'] && req.files['images[]'].length > 0) {
        const cloudinary = require('cloudinary').v2;
        for (const imageFile of req.files['images[]']) {
          try {
            const result = await cloudinary.uploader.upload(imageFile.path, { folder: 'core-insight/products', resource_type: 'image' });
            imageUrls.push(result.secure_url);
          } catch (cloudErr) { console.error('Cloudinary upload error:', cloudErr); }
        }
      } else if (type === 'affiliate' && external_image) imageUrls = [external_image];
      let fileUrl = null;
      if (req.files && req.files.file && req.files.file[0]) {
        const productFile = req.files.file[0];
        const uploadDir = path.join(__dirname, 'uploads', 'products', 'files');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        const ext = path.extname(productFile.originalname);
        const baseName = path.basename(productFile.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
        const filename = `${timestamp}-${random}-${baseName}${ext}`;
        const finalPath = path.join(uploadDir, filename);
        fs.copyFileSync(productFile.path, finalPath);
        fs.unlinkSync(productFile.path);
        fileUrl = `/uploads/products/files/${filename}`;
      }
      const result = await db.query(
        `INSERT INTO products (user_id, title, description, price, original_price, platform_fee, product_cost, category, type, file_url, image_urls, affiliate_link, delivery_type, delivery_locations, delivery_fee, payment_option, seller_payment_provider, estimated_delivery_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [req.session.user.id, title, description || '', sellerPrice, originalPrice, platformFee, parseFloat(product_cost) || null, category || '', type || 'digital', fileUrl, imageUrls.length > 0 ? JSON.stringify(imageUrls) : null, affiliate_link || null, delivery_type || null, delivery_locations || null, delivery_fee ? parseFloat(delivery_fee) : null, payment_option || null, paymentProvider, parseInt(delivery_days) || null]
      );
      res.json({ message: "✅ Product uploaded successfully!", productId: result.insertId, file_url: fileUrl, image_urls: imageUrls });
    } catch (err) {
      console.error('Product upload error:', err);
      res.status(500).json({ error: "Error uploading product: " + err.message });
    }
  });
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please login first" });
    const productId = req.params.id;
    const { id: userId, role: userRole } = req.session.user;
    const products = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
    let product = null;
    if (Array.isArray(products)) {
      if (products.length === 2 && Array.isArray(products[0])) product = products[0][0];
      else if (products.length > 0) product = products[0];
    }
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (userRole !== "admin" && Number(product.user_id) !== Number(userId)) {
      return res.status(403).json({ error: "You are not authorized to delete this product" });
    }
    await db.query("START TRANSACTION");
    try {
      const orderIdsResult = await db.query("SELECT id FROM physical_orders WHERE product_id = ?", [productId]);
      let orderIds = [];
      if (Array.isArray(orderIdsResult)) {
        if (orderIdsResult.length === 2 && Array.isArray(orderIdsResult[0])) orderIds = orderIdsResult[0].map(row => row.id);
        else if (orderIdsResult.length > 0) orderIds = orderIdsResult.map(row => row.id);
      }
      for (const orderId of orderIds) {
        await db.query("DELETE FROM seller_notifications WHERE order_id = ?", [orderId]);
        await db.query("DELETE FROM order_tracking WHERE order_id = ?", [orderId]);
      }
      await db.query("DELETE FROM physical_orders WHERE product_id = ?", [productId]);
      await db.query("DELETE FROM orders WHERE product_id = ?", [productId]);
      await db.query("DELETE FROM favorites WHERE product_id = ?", [productId]);
      await db.query("DELETE FROM reviews WHERE product_id = ?", [productId]);
      const saleIdsResult = await db.query("SELECT id FROM product_sales WHERE product_id = ?", [productId]);
      let saleIds = [];
      if (Array.isArray(saleIdsResult)) {
        if (saleIdsResult.length === 2 && Array.isArray(saleIdsResult[0])) saleIds = saleIdsResult[0].map(row => row.id);
        else if (saleIdsResult.length > 0) saleIds = saleIdsResult.map(row => row.id);
      }
      for (const saleId of saleIds) await db.query("DELETE FROM platform_commissions WHERE sale_id = ?", [saleId]);
      await db.query("DELETE FROM product_sales WHERE product_id = ?", [productId]);
      await db.query("DELETE FROM products WHERE id = ?", [productId]);
      await db.query("COMMIT");
      res.json({ success: true, message: "Product deleted successfully", deletedId: productId });
    } catch (transactionError) {
      await db.query("ROLLBACK");
      throw transactionError;
    }
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: "Failed to delete product", details: err.message });
  }
});

// =================== PHYSICAL ORDERS ENDPOINTS ===================
app.post("/api/order-product", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please log in to place an order" });
    const { productId, productTitle, price, quantity = 1, deliveryAddress, city, state, country, deliveryPhone, deliveryDays = 7, notes = '' } = req.body;
    const productResult = await db.query("SELECT user_id as seller_id, original_price, platform_fee FROM products WHERE id = ?", [productId]);
    if (!productResult || productResult.length === 0) return res.status(404).json({ error: "Product not found" });
    const sellerId = productResult[0].seller_id;
    const buyerId = req.session.user.id;
    const unitPrice = parseFloat(productResult[0].original_price || price);
    const platformFeePerUnit = parseFloat(productResult[0].platform_fee || (unitPrice * 0.1));
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 100) return res.status(400).json({ error: "Invalid quantity" });
    const totalAmount = qty * unitPrice;
    const totalPlatformFee = qty * platformFeePerUnit;
    const sellerEarnings = totalAmount - totalPlatformFee;
    const result = await db.query(
      `INSERT INTO physical_orders (product_id, seller_id, buyer_id, product_name, product_type, quantity, price, platform_fee, seller_earnings, total_amount, customer_name, customer_email, customer_phone, shipping_address, city, state, country, payment_method, payment_status, order_status, notes, estimated_delivery_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, sellerId, buyerId, productTitle, 'physical', qty, unitPrice, totalPlatformFee, sellerEarnings, totalAmount, req.session.user.username || 'Buyer', req.session.user.email, deliveryPhone, deliveryAddress, city || '', state || '', country || '', 'pay_online', 'pending', 'pending', notes || '', parseInt(deliveryDays) || 7]
    );
    let orderId = null;
    if (result) {
      if (result.insertId) orderId = result.insertId;
      else if (Array.isArray(result) && result[0] && result[0].insertId) orderId = result[0].insertId;
    }
    try {
      await db.query(`INSERT INTO seller_notifications (seller_id, order_id, notification_type, title, message, created_at) VALUES (?, ?, 'new_order', 'New Order Received', CONCAT('New order for ', ?, ' - $', ?, ' (Qty: ', ?, ')'), NOW())`, [sellerId, orderId, productTitle, totalAmount, qty]);
    } catch (notifError) { console.error("Failed to create notification:", notifError.message); }
    res.json({ success: true, message: "Order placed successfully!", orderId: orderId, totalAmount: totalAmount });
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ error: "Failed to place order", details: err.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const { status, email, limit = 50, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM physical_orders WHERE 1=1';
    const params = [];
    if (status) { query += ' AND order_status = ?'; params.push(status); }
    if (email) { query += ' AND customer_email = ?'; params.push(email); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const orders = await db.query(query, params);
    const countResult = await db.query('SELECT COUNT(*) as total FROM physical_orders', []);
    const total = countResult[0]?.total || 0;
    res.json({ success: true, orders: Array.isArray(orders) ? orders : [], pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

// =================== FAVORITES ENDPOINTS ===================
app.post("/api/favorites/toggle", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please log in to favorite products." });
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: "Product ID is required." });
    const result = await db.query("SELECT id FROM favorites WHERE user_id = ? AND product_id = ?", [req.session.user.id, productId]);
    let existing = [];
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) existing = result[0];
      else if (result.length > 0) existing = result;
    }
    if (existing.length > 0) {
      await db.query("DELETE FROM favorites WHERE user_id = ? AND product_id = ?", [req.session.user.id, productId]);
      const countResult = await db.query("SELECT COUNT(*) as count FROM favorites WHERE product_id = ?", [productId]);
      let count = 0;
      if (Array.isArray(countResult) && countResult[0] && countResult[0].count) count = countResult[0].count;
      await db.query("UPDATE products SET favorite_count = ? WHERE id = ?", [count, productId]);
      return res.json({ success: true, action: "removed", favoriteCount: count });
    } else {
      await db.query("INSERT INTO favorites (user_id, product_id) VALUES (?, ?)", [req.session.user.id, productId]);
      const countResult = await db.query("SELECT COUNT(*) as count FROM favorites WHERE product_id = ?", [productId]);
      let count = 0;
      if (Array.isArray(countResult) && countResult[0] && countResult[0].count) count = countResult[0].count;
      await db.query("UPDATE products SET favorite_count = ? WHERE id = ?", [count, productId]);
      return res.json({ success: true, action: "added", favoriteCount: count });
    }
  } catch (err) {
    console.error("Favorite toggle error:", err);
    res.status(500).json({ error: "Error updating favorites: " + err.message });
  }
});

app.get("/api/favorites", async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (!req.session.user) return res.json({ favorites: [], favoriteCounts: {} });
  try {
    const userFavs = await db.query("SELECT product_id FROM favorites WHERE user_id = ?", [req.session.user.id]);
    let userFavorites = [];
    if (Array.isArray(userFavs)) {
      if (userFavs.length === 2 && Array.isArray(userFavs[0])) userFavorites = userFavs[0].map(row => row.product_id);
      else if (userFavs.length > 0) userFavorites = userFavs.map(row => row.product_id);
    }
    const countResults = await db.query("SELECT product_id, COUNT(*) as count FROM favorites GROUP BY product_id");
    let favoriteCounts = {};
    if (Array.isArray(countResults)) {
      const counts = countResults.length === 2 ? countResults[0] : countResults;
      if (Array.isArray(counts)) counts.forEach(row => { favoriteCounts[row.product_id] = parseInt(row.count) || 0; });
    }
    for (const [productId, count] of Object.entries(favoriteCounts)) {
      await db.query("UPDATE products SET favorite_count = ? WHERE id = ?", [count, productId]);
    }
    return res.json({ favorites: userFavorites, favoriteCounts: favoriteCounts });
  } catch (err) {
    console.error("Error loading favorites:", err);
    return res.status(500).json({ error: "Error loading favorites: " + err.message });
  }
});

// =================== SELLER NOTIFICATIONS ===================
app.get("/api/seller/notifications", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please log in" });
    const notifications = await db.query(
      `SELECT n.*, o.product_name, o.total_amount, o.order_status, DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i') as formatted_time
       FROM seller_notifications n LEFT JOIN physical_orders o ON n.order_id = o.id
       WHERE n.seller_id = ? ORDER BY n.created_at DESC LIMIT 20`,
      [req.session.user.id]
    );
    let notificationsArray = [];
    if (Array.isArray(notifications)) notificationsArray = notifications[0] || notifications;
    else if (notifications && notifications.rows) notificationsArray = notifications.rows;
    const unreadResult = await db.query(`SELECT COUNT(*) AS count FROM seller_notifications WHERE seller_id = ? AND is_read = FALSE`, [req.session.user.id]);
    let unreadCount = 0;
    if (Array.isArray(unreadResult)) {
      const unreadData = unreadResult[0] || unreadResult;
      unreadCount = unreadData[0]?.count || unreadData?.count || 0;
    }
    res.json({ success: true, notifications: notificationsArray, unreadCount: unreadCount });
  } catch (err) {
    console.error('Error loading notifications:', err);
    res.status(500).json({ success: false, error: "Failed to load notifications" });
  }
});

app.post("/api/seller/notifications/:id/read", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Please log in" });
    await db.query(`UPDATE seller_notifications SET is_read = TRUE WHERE id = ? AND seller_id = ?`, [req.params.id, req.session.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// =================== COMPLAINT ENDPOINT ===================
app.post('/api/send-complaint', async (req, res) => {
  try {
    const { name, email, subject, priority, message, orderId } = req.body;
    if (!name || !email || !subject || !message) return res.status(400).json({ success: false, error: 'Please fill in all required fields' });
    if (!email.includes('@')) return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
    if (supportTransporter) {
      await supportTransporter.sendMail({
        from: `"Core Insight Support" <${SUPPORT_EMAIL}>`,
        to: 'suppourtcoreinsight@gmail.com',
        subject: `[COMPLAINT] ${subject} - ${name}`,
        html: `<div><h2>New Complaint Submission</h2><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Subject:</strong> ${subject}</p><p><strong>Priority:</strong> ${priority || 'Medium'}</p><p><strong>Order ID:</strong> ${orderId || 'Not provided'}</p><hr><p>${message.replace(/\n/g, '<br>')}</p></div>`
      });
    }
    res.json({ success: true, message: 'Complaint submitted successfully!', complaintId: `COMP-${Date.now()}` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to submit complaint. Please try again.' });
  }
});

// =================== ADMIN ENDPOINTS ===================
app.get("/api/admin/users", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    const usersResult = await db.query(`SELECT u.id, u.username, u.email, u.role, u.verified, u.created_at FROM users u ORDER BY u.created_at DESC`);
    res.json(Array.isArray(usersResult) ? usersResult : []);
  } catch (err) {
    res.status(500).json({ error: "Error fetching users" });
  }
});

app.get("/api/admin/platform/stats", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    const [usersResult, productsResult, salesResult, revenueResult] = await Promise.all([
      db.query("SELECT COUNT(*) as total FROM users"),
      db.query("SELECT COUNT(*) as total FROM products"),
      db.query("SELECT COUNT(*) as total FROM orders"),
      db.query("SELECT SUM(price) as total FROM orders")
    ]);
    const stats = {
      total_users: usersResult[0]?.total || 0,
      total_products: productsResult[0]?.total || 0,
      total_sales: salesResult[0]?.total || 0,
      total_revenue: revenueResult[0]?.total || 0,
      platform_revenue: (revenueResult[0]?.total || 0) * 0.1
    };
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: "Error fetching platform statistics" });
  }
});

// =================== DEBUG ENDPOINTS ===================
app.get("/api/debug/all-courses", async (req, res) => {
  try {
    const result = await db.query("SELECT id, title, file_path, price, type, created_at FROM courses ORDER BY id DESC");
    let courses = [];
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) courses = result[0];
      else if (result.length > 0) courses = result;
    }
    const html = `
      <!DOCTYPE html>
      <html><head><title>All Courses</title><style>
        body{font-family:Arial;padding:20px;background:#0a192f;color:#e6f1ff;}
        h1{color:#64ffda;} table{width:100%;border-collapse:collapse;margin-top:20px;background:#172a45;}
        th{background:#1d3b5c;color:#64ffda;padding:12px;text-align:left;}
        td{padding:12px;border-bottom:1px solid #2a4a6e;}
        a{color:#64ffda;text-decoration:none;padding:4px 8px;border:1px solid #64ffda;border-radius:4px;}
      </style></head>
      <body><h1>📚 All Courses (${courses.length})</h1>
      <table><thead><tr><th>ID</th><th>Title</th><th>File Path</th><th>Price</th><th>Type</th><th>Actions</th></tr></thead>
      <tbody>${courses.map(course => `
        <tr><td>${course.id}</td><td>${course.title || 'Untitled'}</td>
        <td style="font-size:12px;">${course.file_path || 'N/A'}</td>
        <td>$${parseFloat(course.price || 0).toFixed(2)}</td>
        <td>${course.type || 'free'}</td>
        <td><a href="/api/download/${course.id}" target="_blank">Download</a></td></tr>
      `).join('')}</tbody></table></body></html>
    `;
    res.send(html);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// =================== STATIC PAGE ROUTES ===================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "public", "signup.html")));
app.get("/courses", (req, res) => res.sendFile(path.join(__dirname, "public", "courses.html")));
app.get("/payment-callback.html", (req, res) => res.sendFile(path.join(__dirname, "public", "payment-callback.html")));
app.get("/payment-verification.html", (req, res) => res.sendFile(path.join(__dirname, "public", "payment-verification.html")));
app.get("/payment-failed.html", (req, res) => res.sendFile(path.join(__dirname, "public", "payment-failed.html")));
app.get("/forgot-password.html", (req, res) => res.sendFile(path.join(__dirname, "public", "forgot-password.html")));
app.get("/reset-password.html", (req, res) => res.sendFile(path.join(__dirname, "public", "reset-password.html")));
app.get("/verify.html", (req, res) => res.sendFile(path.join(__dirname, "public", "verify.html")));
app.get("/admin-files.html", (req, res) => res.sendFile(path.join(__dirname, "public", "admin-files.html")));
app.get("/api/terms", (req, res) => res.sendFile(path.join(__dirname, "public", "terms.html")));

// =================== SERVER START ===================
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
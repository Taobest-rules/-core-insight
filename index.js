  // index.js - COMPLETE PRODUCTION VERSION (Gmail Only - All Features)
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

// Cloudinary imports
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

// =================== GMAIL EMAIL CONFIGURATION ===================
const VERIFICATION_EMAIL = process.env.VERIFICATION_EMAIL || 'coreinsightmail@gmail.com';
const VERIFICATION_EMAIL_PASSWORD = process.env.VERIFICATION_EMAIL_PASSWORD;
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'suppourtcoreinsight@gmail.com';
const SUPPORT_EMAIL_PASSWORD = process.env.SUPPORT_EMAIL_PASSWORD;

let verificationTransporter = null;
let supportTransporter = null;

const emailConfig = {
  service: "gmail",
  tls: { rejectUnauthorized: false },
  connectionTimeout: 60000,
  greetingTimeout: 60000,
  socketTimeout: 60000,
  pool: true,
  maxConnections: 5
};

if (VERIFICATION_EMAIL && VERIFICATION_EMAIL_PASSWORD) {
  verificationTransporter = nodemailer.createTransport({
    ...emailConfig,
    auth: { user: VERIFICATION_EMAIL, pass: VERIFICATION_EMAIL_PASSWORD.replace(/\s/g, '') }
  });
  console.log("✅ Verification email configured - " + VERIFICATION_EMAIL);
}

if (SUPPORT_EMAIL && SUPPORT_EMAIL_PASSWORD) {
  supportTransporter = nodemailer.createTransport({
    ...emailConfig,
    auth: { user: SUPPORT_EMAIL, pass: SUPPORT_EMAIL_PASSWORD.replace(/\s/g, '') }
  });
  console.log("✅ Support email configured - " + SUPPORT_EMAIL);
}

// Email helper with retry
async function sendWithRetry(transporter, mailOptions, maxRetries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.log(`Email attempt ${attempt} failed: ${error.message}`);
      if (attempt < maxRetries) await new Promise(resolve => setTimeout(resolve, delay));
      else return { success: false, error: error.message };
    }
  }
}

async function sendVerificationEmail(to, subject, html) {
  if (!verificationTransporter) return { success: false, error: "Email not configured", skipped: true };
  const styledHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>${subject}</title>
    <style>
      body{font-family:Arial;line-height:1.6;background:#f4f4f4;margin:0;padding:0}
      .container{max-width:600px;margin:0 auto;padding:20px}
      .header{background:linear-gradient(135deg,#0a192f,#172a45);padding:30px;text-align:center;border-radius:10px 10px 0 0}
      .header h1{color:#64ffda;margin:0;font-size:28px}
      .content{background:#fff;padding:30px;border-radius:0 0 10px 10px;color:#333}
      .button{display:inline-block;padding:12px 24px;background:#64ffda;color:#0a192f;text-decoration:none;border-radius:5px;margin:20px 0;font-weight:bold}
      .footer{text-align:center;padding:20px;font-size:12px;color:#666;border-top:1px solid #eee}
    </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>🎓 Core Insight</h1></div>
        <div class="content">${html}</div>
        <div class="footer"><p>© 2024 Core Insight</p><p>Contact: ${SUPPORT_EMAIL}</p></div>
      </div>
    </body>
    </html>
  `;
  return sendWithRetry(verificationTransporter, {
    from: `"Core Insight" <${VERIFICATION_EMAIL}>`,
    to, subject, html: styledHtml
  });
}

async function sendSupportEmail(name, email, subject, message, orderId = null) {
  if (!supportTransporter) return { success: false, error: "Support email not configured" };
  const emailHtml = `
    <div style="font-family:Arial">
      <h2>New Support Request</h2>
      <p><strong>From:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      ${orderId ? `<p><strong>Order ID:</strong> ${orderId}</p>` : ''}
      <hr><p>${message.replace(/\n/g, '<br>')}</p>
    </div>
  `;
  return sendWithRetry(supportTransporter, {
    from: `"Core Insight Support" <${SUPPORT_EMAIL}>`,
    to: SUPPORT_EMAIL,
    subject: `[Support] ${subject} - from ${name}`,
    html: emailHtml,
    replyTo: email
  });
}

async function sendOrderConfirmationEmail(orderDetails) {
  const { email, orderId, productName, quantity, totalAmount, deliveryAddress, deliveryDays } = orderDetails;
  const html = `
    <h2>Thank you for your order! 🎉</h2>
    <p>Your order has been received and is being processed.</p>
    <div style="background:#f1f5f9;padding:20px;border-radius:10px;margin:20px 0">
      <h3>Order Details:</h3>
      <p><strong>Order ID:</strong> #${orderId}</p>
      <p><strong>Product:</strong> ${productName}</p>
      <p><strong>Quantity:</strong> ${quantity}</p>
      <p><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>
      <p><strong>Estimated Delivery:</strong> ${deliveryDays} days</p>
    </div>
    <p>Track your order from your account.</p>
  `;
  return sendVerificationEmail(email, `Order Confirmation #${orderId}`, html);
}

async function sendPasswordResetEmail(email, resetLink) {
  const html = `
    <h2>🔐 Password Reset Request</h2>
    <p>Click below to reset your password:</p>
    <div style="text-align:center">
      <a href="${resetLink}" style="background:#64ffda;color:#0a192f;padding:12px 30px;text-decoration:none;border-radius:25px;display:inline-block;margin:20px 0">Reset Password</a>
    </div>
    <p>Link expires in 1 hour.</p>
  `;
  return sendVerificationEmail(email, "Reset Your Password", html);
}

// =================== Flutterwave & Paystack ===================
let flw;
try {
  if (!process.env.FLW_PUBLIC_KEY || !process.env.FLW_SECRET_KEY) throw new Error("Flutterwave API keys required");
  flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);
  console.log("✅ Flutterwave initialized");
} catch (error) {
  console.error("Flutterwave init failed:", error.message);
}

let paystackInitialized = !!(process.env.PAYSTACK_SECRET_KEY);

// BigInt fix
BigInt.prototype.toJSON = function() { return this.toString(); };

// =================== FILE UPLOAD DIRECTORIES ===================
const uploadDir = "uploads/courses";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const productsUploadDir = path.join(__dirname, 'uploads', 'products');
if (!fs.existsSync(productsUploadDir)) fs.mkdirSync(productsUploadDir, { recursive: true });
const servicesUploadDir = path.join(__dirname, 'uploads', 'services');
if (!fs.existsSync(servicesUploadDir)) fs.mkdirSync(servicesUploadDir, { recursive: true });
const profilesUploadDir = path.join(__dirname, 'uploads', 'profiles');
if (!fs.existsSync(profilesUploadDir)) fs.mkdirSync(profilesUploadDir, { recursive: true });

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    cb(null, `${uniqueSuffix}-${baseName}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024, files: 2 } });

const productStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, productsUploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
});

const productUpload = multer({ storage: productStorage, limits: { fileSize: 50 * 1024 * 1024 } }).fields([
  { name: 'file', maxCount: 1 }, { name: 'images[]', maxCount: 10 }
]);

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/chat-images';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, 'chat-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});

const imageUpload = multer({ storage: imageStorage, limits: { fileSize: 5 * 1024 * 1024 } });

const profilePictureUpload = multer({
  storage: multer.diskStorage({
    destination: profilesUploadDir,
    filename: (req, file, cb) => cb(null, `profile-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// =================== HELPER FUNCTIONS ===================
function extractRows(result) {
  if (!result) return [];
  if (Array.isArray(result) && result.length === 2) return result[0] || [];
  if (Array.isArray(result)) return result;
  return result && typeof result === 'object' ? [result] : [];
}

function extractInsertId(result) {
  if (!result) return null;
  if (result.insertId) return result.insertId;
  if (Array.isArray(result) && result[0] && result[0].insertId) return result[0].insertId;
  return null;
}

const checkCourseAccess = async (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login" });
  try {
    const courseId = req.params.id;
    const userId = req.session.user.id;
    const accessCheck = await db.query(
      `SELECT c.*, uc.payment_status FROM courses c LEFT JOIN user_courses uc ON c.id = uc.course_id AND uc.user_id = ?
       WHERE c.id = ? AND (c.price = 0 OR uc.payment_status = 'completed')`,
      [userId, courseId]
    );
    let hasAccess = !!(Array.isArray(accessCheck) && accessCheck.length > 0) ||
                    !!(accessCheck && accessCheck[0] && Array.isArray(accessCheck[0]) && accessCheck[0].length > 0);
    if (!hasAccess) return res.status(403).json({ error: "You don't have access to this course" });
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
    let fileCount = uploadsExist ? fs.readdirSync(uploadDir).length : 0;
    const courses = await db.query('SELECT COUNT(*) as count FROM courses');
    res.json({
      status: "healthy", database: "connected", uploads_directory: uploadsExist,
      file_count: fileCount, course_count: courses[0]?.count || 0,
      email_configured: !!verificationTransporter,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

app.get("/api/currency-rates", (req, res) => {
  res.json({ base: 'NGN', rates: { NGN: 1, USD: 0.0011, EUR: 0.0010, GBP: 0.00085 }, timestamp: new Date().toISOString() });
});

// =================== AUTHENTICATION ===================
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    if (!username || !password || !email) return res.status(400).json({ error: "Username, email, and password are required" });
    let userRole = role || 'client';
    if (!['client', 'freelancer', 'admin'].includes(userRole)) return res.status(400).json({ error: "Invalid role" });
    
    const existing = await db.query("SELECT id FROM users WHERE username = ? OR email = ?", [username, email]);
    if (existing && existing.length > 0) return res.status(400).json({ error: "Username or email already exists" });
    
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
      <h2>Welcome ${username}!</h2>
      <p>Verify your email:</p>
      <a href="${verifyLink}" style="background:#64ffda;color:#0a192f;padding:12px 24px;text-decoration:none;border-radius:5px;display:inline-block">Verify Email</a>
      <p>Code: ${verifyToken}</p>
    `;
    
    await sendVerificationEmail(email, "Verify Your Email", emailHtml);
    res.json({ message: "Account created! Please check your email to verify.", userId: result.insertId });
  } catch (err) {
    console.error("Signup error:", err);
    if (err.code === 'ER_DUP_ENTRY') res.status(400).json({ error: "Username or email already exists" });
    else res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if ((!username && !email) || !password) return res.status(400).json({ error: "Username/email and password required" });
    const users = await db.query(username ? "SELECT * FROM users WHERE username = ?" : "SELECT * FROM users WHERE email = ?", [username || email]);
    if (!users || users.length === 0) return res.status(400).json({ error: "User not found" });
    const user = users[0];
    if (!user.verified) return res.status(403).json({ error: "Please verify your email first", unverified: true, email: user.email });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Invalid password" });
    req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role || 'client', verified: user.verified };
    res.json({ message: "Login successful!", user: req.session.user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => { req.session.destroy(); res.json({ message: "Logged out" }); });
app.get("/api/me", (req, res) => { res.json(req.session.user || null); });

app.post("/api/verify", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token required" });
    const users = await db.query("SELECT id FROM users WHERE verify_token = ? AND verified = 0", [token]);
    if (!users || users.length === 0) return res.status(400).json({ error: "Invalid token" });
    await db.query("UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?", [users[0].id]);
    res.json({ success: true, message: "Email verified!" });
  } catch (err) {
    res.status(500).json({ error: "Verification failed" });
  }
});

app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email required" });
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000);
    const result = await db.query("UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?", [token, expires, email]);
    if (result.affectedRows > 0) {
      await sendPasswordResetEmail(email, `https://core-insight-7.onrender.com/reset-password.html?token=${token}`);
    }
    res.json({ success: true, message: "If that email exists, we've sent a reset link." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error processing request" });
  }
});

app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Token and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  try {
    const users = await db.query("SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()", [token]);
    if (!users || users.length === 0) return res.status(400).json({ error: "Invalid or expired token" });
    const hashed = await bcrypt.hash(password, 10);
    await db.query("UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?", [hashed, users[0].id]);
    res.json({ success: true, message: "Password reset successfully!" });
  } catch (err) {
    res.status(500).json({ error: "Error resetting password" });
  }
});

// =================== COURSES ===================
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT c.*, u.username as author_name,
        COALESCE(c.file_url, c.file_path) as file_path_combined,
        COALESCE(c.thumbnail_url, c.thumbnail_path) as thumbnail_path_combined
      FROM courses c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC
    `);
    const processed = (Array.isArray(courses) ? courses : (courses[0] || [])).map(c => ({
      ...c, id: Number(c.id), user_id: Number(c.user_id),
      thumbnail_url: c.thumbnail_url || c.thumbnail_path,
      file_url: c.file_url || c.file_path,
      download_url: `/api/download/${c.id}`
    }));
    res.json(processed);
  } catch (err) {
    res.status(500).json({ error: "Error fetching courses" });
  }
});

app.get('/api/download/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Please login' });
    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    if (!courses || courses.length === 0) return res.status(404).json({ error: 'Course not found' });
    const course = courses[0];
    const isFree = course.price === 0 || course.type === 'free';
    if (!isFree) {
      const purchased = await db.query('SELECT id FROM user_courses WHERE course_id = ? AND user_id = ? AND payment_status = "completed"', [courseId, userId]);
      if (!purchased || purchased.length === 0) {
        const paid = await db.query('SELECT id FROM payments WHERE course_id = ? AND user_id = ? AND status = "successful"', [courseId, userId]);
        if (!paid || paid.length === 0) return res.status(403).json({ error: 'No access to this course' });
      }
    }
    const filePath = course.file_url || course.file_path;
    if (!filePath) return res.status(404).json({ error: 'No file associated' });
    const filename = path.basename(filePath);
    const fullPath = path.join(__dirname, 'uploads', 'courses', filename);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
    const safeName = course.title ? course.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + path.extname(filename) : filename;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.sendFile(fullPath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/courses", (req, res) => {
  const uploadCourseFile = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }).fields([
    { name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }
  ]);
  uploadCourseFile(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.session.user) return res.status(401).json({ error: "Please login" });
      const { title, description, price, author, content_type } = req.body;
      if (!title || !req.files?.file || !req.files?.thumbnail) return res.status(400).json({ error: "Title, file, and thumbnail required" });
      const file = req.files.file[0], thumb = req.files.thumbnail[0];
      const result = await db.query(
        `INSERT INTO courses (title, description, file_path, thumbnail_path, price, type, user_id, author, content_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [title.trim(), description || '', `/uploads/courses/${file.filename}`, `/uploads/courses/${thumb.filename}`,
         parseFloat(price) || 0, parseFloat(price) > 0 ? 'paid' : 'free', req.session.user.id, author || req.session.user.username, content_type || 'book']
      );
      res.json({ message: "✅ Course uploaded!", courseId: result.insertId, download_url: `/api/download/${result.insertId}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

app.get('/api/check-access/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId = req.session?.user?.id;
    if (!userId) return res.json({ hasAccess: false, error: 'Please login' });
    const courses = await db.query('SELECT * FROM courses WHERE id = ?', [courseId]);
    if (!courses || courses.length === 0) return res.status(404).json({ hasAccess: false });
    const course = courses[0];
    if (course.price === 0 || course.type === 'free') return res.json({ hasAccess: true, isFree: true });
    const purchased = await db.query('SELECT id FROM user_courses WHERE course_id = ? AND user_id = ? AND payment_status = "completed"', [courseId, userId]);
    if (purchased && purchased.length > 0) return res.json({ hasAccess: true });
    const paid = await db.query('SELECT id FROM payments WHERE course_id = ? AND user_id = ? AND status = "successful"', [courseId, userId]);
    res.json({ hasAccess: !!(paid && paid.length > 0), price: course.price });
  } catch (err) {
    res.status(500).json({ hasAccess: false });
  }
});

// =================== PAYMENTS ===================
app.post("/api/initiate-payment", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login" });
  try {
    const { courseId } = req.body;
    if (!courseId) return res.status(400).json({ error: "Course ID required" });
    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    if (!courses || courses.length === 0) return res.status(404).json({ error: "Course not found" });
    const course = courses[0];
    if (course.price <= 0) return res.status(400).json({ error: "This course is free" });
    if (!process.env.FLW_SECRET_KEY) return res.status(500).json({ error: "Payment system not configured" });
    const tx_ref = `coreinsight_${Date.now()}_${courseId}`;
    const payload = {
      tx_ref, amount: parseFloat(course.price), currency: "NGN",
      redirect_url: "https://core-insight-7.onrender.com/payment-callback.html",
      customer: { email: req.session.user.email || `${req.session.user.username}@example.com`, name: req.session.user.username },
      customizations: { title: "Core Insight", description: `Payment for ${course.title}` },
      meta: { course_id: courseId, user_id: req.session.user.id }
    };
    const response = await axios.post('https://api.flutterwave.com/v3/payments', payload, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' }
    });
    if (response.data.status === "success" && response.data.data?.link) {
      await db.query(`INSERT INTO payments (user_id, course_id, transaction_ref, amount, status) VALUES (?, ?, ?, ?, 'pending')`,
        [req.session.user.id, courseId, tx_ref, course.price]);
      res.json({ status: "success", paymentLink: response.data.data.link, transactionRef: tx_ref });
    } else {
      res.status(500).json({ error: "Payment initiation failed" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/verify-payment/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;
    const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
    });
    if (response.data.status === "success" && response.data.data.status === "successful") {
      const tx = response.data.data;
      await db.query(`UPDATE payments SET status = 'completed' WHERE transaction_ref = ?`, [tx.tx_ref]);
      await db.query(`INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at) VALUES (?, ?, 'completed', NOW())
        ON DUPLICATE KEY UPDATE payment_status = 'completed', purchased_at = NOW()`, [tx.meta.user_id, tx.meta.course_id]);
      res.json({ status: "success", message: "Payment verified" });
    } else {
      res.status(400).json({ status: "failed", message: "Payment not successful" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== CHAT SYSTEM ===================
app.get("/api/messages/unread-count", async (req, res) => {
  if (!req.session.user) return res.json({ count: 0 });
  try {
    const result = await db.query(`
      SELECT COUNT(m.id) as count FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.sender_id != ? AND m.is_read = 0 AND (c.client_id = ? OR c.freelancer_id = ?)
    `, [req.session.user.id, req.session.user.id, req.session.user.id]);
    res.json({ count: result[0]?.count || 0 });
  } catch (err) {
    res.json({ count: 0 });
  }
});

app.get("/api/messages/conversations", async (req, res) => {
  if (!req.session.user) return res.json([]);
  try {
    const userId = req.session.user.id;
    const result = await db.query(`
      SELECT c.id, c.service_id, s.title as service_title, c.created_at,
        CASE WHEN c.client_id = ? THEN u2.username ELSE u1.username END as other_user_name,
        CASE WHEN c.client_id = ? THEN u2.id ELSE u1.id END as other_user_id
      FROM conversations c
      JOIN users u1 ON c.client_id = u1.id JOIN users u2 ON c.freelancer_id = u2.id
      LEFT JOIN services s ON c.service_id = s.id
      WHERE c.client_id = ? OR c.freelancer_id = ?
      ORDER BY (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) DESC, c.created_at DESC
    `, [userId, userId, userId, userId]);
    res.json(Array.isArray(result) ? (result[0] || result) : []);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.post("/api/conversations/start", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Login required" });
  try {
    const { service_id, recipient_id } = req.body;
    if (!service_id || !recipient_id) return res.status(400).json({ error: "Missing service or recipient" });
    const service = await db.query("SELECT id, user_id FROM services WHERE id = ?", [service_id]);
    if (!service || service.length === 0) return res.status(404).json({ error: "Service not found" });
    const provider_id = service[0].user_id;
    const client_id = req.session.user.id;
    const existing = await db.query(
      `SELECT id FROM conversations WHERE (client_id = ? AND freelancer_id = ?) OR (client_id = ? AND freelancer_id = ?) LIMIT 1`,
      [client_id, provider_id, provider_id, client_id]
    );
    if (existing && existing.length > 0) {
      return res.json({ success: true, conversation_id: existing[0].id });
    }
    const result = await db.query(`INSERT INTO conversations (service_id, client_id, freelancer_id) VALUES (?, ?, ?)`,
      [service_id, client_id, provider_id]);
    res.json({ success: true, conversation_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/messages/send", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Login required" });
  try {
    const { conversation_id, message } = req.body;
    if (!conversation_id || !message?.trim()) return res.status(400).json({ error: "Missing data" });
    const conv = await db.query(`SELECT client_id, freelancer_id FROM conversations WHERE id = ?`, [conversation_id]);
    if (!conv || conv.length === 0) return res.status(404).json({ error: "Conversation not found" });
    const userId = req.session.user.id;
    const isParticipant = conv[0].client_id === userId || conv[0].freelancer_id === userId;
    if (!isParticipant) return res.status(403).json({ error: "Access denied" });
    const result = await db.query(`INSERT INTO messages (conversation_id, sender_id, message) VALUES (?, ?, ?)`,
      [conversation_id, userId, message.trim()]);
    const newMsg = await db.query(`SELECT m.*, u.username as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?`, [result.insertId]);
    res.json({ success: true, data: newMsg[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/messages/:conversationId", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const convId = parseInt(req.params.conversationId);
    const userId = req.session.user.id;
    const conv = await db.query(`SELECT id FROM conversations WHERE id = ? AND (client_id = ? OR freelancer_id = ?)`, [convId, userId, userId]);
    if (!conv || conv.length === 0) return res.status(403).json({ error: "Access denied" });
    const messages = await db.query(`
      SELECT m.*, u.username as sender_name FROM messages m JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ? ORDER BY m.created_at ASC`, [convId]);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== PRODUCTS ===================
app.get("/api/products", async (req, res) => {
  try {
    const products = await db.query(`
      SELECT p.*, u.username as seller_name FROM products p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.is_deleted = 0 OR p.is_deleted IS NULL ORDER BY p.created_at DESC
    `);
    const processed = products.map(p => {
      p.price = parseFloat(p.price || 0);
      p.original_price = parseFloat(p.original_price || p.price);
      p.platform_fee = parseFloat(p.platform_fee || (p.type === 'physical' ? p.original_price * 0.1 : 0));
      if (p.image_urls) {
        try { p.images = typeof p.image_urls === 'string' ? (p.image_urls.startsWith('[') ? JSON.parse(p.image_urls) : [p.image_urls]) : p.image_urls; }
        catch(e) { p.images = []; }
      } else p.images = [];
      if (!p.images?.length) p.images = ['https://placehold.co/400x250/1e293b/3b82f6/png?text=Product'];
      if (!p.type) p.type = p.affiliate_link ? 'affiliate' : 'digital';
      return p;
    });
    res.json(processed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload-product", (req, res) => {
  const uploadProduct = multer({ storage: multer.diskStorage({}) }).fields([
    { name: 'file', maxCount: 1 }, { name: 'images[]', maxCount: 10 }
  ]);
  uploadProduct(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.session.user) return res.status(401).json({ error: "Please login" });
      const { title, description, price, category, type, affiliate_link, paymentProvider, delivery_days } = req.body;
      if (!title || !price || !type || !paymentProvider) return res.status(400).json({ error: "Required fields missing" });
      const listedPrice = parseFloat(price);
      let sellerPrice = listedPrice, originalPrice = listedPrice, platformFee = 0;
      if (type === 'physical') { platformFee = listedPrice * 0.1; sellerPrice = listedPrice - platformFee; }
      let imageUrls = [];
      if (req.files?.['images[]']?.length) {
        const cloudinary = require('cloudinary').v2;
        for (const img of req.files['images[]']) {
          try {
            const result = await cloudinary.uploader.upload(img.path, { folder: 'core-insight/products' });
            imageUrls.push(result.secure_url);
          } catch(e) { console.error('Cloudinary error:', e); }
        }
      }
      let fileUrl = null;
      if (req.files?.file?.length) {
        const productFile = req.files.file[0];
        const uploadDir = path.join(__dirname, 'uploads', 'products', 'files');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(productFile.originalname)}`;
        const finalPath = path.join(uploadDir, filename);
        fs.copyFileSync(productFile.path, finalPath);
        fs.unlinkSync(productFile.path);
        fileUrl = `/uploads/products/files/${filename}`;
      }
      const result = await db.query(
        `INSERT INTO products (user_id, title, description, price, original_price, platform_fee, category, type, file_url, image_urls, affiliate_link, seller_payment_provider, estimated_delivery_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.session.user.id, title, description || '', sellerPrice, originalPrice, platformFee, category || '', type, fileUrl, JSON.stringify(imageUrls), affiliate_link || null, paymentProvider, parseInt(delivery_days) || null]
      );
      res.json({ message: "✅ Product uploaded!", productId: result.insertId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

app.delete("/api/products/:id", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login" });
  try {
    const product = await db.query("SELECT user_id FROM products WHERE id = ?", [req.params.id]);
    if (!product || product.length === 0) return res.status(404).json({ error: "Product not found" });
    if (product[0].user_id !== req.session.user.id && req.session.user.role !== 'admin')
      return res.status(403).json({ error: "Not authorized" });
    await db.query("DELETE FROM physical_orders WHERE product_id = ?", [req.params.id]);
    await db.query("DELETE FROM favorites WHERE product_id = ?", [req.params.id]);
    await db.query("DELETE FROM products WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== PHYSICAL ORDERS ===================
app.post("/api/order-product", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login" });
  try {
    const { productId, productTitle, price, quantity = 1, deliveryAddress, deliveryPhone, deliveryDays = 7 } = req.body;
    const product = await db.query("SELECT user_id as seller_id, original_price, platform_fee FROM products WHERE id = ?", [productId]);
    if (!product || product.length === 0) return res.status(404).json({ error: "Product not found" });
    const unitPrice = parseFloat(product[0].original_price || price);
    const platformFeePerUnit = parseFloat(product[0].platform_fee || (unitPrice * 0.1));
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1 || qty > 100) return res.status(400).json({ error: "Invalid quantity" });
    const totalAmount = qty * unitPrice;
    const result = await db.query(
      `INSERT INTO physical_orders (product_id, seller_id, buyer_id, product_name, quantity, price, total_amount, customer_name, customer_email, customer_phone, shipping_address, payment_status, order_status, estimated_delivery_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?)`,
      [productId, product[0].seller_id, req.session.user.id, productTitle, qty, unitPrice, totalAmount,
       req.session.user.username, req.session.user.email, deliveryPhone, deliveryAddress, parseInt(deliveryDays) || 7]
    );
    await sendOrderConfirmationEmail({
      email: req.session.user.email, orderId: result.insertId, productName: productTitle,
      quantity: qty, totalAmount, deliveryAddress, deliveryDays: parseInt(deliveryDays) || 7
    });
    res.json({ success: true, orderId: result.insertId, totalAmount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const orders = await db.query("SELECT * FROM physical_orders ORDER BY created_at DESC LIMIT 100");
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== FAVORITES ===================
app.post("/api/favorites/toggle", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login" });
  try {
    const { productId } = req.body;
    const existing = await db.query("SELECT id FROM favorites WHERE user_id = ? AND product_id = ?", [req.session.user.id, productId]);
    if (existing && existing.length > 0) {
      await db.query("DELETE FROM favorites WHERE user_id = ? AND product_id = ?", [req.session.user.id, productId]);
      const count = await db.query("SELECT COUNT(*) as c FROM favorites WHERE product_id = ?", [productId]);
      await db.query("UPDATE products SET favorite_count = ? WHERE id = ?", [count[0].c, productId]);
      res.json({ success: true, action: "removed", favoriteCount: count[0].c });
    } else {
      await db.query("INSERT INTO favorites (user_id, product_id) VALUES (?, ?)", [req.session.user.id, productId]);
      const count = await db.query("SELECT COUNT(*) as c FROM favorites WHERE product_id = ?", [productId]);
      await db.query("UPDATE products SET favorite_count = ? WHERE id = ?", [count[0].c, productId]);
      res.json({ success: true, action: "added", favoriteCount: count[0].c });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/favorites", async (req, res) => {
  if (!req.session.user) return res.json({ favorites: [] });
  try {
    const favs = await db.query("SELECT product_id FROM favorites WHERE user_id = ?", [req.session.user.id]);
    const counts = await db.query("SELECT product_id, COUNT(*) as count FROM favorites GROUP BY product_id");
    const countMap = {};
    counts.forEach(c => countMap[c.product_id] = c.count);
    res.json({ favorites: favs.map(f => f.product_id), favoriteCounts: countMap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== SELLER NOTIFICATIONS ===================
app.get("/api/seller/notifications", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login" });
  try {
    const notifs = await db.query(`
      SELECT n.*, o.product_name, o.total_amount FROM seller_notifications n
      LEFT JOIN physical_orders o ON n.order_id = o.id
      WHERE n.seller_id = ? ORDER BY n.created_at DESC LIMIT 50`, [req.session.user.id]);
    const unread = await db.query("SELECT COUNT(*) as c FROM seller_notifications WHERE seller_id = ? AND is_read = FALSE", [req.session.user.id]);
    res.json({ success: true, notifications: notifs, unreadCount: unread[0]?.c || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/seller/notifications/:id/read", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Please login" });
  try {
    await db.query("UPDATE seller_notifications SET is_read = TRUE WHERE id = ? AND seller_id = ?", [req.params.id, req.session.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== COMPLAINT ===================
app.post('/api/send-complaint', async (req, res) => {
  try {
    const { name, email, subject, message, orderId } = req.body;
    if (!name || !email || !subject || !message) return res.status(400).json({ error: "All fields required" });
    await sendSupportEmail(name, email, subject, message, orderId);
    res.json({ success: true, message: "Complaint submitted!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== ADMIN ===================
app.get("/api/admin/users", async (req, res) => {
  if (!req.session.user?.role === 'admin') return res.status(403).json({ error: "Admin required" });
  try {
    const users = await db.query("SELECT id, username, email, role, verified, created_at FROM users ORDER BY created_at DESC");
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/platform/stats", async (req, res) => {
  if (!req.session.user?.role === 'admin') return res.status(403).json({ error: "Admin required" });
  try {
    const [users, products, orders] = await Promise.all([
      db.query("SELECT COUNT(*) as total FROM users"),
      db.query("SELECT COUNT(*) as total FROM products"),
      db.query("SELECT COUNT(*) as total, SUM(total_amount) as revenue FROM physical_orders")
    ]);
    res.json({
      total_users: users[0]?.total || 0,
      total_products: products[0]?.total || 0,
      total_orders: orders[0]?.total || 0,
      total_revenue: orders[0]?.revenue || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================== DEBUG ===================
app.get("/api/debug/all-courses", async (req, res) => {
  try {
    const courses = await db.query("SELECT id, title, file_path, price, type FROM courses");
    const html = `
      <html><body style="background:#0a192f;color:#fff;font-family:monospace;padding:20px">
      <h1>📚 Courses (${courses.length})</h1>
      <table border="1" cellpadding="10"><tr><th>ID</th><th>Title</th><th>File</th><th>Price</th><th>Type</th></tr>
      ${courses.map(c => `<tr><td>${c.id}</td><td>${c.title}</td><td>${c.file_path || 'N/A'}</td><td>$${c.price}</td><td>${c.type}</td></tr>`).join('')}
      </table></body></html>
    `;
    res.send(html);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// =================== STATIC PAGES ===================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "public", "signup.html")));
app.get("/courses", (req, res) => res.sendFile(path.join(__dirname, "public", "courses.html")));
app.get("/payment-callback.html", (req, res) => res.sendFile(path.join(__dirname, "public", "payment-callback.html")));
app.get("/payment-verification.html", (req, res) => res.sendFile(path.join(__dirname, "public", "payment-verification.html")));
app.get("/forgot-password.html", (req, res) => res.sendFile(path.join(__dirname, "public", "forgot-password.html")));
app.get("/reset-password.html", (req, res) => res.sendFile(path.join(__dirname, "public", "reset-password.html")));
app.get("/verify.html", (req, res) => res.sendFile(path.join(__dirname, "public", "verify.html")));
app.get("/admin-files.html", (req, res) => res.sendFile(path.join(__dirname, "public", "admin-files.html")));
app.get("/api/terms", (req, res) => res.sendFile(path.join(__dirname, "public", "terms.html")));

// =================== START SERVER ===================
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📧 Email: ${VERIFICATION_EMAIL || 'Not configured'}`);
  console.log(`💳 Flutterwave: ${process.env.FLW_SECRET_KEY ? '✅' : '❌'}`);
  console.log(`✅ All systems ready!\n`);
});

// Test email endpoint
app.get("/api/test-email", async (req, res) => {
  const testEmail = req.query.email || VERIFICATION_EMAIL;
  const result = await sendVerificationEmail(testEmail, "Test Email", "<h2>Test</h2><p>Email working!</p>");
  res.json(result);
});
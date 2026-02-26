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

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

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

// =================== HEALTH & BASIC ENDPOINTS ===================
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1 as healthy");
    res.json({ status: "healthy", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

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

// =================== AUTHENTICATION ENDPOINTS ===================
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password || !email) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    const existingUsers = await db.query(
      "SELECT id FROM users WHERE username = ? OR email = ?", 
      [username, email]
    );
    
    let userExists = false;
    if (Array.isArray(existingUsers) && existingUsers.length > 0) {
      userExists = true;
    } else if (existingUsers && existingUsers[0] && Array.isArray(existingUsers[0]) && existingUsers[0].length > 0) {
      userExists = true;
    }

    if (userExists) {
      return res.status(400).json({ error: "Username or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verifyToken = crypto.randomBytes(32).toString('hex');

    await db.query(
      "INSERT INTO users (username, email, password, role, verified, verify_token) VALUES (?, ?, ?, 'user', 0, ?)",
      [username, email, hashedPassword, verifyToken]
    );

    const verifyLink = `https://core-insight-7.onrender.com/api/verify/${verifyToken}`;
    await transporter.sendMail({
      to: email,
      subject: "Verify your Core Insight account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Core Insight!</h2>
          <p>Please verify your email address by clicking the link below:</p>
          <a href="${verifyLink}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Verify Email Address
          </a>
          <p>If you didn't create an account, please ignore this email.</p>
        </div>
      `
    });

    res.json({ message: "Registration successful! Please check your email to verify your account." });
    
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: "Username or email already exists" });
    } else {
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  }
});

app.get("/api/verify/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const result = await db.query(
      "UPDATE users SET verified = 1, verify_token = NULL WHERE verify_token = ?", 
      [token]
    );
    
    if (result.affectedRows === 0) {
      return res.send(`
        <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
          <h2 style="color: #ff4444;">Invalid or expired verification token</h2>
          <p>The verification link is invalid or has expired.</p>
        </div>
      `);
    }
    
    res.send(`
      <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
        <h2 style="color: #4CAF50;">Email Verified Successfully! ✅</h2>
        <p>Your email has been verified. You can now log in to your account.</p>
        <a href="/login" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 20px;">
          Go to Login
        </a>
      </div>
    `);
  } catch (err) {
    res.status(500).send("Error verifying email");
  }
});

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
    
    if (Array.isArray(users) && users.length > 0) {
      user = users[0];
    } else if (users && users[0] && Array.isArray(users[0]) && users[0].length > 0) {
      user = users[0][0];
    }

    if (!user) {
      const identifier = username || email;
      return res.status(400).json({ error: `User with ${username ? 'username' : 'email'} "${identifier}" not found` });
    }

    if (!user.verified) {
      return res.status(403).json({ 
        error: "Please verify your email before logging in. Check your email for the verification link." 
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
      role: user.role || 'user'
    };

    res.json({ message: "Login successful!", user: req.session.user });
    
  } catch (err) {
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
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000);

    const result = await db.query(
      "UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?",
      [token, expires, email]
    );

    const message = "If that email address exists in our system, we've sent a password reset link to it.";

    if (result.affectedRows > 0) {
      const resetLink = `https://core-insight-7.onrender.com/reset-password.html?token=${token}`;

      await transporter.sendMail({
        from: `"Core Insight" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Reset your Core Insight password",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Request</h2>
            <p>You requested to reset your password. Click the link below to create a new password:</p>
            <a href="${resetLink}" 
               style="background-color: #2196F3; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px; display: inline-block;">
              Reset Password
            </a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
        `
      });
    }

    res.json({ message });

  } catch (err) {
    res.status(500).json({ error: "Error sending reset email" });
  }
});

app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;
  
  if (!token || !password) {
    return res.status(400).json({ error: "Token and password are required" });
  }

  try {
    const users = await db.query(
      "SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()",
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    await db.query(
      "UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE reset_token = ?",
      [hashedPassword, token]
    );

    res.json({ message: "Password reset successfully! You can now login with your new password." });
    
  } catch (err) {
    res.status(500).json({ error: "Error resetting password" });
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

// Send message with image
app.post("/api/messages/send-with-image", imageUpload.single('image'), async (req, res) => {
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

    // Handle the result format
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
      imageUrl = `/uploads/chat-images/${req.file.filename}`;
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

// Get messages for a conversation - UPDATED to include image_url
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


// Search users
app.get("/api/users/search", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Login required" });
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const currentUserId = req.session.user.id;
    const [users] = await db.query(
      `SELECT id, username, email, profile_picture FROM users WHERE (username LIKE ? OR email LIKE ?) AND id != ? LIMIT 10`,
      [`%${q}%`, `%${q}%`, currentUserId]
    );

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

// =================== COURSES ENDPOINTS ===================
app.post("/api/courses", upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to upload courses" });
  }

  if (!req.files || !req.files['file'] || req.files['file'].length === 0) {
    return res.status(400).json({ error: "Course file is required" });
  }
  
  if (!req.files['thumbnail'] || req.files['thumbnail'].length === 0) {
    return res.status(400).json({ error: "Thumbnail image is required" });
  }

  try {
    const { 
      title, 
      description, 
      price, 
      author, 
      content_type = 'book'
    } = req.body;
    
    const user = req.session.user;
    
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: "Title is required" });
    }

    const courseFile = req.files['file'][0];
    const thumbnailFile = req.files['thumbnail'][0];
    
    const courseFilename = courseFile.filename;
    const thumbnailFilename = thumbnailFile.filename;

    let finalPrice = 0;
    let bookType = 'free';
    let finalContentType = 'book';
    
    const validContentTypes = ['book', 'video', 'document', 'presentation'];
    if (validContentTypes.includes(content_type)) {
      finalContentType = content_type;
    }
    
    if (user.role === 'admin' && price && parseFloat(price) > 0) {
      finalPrice = parseFloat(price);
      bookType = 'paid';
    }
    
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv'];
    const fileExtension = path.extname(courseFile.originalname).toLowerCase();
    const isVideoFile = videoExtensions.includes(fileExtension);
    
    if (isVideoFile) {
      finalContentType = 'video';
    }
    
    const finalAuthor = author && author.trim() !== '' ? author.trim() : null;

    const result = await db.query(
      `INSERT INTO courses (
        title, 
        description, 
        file_path, 
        thumbnail_path, 
        price, 
        type, 
        user_id, 
        author, 
        content_type,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        title.trim(), 
        description ? description.trim() : '', 
        courseFilename,
        thumbnailFilename,
        finalPrice, 
        bookType, 
        user.id, 
        finalAuthor, 
        finalContentType
      ]
    );

    const courseId = Number(result.insertId);
    
    const responseData = {
      message: "Content uploaded successfully!",
      courseId: courseId,
      title: title,
      price: finalPrice,
      type: bookType,
      content_type: finalContentType,
      thumbnail_url: `/uploads/${thumbnailFilename}`,
      download_url: `/api/download/${courseId}`
    };
    
    res.json(responseData);
    
  } catch (err) {
    res.status(500).json({ 
      error: "Error uploading content", 
      details: err.message
    });
  }
});

app.get("/api/courses", async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT 
        c.*, 
        u.username as author_name
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
      
      if (course.thumbnail_path) {
        let thumbnailPath = course.thumbnail_path;
        
        if (!thumbnailPath.includes('/') && !thumbnailPath.includes('\\')) {
          course.thumbnail_url = `/uploads/courses/${thumbnailPath}`;
        }
        else if (thumbnailPath.includes('uploads/courses/')) {
          thumbnailPath = thumbnailPath.replace(/uploads\/courses\/uploads\/courses\//, 'uploads/courses/');
          
          if (!thumbnailPath.startsWith('uploads/courses/')) {
            thumbnailPath = `uploads/courses/${path.basename(thumbnailPath)}`;
          }
          
          course.thumbnail_url = `/${thumbnailPath}`;
        }
        else if (thumbnailPath.includes('uploads/uploads/courses/')) {
          thumbnailPath = thumbnailPath.replace('uploads/uploads/courses/', 'uploads/courses/');
          course.thumbnail_url = `/${thumbnailPath}`;
        }
        else {
          const filename = path.basename(thumbnailPath);
          course.thumbnail_url = `/uploads/courses/${filename}`;
        }
      } else {
        course.thumbnail_url = null;
      }
      
      if (course.file_path) {
        let filePath = course.file_path;
        
        if (!filePath.includes('/') && !filePath.includes('\\')) {
          course.file_url = `/uploads/courses/${filePath}`;
        } else if (filePath.includes('uploads/courses/')) {
          filePath = filePath.replace(/uploads\/courses\/uploads\/courses\//, 'uploads/courses/');
          if (!filePath.startsWith('uploads/courses/')) {
            filePath = `uploads/courses/${path.basename(filePath)}`;
          }
          course.file_url = `/${filePath}`;
        } else if (filePath.includes('uploads/uploads/courses/')) {
          filePath = filePath.replace('uploads/uploads/courses/', 'uploads/courses/');
          course.file_url = `/${filePath}`;
        } else {
          const filename = path.basename(filePath);
          course.file_url = `/uploads/courses/${filename}`;
        }
      }
      
      course.download_url = `/api/download/${course.id}`;
      
      return course;
    });
    
    res.json(processedCourses);
  } catch (err) {
    res.status(500).json({ 
      error: "Error fetching courses", 
      details: err.message
    });
  }
});

app.get("/api/download/:id", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login to download files" });
    }
    
    const courseId = req.params.id;
    const userId = req.session.user.id;
    
    console.log(`Download request - Course ID: ${courseId}, User ID: ${userId}`);
    
    // First check if user has access
    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    let course = null;
    
    if (Array.isArray(courses) && courses.length > 0) {
      course = courses[0];
    } else if (courses && courses[0] && Array.isArray(courses[0]) && courses[0].length > 0) {
      course = courses[0][0];
    }
    
    if (!course) {
      console.log(`Course ${courseId} not found`);
      return res.status(404).json({ error: "Course not found" });
    }
    
    // Check access
    let hasAccess = false;
    
    if (course.price === 0 && course.type !== 'paid') {
      hasAccess = true;
    }
    else if (req.session.user.role === 'admin') {
      hasAccess = true;
    }
    else if (parseInt(req.session.user.id) === parseInt(course.user_id)) {
      hasAccess = true;
    }
    else {
      // Check user_courses
      const accessCheck = await db.query(
        "SELECT * FROM user_courses WHERE user_id = ? AND course_id = ? AND payment_status = 'completed'",
        [userId, courseId]
      );
      
      if (Array.isArray(accessCheck) && accessCheck.length > 0) {
        hasAccess = true;
      } else if (accessCheck && accessCheck[0] && Array.isArray(accessCheck[0]) && accessCheck[0].length > 0) {
        hasAccess = true;
      }
    }
    
    if (!hasAccess) {
      console.log(`User ${userId} does not have access to course ${courseId}`);
      return res.status(403).json({ error: "You don't have access to this file" });
    }
    
    // Find the file
    let filePath = course.file_path;
    console.log(`Original file path from DB: ${filePath}`);
    
    // Handle different path formats
    if (!filePath) {
      return res.status(404).json({ error: "File path not found in database" });
    }
    
    // Extract just the filename if it's a full path
    let filename = path.basename(filePath);
    console.log(`Extracted filename: ${filename}`);
    
    // List of possible locations to check
    const possiblePaths = [
      path.join(__dirname, "uploads/courses", filename),
      path.join(__dirname, "uploads", filename),
      path.join(__dirname, "uploads/courses", filePath),
      path.join(__dirname, filePath),
      path.join(__dirname, "public/uploads/courses", filename),
      `/opt/render/project/src/uploads/courses/${filename}`, // Render specific path
      `/opt/render/project/src/uploads/${filename}`,
    ];
    
    // Add paths with the original filePath if it's different
    if (filePath !== filename) {
      possiblePaths.push(path.join(__dirname, filePath));
      possiblePaths.push(`/opt/render/project/src/${filePath}`);
    }
    
    let foundPath = null;
    for (const testPath of possiblePaths) {
      console.log(`Checking: ${testPath}`);
      if (fs.existsSync(testPath)) {
        foundPath = testPath;
        console.log(`✅ Found file at: ${foundPath}`);
        break;
      }
    }
    
    if (!foundPath) {
      console.log(`❌ File not found in any location`);
      
      // List directory contents for debugging
      try {
        const uploadDir = path.join(__dirname, "uploads/courses");
        if (fs.existsSync(uploadDir)) {
          const files = fs.readdirSync(uploadDir);
          console.log(`Files in uploads/courses:`, files);
        }
      } catch (dirError) {
        console.log("Could not list directory:", dirError);
      }
      
      return res.status(404).json({ 
        error: "File not found on server",
        debug: {
          filename: filename,
          originalPath: filePath,
          checked: possiblePaths
        }
      });
    }
    
    // Get file stats
    const stats = fs.statSync(foundPath);
    console.log(`File size: ${stats.size} bytes`);
    
    // Set proper headers
    const safeFilename = encodeURIComponent(
      course.title.replace(/[^a-zA-Z0-9._-]/g, '_') + path.extname(foundPath)
    );
    
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    
    // Send the file
    res.sendFile(foundPath);
    
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Error downloading file", details: err.message });
  }
});

// Debug endpoint to check file paths
app.get("/api/debug/file/:id", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const courseId = req.params.id;
    
    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    let course = null;
    
    if (Array.isArray(courses) && courses.length > 0) {
      course = courses[0];
    } else if (courses && courses[0] && Array.isArray(courses[0]) && courses[0].length > 0) {
      course = courses[0][0];
    }
    
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }
    
    const filePath = course.file_path;
    const filename = path.basename(filePath);
    
    const possiblePaths = [
      path.join(__dirname, "uploads/courses", filename),
      path.join(__dirname, "uploads", filename),
      path.join(__dirname, "uploads/courses", filePath),
      path.join(__dirname, filePath),
      `/opt/render/project/src/uploads/courses/${filename}`,
      `/opt/render/project/src/uploads/${filename}`,
    ];
    
    const results = {};
    for (const testPath of possiblePaths) {
      results[testPath] = fs.existsSync(testPath);
    }
    
    // List directory contents
    let directoryContents = {};
    try {
      const uploadDir = path.join(__dirname, "uploads/courses");
      if (fs.existsSync(uploadDir)) {
        directoryContents[uploadDir] = fs.readdirSync(uploadDir);
      }
    } catch (e) {
      directoryContents.error = e.message;
    }
    
    res.json({
      course_id: courseId,
      course_title: course.title,
      file_path_db: filePath,
      filename: filename,
      current_dir: __dirname,
      file_exists_check: results,
      directory_contents: directoryContents
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

app.get("/api/check-access/:id", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ hasAccess: false, error: "Please login first" });
    }
    
    const courseId = req.params.id;
    const userId = req.session.user.id;
    
    console.log(`Checking access for user ${userId} to course ${courseId}`);
    
    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    let course = null;
    
    if (Array.isArray(courses) && courses.length > 0) {
      course = courses[0];
    } else if (courses && courses[0] && Array.isArray(courses[0]) && courses[0].length > 0) {
      course = courses[0][0];
    }
    
    if (!course) {
      return res.json({ hasAccess: false, error: "Course not found" });
    }
    
    let hasAccess = false;
    let reason = "";
    
    if (course.price === 0 && course.type !== 'paid') {
      hasAccess = true;
      reason = "Content is free";
    }
    else if (req.session.user.role === 'admin') {
      hasAccess = true;
      reason = "User is admin";
    }
    else if (parseInt(req.session.user.id) === parseInt(course.user_id)) {
      hasAccess = true;
      reason = "User is uploader";
    }
    else {
      // Check user_courses table first
      const userCourseCheck = await db.query(
        "SELECT * FROM user_courses WHERE user_id = ? AND course_id = ? AND payment_status = 'completed'",
        [userId, courseId]
      );
      
      let userCourseExists = false;
      if (userCourseCheck) {
        if (Array.isArray(userCourseCheck) && userCourseCheck.length > 0) {
          userCourseExists = true;
        } else if (userCourseCheck[0] && Array.isArray(userCourseCheck[0]) && userCourseCheck[0].length > 0) {
          userCourseExists = true;
        }
      }
      
      // Check purchases table as fallback
      let purchaseExists = false;
      if (!userCourseExists) {
        const purchaseCheck = await db.query(
          "SELECT * FROM purchases WHERE user_id = ? AND course_id = ? AND status = 'completed'",
          [userId, courseId]
        );
        
        if (purchaseCheck) {
          if (Array.isArray(purchaseCheck) && purchaseCheck.length > 0) {
            purchaseExists = true;
          } else if (purchaseCheck[0] && Array.isArray(purchaseCheck[0]) && purchaseCheck[0].length > 0) {
            purchaseExists = true;
          }
        }
      }
      
      // Check payments table as another fallback
      let paymentExists = false;
      if (!userCourseExists && !purchaseExists) {
        const paymentCheck = await db.query(
          "SELECT * FROM payments WHERE user_id = ? AND course_id = ? AND status = 'completed'",
          [userId, courseId]
        );
        
        if (paymentCheck) {
          if (Array.isArray(paymentCheck) && paymentCheck.length > 0) {
            paymentExists = true;
          } else if (paymentCheck[0] && Array.isArray(paymentCheck[0]) && paymentCheck[0].length > 0) {
            paymentExists = true;
          }
        }
      }
      
      if (userCourseExists || purchaseExists || paymentExists) {
        hasAccess = true;
        reason = "User has purchased this content";
        
        // Ensure record exists in user_courses
        if (!userCourseExists && (purchaseExists || paymentExists)) {
          try {
            await db.query(
              `INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at) 
               VALUES (?, ?, 'completed', NOW()) 
               ON DUPLICATE KEY UPDATE payment_status='completed'`,
              [userId, courseId]
            );
            console.log(`Created missing user_courses record for user ${userId}, course ${courseId}`);
          } catch (syncError) {
            console.error('Error syncing user_courses:', syncError);
          }
        }
      } else {
        reason = "User has not purchased this content";
      }
    }
    
    console.log(`Access result for user ${userId} to course ${courseId}: ${hasAccess} (${reason})`);
    
    res.json({
      hasAccess: hasAccess,
      reason: reason,
      course: {
        id: course.id,
        title: course.title,
        price: course.price,
        type: course.type,
        content_type: course.content_type
      },
      user: {
        id: userId,
        role: req.session.user.role,
        isUploader: parseInt(req.session.user.id) === parseInt(course.user_id)
      }
    });
    
  } catch (err) {
    console.error('Error checking access:', err);
    res.status(500).json({ 
      hasAccess: false, 
      error: "Error checking access", 
      details: err.message 
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
      if (course.file_path && fs.existsSync(course.file_path)) {
        fs.unlinkSync(course.file_path);
      }
    } catch (fileError) {}

    await db.query('DELETE FROM courses WHERE id = ?', [courseId]);

    res.json({ message: 'Course deleted successfully' });

  } catch (error) {
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// =================== PRODUCTS ENDPOINTS ===================
app.get("/api/products", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM products ORDER BY created_at DESC");
    const products = Array.isArray(result) ? result : result[0];
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "Error fetching products." });
  }
});

app.post("/api/upload-product", productUpload, async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to upload products." });
  }

  try {
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
      delivery_days
    } = req.body;

    if (!title || !price || !type || !paymentProvider) {
      return res.status(400).json({ 
        error: "Title, price, type, and payment provider are required." 
      });
    }

    if (type === 'physical') {
      if (!delivery_days || isNaN(parseInt(delivery_days)) || parseInt(delivery_days) < 1) {
        return res.status(400).json({ 
          error: "Please provide valid delivery days (minimum 1 day) for physical products." 
        });
      }
      
      if (!payment_option) {
        req.body.payment_option = 'pay_on_delivery';
      }
    }

    let filePath = null;
    let images = [];

    if (req.files['file'] && req.files['file'][0]) {
      const mainFile = req.files['file'][0];
      filePath = `/uploads/products/${mainFile.filename}`;
    }

    if (req.files['images[]']) {
      images = req.files['images[]'].map(file => `/uploads/products/${file.filename}`);
    }

    const estimatedDeliveryDays = type === 'physical' 
      ? parseInt(delivery_days) || 7 
      : null;

    const result = await db.query(
      `INSERT INTO products (
        user_id, 
        title, 
        description, 
        price, 
        category, 
        type, 
        file_path, 
        images, 
        affiliate_link, 
        delivery_type, 
        delivery_locations, 
        delivery_fee, 
        payment_option, 
        seller_payment_provider,
        estimated_delivery_days
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.user.id,
        title,
        description || '',
        parseFloat(price),
        category || '',
        type || 'digital',
        filePath,
        images.length > 0 ? JSON.stringify(images) : null,
        affiliate_link || null,
        delivery_type || null,
        delivery_locations || null,
        delivery_fee ? parseFloat(delivery_fee) : null,
        payment_option || null,
        paymentProvider,
        estimatedDeliveryDays
      ]
    );
    
    res.json({ 
      message: "✅ Product uploaded successfully!",
      productId: result.insertId,
      payment_provider: paymentProvider,
      estimated_delivery_days: estimatedDeliveryDays
    });

  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ 
        error: "Database configuration error. Please contact administrator." 
      });
    }
    
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      if (err.message.includes('estimated_delivery_days')) {
        return res.status(500).json({ 
          error: "Database update required. Please add estimated_delivery_days column to products table.",
          sql_fix: "ALTER TABLE products ADD COLUMN estimated_delivery_days INT DEFAULT 7;"
        });
      }
      
      return res.status(500).json({ 
        error: "Database configuration error. Please contact administrator." 
      });
    }
    
    if (err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
      return res.status(400).json({ 
        error: "Invalid delivery days value. Please enter a number between 1 and 90." 
      });
    }
    
    res.status(500).json({ 
      error: "Error uploading product: " + err.message,
      code: err.code
    });
  }
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

app.get("/api/products/seller/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;

    const products = await db.query(
      "SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC",
      [sellerId]
    );
    
    res.json(Array.isArray(products) ? products : []);
  } catch (err) {
    res.status(500).json({ error: "Error fetching seller products" });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login first" });
    }

    const productId = req.params.id;
    const { id: userId, role: userRole } = req.session.user;

    const products = await db.query(
      "SELECT user_id FROM products WHERE id = ?",
      [productId]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const productOwnerId = products[0].user_id;

    if (userRole !== "admin" && Number(productOwnerId) !== Number(userId)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const result = await db.query(
      "DELETE FROM products WHERE id = ?",
      [productId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Delete failed" });
    }

    return res.json({
      success: true,
      message: "✅ Product deleted successfully",
      deletedId: productId
    });

  } catch (err) {
    return res.status(500).json({
      error: "Failed to delete product",
      details: err.message
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

// =================== FAVORITES ENDPOINTS ===================
app.post("/api/favorites", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to favorite products." });
  }

  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "Product ID is required." });
    }

    const result = await db.query(
      "SELECT * FROM favorites WHERE user_id = ? AND product_id = ?",
      [req.session.user.id, productId]
    );

    const existing = Array.isArray(result)
      ? (Array.isArray(result[0]) ? result[0] : result)
      : [];

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
    res.status(500).json({ error: "Error updating favorites." });
  }
});

app.get("/api/favorites", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to view favorites." });
  }

  try {
    const result = await db.query(
      "SELECT product_id FROM favorites WHERE user_id = ?",
      [req.session.user.id]
    );

    let favorites;
    if (Array.isArray(result) && result.length > 0) {
      if (Array.isArray(result[0])) {
        favorites = result[0].map(row => row.product_id);
      } else {
        favorites = result.map(row => row.product_id);
      }
    } else {
      favorites = [];
    }

    res.json({ favorites });
  } catch (err) {
    res.status(500).json({ error: "Error loading favorites." });
  }
});

// =================== SERVICES ENDPOINTS ===================
app.get("/api/services", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        s.*, 
        u.username,
        fp.profile_picture,
        fp.headline as provider_headline
      FROM services s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
      WHERE s.id IS NOT NULL
      ORDER BY s.created_at DESC
    `);
    
    let services = [];
    if (Array.isArray(result)) {
      if (result.length > 0 && Array.isArray(result[0])) {
        services = result[0];
      } else {
        services = result;
      }
    }
    
    res.json(services);
    
  } catch (err) {
    res.status(500).json({ 
      error: "Error fetching services",
      details: err.message 
    });
  }
});

app.get("/api/services/my-services", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login to view your services" });
    }

    const result = await db.query(`
      SELECT 
        s.*, 
        u.username,
        fp.profile_picture,
        fp.headline as provider_headline
      FROM services s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN freelancer_profiles fp ON fp.user_id = s.user_id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `, [req.session.user.id]);

    let services = [];
    if (Array.isArray(result)) {
      if (result.length > 0 && Array.isArray(result[0])) {
        services = result[0];
      } else {
        services = result;
      }
    }
    
    res.json(services);

  } catch (err) {
    res.status(500).json({ 
      error: "Error fetching your services",
      details: err.message 
    });
  }
});

app.get("/api/services/categories", async (req, res) => {
  try {
    const categories = await db.query(`
      SELECT DISTINCT category 
      FROM services 
      WHERE category IS NOT NULL AND category != ''
      ORDER BY category
    `);
    
    const categoryList = (Array.isArray(categories) ? categories : (categories[0] || []))
      .map(row => row.category)
      .filter(Boolean);
    
    res.json(categoryList);
  } catch (err) {
    res.status(500).json({ error: "Error fetching categories" });
  }
});

app.post("/api/services", upload.none(), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to create a service" });
  }

  try {
    const { title, description, category, hourly_rate, fixed_price } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required" });
    }

    const price = fixed_price ? parseFloat(fixed_price) :
                  hourly_rate ? parseFloat(hourly_rate) : 0;

    const profileResult = await db.query(
      "SELECT profile_picture FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    let profilePictures = [];
    if (Array.isArray(profileResult)) {
      profilePictures = Array.isArray(profileResult[0]) ? profileResult[0] : profileResult;
    }

    const profilePicture = profilePictures.length > 0 ? profilePictures[0].profile_picture : null;

    const result = await db.query(`
      INSERT INTO services 
      (user_id, title, description, price, category, provider_profile_picture)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      req.session.user.id,
      title,
      description,
      price,
      category || 'other',
      profilePicture
    ]);

    const serviceId = result.insertId || result[0]?.insertId;
    if (!serviceId) throw new Error("Could not get service ID after creation");

    const subscriptionCheck = await db.query(`
      SELECT * FROM service_subscriptions 
      WHERE user_id = ? AND (status = 'active' OR trial_ends_at > CURDATE())
    `, [req.session.user.id]);

    let hasActiveSubscription = false;
    if (
      (Array.isArray(subscriptionCheck) && subscriptionCheck.length > 0) ||
      (subscriptionCheck && Array.isArray(subscriptionCheck[0]) && subscriptionCheck[0].length > 0)
    ) {
      hasActiveSubscription = true;
    }

    if (!hasActiveSubscription) {
      const trialStarted = new Date();
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 90);

      const trialStartedDate = trialStarted.toISOString().split('T')[0];
      const trialEndsDate = trialEnds.toISOString().split('T')[0];

      try {
        await db.query(`
          INSERT INTO service_subscriptions 
          (user_id, service_id, trial_started_at, trial_ends_at, status)
          VALUES (?, ?, ?, ?, ?)
        `, [
          req.session.user.id,
          serviceId,
          trialStartedDate,
          trialEndsDate,
          'active'
        ]);
      } catch (subscriptionError) {}
    }

    res.json({
      message: "Service created successfully! You're on a 90-day free trial.",
      serviceId: serviceId,
      onTrial: !hasActiveSubscription,
      hasProfilePicture: !!profilePicture
    });

  } catch (err) {
    res.status(500).json({ error: "Error creating service: " + err.message });
  }
});

app.get("/api/services/:id/details", async (req, res) => {
  try {
    const serviceId = req.params.id;
    
    const [serviceRows] = await db.query(`
      SELECT s.*, u.username, u.email, 
             fp.profile_picture as provider_profile_picture,
             fp.headline as provider_headline
      FROM services s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
      WHERE s.id = ?
    `, [serviceId]);
    
    if (!serviceRows || serviceRows.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }
    
    const service = serviceRows[0];
    
    const [products] = await db.query(`
      SELECT * FROM service_products 
      WHERE service_id = ?
      ORDER BY created_at DESC
    `, [serviceId]);
    
    const [reviews] = await db.query(`
      SELECT sr.*, u.username
      FROM service_reviews sr
      JOIN users u ON sr.user_id = u.id
      WHERE sr.service_id = ?
      ORDER BY sr.created_at DESC
    `, [serviceId]);
    
    res.json({
      ...service,
      products: products || [],
      reviews: reviews || [],
      avg_rating: service.rating || 0,
      review_count: service.review_count || 0
    });
    
  } catch (err) {
    res.status(500).json({ error: "Error loading service details" });
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

    const trialCheck = await db.query(`
      SELECT * FROM service_subscriptions 
      WHERE user_id = ? AND trial_ends_at > CURDATE()
    `, [req.session.user.id]);

    let hasActiveTrial = false;
    
    if (Array.isArray(trialCheck) && trialCheck.length > 0) {
      hasActiveTrial = true;
    } else if (trialCheck && trialCheck[0] && Array.isArray(trialCheck[0]) && trialCheck[0].length > 0) {
      hasActiveTrial = true;
    }

    if (hasActiveTrial) {
      return res.status(400).json({ 
        error: "You're still on free trial. Subscription will start after trial ends." 
      });
    }

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

app.get("/api/services/subscription/status", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login" });
  }

  try {
    const subscription = await db.query(`
      SELECT * FROM service_subscriptions 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [req.session.user.id]);

    if (!subscription.length) {
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
      currentPeriodEnds: sub.current_period_ends
    });

  } catch (err) {
    res.status(500).json({ error: "Error checking subscription status" });
  }
});

app.post("/api/services/:id/reviews", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to review services" });
  }

  try {
    const { rating, comment } = req.body;
    const serviceId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const existingReview = await db.query(
      "SELECT id FROM service_reviews WHERE user_id = ? AND service_id = ?",
      [req.session.user.id, serviceId]
    );

    if (existingReview.length > 0) {
      return res.status(400).json({ error: "You have already reviewed this service" });
    }

    await db.query(
      "INSERT INTO service_reviews (service_id, user_id, rating, comment) VALUES (?, ?, ?, ?)",
      [serviceId, req.session.user.id, rating, comment]
    );

    const ratingResult = await db.query(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as review_count 
      FROM service_reviews WHERE service_id = ?
    `, [serviceId]);

    const avgRating = ratingResult[0]?.avg_rating || 0;
    const reviewCount = ratingResult[0]?.review_count || 0;

    await db.query(
      "UPDATE services SET rating = ?, review_count = ? WHERE id = ?",
      [avgRating, reviewCount, serviceId]
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
        type: 'service_product'
      });
    } else {
      throw new Error(response.data.message || 'Service product payment failed');
    }

  } catch (err) {
    res.status(500).json({ error: "Error purchasing service product: " + err.message });
  }
});

app.delete("/api/services/:id", async (req, res) => {
  try {
    const serviceId = Number(req.params.id);
    const { reason } = req.body;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated. Please log in." });
    }

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: "Detailed reason required (min 10 chars)." });
    }

    try {
      await checkAndEnforceDeleteLimits(userId);
    } catch (limitErr) {
      return res.status(403).json({ error: limitErr.message });
    }

    const queryResult = await db.query(
      "SELECT id, title, user_id FROM services WHERE id = ? AND user_id = ?",
      [serviceId, userId]
    );

    const rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
    const service = rows[0];

    if (!service) {
      return res.status(404).json({ error: "Service not found or not owned by you." });
    }

    await db.query("DELETE FROM services WHERE id = ?", [serviceId]);

    await db.query(
      "INSERT INTO deleted_services (service_id, service_owner_id, deleted_by, deleted_by_role, reason) VALUES (?, ?, ?, ?, ?)",
      [service.id, userId, userId, 'user', reason]
    );

    res.json({
      success: true,
      message: "Service deleted successfully.",
      deleted_service: {
        id: service.id,
        title: service.title,
        provider_id: service.user_id
      }
    });

  } catch (err) {
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

// =================== SERVICE DELETE TRACKING ===================
async function checkAndEnforceDeleteLimits(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [userRows] = await db.query(
      "SELECT daily_delete_count, last_delete_date FROM users WHERE id = ?",
      [userId]
    );

    if (!userRows || userRows.length === 0) {
      throw new Error("User not found for delete limit check");
    }

    const user = userRows[0];
    const lastDeleteDate = user.last_delete_date
      ? new Date(user.last_delete_date).toISOString().split('T')[0]
      : null;
    const dailyCount = user.daily_delete_count || 0;

    let remainingDeletes = 3;

    if (lastDeleteDate === today) {
      remainingDeletes = 3 - dailyCount;
    }

    if (remainingDeletes <= 0) {
      throw new Error("You have reached your daily delete limit (3 per day).");
    }

    if (lastDeleteDate === today) {
      await db.query(
        "UPDATE users SET daily_delete_count = daily_delete_count + 1 WHERE id = ?",
        [userId]
      );
    } else {
      await db.query(
        "UPDATE users SET daily_delete_count = 1, last_delete_date = ? WHERE id = ?",
        [today, userId]
      );
    }

    return remainingDeletes;
  } catch (err) {
    throw err;
  }
}

async function logServiceDeletion({ serviceId, userId, serviceTitle, reason, deletedBy, isFlagged = false }) {
  try {
    await db.query(`
      INSERT INTO service_delete_tracking 
      (user_id, service_id, delete_reason, flagged)
      VALUES (?, ?, ?, ?)
    `, [userId, serviceId, reason, isFlagged]);
    
    if (isFlagged) {
      await updateUserMonitoring(userId);
    }
    
  } catch (error) {}
}

async function updateUserMonitoring(userId) {
  try {
    const [userRows] = await db.query(
      "SELECT username, email FROM users WHERE id = ?",
      [userId]
    );
    
    if (userRows.length === 0) return;
    
    const user = userRows[0];
    
    const [deleteCountRows] = await db.query(`
      SELECT COUNT(*) as count FROM service_delete_tracking 
      WHERE user_id = ? AND deleted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `, [userId]);
    
    const deleteCount = deleteCountRows[0].count;
    
    const [monitoringRows] = await db.query(
      "SELECT id FROM user_delete_monitoring WHERE user_id = ?",
      [userId]
    );
    
    if (monitoringRows.length === 0) {
      await db.query(`
        INSERT INTO user_delete_monitoring 
        (user_id, username, email, delete_count_last_7_days, is_flagged, flagged_reason, flagged_at)
        VALUES (?, ?, ?, ?, TRUE, ?, NOW())
      `, [userId, user.username, user.email, deleteCount, 'Multiple service deletions detected']);
    } else {
      await db.query(`
        UPDATE user_delete_monitoring 
        SET delete_count_last_7_days = ?, 
            is_flagged = TRUE,
            flagged_reason = CONCAT(COALESCE(flagged_reason, ''), ' | Multiple deletions detected on ', NOW()),
            flagged_at = NOW(),
            reviewed = FALSE
        WHERE user_id = ?
      `, [deleteCount, userId]);
    }
    
  } catch (error) {}
}

app.get("/api/user/delete-limits", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ 
        error: "Not authenticated" 
      });
    }
    
    const userId = req.session.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    const userResult = await db.query(
      "SELECT daily_delete_count, last_delete_date FROM users WHERE id = ?",
      [userId]
    );
    
    let user;
    
    if (userResult && typeof userResult === 'object') {
      if (userResult.daily_delete_count !== undefined) {
        user = userResult;
      } else if (userResult[0] && userResult[0].daily_delete_count !== undefined) {
        user = userResult[0];
      } else if (userResult.rows && userResult.rows[0]) {
        user = userResult.rows[0];
      }
    }
    
    if (!user) {
      return res.json({
        daily_limit: 3,
        remaining_deletes: 3,
        used_today: 0,
        last_delete_date: null
      });
    }
    
    const lastDeleteDate = user.last_delete_date ? 
      new Date(user.last_delete_date).toISOString().split('T')[0] : 
      null;
    const dailyCount = user.daily_delete_count || 0;
    
    let remaining = 3;
    
    if (lastDeleteDate === today) {
      remaining = Math.max(0, 3 - dailyCount);
    }
    
    res.json({
      daily_limit: 3,
      remaining_deletes: remaining,
      used_today: lastDeleteDate === today ? dailyCount : 0,
      last_delete_date: lastDeleteDate
    });
    
  } catch (err) {
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

app.get("/api/admin/deleted-services", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const result = await db.query(
      "SELECT * FROM deleted_services ORDER BY deleted_at DESC"
    );

    const rows = Array.isArray(result[0]) ? result[0] : result;

    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to load deleted services" });
  }
});

app.get("/api/admin/flagged-users", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ 
        error: "Admin access required" 
      });
    }
    
    const [flaggedUsers] = await db.query(`
      SELECT 
        um.*,
        u.profile_picture,
        u.created_at as user_joined,
        (SELECT COUNT(*) FROM services WHERE user_id = um.user_id) as active_services_count,
        (SELECT COUNT(*) FROM service_delete_tracking WHERE user_id = um.user_id) as total_deletes_count
      FROM user_delete_monitoring um
      JOIN users u ON um.user_id = u.id
      WHERE um.is_flagged = TRUE AND um.reviewed = FALSE
      ORDER BY um.flagged_at DESC
    `);
    
    for (let user of flaggedUsers) {
      const [deleteHistory] = await db.query(`
        SELECT sdt.*, s.title as service_title, s.category as service_category
        FROM service_delete_tracking sdt
        LEFT JOIN services s ON sdt.service_id = s.id
        WHERE sdt.user_id = ?
        ORDER BY sdt.deleted_at DESC
        LIMIT 10
      `, [user.user_id]);
      
      user.delete_history = deleteHistory;
    }
    
    res.json({
      success: true,
      flagged_users: flaggedUsers,
      count: flaggedUsers.length
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// =================== FREELANCER PROFILES ENDPOINTS ===================
app.get("/api/freelancer/profile", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to view profile" });
  }

  try {
    const profileResult = await db.query(
      "SELECT * FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    let profiles = [];
    if (Array.isArray(profileResult)) {
      if (profileResult.length > 0 && Array.isArray(profileResult[0])) {
        profiles = profileResult[0];
      } else {
        profiles = profileResult;
      }
    } else if (profileResult && Array.isArray(profileResult.rows)) {
      profiles = profileResult.rows;
    }

    let userProfile;

    if (profiles.length > 0) {
      const profile = profiles[0];
      
      const enhancedResult = await db.query(`
        SELECT 
          u.id as user_id, 
          u.username, 
          u.email, 
          u.role,
          u.created_at as user_created_at,
          fp.id as profile_id,
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
          fp.profile_picture,
          fp.created_at as profile_created_at,
          fp.updated_at as profile_updated_at,
          COUNT(DISTINCT s.id) as total_services,
          COUNT(DISTINCT sr.id) as total_reviews,
          AVG(sr.rating) as avg_rating,
          COUNT(DISTINCT sp.id) as total_products,
          COALESCE(SUM(so.amount), 0) as total_earnings
        FROM users u
        LEFT JOIN freelancer_profiles fp ON u.id = fp.user_id
        LEFT JOIN services s ON u.id = s.user_id
        LEFT JOIN service_reviews sr ON s.id = sr.service_id
        LEFT JOIN service_products sp ON s.id = sp.service_id
        LEFT JOIN service_orders so ON sp.id = so.product_id AND so.status = 'completed'
        WHERE u.id = ? AND fp.id = ?
        GROUP BY u.id, fp.id
      `, [req.session.user.id, profile.id]);

      let enhancedProfile = [];
      if (Array.isArray(enhancedResult)) {
        if (enhancedResult.length > 0 && Array.isArray(enhancedResult[0])) {
          enhancedProfile = enhancedResult[0];
        } else {
          enhancedProfile = enhancedResult;
        }
      }

      userProfile = enhancedProfile[0] || profile;
      
    } else {
      try {
        const directResult = await db.query(
          "SELECT fp.*, u.username, u.email, u.created_at as user_created_at FROM freelancer_profiles fp JOIN users u ON fp.user_id = u.id WHERE fp.user_id = ?",
          [req.session.user.id]
        );

        let directProfiles = [];
        if (Array.isArray(directResult)) {
          if (directResult.length > 0 && Array.isArray(directResult[0])) {
            directProfiles = directResult[0];
          } else {
            directProfiles = directResult;
          }
        }

        if (directProfiles.length > 0) {
          userProfile = directProfiles[0];
        } else {
          try {
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

            const [newProfile] = await db.query(
              "SELECT fp.*, u.username, u.email, u.created_at as user_created_at FROM freelancer_profiles fp JOIN users u ON fp.user_id = u.id WHERE fp.user_id = ?",
              [req.session.user.id]
            );

            let newProfiles = [];
            if (Array.isArray(newProfile)) {
              if (newProfile.length > 0 && Array.isArray(newProfile[0])) {
                newProfiles = newProfile[0];
              } else {
                newProfiles = newProfile;
              }
            }

            userProfile = newProfiles[0];
            
          } catch (insertError) {
            const userResult = await db.query(
              "SELECT id as user_id, username, email, role, created_at as user_created_at FROM users WHERE id = ?",
              [req.session.user.id]
            );

            let users = [];
            if (Array.isArray(userResult)) {
              if (userResult.length > 0 && Array.isArray(userResult[0])) {
                users = userResult[0];
              } else {
                users = userResult;
              }
            }

            userProfile = {
              ...users[0],
              headline: 'New Freelancer',
              description: 'Tell clients about yourself and your services...',
              hourly_rate: 25,
              skills: JSON.stringify([]),
              languages: JSON.stringify([]),
              experience_level: 'intermediate',
              availability: 'available'
            };
          }
        }
      } catch (directError) {
        throw new Error("Cannot access profile data");
      }
    }

    if (!userProfile) {
      throw new Error("Failed to load or create profile");
    }

    res.json(userProfile);
    
  } catch (err) {
    res.status(500).json({ error: "Error loading profile: " + err.message });
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

app.post("/api/freelancer/profile-picture", profilePictureUpload.single("profile_picture"), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to upload picture" });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const profilePicturePath = `/uploads/profiles/${req.file.filename}`;

    const result = await db.query(`
      UPDATE freelancer_profiles 
      SET profile_picture = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = ?
    `, [profilePicturePath, req.session.user.id]);

    res.json({ 
      success: true,
      message: "Profile picture updated successfully",
      profile_picture: profilePicturePath
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: "Error uploading profile picture: " + err.message 
    });
  }
});

app.post("/api/freelancer/certificate-images", profilePictureUpload.array("certificate_images", 5), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to upload certificates" });
  }

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const certificatePaths = req.files.map(file => `/uploads/profiles/${file.filename}`);

    const [currentProfile] = await db.query(
      "SELECT certificate_images FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    let currentCertificates = [];
    
    if (currentProfile && currentProfile.length > 0 && currentProfile[0].certificate_images) {
      const certData = currentProfile[0].certificate_images;
      
      if (certData && certData.trim() !== '') {
        try {
          if (certData.startsWith('[')) {
            currentCertificates = JSON.parse(certData);
          } else {
            currentCertificates = [certData];
          }
        } catch (e) {
          currentCertificates = [];
        }
      }
    }

    const updatedCertificates = [...currentCertificates, ...certificatePaths];
    
    if (updatedCertificates.length > 5) {
      return res.status(400).json({ 
        error: "Maximum 5 certificates allowed. Please remove some existing certificates first." 
      });
    }

    await db.query(`
      UPDATE freelancer_profiles 
      SET certificate_images = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = ?
    `, [JSON.stringify(updatedCertificates), req.session.user.id]);

    res.json({ 
      success: true,
      message: "Certificate images uploaded successfully",
      certificate_images: updatedCertificates
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: "Error uploading certificate images: " + err.message 
    });
  }
});

app.get("/api/freelancer/dashboard-stats", async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'freelancer') {
    return res.status(401).json({ error: "Freelancer access required" });
  }

  try {
    const [stats] = await db.query(`
      SELECT 
        COUNT(DISTINCT s.id) as total_services,
        COUNT(DISTINCT sp.id) as total_products,
        COUNT(DISTINCT so.id) as total_orders,
        COUNT(DISTINCT sr.id) as total_reviews,
        AVG(sr.rating) as avg_rating,
        COALESCE(SUM(so.amount), 0) as total_earnings,
        COUNT(DISTINCT so.buyer_id) as total_clients
      FROM users u
      LEFT JOIN services s ON u.id = s.user_id
      LEFT JOIN service_products sp ON s.id = sp.service_id
      LEFT JOIN service_orders so ON sp.id = so.product_id AND so.status = 'completed'
      LEFT JOIN service_reviews sr ON s.id = sr.service_id
      WHERE u.id = ?
    `, [req.session.user.id]);

    const [recentOrders] = await db.query(`
      SELECT 
        so.id as order_id,
        so.amount,
        so.status,
        so.created_at,
        so.transaction_id,
        sp.title as product_title, 
        u.username as buyer_name
      FROM service_orders so
      JOIN service_products sp ON so.product_id = sp.id
      JOIN users u ON so.buyer_id = u.id
      JOIN services s ON sp.service_id = s.id
      WHERE s.user_id = ?
      ORDER BY so.created_at DESC
      LIMIT 5
    `, [req.session.user.id]);

    res.json({
      stats: stats[0],
      recent_orders: recentOrders
    });
  } catch (err) {
    res.status(500).json({ error: "Error loading dashboard stats" });
  }
});

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
        fp.profile_picture
      FROM users u
      JOIN freelancer_profiles fp ON u.id = fp.user_id
      WHERE u.id = ?`,
      [userId]
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const data = result[0];
    
    const serviceCountResult = await db.query(
      "SELECT COUNT(*) as service_count FROM services WHERE user_id = ?",
      [userId]
    );
    const serviceCount = serviceCountResult[0]?.service_count || 0;
    
    let reviewCount = 0;
    let avgRating = 0.0;
    
    try {
      const reviewsResult = await db.query(
        `SELECT COUNT(*) as review_count, AVG(rating) as avg_rating 
         FROM service_reviews sr
         JOIN services s ON sr.service_id = s.id
         WHERE s.user_id = ?`,
        [userId]
      );
      reviewCount = reviewsResult[0]?.review_count || 0;
      avgRating = parseFloat(reviewsResult[0]?.avg_rating) || 0.0;
    } catch (reviewError) {}
    
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
      created_at: data.created_at,
      service_count: serviceCount,
      review_count: reviewCount,
      avg_rating: avgRating,
      completed_orders: 0
    };

    res.json(publicProfile);
    
  } catch (err) {
    res.status(500).json({ 
      error: "Error loading user profile"
    });
  }
});

app.get("/api/users/:userId/certificates", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await db.query(
      `SELECT certificate_images FROM freelancer_profiles WHERE user_id = ?`,
      [userId]
    );
    
    let certificates = [];
    if (Array.isArray(result) && result.length > 0) {
      const profile = result[0];
      if (profile.certificate_images) {
        try {
          certificates = JSON.parse(profile.certificate_images);
        } catch (e) {}
      }
    }
    
    res.json({
      success: true,
      certificate_images: certificates
    });
    
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: "Error loading certificates" 
    });
  }
});

// =================== PAYMENT ENDPOINTS ===================
app.post("/api/initiate-payment", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to make payment" });
  }

  try {
    const { courseId } = req.body;

    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [courseId]);
    const course = Array.isArray(courses) && courses.length > 0
      ? courses[0]
      : (courses[0] && courses[0][0]) || null;

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.price <= 0) {
      return res.status(400).json({ error: "This course is free. No payment required." });
    }

    const payload = {
      tx_ref: "coreinsight_" + Date.now() + "_" + courseId,
      amount: course.price,
      currency: "NGN",
      payment_options: "card, banktransfer, ussd",
      redirect_url: `https://core-insight-7.onrender.com/payment-callback.html`,
      customer: {
        email: req.session.user.email || `${req.session.user.username}@example.com`,
        name: req.session.user.username,
      },
      customizations: {
        title: "Core Insight Courses",
        description: `Payment for ${course.title}`,
        logo: "https://your-logo-url.com/logo.png",
      },
      meta: {
        course_id: courseId,
        user_id: req.session.user.id,
        course_title: course.title,
      }
    };

    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.status === "success" && response.data.data && response.data.data.link) {
      res.json({
        paymentLink: response.data.data.link,
        transactionRef: payload.tx_ref,
        status: "success",
      });
    } else {
      res.status(500).json({
        error: "Payment initiation failed: " + (response.data.message || "Unknown error"),
      });
    }

  } catch (err) {
    res.status(500).json({ error: "Error initiating payment: " + err.message });
  }
});

app.get("/api/verify-payment/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;
    
    console.log(`Verifying payment for transaction: ${transaction_id}`);
    
    const response = await flw.Transaction.verify({ id: transaction_id });
    
    console.log('Flutterwave verification response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.status === "successful") {
      const transactionRef = response.data.tx_ref;
      const courseId = response.data.meta?.course_id;
      const userId = response.data.meta?.user_id;
      const courseTitle = response.data.meta?.course_title || 'Course';
      
      console.log(`Payment successful for course ${courseId}, user ${userId}`);
      
      if (!courseId || !userId) {
        console.error('Missing course_id or user_id in meta:', response.data.meta);
        return res.status(400).json({ 
          status: "failed", 
          message: "Missing course or user information in payment metadata" 
        });
      }
      
      // Insert into payments table
      try {
        await db.query(
          `INSERT INTO payments (transaction_id, transaction_ref, course_id, user_id, amount, status, flutterwave_response) 
           VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
          [
            transaction_id,
            transactionRef,
            courseId,
            userId,
            response.data.amount || 0,
            JSON.stringify(response.data)
          ]
        );
        console.log('Payment record inserted');
      } catch (paymentError) {
        console.error('Error inserting payment record:', paymentError);
        // Continue even if payment record fails - the important part is user_courses
      }

      // Insert into user_courses table
      try {
        // Check if record already exists
        const existing = await db.query(
          `SELECT * FROM user_courses WHERE user_id = ? AND course_id = ?`,
          [userId, courseId]
        );
        
        let existingRows = [];
        if (existing) {
          if (Array.isArray(existing)) {
            if (existing.length === 2 && Array.isArray(existing[0])) {
              existingRows = existing[0];
            } else if (existing.length > 0) {
              existingRows = existing;
            }
          }
        }
        
        if (existingRows.length > 0) {
          // Update existing record
          await db.query(
            `UPDATE user_courses SET payment_status = 'completed', purchased_at = NOW() WHERE user_id = ? AND course_id = ?`,
            [userId, courseId]
          );
          console.log('User_courses record updated');
        } else {
          // Insert new record
          await db.query(
            `INSERT INTO user_courses (user_id, course_id, payment_status, purchased_at) 
             VALUES (?, ?, 'completed', NOW())`,
            [userId, courseId]
          );
          console.log('User_courses record inserted');
        }
        
        // Double-check that it was inserted
        const verifyCheck = await db.query(
          `SELECT * FROM user_courses WHERE user_id = ? AND course_id = ? AND payment_status = 'completed'`,
          [userId, courseId]
        );
        
        let verifyRows = [];
        if (verifyCheck) {
          if (Array.isArray(verifyCheck)) {
            if (verifyCheck.length === 2 && Array.isArray(verifyCheck[0])) {
              verifyRows = verifyCheck[0];
            } else if (verifyCheck.length > 0) {
              verifyRows = verifyCheck;
            }
          }
        }
        
        console.log(`Access record exists: ${verifyRows.length > 0}`);
        
      } catch (userCourseError) {
        console.error('Error updating user_courses:', userCourseError);
        return res.status(500).json({ 
          status: "failed", 
          message: "Error updating course access" 
        });
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
    console.error('Error verifying payment:', err);
    res.status(500).json({ error: "Error verifying payment: " + err.message });
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

// ====== PHYSICAL ORDER CREATION - COMPLETE FORM ======
app.post("/api/order-product", async (req, res) => {
  try {
    console.log("📦 ORDER REQUEST RECEIVED:", req.body);
    
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

    // Validation
    if (!productId || !productTitle || !price) {
      return res.status(400).json({ error: "Missing product information" });
    }

    if (!deliveryAddress || !deliveryPhone) {
      return res.status(400).json({ error: "Delivery details required" });
    }

    // Get product and seller info
    const productResult = await db.query(
      "SELECT user_id as seller_id FROM products WHERE id = ?",
      [productId]
    );

    if (!productResult || productResult.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const sellerId = productResult[0].seller_id;
    const buyerId = req.session.user.id;

    // Calculate totals
    const qty = parseInt(quantity, 10);
    const unitPrice = parseFloat(price);
    
    if (isNaN(qty) || qty < 1 || qty > 100) {
      return res.status(400).json({ error: "Invalid quantity" });
    }
    
    if (isNaN(unitPrice) || unitPrice <= 0) {
      return res.status(400).json({ error: "Invalid price" });
    }

    const totalAmount = qty * unitPrice;
    const platformFee = totalAmount * 0.10; // 10% platform fee
    const sellerEarnings = totalAmount - platformFee;

    console.log("💰 CALCULATIONS:", {
      totalAmount,
      platformFee,
      sellerEarnings,
      quantity: qty,
      unitPrice
    });

    const result = await db.query(
      `INSERT INTO physical_orders (
        product_id, seller_id, buyer_id,
        product_name, product_type, quantity, price, total_amount,
        customer_name, customer_email, customer_phone,
        shipping_address, city, state, country,
        payment_method, payment_status, order_status,
        notes, estimated_delivery_days, platform_fee, seller_earnings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        sellerId,
        buyerId,
        productTitle,
        'physical',
        qty,
        unitPrice,
        totalAmount,
        req.session.user.username || 'Buyer',
        req.session.user.email,
        deliveryPhone,
        deliveryAddress,
        city || '',
        state || '',
        country || '',
        'pay_on_delivery',
        'pending',
        'pending',
        notes || '',
        parseInt(deliveryDays) || 7,
        platformFee,
        sellerEarnings
      ]
    );

    const orderId = result.insertId;

    // Create initial tracking entry
    await db.query(
      `INSERT INTO order_tracking (order_id, status, description)
       VALUES (?, ?, ?)`,
      [orderId, 'pending', 'Order received and is being processed']
    );

    // Create notification for seller
    await db.query(
      `INSERT INTO seller_notifications 
       (seller_id, order_id, notification_type, title, message)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sellerId,
        orderId,
        'new_order',
        'New Order Received!',
        `New order #${orderId} for "${productTitle}" - ${qty} x $${unitPrice} = $${totalAmount}. Buyer: ${req.session.user.username || 'Buyer'}, Phone: ${deliveryPhone}`
      ]
    );

    // Send detailed email to seller
    try {
      const sellerResult = await db.query(
        "SELECT email, username FROM users WHERE id = ?",
        [sellerId]
      );
      
      if (sellerResult && sellerResult.length > 0) {
        const seller = sellerResult[0];
        
        await transporter.sendMail({
          from: `"Core Insight Orders" <${process.env.EMAIL_USER}>`,
          to: seller.email,
          subject: `📦 New Order #${orderId} - ${productTitle}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
              <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <h1 style="color: #0f172a; margin-bottom: 20px;">🎉 New Order Received!</h1>
                
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                  <h2 style="margin: 0; font-size: 24px;">Order #${orderId}</h2>
                  <p style="margin: 10px 0 0 0; opacity: 0.9;">${productTitle}</p>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px;">
                  <div style="background: #f1f5f9; padding: 20px; border-radius: 8px;">
                    <h3 style="color: #475569; margin-top: 0;">📋 Order Details</h3>
                    <p><strong>Product:</strong> ${productTitle}</p>
                    <p><strong>Quantity:</strong> ${qty}</p>
                    <p><strong>Unit Price:</strong> $${unitPrice.toFixed(2)}</p>
                    <p><strong>Total Amount:</strong> <span style="color: #10b981; font-weight: bold;">$${totalAmount.toFixed(2)}</span></p>
                    <p><strong>Your Earnings:</strong> <span style="color: #10b981; font-weight: bold;">$${sellerEarnings.toFixed(2)}</span></p>
                    <p><strong>Platform Fee (10%):</strong> $${platformFee.toFixed(2)}</p>
                  </div>
                  
                  <div style="background: #f1f5f9; padding: 20px; border-radius: 8px;">
                    <h3 style="color: #475569; margin-top: 0;">👤 Buyer Information</h3>
                    <p><strong>Name:</strong> ${req.session.user.username || 'Buyer'}</p>
                    <p><strong>Email:</strong> ${req.session.user.email}</p>
                    <p><strong>Phone:</strong> ${deliveryPhone}</p>
                  </div>
                </div>
                
                <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                  <h3 style="color: #475569; margin-top: 0;">📍 Delivery Address</h3>
                  <p style="margin: 5px 0;">${deliveryAddress}</p>
                  <p style="margin: 5px 0;">${city}${state ? ', ' + state : ''}${country ? ', ' + country : ''}</p>
                  <p style="margin: 5px 0;"><strong>Estimated Delivery:</strong> ${deliveryDays} days</p>
                </div>
                
                <div style="border-top: 2px dashed #e2e8f0; padding-top: 20px;">
                  <p style="text-align: center; margin-bottom: 20px;">
                    <a href="https://core-insight-7.onrender.com/products.html#dashboard" 
                       style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                              color: white; padding: 12px 30px; text-decoration: none; 
                              border-radius: 6px; font-weight: bold; display: inline-block;">
                      📊 View in Dashboard
                    </a>
                  </p>
                  <p style="text-align: center; color: #64748b; font-size: 14px;">
                    This order is marked as <strong style="color: #f59e0b;">Pending</strong>. 
                    Please update the status when you process or ship the order.
                  </p>
                </div>
              </div>
            </div>
          `
        });
        console.log(`📧 Detailed email sent to seller: ${seller.email}`);
      }
    } catch (emailError) {
      console.error("❌ Email sending failed:", emailError);
    }

    // Send confirmation email to buyer
    try {
      await transporter.sendMail({
        from: `"Core Insight Orders" <${process.env.EMAIL_USER}>`,
        to: req.session.user.email,
        subject: `✅ Order Confirmation #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">✅ Order Confirmed!</h2>
            <p>Thank you for your order. The seller has been notified.</p>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Order Summary</h3>
              <p><strong>Order ID:</strong> #${orderId}</p>
              <p><strong>Product:</strong> ${productTitle}</p>
              <p><strong>Quantity:</strong> ${qty}</p>
              <p><strong>Total:</strong> $${totalAmount.toFixed(2)}</p>
              <p><strong>Payment Method:</strong> Pay on Delivery</p>
              <p><strong>Estimated Delivery:</strong> ${deliveryDays} days</p>
            </div>
            
            <p>You will receive updates about your order via email.</p>
          </div>
        `
      });
    } catch (buyerEmailError) {
      console.error("❌ Buyer email failed:", buyerEmailError);
    }

    console.log(`✅ Order created: ID ${orderId} for seller ${sellerId}`);

    res.json({
      success: true,
      message: "Order placed successfully!",
      orderId: orderId,
      totalAmount: totalAmount,
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

// =================== SELLER NOTIFICATIONS ===================
app.get("/api/seller/notifications", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Please log in" });
    }

    const [notifications] = await db.query(
      `SELECT n.*, o.product_name, o.total_amount, o.order_status,
              DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i') as formatted_time
       FROM seller_notifications n
       JOIN physical_orders o ON n.order_id = o.id
       WHERE n.seller_id = ?
       ORDER BY n.created_at DESC
       LIMIT 20`,
      [req.session.user.id]
    );

    const [[unread]] = await db.query(
      `SELECT COUNT(*) AS count
       FROM seller_notifications
       WHERE seller_id = ? AND is_read = FALSE`,
      [req.session.user.id]
    );

    res.json({
      success: true,
      notifications,
      unreadCount: unread.count
    });

  } catch (err) {
    res.status(500).json({ error: "Failed to load notifications" });
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

// =================== SERVER START ===================
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
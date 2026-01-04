// index.js - COMPLETE VERSION with Enhanced Authentication Features
require("dotenv").config();
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



// ========================= FLUTTERWAVE SETUP =========================
const Flutterwave = require('flutterwave-node-v3');

// Enhanced initialization with better error handling
let flw;
try {
    if (!process.env.FLW_PUBLIC_KEY || !process.env.FLW_SECRET_KEY) {
        console.error("❌ Flutterwave keys missing in environment variables");
        throw new Error("Flutterwave API keys are required");
    }
    
    flw = new Flutterwave(
        process.env.FLW_PUBLIC_KEY,
        process.env.FLW_SECRET_KEY
    );
    console.log("✅ Flutterwave initialized successfully");
} catch (error) {
    console.error("❌ Flutterwave initialization failed:", error.message);
}

// ========================= BIGINT SERIALIZATION FIX =========================
BigInt.prototype.toJSON = function() {
    return this.toString();
};

const safeJSON = (data) => {
    return JSON.parse(JSON.stringify(data, (key, value) => {
        return typeof value === 'bigint' ? value.toString() : value;
    }));
};

console.log("🚀 Starting Core Insight Server...");

// ========================= ENHANCED MIDDLEWARE =========================
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);
app.use(express.static("public"));

// ========================= NODEMAILER SETUP =========================
// ========================= EMAIL SETUP =========================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false // ✅ Fixes "self-signed certificate" issue
  }
});


// Create uploads directory
const uploadDir = "uploads/courses";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("✅ Created uploads directory");
}

// ========================= MULTER CONFIG =========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

// ========================= COURSE ACCESS MIDDLEWARE =========================
const checkCourseAccess = async (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to access this course" });
  }

  try {
    const courseId = req.params.id;
    const userId = req.session.user.id;

    // Check if user has access to the course (free or paid)
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
    console.error("❌ Course access check error:", err);
    res.status(500).json({ error: "Error checking course access" });
  }
};
// Add this BEFORE your other routes
app.get("/api/test-my-services", (req, res) => {
  res.json({ 
    message: "Test route works!",
    sessionUser: req.session.user,
    timestamp: new Date().toISOString()
  });
});
// ========================= ROUTES =========================
app.get("/api/products", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM products ORDER BY created_at DESC");
    const products = Array.isArray(result) ? result : result[0];
    res.json(products);
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({ error: "Error fetching products." });
  }
});

// Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "✅ Server is working!", database: process.env.DB_NAME });
});

// Health check
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1 as healthy");
    res.json({ status: "healthy", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

// ========================= ENHANCED AUTHENTICATION ROUTES =========================

// Register new user with email verification
app.post("/api/signup", async (req, res) => {
  console.log("📝 Signup attempt:", req.body.username);
  
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password || !email) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    // Check if username or email exists
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

    // Send verification email
    const verifyLink = `http://localhost:${PORT}/api/verify/${verifyToken}`;
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

    console.log("✅ User registered:", username);
    res.json({ message: "Registration successful! Please check your email to verify your account." });
    
  } catch (err) {
    console.error("❌ Signup error:", err);
    
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: "Username or email already exists" });
    } else {
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  }
});

// Verify email endpoint
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
    console.error("❌ Email verification error:", err);
    res.status(500).send("Error verifying email");
  }
});

// Enhanced login with email OR username support
app.post("/api/login", async (req, res) => {
  console.log("🔐 Login attempt:", req.body.username || req.body.email);
  
  try {
    const { username, email, password } = req.body;
    
    // Validate that at least one identifier is provided
    if ((!username && !email) || !password) {
      return res.status(400).json({ error: "Username/email and password are required" });
    }

    // Find user by username OR email
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
    
    // Extract user from different possible result structures
    if (Array.isArray(users) && users.length > 0) {
      user = users[0];
    } else if (users && users[0] && Array.isArray(users[0]) && users[0].length > 0) {
      user = users[0][0];
    }

    if (!user) {
      const identifier = username || email;
      return res.status(400).json({ error: `User with ${username ? 'username' : 'email'} "${identifier}" not found` });
    }

    // Check if email is verified
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

    const identifier = username || email;
    console.log("✅ Login successful:", identifier);
    res.json({ message: "Login successful!", user: req.session.user });
    
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Forgot password request
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 hour

    const result = await db.query(
      "UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?",
      [token, expires, email]
    );


    // Always respond the same for security
    const message = "If that email address exists in our system, we've sent a password reset link to it.";

    // Send the email only if a row was updated
    if (result.affectedRows > 0) {
      const resetLink = `http://localhost:${PORT}/reset-password.html?token=${token}`;

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

    // Always respond success message regardless of whether the email existed
    res.json({ message });

  } catch (err) {
    console.error("❌ Forgot password error:", err);
    res.status(500).json({ error: "Error sending reset email" });
  }
});


// Reset password
app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;
  
  if (!token || !password) {
    return res.status(400).json({ error: "Token and password are required" });
  }

  try {
    // Check for valid, non-expired token
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
    console.error("❌ Reset password error:", err);
    res.status(500).json({ error: "Error resetting password" });
  }
});

// Admin password change
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
    console.error("❌ Admin password change error:", err);
    res.status(500).json({ error: "Error changing password" });
  }
});

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ message: "Logged out" });
});

// Get current user
app.get("/api/me", (req, res) => {
  res.json(req.session.user || null);
});
// ================= COMPLAINT EMAIL ROUTE =================
// Add this AFTER your existing routes but BEFORE app.listen

// ================= COMPLAINT EMAIL ROUTE =================
app.post('/api/send-complaint', async (req, res) => {
  try {
    console.log('📧 Complaint API called:', req.body);
    
    const { name, email, subject, priority, message, orderId } = req.body;
    
    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please fill in all required fields' 
      });
    }
    
    // Simple email check
    if (!email.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please enter a valid email address' 
      });
    }
    
    // Send email using your existing transporter
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
    
    // Send email
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', result.messageId);
    
    // Return success
    res.json({
      success: true,
      message: 'Complaint submitted successfully!',
      complaintId: `COMP-${Date.now()}`
    });
    
  } catch (error) {
    console.error('❌ Email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit complaint. Please try again.'
    });
  }
});
// ========================= COURSES =========================
// Upload course
app.post("/api/courses", upload.single("file"), async (req, res) => {
  console.log("📤 Upload attempt by:", req.session.user?.username);
  
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to upload courses" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "File is required" });
  }

  try {
    const { title, description, price, author } = req.body; // Added 'author'
    const user = req.session.user;
    
    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    // Determine price based on user role
    let finalPrice = 0;
    let bookType = 'free';
    
    // Only admin can set prices
    if (user.role === 'admin' && price && parseFloat(price) > 0) {
      finalPrice = parseFloat(price);
      bookType = 'paid';
    }

    // Handle optional author field
    const finalAuthor = author && author.trim() !== '' ? author.trim() : null;

    // Insert into database
    const result = await db.query(
      `INSERT INTO courses (title, description, file_path, price, type, user_id, author) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, description, req.file.path, finalPrice, bookType, user.id, finalAuthor] // Use finalAuthor
    );

    console.log("✅ Course uploaded successfully:", title);
    
    const responseData = {
      message: "Course uploaded successfully!",
      courseId: Number(result.insertId),
      title: title,
      price: finalPrice,
      type: bookType
    };
    
    res.json(responseData);
    
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: "Error uploading course: " + err.message });
  }
});
// Get all courses
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT c.*, u.username as author_name 
      FROM courses c 
      LEFT JOIN users u ON c.user_id = u.id 
      ORDER BY c.created_at DESC
    `);
    
    // Convert any BigInt values to regular numbers
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
    console.error("❌ Courses error:", err);
    res.status(500).json({ error: "Error fetching courses" });
  }
});

// Download course with access control
app.get("/api/download/:id", checkCourseAccess, async (req, res) => {
  try {
    const courses = await db.query("SELECT * FROM courses WHERE id = ?", [req.params.id]);
    
    let course = null;
    if (Array.isArray(courses) && courses.length > 0) {
      course = courses[0];
    } else if (courses && courses[0] && Array.isArray(courses[0]) && courses[0].length > 0) {
      course = courses[0][0];
    }

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    console.log("✅ Course download by:", req.session.user.username);
    res.download(path.resolve(course.file_path));
    
  } catch (err) {
    console.error("❌ Download error:", err);
    res.status(500).json({ error: "Error downloading course" });
  }
});

// Check course access
app.get("/api/check-access/:courseId", async (req, res) => {
  if (!req.session.user) {
    return res.json({ hasAccess: false, message: "Please login first" });
  }

  try {
    const courseId = req.params.courseId;
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

    res.json({ hasAccess: hasAccess });
  } catch (err) {
    console.error("❌ Access check error:", err);
    res.status(500).json({ error: "Error checking access" });
  }
});

// ====== PRODUCT UPLOAD SETUP ======
// Create products upload directory FIRST
const productsUploadDir = path.join(__dirname, 'uploads', 'products');
if (!fs.existsSync(productsUploadDir)) {
  fs.mkdirSync(productsUploadDir, { recursive: true });
  console.log("✅ Created products upload directory:", productsUploadDir);
}

const productStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, productsUploadDir);
  },
  filename: function (req, file, cb) {
    // Sanitize filename to remove special characters
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = Date.now() + "-" + sanitizedName;
    console.log("📁 Saving file:", filename);
    cb(null, filename);
  },
});

// ✅ Handle multiple files: main file + multiple images
const productUpload = multer({ 
  storage: productStorage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
}).fields([
  { name: 'file', maxCount: 1 },        // Main file
  { name: 'images[]', maxCount: 10 }    // Multiple images
]);

// ====== UPLOAD PRODUCT ======
app.post("/api/upload-product", productUpload, async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to upload products." });
  }

  try {
    console.log("📦 Upload product request received from user:", req.session.user.id);
    
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
      paymentProvider
    } = req.body;
    
    console.log("📋 Product data:", { 
      title, 
      price, 
      type,
      paymentProvider,
      category
    });
    console.log("📁 Files received:", {
      mainFile: req.files['file'] ? req.files['file'][0] : null,
      images: req.files['images[]'] ? req.files['images[]'] : []
    });

    // Validation
    if (!title || !price || !type || !paymentProvider) {
      return res.status(400).json({ 
        error: "Title, price, type, and payment provider are required." 
      });
    }

    let filePath = null;
    let images = [];

    // Handle main file
    if (req.files['file'] && req.files['file'][0]) {
      const mainFile = req.files['file'][0];
      filePath = `/uploads/products/${mainFile.filename}`;
      console.log("📍 Main file path:", filePath);
    }

    // Handle multiple images
    if (req.files['images[]']) {
      images = req.files['images[]'].map(file => `/uploads/products/${file.filename}`);
      console.log("🖼️ Images uploaded:", images.length);
    }

    // Insert into database
    const result = await db.query(
      `INSERT INTO products (user_id, title, description, price, category, type, file_path, images, affiliate_link, delivery_type, delivery_locations, delivery_fee, payment_option, seller_payment_provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        paymentProvider
      ]
    );

    console.log("✅ Product uploaded successfully with ID:", result.insertId);
    res.json({ 
      message: "✅ Product uploaded successfully!",
      productId: result.insertId,
      payment_provider: paymentProvider
    });

  } catch (err) {
    console.error("❌ Product upload error:", err);
    
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.error("❌ Products table doesn't exist");
      return res.status(500).json({ error: "Database configuration error. Please contact administrator." });
    }
    
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      console.error("❌ Missing database column:", err.message);
      return res.status(500).json({ error: "Database configuration error. Please contact administrator." });
    }
    
    res.status(500).json({ error: "Error uploading product: " + err.message });
  }
});

// Add this function to your JavaScript:
function getSelectedCategory() {
  const select = $('p_category_select');
  const newCat = $('p_category_new').value.trim();
  
  if (newCat) {
    return newCat;
  } else if (select.value) {
    return select.value;
  }
  return '';
}
// Set user role (client or freelancer)
app.post("/api/user/set-role", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to set role" });
  }

  try {
    const { role } = req.body; // 'client' or 'freelancer'
    
    if (!['client', 'freelancer'].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be 'client' or 'freelancer'" });
    }

    // Update user role in database
    await db.query(
      "UPDATE users SET role = ? WHERE id = ?",
      [role, req.session.user.id]
    );

    // Update session
    req.session.user.role = role;

    res.json({ 
      message: `Role set to ${role} successfully`,
      role: role
    });

  } catch (err) {
    console.error("❌ Set role error:", err);
    res.status(500).json({ error: "Error setting role: " + err.message });
  }
});

// ========================= SERVICES SECTION ROUTES =========================

// Service upload directory
const servicesUploadDir = path.join(__dirname, 'uploads', 'services');
if (!fs.existsSync(servicesUploadDir)) {
  fs.mkdirSync(servicesUploadDir, { recursive: true });
}

const serviceStorage = multer.diskStorage({
  destination: servicesUploadDir,
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + "-" + sanitizedName);
  }
});

const serviceUpload = multer({ 
  storage: serviceStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Get services for current user (service provider)
// ========================= SERVICES GET ROUTE =========================
// Get all services - SINGLE CORRECTED VERSION
app.get("/api/services", async (req, res) => {
  try {
    console.log("📡 Fetching all services...");
    
    // Use consistent query structure for MariaDB
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
    
    // Handle MariaDB response format
    let services = [];
    if (Array.isArray(result)) {
      if (result.length > 0 && Array.isArray(result[0])) {
        // Format: [[rows]]
        services = result[0];
      } else {
        // Format: [rows]
        services = result;
      }
    }
    
    console.log(`✅ Found ${services.length} services`);
    
    // Always return an array
    res.json(services);
    
  } catch (err) {
    console.error("❌ Error fetching services:", err);
    res.status(500).json({ 
      error: "Error fetching services",
      details: err.message 
    });
  }
});
// ========================= GET USER'S SERVICES =========================
app.get("/api/services/my-services", async (req, res) => {
  try {
    console.log("📋 [MY-SERVICES] Fetching services for user...");
    
    // Check if user is logged in
    if (!req.session.user) {
      console.log("❌ [MY-SERVICES] No user session");
      return res.status(401).json({ error: "Please login to view your services" });
    }

    console.log("👤 [MY-SERVICES] User ID:", req.session.user.id, "Username:", req.session.user.username);

    // Query services for the current logged-in user
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

    console.log("📊 [MY-SERVICES] Database result:", result);

    // Handle MariaDB response format
    let services = [];
    if (Array.isArray(result)) {
      if (result.length > 0 && Array.isArray(result[0])) {
        services = result[0]; // Format: [[rows]]
      } else {
        services = result; // Format: [rows]
      }
    }

    console.log(`✅ [MY-SERVICES] Found ${services.length} services for user ${req.session.user.id}`);
    
    // Always return an array
    res.json(services);

  } catch (err) {
    console.error("❌ [MY-SERVICES] Error fetching user services:", err);
    res.status(500).json({ 
      error: "Error fetching your services",
      details: err.message 
    });
  }
});
// Get all categories (for dropdown)
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
    console.error("❌ Categories error:", err);
    res.status(500).json({ error: "Error fetching categories" });
  }
});

// ========================= SERVICES ROUTES =========================

// Create new service - MERGED WITH PROFILE PICTURE
app.post("/api/services", upload.none(), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to create a service" });
  }

  try {
    const { title, description, category, hourly_rate, fixed_price } = req.body;

    console.log("📝 Creating service for user:", req.session.user.id);
    console.log("📦 Service data:", { title, category, hourly_rate, fixed_price });

    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required" });
    }

    // Determine price
    const price = fixed_price ? parseFloat(fixed_price) :
                  hourly_rate ? parseFloat(hourly_rate) : 0;

    console.log("💰 Final price:", price);

    // STEP 1: Get user's current profile picture
    const profileResult = await db.query(
      "SELECT profile_picture FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    let profilePictures = [];
    if (Array.isArray(profileResult)) {
      profilePictures = Array.isArray(profileResult[0]) ? profileResult[0] : profileResult;
    }

    const profilePicture = profilePictures.length > 0 ? profilePictures[0].profile_picture : null;
    console.log("🖼️ Profile picture found:", profilePicture || "None");

    // STEP 2: Insert service with profile picture
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

    // Get service ID
    const serviceId = result.insertId || result[0]?.insertId;
    if (!serviceId) throw new Error("Could not get service ID after creation");
    console.log("✅ Service created with ID:", serviceId);

    // STEP 3: Check if user has an active subscription/trial
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
      console.log("📊 User has existing subscription/trial");
    } else {
      console.log("📊 No existing subscription found - starting trial");
    }

    // STEP 4: Create trial if needed
    if (!hasActiveSubscription) {
      const trialStarted = new Date();
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 90);

      const trialStartedDate = trialStarted.toISOString().split('T')[0];
      const trialEndsDate = trialEnds.toISOString().split('T')[0];

      console.log("📅 Trial dates:", { started: trialStartedDate, ends: trialEndsDate });

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
        console.log("✅ Trial subscription created successfully");
      } catch (subscriptionError) {
        console.error("❌ Failed to create trial subscription:", subscriptionError);
        console.log("⚠️ Service created but trial subscription failed");
      }
    }

    // STEP 5: Return success
    console.log("🎉 Service creation process completed successfully");
    res.json({
      message: "Service created successfully! You're on a 90-day free trial.",
      serviceId: serviceId,
      onTrial: !hasActiveSubscription,
      hasProfilePicture: !!profilePicture
    });

  } catch (err) {
    console.error("❌ Create service error:", err);
    res.status(500).json({ error: "Error creating service: " + err.message });
  }
});

// Upload service product (course/file)
app.post("/api/services", upload.single("service_image"), async (req, res) => {

  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to upload service products" });
  }

  try {
    const serviceId = req.params.id;
    const { title, description, price, type } = req.body;

    // Verify service ownership
    const services = await db.query(
      "SELECT * FROM services WHERE id = ? AND user_id = ?",
      [serviceId, req.session.user.id]
    );

    if (!services.length) {
      return res.status(403).json({ error: "You don't own this service" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "File is required" });
    }

    const result = await db.query(`
      INSERT INTO service_products 
      (service_id, title, description, file_path, price, type)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      serviceId,
      title,
      description,
      `/uploads/services/${req.file.filename}`,
      parseFloat(price || 0),
      type || 'digital'
    ]);

    res.json({
      message: "Service product uploaded successfully",
      productId: result.insertId
    });

  } catch (err) {
    console.error("❌ Service product upload error:", err);
    res.status(500).json({ error: "Error uploading service product: " + err.message });
  }
});

// Get service products
app.get("/api/services/:id/products", async (req, res) => {
  try {
    const products = await db.query(`
      SELECT * FROM service_products 
      WHERE service_id = ? 
      ORDER BY is_featured DESC, created_at DESC
    `, [req.params.id]);

    res.json(Array.isArray(products) ? products : (products[0] || []));
  } catch (err) {
    console.error("❌ Get service products error:", err);
    res.status(500).json({ error: "Error fetching service products" });
  }
});

// Subscribe to service (monthly/yearly payment) - CORRECTED & CLEAN
app.post("/api/services/subscribe", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to subscribe" });
  }

  try {
    const { planType } = req.body; // 'monthly' or 'yearly'
    
    const prices = {
      monthly: 5.00,
      yearly: 57.50
    };

    const amount = prices[planType];
    if (!amount) {
      return res.status(400).json({ error: "Invalid plan type" });
    }

    // Check if user is still on trial
    const trialCheck = await db.query(`
      SELECT * FROM service_subscriptions 
      WHERE user_id = ? AND trial_ends_at > CURDATE()
    `, [req.session.user.id]);

    let hasActiveTrial = false;
    
    // Handle different MariaDB response formats
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

    console.log("💰 Creating subscription payment for user:", req.session.user.id, "Amount:", amount);

    // Create subscription payment
    const payload = {
      tx_ref: `service-sub-${req.session.user.id}-${Date.now()}`,
      amount: amount,
      currency: "USD",
      redirect_url: `http://localhost:${PORT}/services-payment-callback.html`,
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

    console.log("📤 Flutterwave payload:", payload);

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

    console.log("📥 Flutterwave response:", response.data);

    // CORRECTED: Flutterwave returns 'success' status at root level, not in data
    if (response.data.status === 'success' && response.data.data && response.data.data.link) {
      res.json({
        link: response.data.data.link,
        type: 'subscription',
        provider: 'flutterwave'
      });
    } else {
      // More detailed error information
      console.error("❌ Flutterwave API error:", response.data);
      throw new Error(response.data.message || `Flutterwave returned status: ${response.data.status}`);
    }

  } catch (err) {
    console.error("❌ Service subscription error:", err);
    
    // More detailed error handling
    if (err.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("❌ Flutterwave API error response:", err.response.data);
      res.status(500).json({ 
        error: `Payment gateway error: ${err.response.data.message || err.message}` 
      });
    } else if (err.request) {
      // The request was made but no response was received
      console.error("❌ No response from Flutterwave:", err.request);
      res.status(500).json({ error: "No response from payment gateway. Please check your internet connection." });
    } else {
      // Something happened in setting up the request that triggered an Error
      res.status(500).json({ error: "Error creating subscription: " + err.message });
    }
  }
});

// Buy service product
app.post("/api/services/:serviceId/products/:productId/buy", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to buy service products" });
  }

  try {
    const { serviceId, productId } = req.params;
    
    // Get product details
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
    
    // Create payment
    const payload = {
      tx_ref: `service-product-${productId}-${Date.now()}`,
      amount: product.price,
      currency: "USD",
      redirect_url: `http://localhost:${PORT}/services-payment-callback.html`,
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
    console.error("❌ Service product purchase error:", err);
    res.status(500).json({ error: "Error purchasing service product: " + err.message });
  }
});

// Add service review
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

    // Check if user already reviewed this service
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

    // Update service rating
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
    console.error("❌ Service review error:", err);
    res.status(500).json({ error: "Error submitting review: " + err.message });
  }
});

// Get service reviews
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
    console.error("❌ Get service reviews error:", err);
    res.status(500).json({ error: "Error loading reviews" });
  }
});

// Get user's service subscription status
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
    console.error("❌ Subscription status error:", err);
    res.status(500).json({ error: "Error checking subscription status" });
  }
});

// Service payment callback handler
app.get("/services-payment-callback", async (req, res) => {
  try {
    const { transaction_id, status } = req.query;
    
    if (status === 'successful') {
      return res.redirect(`/services-payment-verification.html?transaction_id=${transaction_id}`);
    }
    
    res.redirect('/services-payment-failed.html');
  } catch (err) {
    console.error("❌ Services payment callback error:", err);
    res.redirect('/services-payment-failed.html');
  }
});

// Verify service payment - UPDATED FOR YOUR SCHEMA
app.get("/api/verify-service-payment/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;
    
    const response = await flw.Transaction.verify({ id: transaction_id });
    
    if (response.data.status === "successful") {
      const meta = response.data.meta;
      
      if (meta.subscription) {
        // Handle subscription payment - update trial end date
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

        console.log("✅ Service subscription extended for user:", meta.user_id);
        
      } else if (meta.type === 'service_product') {
        // Handle service product purchase
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

        console.log("✅ Service product purchase completed");
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
    console.error("❌ Service payment verification error:", err);
    res.status(500).json({ error: "Error verifying payment: " + err.message });
  }
});
// ========================= FREELANCER PROFILE ROUTES =========================

// Create profiles upload directory
const profilesUploadDir = path.join(__dirname, 'uploads', 'profiles');
if (!fs.existsSync(profilesUploadDir)) {
  fs.mkdirSync(profilesUploadDir, { recursive: true });
  console.log("✅ Created profiles upload directory");
}

const profilePictureStorage = multer.diskStorage({
  destination: profilesUploadDir,
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `profile-${Date.now()}-${sanitizedName}`);
  }
});

const profilePictureUpload = multer({ 
  storage: profilePictureStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Get freelancer profile - FIXED FOR MARIADB RESPONSE FORMAT
app.get("/api/freelancer/profile", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to view profile" });
  }

  try {
    console.log("🔍 Fetching profile for user:", req.session.user.id);
    
    // Check if profile exists - HANDLE MARIADB RESPONSE FORMAT
    const profileResult = await db.query(
      "SELECT * FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    // Handle MariaDB response format - it could be [rows] or [[rows]] or {rows: []}
    let profiles = [];
    if (Array.isArray(profileResult)) {
      if (profileResult.length > 0 && Array.isArray(profileResult[0])) {
        // Format: [[rows]]
        profiles = profileResult[0];
      } else {
        // Format: [rows]
        profiles = profileResult;
      }
    } else if (profileResult && Array.isArray(profileResult.rows)) {
      // Format: {rows: []}
      profiles = profileResult.rows;
    }

    console.log("📊 Profiles found:", profiles.length);
    console.log("📋 Profile data structure:", profiles);

    let userProfile;

    if (profiles.length > 0) {
      // Profile exists - get enhanced data
      const profile = profiles[0];
      console.log("✅ Using existing profile ID:", profile.id);
      
      // Get enhanced profile data with stats
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

      // Handle MariaDB response format for enhanced result
      let enhancedProfile = [];
      if (Array.isArray(enhancedResult)) {
        if (enhancedResult.length > 0 && Array.isArray(enhancedResult[0])) {
          enhancedProfile = enhancedResult[0];
        } else {
          enhancedProfile = enhancedResult;
        }
      }

      userProfile = enhancedProfile[0] || profile;
      console.log("✅ Enhanced profile loaded");
      
    } else {
      // No profile exists - but we know one exists because of duplicate errors
      // Let's try a different approach: force get the profile
      console.log("🔄 No profiles found in query, but duplicate errors suggest profile exists. Trying direct fetch...");
      
      try {
        // Try to get the profile with a simpler query
        const directResult = await db.query(
          "SELECT fp.*, u.username, u.email, u.created_at as user_created_at FROM freelancer_profiles fp JOIN users u ON fp.user_id = u.id WHERE fp.user_id = ?",
          [req.session.user.id]
        );

        // Handle MariaDB response format
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
          console.log("✅ Found profile via direct query:", userProfile.id);
        } else {
          // Really no profile exists - create one with error handling
          console.log("🆕 Creating new profile for user:", req.session.user.id);
          
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

            console.log("✅ New profile created");

            // Get the newly created profile
            const [newProfile] = await db.query(
              "SELECT fp.*, u.username, u.email, u.created_at as user_created_at FROM freelancer_profiles fp JOIN users u ON fp.user_id = u.id WHERE fp.user_id = ?",
              [req.session.user.id]
            );

            // Handle MariaDB response format
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
            console.error("❌ Failed to create profile:", insertError);
            
            // If insert fails due to duplicate, the profile exists but we can't find it
            // Return basic user info as fallback
            const userResult = await db.query(
              "SELECT id as user_id, username, email, role, created_at as user_created_at FROM users WHERE id = ?",
              [req.session.user.id]
            );

            // Handle MariaDB response format
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
            console.log("⚠️ Using fallback profile data");
          }
        }
      } catch (directError) {
        console.error("❌ Direct query failed:", directError);
        throw new Error("Cannot access profile data");
      }
    }

    if (!userProfile) {
      throw new Error("Failed to load or create profile");
    }

    console.log("✅ Returning profile data for user:", req.session.user.id);
    res.json(userProfile);
    
  } catch (err) {
    console.error("❌ Get freelancer profile error:", err);
    res.status(500).json({ error: "Error loading profile: " + err.message });
  }
});


// Update freelancer profile - ENHANCED WITH CERTIFICATE IMAGES
app.put("/api/freelancer/profile", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to update profile" });
  }

  try {
    const {
      headline,
      description,
      hourly_rate,
      skills,
      languages,
      experience_level,
      website,
      location,
      phone,
      education,
      certifications,
      availability,
      certificate_images
    } = req.body;

    console.log("📝 Updating profile for user:", req.session.user.id);

    // Check if profile exists
    const existingResult = await db.query(
      "SELECT id FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    // Handle MariaDB response format
    let existing = [];
    if (Array.isArray(existingResult)) {
      if (existingResult.length > 0 && Array.isArray(existingResult[0])) {
        existing = existingResult[0];
      } else {
        existing = existingResult;
      }
    }

    let result;

    if (existing.length > 0) {
      // UPDATE existing profile
      console.log("🔄 Updating existing profile...");
      result = await db.query(`
        UPDATE freelancer_profiles SET
          headline = ?, 
          description = ?, 
          hourly_rate = ?, 
          skills = ?, 
          languages = ?,
          experience_level = ?, 
          website = ?, 
          location = ?, 
          phone = ?, 
          education = ?,
          certifications = ?, 
          availability = ?, 
          certificate_images = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `, [
        headline || 'New Freelancer',
        description || 'Tell clients about yourself and your services...',
        parseFloat(hourly_rate) || 25,
        JSON.stringify(skills || []),
        JSON.stringify(languages || []),
        experience_level || 'intermediate',
        website || '',
        location || '',
        phone || '',
        education || '',
        certifications || '',
        availability || 'available',
        JSON.stringify(certificate_images || []),
        req.session.user.id
      ]);

    } else {
      // CREATE new profile
      console.log("🆕 Creating new profile...");
      result = await db.query(`
        INSERT INTO freelancer_profiles (
          user_id, headline, description, hourly_rate, skills, languages,
          experience_level, website, location, phone, education, certifications, 
          availability, certificate_images
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        req.session.user.id,
        headline || 'New Freelancer',
        description || 'Tell clients about yourself and your services...',
        parseFloat(hourly_rate) || 25,
        JSON.stringify(skills || []),
        JSON.stringify(languages || []),
        experience_level || 'intermediate',
        website || '',
        location || '',
        phone || '',
        education || '',
        certifications || '',
        availability || 'available',
        JSON.stringify(certificate_images || [])
      ]);
    }

    // Update all services with the current profile picture
    const profileResult = await db.query(
      "SELECT profile_picture FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    let profilePictures = [];
    if (Array.isArray(profileResult)) {
      if (profileResult.length > 0 && Array.isArray(profileResult[0])) {
        profilePictures = profileResult[0];
      } else {
        profilePictures = profileResult;
      }
    }

    if (profilePictures.length > 0 && profilePictures[0].profile_picture) {
      await db.query(
        "UPDATE services SET provider_profile_picture = ? WHERE user_id = ?",
        [profilePictures[0].profile_picture, req.session.user.id]
      );
      console.log("✅ Updated profile picture for all services");
    }

    res.json({ 
      success: true,
      message: "Profile updated successfully"
    });

  } catch (err) {
    console.error("❌ Update freelancer profile error:", err);
    res.status(500).json({ 
      success: false,
      error: "Error updating profile: " + err.message 
    });
  }
}); 


// Upload certificate images
app.post("/api/freelancer/certificate-images", profilePictureUpload.array("certificate_images", 5), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to upload certificates" });
  }

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const certificatePaths = req.files.map(file => `/uploads/profiles/${file.filename}`);
    console.log("📜 Uploading certificate images:", certificatePaths);

    // Get current certificate images
    const [currentProfile] = await db.query(
      "SELECT certificate_images FROM freelancer_profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    let currentCertificates = [];
    if (currentProfile && currentProfile.length > 0 && currentProfile[0].certificate_images) {
      try {
        currentCertificates = JSON.parse(currentProfile[0].certificate_images);
      } catch (e) {
        console.log("❌ Error parsing current certificates:", e);
      }
    }

    // Add new certificates to existing ones
    const updatedCertificates = [...currentCertificates, ...certificatePaths];

    // Update profile with new certificate images
    await db.query(`
      UPDATE freelancer_profiles 
      SET certificate_images = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = ?
    `, [JSON.stringify(updatedCertificates), req.session.user.id]);

    console.log("✅ Certificate images updated, total:", updatedCertificates.length);

    res.json({ 
      success: true,
      message: "Certificate images uploaded successfully",
      certificate_images: updatedCertificates
    });
  } catch (err) {
    console.error("❌ Certificate images upload error:", err);
    res.status(500).json({ 
      success: false,
      error: "Error uploading certificate images: " + err.message 
    });
  }
});

// Upload profile picture
app.post("/api/freelancer/profile-picture", profilePictureUpload.single("profile_picture"), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to upload picture" });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const profilePicturePath = `/uploads/profiles/${req.file.filename}`;
    console.log("📸 Uploading profile picture:", profilePicturePath);

    // Update profile with picture path
    const result = await db.query(`
      UPDATE freelancer_profiles 
      SET profile_picture = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = ?
    `, [profilePicturePath, req.session.user.id]);

    console.log("✅ Profile picture updated, affected rows:", result.affectedRows);

    res.json({ 
      success: true,
      message: "Profile picture updated successfully",
      profile_picture: profilePicturePath
    });
  } catch (err) {
    console.error("❌ Profile picture upload error:", err);
    res.status(500).json({ 
      success: false,
      error: "Error uploading profile picture: " + err.message 
    });
  }
});

// Get freelancer dashboard stats
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

    // Recent orders
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
    console.error("❌ Dashboard stats error:", err);
    res.status(500).json({ error: "Error loading dashboard stats" });
  }
});

// Debug route to check profile state
app.get("/api/debug/profile", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login" });
  }

  try {
    console.log("🐛 DEBUG: Checking profile state for user:", req.session.user.id);
    
    // Check users table
    const [users] = await db.query("SELECT id, username, email, role FROM users WHERE id = ?", [req.session.user.id]);
    console.log("👤 User data:", users[0]);
    
    // Check freelancer_profiles table
    const [profiles] = await db.query("SELECT * FROM freelancer_profiles WHERE user_id = ?", [req.session.user.id]);
    console.log("📊 Profile data:", profiles);
    
    // Check for duplicates
    const [duplicates] = await db.query("SELECT COUNT(*) as count FROM freelancer_profiles WHERE user_id = ?", [req.session.user.id]);
    console.log("🔍 Duplicate check - profiles count:", duplicates[0].count);
    
    res.json({
      user: users[0],
      profiles: profiles,
      profileCount: duplicates[0].count,
      hasProfile: profiles.length > 0
    });
    
  } catch (err) {
    console.error("❌ Debug error:", err);
    res.status(500).json({ error: "Debug failed" });
  }
});
// ========================= ADMIN DELETE SERVICE ROUTE =========================
app.delete("/api/admin/services/:id", async (req, res) => {
  try {
    const serviceId = Number(req.params.id);
    const { reason, provider_user_id } = req.body;

    console.log("🚨 ADMIN DELETE REQUEST");
    console.log("Service ID:", serviceId);
    console.log("Reason:", reason);

    // 1️⃣ Auth check
    if (!req.session.user || req.session.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: "Reason must be at least 10 characters" });
    }

    // 2️⃣ Fetch service
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

    // 3️⃣ Delete service
    await db.query("DELETE FROM services WHERE id = ?", [serviceId]);
    console.log("🗑️ Service deleted");

    // 4️⃣ LOG DELETION  ✅✅✅ THIS WAS MISSING
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

    console.log("📦 Deleted service logged");

    // 5️⃣ Respond LAST
    res.json({
      success: true,
      message: "Service deleted and logged successfully"
    });

  } catch (err) {
    console.error("❌ ADMIN DELETE ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



//admin deleted
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
    console.error("❌ Load deleted services error:", err);
    res.status(500).json({ error: "Failed to load deleted services" });
  }
});




// Helper function to get remaining deletes
async function getRemainingDeletes(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log("🔍 Getting remaining deletes for user:", userId);
    
    const [userRows] = await db.query(
      "SELECT daily_delete_count, last_delete_date FROM users WHERE id = ?",
      [userId]
    );
    
    if (!userRows || userRows.length === 0) {
      console.log("⚠️ User not found, returning default 3");
      return 3;
    }
    
    const user = userRows[0];
    
    // Handle null values
    const lastDeleteDate = user.last_delete_date ? 
      new Date(user.last_delete_date).toISOString().split('T')[0] : 
      null;
    const dailyCount = user.daily_delete_count || 0;
    
    if (!lastDeleteDate || lastDeleteDate !== today) {
      console.log("📅 New day or first delete, returning 3");
      return 3;
    }
    
    const remaining = Math.max(0, 3 - dailyCount);
    console.log("✅ Remaining deletes:", remaining);
    return remaining;
    
  } catch (error) {
    console.error("❌ Error getting remaining deletes:", error);
    return 3; // Default if error
  }
}
// Helper function to log deletions
async function logServiceDeletion({ serviceId, userId, serviceTitle, reason, deletedBy, isFlagged = false }) {
  try {
    // Log to service_delete_tracking table
    await db.query(`
      INSERT INTO service_delete_tracking 
      (user_id, service_id, delete_reason, flagged)
      VALUES (?, ?, ?, ?)
    `, [userId, serviceId, reason, isFlagged]);
    
    console.log("📝 Deletion logged for monitoring");
    
    // If flagged, create/update monitoring entry
    if (isFlagged) {
      await updateUserMonitoring(userId);
    }
    
  } catch (error) {
    console.error("Error logging deletion:", error);
  }
}

// Helper function to update user monitoring
async function updateUserMonitoring(userId) {
  try {
    // Get user info
    const [userRows] = await db.query(
      "SELECT username, email FROM users WHERE id = ?",
      [userId]
    );
    
    if (userRows.length === 0) return;
    
    const user = userRows[0];
    
    // Count deletions in last 7 days
    const [deleteCountRows] = await db.query(`
      SELECT COUNT(*) as count FROM service_delete_tracking 
      WHERE user_id = ? AND deleted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `, [userId]);
    
    const deleteCount = deleteCountRows[0].count;
    
    // Check if monitoring entry exists
    const [monitoringRows] = await db.query(
      "SELECT id FROM user_delete_monitoring WHERE user_id = ?",
      [userId]
    );
    
    if (monitoringRows.length === 0) {
      // Create new monitoring entry
      await db.query(`
        INSERT INTO user_delete_monitoring 
        (user_id, username, email, delete_count_last_7_days, is_flagged, flagged_reason, flagged_at)
        VALUES (?, ?, ?, ?, TRUE, ?, NOW())
      `, [userId, user.username, user.email, deleteCount, 'Multiple service deletions detected']);
    } else {
      // Update existing entry
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
    
    console.log(`🚩 User ${userId} flagged for admin monitoring`);
    
  } catch (error) {
    console.error("Error updating user monitoring:", error);
  }
}
//checkAndenforce
async function checkAndEnforceDeleteLimits(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Fetch user's delete stats
    const [userRows] = await db.query(
      "SELECT daily_delete_count, last_delete_date FROM users WHERE id = ?",
      [userId]
    );

    if (!userRows || userRows.length === 0) {
      throw new Error("User not found for delete limit check");
    }

    const user = userRows[0]; // Make sure user exists
    const lastDeleteDate = user.last_delete_date
      ? new Date(user.last_delete_date).toISOString().split('T')[0]
      : null;
    const dailyCount = user.daily_delete_count || 0;

    let remainingDeletes = 3; // default

    if (lastDeleteDate === today) {
      remainingDeletes = 3 - dailyCount;
    }

    if (remainingDeletes <= 0) {
      throw new Error("You have reached your daily delete limit (3 per day).");
    }

    // Increment daily_delete_count
    if (lastDeleteDate === today) {
      await db.query(
        "UPDATE users SET daily_delete_count = daily_delete_count + 1 WHERE id = ?",
        [userId]
      );
    } else {
      // Reset count for a new day
      await db.query(
        "UPDATE users SET daily_delete_count = 1, last_delete_date = ? WHERE id = ?",
        [today, userId]
      );
    }

    return remainingDeletes;
  } catch (err) {
    console.error("❌ Delete limit error:", err);
    throw err; // propagate to caller
  }
}

// Get flagged users for admin monitoring
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
    
    // Get detailed delete history for each flagged user
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
    console.error("Error fetching flagged users:", err);
    res.status(500).json({ error: err.message });
  }
});

// Mark user as reviewed
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
    
    // If action is 'clear_flag', also clear the user's flag
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
    console.error("Error updating user review:", err);
    res.status(500).json({ error: err.message });
  }
});


// Get user's delete limits - UPDATED for object results
app.get("/api/user/delete-limits", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ 
        error: "Not authenticated" 
      });
    }
    
    const userId = req.session.user.id;
    const today = new Date().toISOString().split('T')[0];
    console.log("📊 Getting delete limits for user:", userId);
    
    const userResult = await db.query(
      "SELECT daily_delete_count, last_delete_date FROM users WHERE id = ?",
      [userId]
    );
    
    console.log("📋 Full user query result:", userResult);
    
    // Extract user data
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
    
    console.log("👤 Extracted user data:", user);
    
    // Default values if user not found or data is missing
    if (!user) {
      console.log("⚠️ User not found, returning default limits");
      return res.json({
        daily_limit: 3,
        remaining_deletes: 3,
        used_today: 0,
        last_delete_date: null
      });
    }
    
    // Handle null/undefined values
    const lastDeleteDate = user.last_delete_date ? 
      new Date(user.last_delete_date).toISOString().split('T')[0] : 
      null;
    const dailyCount = user.daily_delete_count || 0;
    
    console.log("📅 Last delete date:", lastDeleteDate);
    console.log("🔢 Daily count:", dailyCount);
    
    let remaining = 3;
    
    // Check if it's the same day
    if (lastDeleteDate === today) {
      remaining = Math.max(0, 3 - dailyCount);
    }
    
    console.log("✅ Remaining deletes:", remaining);
    
    res.json({
      daily_limit: 3,
      remaining_deletes: remaining,
      used_today: lastDeleteDate === today ? dailyCount : 0,
      last_delete_date: lastDeleteDate
    });
    
  } catch (err) {
    console.error("❌ Error getting delete limits:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({ 
      error: "Error getting delete limits: " + err.message 
    });
  }
});
app.get("/api/debug/user/:id", async (req, res) => {
  try {
    const [userRows] = await db.query(
      "SELECT id, username, role, daily_delete_count, last_delete_date FROM users WHERE id = ?",
      [req.params.id]
    );
    
    res.json({
      user: userRows[0] || null,
      rowCount: userRows.length
    });
    
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to extract data from database results
function extractFirstRow(result) {
  if (!result) return null;
  
  if (typeof result === 'object') {
    // Check different possible formats
    if (result.id !== undefined || result.daily_delete_count !== undefined) {
      // Direct object with data
      return result;
    } else if (Array.isArray(result) && result[0]) {
      // Array with objects
      return result[0];
    } else if (result[0] && typeof result[0] === 'object' && result[0].id !== undefined) {
      // Nested array (MySQL2 style)
      return result[0];
    } else if (result.rows && result.rows[0]) {
      // PostgreSQL style
      return result.rows[0];
    }
  }
  
  return null;
}
// Add this to your index.js (not inside services.html)
app.get("/api/test-db-format", async (req, res) => {
  try {
    // Test query
    const result = await db.query("SELECT 1 as test, 'hello' as message, NOW() as now");
    
    console.log("=== DATABASE DRIVER FORMAT TEST ===");
    console.log("Full result:", JSON.stringify(result, null, 2));
    console.log("Type:", typeof result);
    console.log("Is array?", Array.isArray(result));
    
    // Try to understand the structure
    let analysis = {
      type: typeof result,
      isArray: Array.isArray(result),
      rawResult: result
    };
    
    if (result) {
      if (typeof result === 'object') {
        analysis.keys = Object.keys(result);
        
        // Check if it's a RowDataPacket or similar
        if (result.test !== undefined) {
          analysis.directObject = true;
          analysis.data = result;
        }
        
        // Check nested structure
        if (Array.isArray(result)) {
          analysis.arrayLength = result.length;
          if (result.length > 0) {
            analysis.firstElementType = typeof result[0];
            analysis.firstElementKeys = Object.keys(result[0]);
          }
        } else if (result[0] && Array.isArray(result[0])) {
          analysis.nestedArray = true;
          analysis.innerArrayLength = result[0].length;
          if (result[0].length > 0) {
            analysis.firstRow = result[0][0];
          }
        }
      }
    }
    
    console.log("Analysis:", analysis);
    
    res.json(analysis);
    
  } catch (error) {
    console.error("Test error:", error);
    res.status(500).json({ error: error.message });
  }
});
//check and delete 
async function checkAndEnforceDeleteLimits(userId) {
  console.log("📊 Getting delete limits for user:", userId);

  const result = await db.query(
    "SELECT daily_delete_count, last_delete_date FROM users WHERE id = ?",
    [userId]
  );

  console.log("📋 Full user query result:", result);

  // ✅ CORRECT extraction for MariaDB
  let user;

  if (Array.isArray(result) && result.length > 0) {
    user = result[0];
  }

  if (!user) {
    throw new Error("User not found for delete limit check");
  }

  console.log("👤 Extracted user data:", user);

  const today = new Date().toISOString().split("T")[0];
  const lastDeleteDate = user.last_delete_date;
  let dailyCount = user.daily_delete_count || 0;

  console.log("📅 Last delete date:", lastDeleteDate);
  console.log("🔢 Daily count:", dailyCount);

  // Reset count if new day
  if (lastDeleteDate !== today) {
    dailyCount = 0;
  }

  const MAX_DELETES_PER_DAY = 3;

  if (dailyCount >= MAX_DELETES_PER_DAY) {
    throw new Error("Daily delete limit reached");
  }

  console.log("✅ Remaining deletes:", MAX_DELETES_PER_DAY - dailyCount);

  return {
    dailyCount,
    today
  };
}


//Freelancer delete route 
// -----------------------------
// FREELANCER DELETE SERVICE ROUTE
// -----------------------------
// Helper: check and enforce delete limits for freelancers
async function checkAndEnforceDeleteLimits(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Fetch user delete info
    const [userRows] = await db.query(
      "SELECT daily_delete_count, last_delete_date FROM users WHERE id = ?",
      [userId]
    );

    if (!userRows || userRows.length === 0) {
      console.log("⚠️ User not found for delete limit check");
      throw new Error("User not found");
    }

    const user = userRows[0];
    const lastDeleteDate = user.last_delete_date ? user.last_delete_date.toISOString().split('T')[0] : null;
    let dailyCount = user.daily_delete_count || 0;

    console.log("📊 Getting delete limits for user:", userId);
    console.log("👤 Extracted user data:", user);
    console.log("📅 Last delete date:", lastDeleteDate);
    console.log("🔢 Daily count:", dailyCount);

    // Reset count if last delete date is not today
    if (lastDeleteDate !== today) {
      dailyCount = 0;
    }

    const remainingDeletes = 3 - dailyCount;
    console.log("✅ Remaining deletes:", remainingDeletes);

    if (remainingDeletes <= 0) {
      throw new Error("You have reached the maximum of 3 deletes for today");
    }

    // Increment the delete count and update last_delete_date
    await db.query(
      "UPDATE users SET daily_delete_count = ?, last_delete_date = ? WHERE id = ?",
      [dailyCount + 1, today, userId]
    );

    return remainingDeletes - 1;

  } catch (err) {
    console.error("❌ Delete limit error:", err.message);
    throw err;
  }
}

// Freelancer delete endpoint
app.delete("/api/services/:id", async (req, res) => {
  try {
    const serviceId = Number(req.params.id);
    const { reason } = req.body;
    const userId = req.session.user?.id;

    console.log("🚨 DELETE REQUEST RECEIVED =========================");
    console.log("📋 Request details:", { serviceId, userId, reason });

    // 1️⃣ Auth check
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated. Please log in." });
    }

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: "Detailed reason required (min 10 chars)." });
    }

    // 2️⃣ Check delete limits
    try {
      await checkAndEnforceDeleteLimits(userId);
    } catch (limitErr) {
      return res.status(403).json({ error: limitErr.message });
    }

    // 3️⃣ Fetch service
    const queryResult = await db.query(
      "SELECT id, title, user_id FROM services WHERE id = ? AND user_id = ?",
      [serviceId, userId]
    );

    const rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
    const service = rows[0];

    if (!service) {
      return res.status(404).json({ error: "Service not found or not owned by you." });
    }

    // 4️⃣ Delete service
    await db.query("DELETE FROM services WHERE id = ?", [serviceId]);

    console.log(`🗑️ Service deleted successfully: ${service.title} (${service.id})`);

    // 5️⃣ Log deletion in deleted_services table
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
    console.error("❌ UNEXPECTED ERROR:", err);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});


// ====== REVIEW SYSTEM ROUTES ======

// Submit a review
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

    // Check if user already reviewed this product
    const existingReview = await db.query(
      "SELECT id FROM reviews WHERE user_id = ? AND product_id = ?",
      [req.session.user.id, productId]
    );

    if (existingReview.length > 0) {
      return res.status(400).json({ error: "You have already reviewed this product." });
    }

    // Insert review
    await db.query(
      "INSERT INTO reviews (user_id, product_id, rating, comment) VALUES (?, ?, ?, ?)",
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

    console.log("✅ Review submitted for product:", productId);
    res.json({ 
      success: true, 
      message: "Review submitted successfully",
      averageRating: avgRating,
      reviewCount: reviewCount
    });

  } catch (err) {
    console.error("❌ Review submission error:", err);
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

    const safeReviews = Array.isArray(reviews) ? reviews : (reviews[0] || []);
    
    res.json({ 
      reviews: safeReviews,
      count: safeReviews.length
    });

  } catch (err) {
    console.error("❌ Get reviews error:", err);
    res.status(500).json({ error: "Error loading reviews: " + err.message });
  }
});

// ====== BUY PRODUCT ======
app.post("/api/buy-product", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to buy products." });
  }

  try {
    const { productId } = req.body;
    const axios = require('axios');
    
    console.log("🛒 Buy product request:", { 
      productId, 
      userId: req.session.user.id,
      userEmail: req.session.user.email 
    });

    if (!productId) {
      return res.status(400).json({ error: "Product ID is required." });
    }

    // Get product
    const productResult = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
    
    let product;
    if (Array.isArray(productResult) && productResult.length > 0) {
      product = productResult[0];
    } else if (productResult && productResult[0] && Array.isArray(productResult[0]) && productResult[0].length > 0) {
      product = productResult[0][0];
    } else {
      return res.status(404).json({ error: "Product not found." });
    }

    console.log("📦 Product found:", { 
      id: product.id, 
      title: product.title, 
      price: product.price,
      type: product.type,
      seller_payment_provider: product.seller_payment_provider
    });

    // Validate product price
    if (!product.price || product.price <= 0) {
      return res.status(400).json({ error: "Product price is invalid." });
    }

    // For affiliate products, redirect directly
    if (product.type === 'affiliate' || product.affiliate_link) {
      console.log("🔗 Affiliate product - redirecting to:", product.affiliate_link);
      return res.json({ 
        link: product.affiliate_link,
        type: 'affiliate' 
      });
    }

    // Use the payment provider from the products table directly
    const paymentProvider = product.seller_payment_provider || 'flutterwave';
    console.log(`💰 Using payment provider: ${paymentProvider}`);

    let paymentLink;

    if (paymentProvider === 'flutterwave') {
      // Flutterwave - Use USD (global)
      if (!process.env.FLW_SECRET_KEY) {
        console.error("❌ Flutterwave secret key not configured");
        return res.status(500).json({ error: "Flutterwave payment gateway not configured." });
      }

      const payload = {
        tx_ref: `product-${product.id}-${Date.now()}`,
        amount: product.price,
        currency: "USD",
        redirect_url: `http://localhost:${PORT}/payment-callback.html`,
        payment_options: "card, banktransfer, ussd, mobilemoney",
        customer: {
          email: req.session.user.email || `${req.session.user.username}@example.com`,
          name: req.session.user.username,
        },
        customizations: {
          title: "Core Insight Products",
          description: `Payment for ${product.title}`,
          logo: "https://via.placeholder.com/100x100?text=CI",
        },
        meta: {
          product_id: product.id,
          seller_id: product.user_id,
          buyer_id: req.session.user.id,
          product_type: product.type
        },
      };

      console.log("💰 Flutterwave payload:", payload);

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

      console.log("💰 Flutterwave response:", response.data);

      if (response.data.status === 'success' && response.data.data && response.data.data.link) {
        paymentLink = response.data.data.link;
        console.log("✅ Flutterwave payment initialized successfully");
      } else {
        throw new Error(response.data.message || 'Flutterwave payment failed');
      }

    } else if (paymentProvider === 'paystack') {
      // Paystack - Use NGN (Nigerian Naira) instead of USD
      if (!process.env.PAYSTACK_SECRET_KEY) {
        console.error("❌ Paystack secret key not configured");
        return res.status(500).json({ error: "Paystack payment gateway not configured." });
      }

      // ✅ GET LIVE EXCHANGE RATE
      const exchangeRate = await getLiveExchangeRate();
      
      const amountInNaira = Math.round(product.price * exchangeRate);
      const amountInKobo = amountInNaira * 100;
      
      const payload = {
        email: req.session.user.email || `${req.session.user.username}@example.com`,
        amount: amountInKobo,
        currency: "NGN",
        reference: `product-${product.id}-${Date.now()}`,
        callback_url: `http://localhost:${PORT}/payment-callback.html`,
        metadata: {
          product_id: product.id,
          seller_id: product.user_id,
          buyer_id: req.session.user.id,
          product_type: product.type,
          original_amount_usd: product.price,
          exchange_rate: exchangeRate,
          rate_timestamp: new Date().toISOString()
        }
      };

      console.log("💰 Paystack payload:", payload);
      console.log(`💱 Live currency conversion: $${product.price} USD → ₦${amountInNaira} NGN (Rate: ${exchangeRate})`);

      const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log("💰 Paystack response:", response.data);

      if (response.data.status && response.data.data && response.data.data.authorization_url) {
        paymentLink = response.data.data.authorization_url;
        console.log("✅ Paystack payment initialized successfully with NGN");
      } else {
        throw new Error(response.data.message || 'Paystack payment failed');
      }
    } else {
      throw new Error(`Unsupported payment provider: ${paymentProvider}`);
    }

    res.json({ 
      link: paymentLink,
      type: 'payment',
      provider: paymentProvider,
      currency: paymentProvider === 'paystack' ? 'NGN' : 'USD'
    });

  } catch (err) {
    console.error("❌ Buy product error:", err);
    
    if (err.response) {
      console.error("❌ Payment API error details:", err.response.data);
      res.status(500).json({ 
        error: "Payment gateway error: " + (err.response.data.message || err.message) 
      });
    } else if (err.request) {
      console.error("❌ Network error contacting payment gateway");
      res.status(500).json({ error: "Network error contacting payment gateway." });
    } else {
      res.status(500).json({ error: "Error initiating payment: " + err.message });
    }
  }
});

// ✅ FUNCTION TO GET LIVE EXCHANGE RATE (MOVE THIS OUTSIDE THE ROUTE)
async function getLiveExchangeRate() {
  const axios = require('axios');
  try {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    const rate = response.data.rates.NGN;
    console.log(`🌍 Live exchange rate fetched: 1 USD = ${rate} NGN`);
    return rate;
  } catch (error) {
    console.error('❌ Failed to get live exchange rate, using fallback:', error.message);
    return 1500; // Fallback rate
  }
}
// Product payment callback handler
app.get("/product-payment-callback", async (req, res) => {
  try {
    const { transaction_id, status, tx_ref } = req.query;
    
    console.log("🔄 Product payment callback:", { transaction_id, status, tx_ref });
    
    if (status === 'successful') {
      // Verify the transaction
      const verification = await flw.Transaction.verify({ id: transaction_id });
      
      if (verification.data.status === "successful") {
        const meta = verification.data.meta;
        
        // Record the sale in your database
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
        
        console.log("✅ Product sale recorded successfully");
        return res.redirect('/payment-success.html');
      }
    }
    
    // If payment failed
    res.redirect('/payment-failed.html');
    
  } catch (err) {
    console.error("❌ Product payment callback error:", err);
    res.redirect('/payment-failed.html');
  }
});

// ✅ this must be OUTSIDE, not inside the route
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ====== FAVORITE TOGGLE ======
app.post("/api/favorites", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to favorite products." });
  }

  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "Product ID is required." });
    }

    // Query favorites
    const result = await db.query(
      "SELECT * FROM favorites WHERE user_id = ? AND product_id = ?",
      [req.session.user.id, productId]
    );

    // Handle MariaDB response format
    const existing = Array.isArray(result)
      ? (Array.isArray(result[0]) ? result[0] : result)
      : [];

    if (existing.length > 0) {
      // Remove from favorites
      await db.query(
        "DELETE FROM favorites WHERE user_id = ? AND product_id = ?",
        [req.session.user.id, productId]
      );
      return res.json({ success: true, action: "removed" });
    } else {
      // Add to favorites
      await db.query(
        "INSERT INTO favorites (user_id, product_id) VALUES (?, ?)",
        [req.session.user.id, productId]
      );
      return res.json({ success: true, action: "added" });
    }
  } catch (err) {
    console.error("❌ Favorites error:", err);
    res.status(500).json({ error: "Error updating favorites." });
  }
});
// ====== GET USER FAVORITES ======
app.get("/api/favorites", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in to view favorites." });
  }

  try {
    const result = await db.query(
      "SELECT product_id FROM favorites WHERE user_id = ?",
      [req.session.user.id]
    );

    // Handle different MariaDB response formats
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

    console.log(`⭐ Loaded ${favorites.length} favorites for user ${req.session.user.id}`);
    res.json({ favorites });
  } catch (err) {
    console.error("❌ Get favorites error:", err);
    res.status(500).json({ error: "Error loading favorites." });
  }
}); 

// Payment callback handler
app.get("/api/payment-callback", async (req, res) => {
  try {
    const { transaction_id, status } = req.query;
    
    if (status === 'successful') {
      return res.redirect(`/payment-verification.html?transaction_id=${transaction_id}`);
    }
    
    res.redirect('/payment-failed.html');
  } catch (err) {
    console.error("❌ Payment callback error:", err);
    res.redirect('/payment-failed.html');
  }
});
// ========================= MESSAGING ROUTES (FIXED & CLEAN) =========================

// 1️⃣ UNREAD MESSAGE COUNT
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
    console.error("❌ Unread count error:", err);
    res.json({ count: 0 });
  }
});


// 2️⃣ GET CONVERSATIONS
app.get("/api/messages/conversations", async (req, res) => {
  try {
    if (!req.session.user) return res.json([]);

    const userId = req.session.user.id;

    const [conversations] = await db.query(`
      SELECT 
        c.id AS conversation_id,
        c.service_id,
        s.title AS service_title,
        c.created_at,
        CASE 
          WHEN c.client_id = ? THEN u2.username
          ELSE u1.username
        END AS other_user_name
      FROM conversations c
      JOIN users u1 ON c.client_id = u1.id
      JOIN users u2 ON c.freelancer_id = u2.id
      JOIN services s ON c.service_id = s.id
      WHERE c.client_id = ? OR c.freelancer_id = ?
      ORDER BY c.created_at DESC
    `, [userId, userId, userId]);

    res.json(conversations);

  } catch (err) {
    console.error("❌ Conversations error:", err);
    res.json([]);
  }
});


// 3️⃣ START CONVERSATION
// ====== START CONVERSATION - COMPLETE VERSION ======
// ====== FIXED START CONVERSATION ROUTE ======
// ====== UPDATED START CONVERSATION - FIXED VERSION ======
// ====== START CONVERSATION WITH TIMESTAMP ======
app.post("/api/messages/start", async (req, res) => {
  try {
    console.log("💬 [START] Starting conversation request:", req.body);
    
    if (!req.session.user) {
      return res.status(401).json({ 
        success: false,
        error: "Please login to start a conversation" 
      });
    }
    
    // ✅ ADD TIMESTAMP TO DESTRUCTURING
    const { serviceId, freelancerId, timestamp } = req.body;
    const clientId = req.session.user.id;
    
    if (!serviceId || !freelancerId) {
      return res.status(400).json({ 
        success: false,
        error: "Service ID and freelancer ID are required" 
      });
    }
    
    console.log("👥 Participants:", { clientId, freelancerId });
    console.log("⏰ Timestamp received:", timestamp || "No timestamp"); // ✅ ADD THIS
    
    // Check if user is messaging themselves
    if (parseInt(clientId) === parseInt(freelancerId)) {
      return res.status(400).json({ 
        success: false,
        error: "You cannot message yourself" 
      });
    }
    
    // Get service info to verify
    const serviceQuery = await db.query(
      "SELECT user_id as freelancerId FROM services WHERE id = ?",
      [serviceId]
    );
    
    // Handle MariaDB response format
    let serviceRows = [];
    if (Array.isArray(serviceQuery)) {
      serviceRows = Array.isArray(serviceQuery[0]) ? serviceQuery[0] : serviceQuery;
    }
    
    if (serviceRows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Service not found" 
      });
    }
    
    const actualFreelancerId = serviceRows[0].freelancerId;
    
    // Verify the freelancer ID matches
    if (parseInt(actualFreelancerId) !== parseInt(freelancerId)) {
      console.warn("⚠️ Freelancer ID mismatch:", { 
        requested: freelancerId, 
        actual: actualFreelancerId 
      });
      // Continue anyway, but log the warning
    }
    
    // ✅ MODIFIED: Check for conversation with timestamp consideration
    // Look for conversation where current user is one of the participants
    const existingQuery = await db.query(
      `SELECT id FROM conversations 
       WHERE service_id = ? 
         AND ((client_id = ? AND freelancer_id = ?) 
              OR (client_id = ? AND freelancer_id = ?))
       ORDER BY created_at DESC
       LIMIT 1`,
      [serviceId, clientId, freelancerId, freelancerId, clientId]
    );
    
    // Handle MariaDB response format
    let existingConv = [];
    if (Array.isArray(existingQuery)) {
      existingConv = Array.isArray(existingQuery[0]) ? existingQuery[0] : existingQuery;
    }
    
    let conversationId;
    let alreadyExists = false;
    
    if (existingConv.length > 0) {
      // Use existing conversation ONLY if current user is part of it
      conversationId = existingConv[0].id;
      alreadyExists = true;
      console.log("✅ [START] Using existing conversation:", conversationId);
    } else {
      // Create new conversation
      const insertQuery = await db.query(
        `INSERT INTO conversations 
         (service_id, client_id, freelancer_id, created_at)
         VALUES (?, ?, ?, NOW())`,
        [serviceId, clientId, freelancerId]
      );
      
      // Get the insert ID
      if (insertQuery && insertQuery.insertId) {
        conversationId = insertQuery.insertId;
      } else if (Array.isArray(insertQuery) && insertQuery[0] && insertQuery[0].insertId) {
        conversationId = insertQuery[0].insertId;
      } else {
        throw new Error("Could not get conversation ID");
      }
      
      console.log("🆕 [START] Created new conversation:", conversationId);
      console.log("⏰ Associated timestamp:", timestamp); // ✅ ADD THIS
    }
    
    res.json({
      success: true,
      conversationId: conversationId,
      alreadyExists: alreadyExists,
      clientId: clientId,
      freelancerId: freelancerId,
      timestamp: timestamp, // ✅ ADD THIS TO RESPONSE
      message: alreadyExists ? "Using existing conversation" : "Created new conversation"
    });
    
  } catch (err) {
    console.error("❌ [START] Start conversation error:", err);
    res.status(500).json({ 
      success: false,
      error: "Server error: " + err.message 
    });
  }
});
// 4️⃣ SEND MESSAGE
// In your index.js, look for the messages/send route:
// ====== FIXED SEND MESSAGE ENDPOINT ======
app.post("/api/messages/send", async (req, res) => {
  try {
    console.log("📨 [SEND] Sending message request:", req.body);
    
    if (!req.session.user) {
      console.log("❌ [SEND] No user session");
      return res.status(401).json({ error: "Login required" });
    }

    const { conversation_id, message } = req.body;
    const senderId = req.session.user.id;

    console.log("👤 [SEND] Sender:", senderId, "Conversation:", conversation_id);

    if (!conversation_id || !message?.trim()) {
      console.log("❌ [SEND] Missing data");
      return res.status(400).json({ error: "Missing data" });
    }

    // ✅ FIXED: Access check with proper MariaDB handling
    const convResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations
       WHERE id = ?`,
      [conversation_id]
    );

    // Handle MariaDB response format
    let conversation = null;
    if (Array.isArray(convResult)) {
      if (convResult.length > 0 && Array.isArray(convResult[0])) {
        conversation = convResult[0][0];
      } else if (convResult.length > 0) {
        conversation = convResult[0];
      }
    }

    if (!conversation) {
      console.log("❌ [SEND] Conversation not found:", conversation_id);
      return res.status(404).json({ error: "Conversation not found" });
    }

    console.log("📊 [SEND] Conversation found:", {
      id: conversation.id,
      client_id: conversation.client_id,
      freelancer_id: conversation.freelancer_id
    });

    // Check if current user is part of the conversation
    const isClient = parseInt(conversation.client_id) === parseInt(senderId);
    const isFreelancer = parseInt(conversation.freelancer_id) === parseInt(senderId);
    
    if (!isClient && !isFreelancer) {
      console.log("❌ [SEND] Access denied. User", senderId, "not in conversation");
      console.log("Expected client:", conversation.client_id, "or freelancer:", conversation.freelancer_id);
      return res.status(403).json({ error: "Access denied" });
    }

    console.log("✅ [SEND] User authorized. Inserting message...");

    // Insert the message
    const insertResult = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, message, created_at)
       VALUES (?, ?, ?, NOW())`,
      [conversation_id, senderId, message.trim()]
    );

    console.log("✅ [SEND] Message inserted successfully");

    res.json({ 
      success: true,
      message: "Message sent successfully"
    });

  } catch (err) {
    console.error("❌ [SEND] Send message error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// 5️⃣ MARK MESSAGES AS READ
app.post("/api/messages/mark-read", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Login required" });
    }

    const { conversation_id } = req.body;
    const userId = req.session.user.id;

    await db.query(
      `UPDATE messages
       SET is_read = 1
       WHERE conversation_id = ?
         AND sender_id != ?`,
      [conversation_id, userId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Mark read error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// 6️⃣ GET MESSAGES (MUST BE LAST)
// ====== FIXED GET MESSAGES ROUTE ======
app.get("/api/messages/:conversationId", async (req, res) => {
  try {
    console.log("📨 GET messages for conversation:", req.params.conversationId);
    
    if (!req.session.user) {
      console.log("❌ No user session");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const conversationId = parseInt(req.params.conversationId);
    const userId = req.session.user.id;

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation ID" });
    }

    console.log("👤 User checking messages:", userId, "for conversation:", conversationId);

    // Check if user has access to this conversation
    const convResult = await db.query(
      `SELECT id, client_id, freelancer_id FROM conversations
       WHERE id = ?`,
      [conversationId]
    );

    // Handle MariaDB response format
    let conversation = null;
    if (Array.isArray(convResult)) {
      if (convResult.length > 0 && Array.isArray(convResult[0])) {
        conversation = convResult[0][0];
      } else if (convResult.length > 0) {
        conversation = convResult[0];
      }
    }

    if (!conversation) {
      console.log("❌ Conversation not found:", conversationId);
      return res.status(404).json({ error: "Conversation not found" });
    }

    console.log("📊 Conversation found:", {
      id: conversation.id,
      client_id: conversation.client_id,
      freelancer_id: conversation.freelancer_id,
      current_user: userId
    });

    // Check if current user is part of the conversation
    const isClient = parseInt(conversation.client_id) === parseInt(userId);
    const isFreelancer = parseInt(conversation.freelancer_id) === parseInt(userId);
    
    if (!isClient && !isFreelancer) {
      console.log("❌ User", userId, "is not part of conversation", conversationId);
      console.log("Expected client:", conversation.client_id, "or freelancer:", conversation.freelancer_id);
      return res.status(403).json({ error: "Access denied" });
    }

    // Get messages
    const messagesResult = await db.query(`
      SELECT m.*, u.username AS sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `, [conversationId]);

    // Handle MariaDB response format
    let messages = [];
    if (Array.isArray(messagesResult)) {
      if (messagesResult.length > 0 && Array.isArray(messagesResult[0])) {
        messages = messagesResult[0];
      } else {
        messages = messagesResult;
      }
    }

    console.log("✅ Returning", messages.length, "messages for conversation", conversationId);
    res.json(messages);

  } catch (err) {
    console.error("❌ Get messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
});;


// ===================== UNIFIED DELETE PRODUCT ROUTE =====================
app.delete("/api/products/:id", async (req, res) => {
  try {
    // 1️⃣ Ensure user is logged in
    if (!req.session.user) {
      return res.status(401).json({ error: "Please login first" });
    }

    const productId = req.params.id;
    const userId = req.session.user.id;
    const userRole = req.session.user.role;

    console.log("🗑️ Delete attempt:", { productId, userId, userRole });

    // 2️⃣ Check if product exists
    const product = await db.query("SELECT * FROM products WHERE id = ?", [productId]);
    console.log("📦 Product query result:", product);

    if (!product.length) {
      return res.status(404).json({ error: "Product not found" });
    }

    const productOwnerId = product[0].user_id;

    // 3️⃣ Authorization check
    if (userRole !== "admin" && productOwnerId !== userId) {
      return res.status(403).json({ error: "You can only delete your own products" });
    }

    // 4️⃣ Perform delete
    const result = await db.query("DELETE FROM products WHERE id = ?", [productId]);
    console.log("🗑️ Delete result:", result);

    if (!result.affectedRows) {
      return res.status(404).json({ error: "Product not found or already deleted" });
    }

    // 5️⃣ Success message
    const message =
      userRole === "admin"
        ? "✅ Product deleted successfully by admin"
        : "✅ Product deleted successfully";

    res.json({ message });
  } catch (err) {
    console.error("❌ Error deleting product:", err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});


// Verify payment
app.get("/api/verify-payment/:transaction_id", async (req, res) => {
  try {
    const { transaction_id } = req.params;
    
    const response = await flw.Transaction.verify({ id: transaction_id });
    
    if (response.data.status === "successful") {
      const transactionRef = response.data.tx_ref;
      const courseId = response.data.meta.course_id;
      const userId = response.data.meta.user_id;
      
      // Store payment record in database
      await db.query(
        `INSERT INTO payments (transaction_id, transaction_ref, course_id, user_id, amount, status, flutterwave_response) 
         VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
        [
          transaction_id,
          transactionRef,
          courseId,
          userId,
          response.data.amount,
          JSON.stringify(response.data)
        ]
      );

      // Grant course access to user
      await db.query(
        `INSERT INTO user_courses (user_id, course_id, payment_status) 
         VALUES (?, ?, 'completed') 
         ON DUPLICATE KEY UPDATE payment_status='completed'`,
        [userId, courseId]
      );

      console.log("✅ Payment verified and access granted for user:", userId);
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
    console.error("❌ Payment verification error:", err);
    res.status(500).json({ error: "Error verifying payment: " + err.message });
  }
});

// Get user's purchased courses
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
    console.error("❌ My courses error:", err);
    res.status(500).json({ error: "Error fetching your courses" });
  }
});
// Verify product payment (for products section)
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

      // Save sale record
      const saleResult = await db.query(
        `INSERT INTO product_sales (product_id, seller_id, buyer_id, amount, transaction_id) 
         VALUES (?, ?, ?, ?, ?)`,
        [productId, sellerId, buyerId, amount, transaction_id]
      );

      const saleId = saleResult.insertId;
      const platformCut = amount * 0.10;
      const sellerEarning = amount - platformCut;

      // Save commission details
      await db.query(
        `INSERT INTO platform_commissions (sale_id, seller_id, total_amount, seller_earning, platform_earning)
         VALUES (?, ?, ?, ?, ?)`,
        [saleId, sellerId, amount, sellerEarning, platformCut]
      );

      console.log("✅ Product sale verified and recorded.");

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
    console.error("❌ Product payment verification error:", err);
    res.status(500).json({ error: "Error verifying product payment: " + err.message });
  }
});
// ====== SELLER PAYMENT SETUP ======
app.post("/api/seller/setup-payments", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in." });
  }

  try {
    const { provider, country, currency, payout_method } = req.body;
    
    // Store seller's preferred payout method
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
    console.error("❌ Seller payment setup error:", err);
    res.status(500).json({ error: "Error setting up payments: " + err.message });
  }
});


// ========================= FRONTEND ROUTES =========================
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

// ========================= DIRECT API PAYMENT ROUTE =========================
app.post("/api/initiate-payment", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please login to make payment" });
  }

  try {
    const { courseId } = req.body;

    // Verify course exists
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
      redirect_url: `http://localhost:${PORT}/payment-callback.html`,
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

    console.log("💰 Payment payload:", payload);

    // ✅ DIRECT API CALL
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

    console.log("💰 Flutterwave response:", response.data);

    if (response.data.status === "success" && response.data.data && response.data.data.link) {
      res.json({
        paymentLink: response.data.data.link,
        transactionRef: payload.tx_ref,
        status: "success",
      });
    } else {
      console.error("❌ Flutterwave API error:", response.data);
      res.status(500).json({
        error: "Payment initiation failed: " + (response.data.message || "Unknown error"),
      });
    }

  } catch (err) {
    console.error("❌ Payment initiation error:", err);
    res.status(500).json({ error: "Error initiating payment: " + err.message });
  }
});

app.delete('/api/courses/:id', async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized - Please log in' });
    }

    const courseId = req.params.id;

    // Get course details with consistent query handling
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

    console.log('🔍 Delete attempt:', {
      user: { id: user.id, role: user.role },
      course: { id: course.id, user_id: course.user_id, author_id: course.author_id }
    });

    // Check permissions - use user_id from courses table
    const canDelete = user.role === 'admin' || user.id === course.user_id;
    
    if (!canDelete) {
      return res.status(403).json({ 
        error: 'Permission denied - You can only delete your own courses' 
      });
    }

    // Delete file from filesystem
    try {
      if (course.file_path && fs.existsSync(course.file_path)) {
        fs.unlinkSync(course.file_path);
        console.log('✅ Deleted file:', course.file_path);
      }
    } catch (fileError) {
      console.warn('⚠️ Could not delete file, continuing with database deletion:', fileError.message);
    }

    // Remove from database
    await db.query('DELETE FROM courses WHERE id = ?', [courseId]);

    console.log('✅ Course deleted successfully:', courseId);
    res.json({ message: 'Course deleted successfully' });

  } catch (error) {
    console.error('❌ Error deleting course:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});
// sellers account
app.post('/api/seller/payment-accounts', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { flutterwave, paystack } = req.body;

    if (!userId) return res.status(401).json({ error: 'Not logged in' });

    await db.query(
      "UPDATE users SET flutterwave_account=?, paystack_account=? WHERE id=?",
      [flutterwave, paystack, userId]
    );

    res.json({ success: true, message: "Accounts saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
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

app.post("/api/seller/subaccount", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Login required" });

  const { business_name, email, account_number, bank_code, commission } = req.body;

  try {
    // Check if seller already exists
    const [existing] = await db.query(
      "SELECT * FROM sellers WHERE user_id = ?",
      [req.session.user.id]
    );

    if (existing.length > 0)
      return res.status(400).json({ error: "You already created a seller account" });

    // Create Flutterwave Subaccount
    const response = await fetch("https://api.flutterwave.com/v3/subaccounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      },
      body: JSON.stringify({
        account_number,
        business_name,
        bank_code,
        business_email: email,
        split_type: "percentage",
        split_value: commission,   // Platform commission %
      }),
    });

    const result = await response.json();
    if (result.status !== "success") {
      return res.status(400).json({ error: "Failed to create subaccount" });
    }

    const subId = result.data.subaccount_id;

    // Save in DB
    await db.query(
      `INSERT INTO sellers 
      (user_id, provider, subaccount_id, business_name, email, account_number, bank_code, commission)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.user.id,
        "flutterwave",
        subId,
        business_name,
        email,
        account_number,
        bank_code,
        commission,
      ]
    );

    res.json({
      success: true,
      seller: {
        provider: "flutterwave",
        subaccount_id: subId,
        business_name,
        email,
        account_number,
        bank_code,
        commission,
      },
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
  
});
// Add this test route to your index.js
app.get("/api/test-payment-config", async (req, res) => {
  try {
    console.log("🔑 Testing payment configuration...");
    
    const config = {
      flutterwave: {
        publicKey: !!process.env.FLW_PUBLIC_KEY,
        secretKey: !!process.env.FLW_SECRET_KEY
      },
      paystack: {
        publicKey: !!process.env.PAYSTACK_PUBLIC_KEY,
        secretKey: !!process.env.PAYSTACK_SECRET_KEY
      }
    };

    console.log("💰 Payment Config:", config);
    
    res.json({
      status: "Payment configuration check",
      config: config,
      note: "Make sure both providers have their keys configured in .env file"
    });
    
  } catch (err) {
    console.error("❌ Payment config test error:", err);
    res.status(500).json({ error: "Config test failed: " + err.message });
  }
});

// ========================= PRODUCT DASHBOARD ROUTES =========================

// Get products by seller ID
app.get("/api/products/seller/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    const products = await db.query(
      "SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC",
      [sellerId]
    );
    
    res.json(Array.isArray(products) ? products : []);
  } catch (err) {
    console.error("❌ Error fetching seller products:", err);
    res.status(500).json({ error: "Error fetching seller products" });
  }
});

// Get sales by seller ID (compatible with your orders table)
app.get("/api/orders/seller/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    // Using your existing orders table structure
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
    console.error("❌ Error fetching seller sales:", err);
    res.status(500).json({ error: "Error fetching seller sales" });
  }
});

// Get seller statistics (compatible with your system)
app.get("/api/seller/stats/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    // Get product count
    const productsResult = await db.query(
      "SELECT COUNT(*) as product_count FROM products WHERE user_id = ?",
      [sellerId]
    );
    
    // Get sales count and total revenue from your orders table
    const salesResult = await db.query(
      `SELECT COUNT(*) as sales_count, SUM(price) as total_revenue
       FROM orders WHERE seller_id = ?`,
      [sellerId]
    );
    
    // Get average rating (if you have reviews table)
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
    console.error("❌ Error fetching seller stats:", err);
    res.status(500).json({ error: "Error fetching seller statistics" });
  }
});

// ========================= ADMIN DASHBOARD ROUTES =========================

// Get all users (admin only) - Updated for your system
app.get("/api/admin/users", async (req, res) => {
  try {
    // Check admin authentication
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
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ error: "Error fetching users" });
  }
});

// Get user statistics (admin only)
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
    console.error("❌ Error fetching user stats:", err);
    res.status(500).json({ error: "Error fetching user statistics" });
  }
});

// Get platform statistics (admin only) - Updated for your orders table
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
    console.error("❌ Error fetching platform stats:", err);
    res.status(500).json({ error: "Error fetching platform statistics" });
  }
});

// Get sales analytics (admin only) - Updated for your orders table
app.get("/api/admin/analytics/sales", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const period = req.query.period || 'month'; // day, week, month, year
    
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
      default: // month
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
    console.error("❌ Error fetching sales analytics:", err);
    res.status(500).json({ error: "Error fetching sales analytics" });
  }
});

// Admin search users
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
    console.error("❌ Error searching users:", err);
    res.status(500).json({ error: "Error searching users" });
  }
});

// Admin search products
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
    console.error("❌ Error searching products:", err);
    res.status(500).json({ error: "Error searching products" });
  }
});

// Suspend/unsuspend product (admin only) - Updated
app.put("/api/admin/products/:id/suspend", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { id } = req.params;
    const { suspended, reason } = req.body;
    
    // First check if product exists
    const productResult = await db.query("SELECT id FROM products WHERE id = ?", [id]);
    
    if (!Array.isArray(productResult) || productResult.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    if (suspended) {
      // Suspend product
      await db.query(
        "UPDATE products SET status = 'suspended' WHERE id = ?",
        [id]
      );
      
      res.json({ success: true, message: "Product suspended successfully" });
    } else {
      // Unsuspend product
      await db.query(
        "UPDATE products SET status = 'active' WHERE id = ?",
        [id]
      );
      
      res.json({ success: true, message: "Product unsuspended successfully" });
    }
  } catch (err) {
    console.error("❌ Error suspending product:", err);
    res.status(500).json({ error: "Error suspending product" });
  }
});

// Delete user (admin only)
app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { id } = req.params;
    
    // Prevent admin from deleting themselves
    if (parseInt(id) === req.session.user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    
    // Check if user exists
    const userResult = await db.query("SELECT id, username FROM users WHERE id = ?", [id]);
    
    if (!Array.isArray(userResult) || userResult.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Delete user
    await db.query("DELETE FROM users WHERE id = ?", [id]);
    
    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ error: "Error deleting user" });
  }
});

// Toggle user status (admin only)
app.put("/api/admin/users/:id/status", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { id } = req.params;
    const { active } = req.body;
    
    // Prevent admin from deactivating themselves
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
    console.error("❌ Error toggling user status:", err);
    res.status(500).json({ error: "Error toggling user status" });
  }
});

// Get admin dashboard summary - Updated for your system
app.get("/api/admin/dashboard/summary", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const [usersStats, productsStats, salesStats, recentActivities] = await Promise.all([
      // Users stats
      db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) as verified,
          SUM(CASE WHEN role = 'seller' THEN 1 ELSE 0 END) as sellers,
          SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as new_today
        FROM users
      `),
      
      // Products stats
      db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN type = 'digital' THEN 1 ELSE 0 END) as digital,
          SUM(CASE WHEN type = 'physical' THEN 1 ELSE 0 END) as physical,
          SUM(CASE WHEN type = 'affiliate' THEN 1 ELSE 0 END) as affiliate,
          SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as new_today
        FROM products
      `),
      
      // Sales stats (using your orders table)
      db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(price) as revenue,
          SUM(price * 0.1) as platform_fee,
          SUM(CASE WHEN DATE(created_at) = CURDATE() THEN price ELSE 0 END) as today_revenue,
          COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_sales
        FROM orders
      `),
      
      // Recent activities
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
    console.error("❌ Error fetching admin dashboard:", err);
    res.status(500).json({ error: "Error fetching dashboard data" });
  }
  
});
app.get("/api/products", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM products");
  console.log("PRODUCT ROWS COUNT:", rows.length);
  res.json(rows);
});

// ========================= ORDER SYSTEM ROUTES =========================

// Create new physical product order
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

    // Validation
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

    // Create initial tracking entry
    await db.query(
      `INSERT INTO order_tracking (order_id, status, description)
       VALUES (?, ?, ?)`,
      [result.insertId, 'pending', 'Order received and is being processed']
    );

    // Send confirmation email
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
            
            <p>You can track your order status at: <a href="http://localhost:${PORT}/order-tracking">Order Tracking</a></p>
            <p>Thank you for shopping with Core Insight!</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error("❌ Failed to send order confirmation email:", emailError);
    }

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
    console.error('❌ Create order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create order'
    });
  }
});

// Get all orders
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
    
    // Get total count for pagination
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
    console.error('❌ Get orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

// Get single order by ID
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
    
    // Get tracking history
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
    console.error('❌ Get order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order'
    });
  }
});

// Update order status
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
    
    // Update order status
    await db.query(
      'UPDATE physical_orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );
    
    // Add tracking entry
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
    console.error('❌ Update order status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order status'
    });
  }
});

// Update payment status
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
    console.error('❌ Update payment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update payment status'
    });
  }
});

// Search orders
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
    console.error('❌ Search orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search orders'
    });
  }
});

// Get order statistics
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
    console.error('❌ Get order stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order statistics'
    });
  }
});
// Test database endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // Test query
    const [rows] = await connection.query('SELECT 1 as test, NOW() as time, DATABASE() as db, USER() as user');
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Database connection successful',
      data: rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message,
      code: error.code,
      errno: error.errno
    });
  }
});

// Add at the END of your index.js, just before app.listen()
console.log("\n📋 ========== REGISTERED ROUTES ==========");
app._router.stack.forEach((middleware, i) => {
  if (middleware.route) {
    const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase()).join(', ');
    console.log(`   ${methods.padEnd(10)} ${middleware.route.path}`);
  } else if (middleware.name === 'router') {
    console.log(`   ⚡ Router: ${middleware.regexp}`);
  }
});
console.log("=======================================\n");
// ========================= START SERVER =========================
app.listen(PORT, () => {
  console.log(`🎉 Server running at http://localhost:${PORT}`);
  console.log(`🔧 Test: http://localhost:${PORT}/api/test`);
  console.log(`📚 Courses: http://localhost:${PORT}/courses`);
  console.log(`💰 Payment Callback: http://localhost:${PORT}/payment-callback.html`);
  console.log(`🔐 Forgot Password: http://localhost:${PORT}/forgot-password.html`);
 
});
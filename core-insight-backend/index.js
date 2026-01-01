const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json()); // for JSON body
app.use(express.static("public")); // serve frontend files

// Path to our "database" (JSON file)
const booksFile = path.join(__dirname, "books.json");

// Helper: read JSON file
function readBooks() {
  if (!fs.existsSync(booksFile)) return [];
  const data = fs.readFileSync(booksFile);
  return JSON.parse(data);
}

// Helper: write JSON file
function writeBooks(books) {
  fs.writeFileSync(booksFile, JSON.stringify(books, null, 2));
}

// API ROUTES ==============================

// Get all books
app.get("/api/books", (req, res) => {
  const books = readBooks();
  res.json(books);
});

// Add a new book
app.post("/api/books", (req, res) => {
  const books = readBooks();
  const newBook = {
    id: Date.now(),
    title: req.body.title,
    author: req.body.author,
    description: req.body.description,
    file: req.body.file || null, // optional download link
  };
  books.push(newBook);
  writeBooks(books);
  res.status(201).json(newBook);
});

// =========================================

// Catch-all route for frontend (works in Express v5)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Core Insight backend running at http://localhost:${PORT}`);
});

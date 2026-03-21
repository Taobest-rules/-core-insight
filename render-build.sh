#!/bin/bash
# render-build.sh - This runs automatically on Render during deployment

echo "🚀 Running Render build script..."
echo "Current directory: $(pwd)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create upload directories
echo "📁 Creating upload directories..."
mkdir -p uploads/courses
mkdir -p uploads/products
mkdir -p uploads/services
mkdir -p uploads/profiles
mkdir -p public/uploads/courses
mkdir -p public/uploads/products

# Set permissions (Render uses Linux)
echo "🔧 Setting permissions..."
chmod -R 755 uploads 2>/dev/null || true
chmod -R 755 public/uploads 2>/dev/null || true

# Verify directories were created
echo "📂 Upload directories created:"
ls -la uploads/ || echo "No uploads directory yet"

echo "✅ Build complete!"

# Run database migrations (if any)
# node scripts/migrate.js
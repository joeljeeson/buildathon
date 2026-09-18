// =============================================
// server.js — Main Express Server Entry Point
// =============================================
// This is where everything comes together.
// Run this file with: node server.js

// Load environment variables from .env file FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

// ── Connect to MongoDB ──
if (process.env.MONGO_URI) {
  connectDB();
} else {
  console.log('⚠️ No MONGO_URI found. Running without database connection.');
}

// ── Create Express App ──
const app = express();

// ── Middleware ──

// Allow the frontend (HTML files) to talk to this server
// even though they're on a different port
app.use(cors({
  origin: '*', // In production, you'd restrict this to your domain
  credentials: true,
}));

// Parse incoming JSON data (from fetch/axios requests)
app.use(express.json());

// Parse URL-encoded form data (from HTML forms)
app.use(express.urlencoded({ extended: true }));

// Serve the frontend HTML/CSS/JS files
// The frontend files are one folder up from server/
app.use(express.static(path.join(__dirname, '..')));

// ── API Routes ──

// Authentication routes (register + login)
app.use('/api/auth', require('./routes/auth'));

// Events routes (protected — requires login)
app.use('/api/events', require('./routes/events'));

// ── Root Route ──
// When someone visits http://localhost:5000, redirect to login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// ── Health Check Route ──
// Visit http://localhost:5000/api/health to check if server is running
app.get('/api/health', (req, res) => {
  res.json({
    status: '✅ Server is running!',
    time: new Date().toLocaleString(),
    message: 'StudySync API is online 🚀',
  });
});

// ── 404 Handler ──
// If no route matched, return a 404
app.use((req, res) => {
  res.status(404).json({ message: '❌ Route not found' });
});

// ── Start the Server ──
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('');
    console.log('🚀 =============================================');
    console.log(`📚  StudySync Server Running!`);
    console.log(`🌐  URL: http://localhost:${PORT}`);
    console.log(`🔗  API: http://localhost:${PORT}/api/health`);
    console.log('🚀 =============================================');
    console.log('');
  });
}

module.exports = app;

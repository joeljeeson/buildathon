// =============================================
// config/db.js — MongoDB Connection
// =============================================
// This file connects our app to MongoDB using Mongoose.
// Mongoose is a library that makes it easy to work with MongoDB.

const mongoose = require('mongoose');

// connectDB is a function we call when the server starts
const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.warn('⚠️ MONGO_URI not set. Skipping MongoDB connection for this environment.');
    return;
  }

  try {
    // Connect to MongoDB using the URI from our .env file
    const conn = await mongoose.connect(process.env.MONGO_URI);

    // If successful, print a success message
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // If it fails, print the error without crashing the serverless environment
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.log('💡 Make sure your MongoDB URI is valid in Vercel environment variables.');
  }
};

// Export so server.js can use it
module.exports = connectDB;

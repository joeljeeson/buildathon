// =============================================
// models/User.js — User Database Schema
// =============================================
// A "schema" describes the shape of data in MongoDB.
// Think of it like a form template for each user.

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // For hashing passwords

// Define what a User looks like in the database
const UserSchema = new mongoose.Schema({

  // User's full name (e.g., "Jude Jose")
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true, // Remove extra spaces
  },

  // User's email (must be unique — no duplicates!)
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,       // Each email can only register once
    lowercase: true,    // Store emails in lowercase
    trim: true,
  },

  // User's password — stored as a HASH (not plain text, for security)
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },

  // When the user registered
  createdAt: {
    type: Date,
    default: Date.now, // Automatically set to right now
  },

});

// ── MIDDLEWARE: Hash password before saving ──
// This runs automatically BEFORE the user is saved to the database.
// It converts "password123" → "$2b$10$abc..." (a safe hash)
UserSchema.pre('save', async function () {
  // Only hash if the password was changed (or it's a new user)
  if (!this.isModified('password')) return;

  // Generate a "salt" (random data added before hashing — makes it stronger)
  const salt = await bcrypt.genSalt(10);

  // Hash the password with the salt
  this.password = await bcrypt.hash(this.password, salt);
});

// ── METHOD: Compare entered password with stored hash ──
// When logging in, we use this to check if the password is correct.
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Create the User model from the schema
const User = mongoose.model('User', UserSchema);

module.exports = User;

// =============================================
// routes/auth.js — Register & Login Endpoints
// =============================================
// These are the API routes the login page will call.
//
// POST /api/auth/register  → Create a new account
// POST /api/auth/login     → Login and get a token
// GET  /api/auth/me        → Get logged-in user info

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// ── Helper: Generate a JWT token ──
// A JWT is like a "login ticket" — the frontend stores this and sends it
// with every request to prove the user is logged in.
const generateToken = (userId) => {
  console.log("JWT_SECRET exists:", !!process.env.JWT_SECRET);
  return jwt.sign(
    { id: userId },           // Data stored inside the token
    process.env.JWT_SECRET,    // Secret key to sign with
    { expiresIn: '7d' }       // Token expires in 7 days
  );
};

// ─────────────────────────────────────────────
// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public (anyone can call this)
// ─────────────────────────────────────────────
router.post('/register', async (req, res) => {
  // Get the data sent from the registration form
  const { name, email, password } = req.body;

  try {
    // 1. Check if all fields are provided
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please fill in all fields' });
    }

    // 2. Check if password is long enough
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // 3. Check if this email is already registered
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    // 4. Create the new user (password will be hashed automatically by our model)
    const user = await User.create({ name, email, password });

    // 5. Generate a login token for the new user
    const token = generateToken(user._id);

    // 6. Send back the token and user info
    res.status(201).json({
      message: 'Account created successfully! 🎉',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────
// @route   POST /api/auth/login
// @desc    Login with email and password
// @access  Public
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Check if both fields are provided
    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter your email and password' });
    }

    // 2. Find the user by email in the database
    const user = await User.findOne({ email: email.toLowerCase() });

    // 3. If no user found with this email → error
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // 4. Check if the entered password matches the stored hash
    const isPasswordCorrect = await user.matchPassword(password);

    if (!isPasswordCorrect) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // 5. Generate a login token
    const token = generateToken(user._id);

    // 6. Send back the token and user info
    res.json({
      message: `Welcome back, ${user.name}! 👋`,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────
// @route   GET /api/auth/me
// @desc    Get the current logged-in user's info
// @access  Private (need to be logged in)
// ─────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  // req.user is set by our protect middleware
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
    },
  });
});

module.exports = router;

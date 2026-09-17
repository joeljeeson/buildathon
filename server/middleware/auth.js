// =============================================
// middleware/auth.js — Protect Routes with JWT
// =============================================
// "Middleware" runs BETWEEN a request and a response.
// This checks if the user is logged in before accessing protected pages.

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // Check if the request has an Authorization header with a Bearer token
  // Example header: "Authorization: Bearer eyJhbGciOiJIUzI1Ni..."
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Extract just the token part (remove "Bearer ")
      token = req.headers.authorization.split(' ')[1];

      // Verify the token using our secret key
      // If the token is valid, decoded = { id: "userId", iat: ..., exp: ... }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find the user in the database (without returning the password)
      req.user = await User.findById(decoded.id).select('-password');

      // Move on to the actual route
      next();

    } catch (error) {
      // Token was invalid or expired
      console.error('Token verification failed:', error.message);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  // No token was provided at all
  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

module.exports = { protect };

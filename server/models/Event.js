// =============================================
// models/Event.js — Event Database Schema
// =============================================
// Each event belongs to ONE user (linked by userId).
// This replaces localStorage — events are now in MongoDB!

const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({

  // Which user does this event belong to?
  // This links to the User model's _id field
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',        // Reference to the User model
    required: true,
  },

  // Event title (e.g., "Math Assignment 2")
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
  },

  // Type of event
  type: {
    type: String,
    enum: ['assignment', 'exam', 'quiz', 'other'], // Only these values allowed
    default: 'assignment',
  },

  // Subject/course name
  subject: {
    type: String,
    default: '',
    trim: true,
  },

  // Date of the event (stored as a string: "YYYY-MM-DD")
  date: {
    type: String,
    required: [true, 'Date is required'],
  },

  // Time (stored as "HH:MM")
  time: {
    type: String,
    default: '23:59',
  },

  // Minutes before the event to send a reminder
  reminderMinutes: {
    type: Number,
    default: 60,
  },

  // Optional notes
  notes: {
    type: String,
    default: '',
  },

  // Where did this event come from? ("whatsapp" or "manual")
  source: {
    type: String,
    default: 'manual',
  },

  // When this event was created
  createdAt: {
    type: Date,
    default: Date.now,
  },

});

const Event = mongoose.model('Event', EventSchema);

module.exports = Event;

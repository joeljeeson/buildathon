// =============================================
// routes/events.js — Events CRUD API
// =============================================
// CRUD = Create, Read, Update, Delete
// All routes are PROTECTED — you must be logged in!
//
// GET    /api/events          → Get all MY events
// POST   /api/events          → Add a new event
// PUT    /api/events/:id      → Update an event
// DELETE /api/events/:id      → Delete an event

const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { protect } = require('../middleware/auth');

// Apply the protect middleware to ALL routes in this file
// This means every route below requires a valid JWT token
router.use(protect);

// ─────────────────────────────────────────────
// @route   GET /api/events
// @desc    Get all events for the logged-in user
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Find events that belong to THIS user only
    // req.user._id comes from the protect middleware
    const events = await Event.find({ userId: req.user._id })
      .sort({ date: 1 }); // Sort by date (earliest first)

    res.json({ events });

  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ message: 'Could not fetch events' });
  }
});

// ─────────────────────────────────────────────
// @route   POST /api/events
// @desc    Add a new event
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { title, type, subject, date, time, reminderMinutes, notes, source } = req.body;

  try {
    // Validate required fields
    if (!title || !date) {
      return res.status(400).json({ message: 'Title and date are required' });
    }

    // Create the event linked to this user
    const event = await Event.create({
      userId: req.user._id, // Link to the logged-in user
      title,
      type: type || 'assignment',
      subject: subject || '',
      date,
      time: time || '23:59',
      reminderMinutes: reminderMinutes || 60,
      notes: notes || '',
      source: source || 'manual',
    });

    res.status(201).json({
      message: 'Event added! ✅',
      event,
    });

  } catch (error) {
    console.error('Add event error:', error);
    res.status(500).json({ message: 'Could not add event' });
  }
});

// ─────────────────────────────────────────────
// @route   POST /api/events/bulk
// @desc    Add multiple events at once (from parsed messages)
// ─────────────────────────────────────────────
router.post('/bulk', async (req, res) => {
  const { events: eventsData } = req.body;

  try {
    if (!Array.isArray(eventsData) || eventsData.length === 0) {
      return res.status(400).json({ message: 'No events provided' });
    }

    // Add userId to each event
    const eventsWithUser = eventsData.map(ev => ({
      ...ev,
      userId: req.user._id,
    }));

    // Insert all at once
    const inserted = await Event.insertMany(eventsWithUser);

    res.status(201).json({
      message: `${inserted.length} events added! ✅`,
      events: inserted,
    });

  } catch (error) {
    console.error('Bulk add error:', error);
    res.status(500).json({ message: 'Could not add events' });
  }
});

// ─────────────────────────────────────────────
// @route   PUT /api/events/:id
// @desc    Update an event
// ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    // Find the event — make sure it belongs to THIS user
    const event = await Event.findOne({ _id: req.params.id, userId: req.user._id });

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Update with the new data
    const updated = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true } // Return the updated document
    );

    res.json({ message: 'Event updated ✅', event: updated });

  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ message: 'Could not update event' });
  }
});

// ─────────────────────────────────────────────
// @route   DELETE /api/events/:id
// @desc    Delete an event
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    // Find and delete — make sure it belongs to THIS user
    const event = await Event.findOneAndDelete({ _id: req.params.id, userId: req.user._id });

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({ message: 'Event deleted 🗑️' });

  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ message: 'Could not delete event' });
  }
});

module.exports = router;

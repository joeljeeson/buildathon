/* ============================================================
  StudySync — app.js
  Smart message parser + Calendar + Reminders + MongoDB API
  ============================================================ */

// ══════════════════════════════════════════════
// API CONFIG & AUTH
// Use the same origin in production and local dev.
// ══════════════════════════════════════════════
const API_BASE = '/api';

// Get auth token from localStorage (set during login)
function getToken() {
  return localStorage.getItem('studysync_token');
}

// Build headers for authenticated API requests
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

// Check if user is logged in (has token) or is a guest
function isLoggedIn() {
  return !!getToken();
}

// Logout function — clears storage and redirects to login
function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  localStorage.removeItem('studysync_token');
  localStorage.removeItem('studysync_user');
  localStorage.removeItem('studysync_guest');
  window.location.href = 'login.html';
}

// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
let events = JSON.parse(localStorage.getItem('studysync_events') || '[]');

let parsedQueue = [];          // Pending parsed events (not yet confirmed)
let currentFilter = 'all';
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let editingEventId = null;

const TYPE_COLORS = {
  assignment: 'var(--blue)',
  exam: 'var(--red)',
  quiz: 'var(--yellow)',
  other: 'var(--purple)',
};

const TYPE_LABELS = {
  assignment: '📝 Assignment',
  exam: '📖 Exam',
  quiz: '❓ Quiz',
  other: '📌 Other',
};

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(updateCountdowns, 1000);
  setInterval(checkReminders, 30000);

  // Show user name in topbar
  displayUserInfo();

  // Load events — from server if logged in, otherwise from localStorage
  await loadEvents();

  renderAll();
  requestNotificationPermission();
});

// Display the logged-in user's name in the topbar
function displayUserInfo() {
  const userEl = document.getElementById('user-name-display');
  const logoutBtn = document.getElementById('logout-btn');

  const userData = localStorage.getItem('studysync_user');
  if (userData) {
    const user = JSON.parse(userData);
    if (userEl) userEl.textContent = user.name.split(' ')[0]; // First name only
  } else {
    if (userEl) userEl.textContent = 'Guest';
    // Hide logout button for guest (they can just close the window)
  }
}

// ── Load events from MongoDB API (or localStorage as fallback) ──
async function loadEvents() {
  if (!isLoggedIn()) {
    // Guest mode — use localStorage only
    events = JSON.parse(localStorage.getItem('studysync_events') || '[]');
    showSyncBadge('offline');
    return;
  }

  showSyncBadge('syncing');
  try {
    const res = await fetch(`${API_BASE}/events`, {
      headers: authHeaders(),
    });

    if (!res.ok) throw new Error('Server error');

    const data = await res.json();
    // Map _id to id for compatibility with frontend code
    events = data.events.map(e => ({ ...e, id: e._id }));
    localStorage.setItem('studysync_events', JSON.stringify(events)); // Cache locally too
    showSyncBadge('synced');
    showToast(`✅ Loaded ${events.length} events from database`, 'success');

  } catch (err) {
    // Server offline — fall back to localStorage
    events = JSON.parse(localStorage.getItem('studysync_events') || '[]');
    showSyncBadge('offline');
    showToast('⚠️ Server offline — using local data. Start: node server/server.js', 'warn');
  }
}

function showSyncBadge(status) {
  const titleEl = document.getElementById('view-title');
  if (!titleEl) return;
  const labels = { synced: '🟢 Synced', syncing: '🔄 Syncing...', offline: '🟡 Offline (Guest)' };
  // Just show a subtle toast, don't clutter the title
}

function renderAll() {
  displayUserInfo();
  updateStats();
  renderMiniCalendar();
  renderFullCalendar();
  renderDashReminders();
  renderRemindersPage();
  renderEventsView();
  updateBadges();
}

// ══════════════════════════════════════════════
// CLOCK
// ══════════════════════════════════════════════
function updateClock() {
  const now = new Date();
  const el = document.getElementById('time-display');
  if (el) {
    el.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
}

// ══════════════════════════════════════════════
// VIEW NAVIGATION
// ══════════════════════════════════════════════
function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById(`view-${viewName}`);
  const nav = document.getElementById(`nav-${viewName}`);
  if (view) view.classList.add('active');
  if (nav) nav.classList.add('active');

  const titles = {
    dashboard: '🏠 Dashboard',
    calendar: '📅 Calendar',
    reminders: '🔔 Reminders',
    events: '📋 All Events',
  };
  document.getElementById('view-title').textContent = titles[viewName] || viewName;

  if (viewName === 'calendar') renderFullCalendar();
  if (viewName === 'reminders') renderRemindersPage();
  if (viewName === 'events') renderEventsView();

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ══════════════════════════════════════════════
// MESSAGE PARSER — NLP Pattern Matching Engine
// ══════════════════════════════════════════════
const EXAM_KEYWORDS = [
  'exam', 'test', 'midterm', 'final', 'finals', 'viva', 'oral exam',
  'practical exam', 'semester exam', 'end-term', 'end term'
];
const ASSIGNMENT_KEYWORDS = [
  'assignment', 'homework', 'hw', 'project', 'report', 'lab report',
  'submit', 'submission', 'deliverable', 'coursework', 'portfolio'
];
const QUIZ_KEYWORDS = [
  'quiz', 'quizz', 'pop quiz', 'mcq', 'mcqs', 'test quiz'
];

const MONTHS_LONG = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];
const MONTHS_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
];

// Relative days
const RELATIVE_DAYS = {
  'today': 0, 'tonight': 0, 'this evening': 0,
  'tomorrow': 1, 'tmr': 1, 'tmrw': 1,
  'day after tomorrow': 2, 'next monday': null, 'next tuesday': null,
  'next wednesday': null, 'next thursday': null, 'next friday': null,
  'next saturday': null, 'next sunday': null,
  'this monday': null, 'this tuesday': null,
  'this wednesday': null, 'this thursday': null,
  'this friday': null, 'this saturday': null, 'this sunday': null,
};

const WEEKDAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function parseMessages() {
  const text = document.getElementById('message-input').value.trim();
  if (!text) { showToast('⚠️ Please paste some messages first!', 'warn'); return; }

  const btn = document.getElementById('btn-parse');
  btn.textContent = '⏳ Analysing...';
  btn.disabled = true;

  setTimeout(() => {
    btn.innerHTML = '<span class="btn-icon">🔍</span> Detect Events';
    btn.disabled = false;
    parsedQueue = extractEvents(text);
    displayParsedResults(parsedQueue);
  }, 600);
}

function extractEvents(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 3);
  const results = [];
  const seen = new Set();

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Determine event type
    let type = null;
    if (EXAM_KEYWORDS.some(k => lower.includes(k))) type = 'exam';
    else if (QUIZ_KEYWORDS.some(k => lower.includes(k))) type = 'quiz';
    else if (ASSIGNMENT_KEYWORDS.some(k => lower.includes(k))) type = 'assignment';
    else if (/due|deadline|submit|by|before/.test(lower)) type = 'assignment';

    if (!type) continue;

    // Parse date
    const dateResult = extractDate(lower, line);
    if (!dateResult) continue;

    // Extract title
    const title = extractTitle(line, type);
    const subject = extractSubject(line);

    const key = `${title}-${dateResult.date}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      id: generateId(),
      title,
      subject,
      type,
      date: dateResult.date,
      time: dateResult.time || (type === 'exam' ? '09:00' : '23:59'),
      reminderMinutes: 60,
      notes: '',
      source: 'whatsapp',
      createdAt: new Date().toISOString(),
    });
  }

  return results;
}

function stripWhatsAppMetadata(line) {
  let clean = line.replace(/^\[?\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4},?\s*\d{1,2}:\d{2}\s*(AM|PM)?\]?\s*-?\s*/i, '');
  clean = clean.replace(/^[\w\s]+:\s*/, '');
  return clean.trim();
}

function extractDateFromText(text, now) {
  const lower = text.toLowerCase();

  // Pattern: DD/MM/YYYY or MM/DD/YYYY
  let m = lower.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4}|\d{2})\b/);
  if (m) {
    let year = parseInt(m[3]); if (year < 100) year += 2000;
    const date = new Date(year, parseInt(m[2])-1, parseInt(m[1]));
    if (!isNaN(date)) return { date: formatDate(date), time: extractTime(lower) };
  }

  // Pattern: DD/MM (no year)
  m = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (m) {
    const day = parseInt(m[1]), month = parseInt(m[2]) - 1;
    let year = now.getFullYear();
    let date = new Date(year, month, day);
    if (!isNaN(date)) return { date: formatDate(date), time: extractTime(lower) };
  }

  // Pattern: Month name DD
  for (let i = 0; i < MONTHS_LONG.length; i++) {
    const monthName = MONTHS_LONG[i];
    const shortName = MONTHS_SHORT[i];
    const re = new RegExp(`\\b(${monthName}|${shortName})\\.?\\s+(\\d{1,2})(st|nd|rd|th)?\\b`);
    m = lower.match(re);
    if (m) {
      let year = now.getFullYear();
      let date = new Date(year, i, parseInt(m[2]));
      if (!isNaN(date)) return { date: formatDate(date), time: extractTime(lower) };
    }
  }

  // Pattern: DD Month (e.g., 15th August)
  for (let i = 0; i < MONTHS_LONG.length; i++) {
    const monthName = MONTHS_LONG[i];
    const shortName = MONTHS_SHORT[i];
    const re = new RegExp(`\\b(\\d{1,2})(st|nd|rd|th)?\\s+(${monthName}|${shortName})\\.?\\b`);
    m = lower.match(re);
    if (m) {
      let year = now.getFullYear();
      let date = new Date(year, i, parseInt(m[1]));
      if (!isNaN(date)) return { date: formatDate(date), time: extractTime(lower) };
    }
  }

  // Relative: tomorrow, today, next Monday, etc.
  for (const [keyword, offset] of Object.entries(RELATIVE_DAYS)) {
    if (!lower.includes(keyword)) continue;
    let targetDate;
    if (offset !== null) {
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() + offset);
    } else {
      const isNext = keyword.startsWith('next');
      const dayName = keyword.replace(/^(next|this)\s+/, '');
      const dayIdx = WEEKDAY_NAMES.indexOf(dayName);
      if (dayIdx === -1) continue;
      targetDate = new Date(now);
      const todayIdx = now.getDay();
      let diff = dayIdx - todayIdx;
      if (isNext) { if (diff <= 0) diff += 7; diff = diff === 0 ? 7 : diff; }
      else { if (diff < 0) diff += 7; if (diff === 0 && keyword.startsWith('this')) diff = 7; }
      if (diff <= 0) diff += 7;
      targetDate.setDate(now.getDate() + diff);
    }
    return { date: formatDate(targetDate), time: extractTime(lower) };
  }

  // "in X days"
  m = lower.match(/in\s+(\d+)\s+days?/);
  if (m) {
    const d = new Date(now);
    d.setDate(now.getDate() + parseInt(m[1]));
    return { date: formatDate(d), time: extractTime(lower) };
  }

  return null;
}

function extractDate(lower, original) {
  const now = new Date();
  now.setHours(0,0,0,0);

  const contentText = stripWhatsAppMetadata(original);
  const candidates = [];
  if (contentText) candidates.push(contentText.toLowerCase());
  if (lower) candidates.push(lower);

  for (const text of candidates) {
    const result = extractDateFromText(text, now);
    if (result) return result;
  }

  return null;
}

function extractTime(lower) {
  // HH:MM AM/PM
  let m = lower.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  if (m) {
    let h = parseInt(m[1]), min = m[2];
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${min}`;
  }
  // XAM/PM
  m = lower.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (m) {
    let h = parseInt(m[1]);
    if (m[2] === 'pm' && h < 12) h += 12;
    if (m[2] === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:00`;
  }
  // 11:59 PM
  m = lower.match(/(\d{1,2}):(\d{2})\s*(pm|am)?/);
  if (m) {
    let h = parseInt(m[1]), min = m[2];
    if (m[3] === 'pm' && h < 12) h += 12;
    return `${String(h).padStart(2,'0')}:${min}`;
  }
  return null;
}

function extractTitle(line, type) {
  let clean = stripWhatsAppMetadata(line);

  // Trim leading articles/verbs
  clean = clean.replace(/^(dear|hi|hello|hey|note|reminder|please|kindly|attention|important)\s*/i, '');
  clean = clean.replace(/^(submit|complete|finish|prepare for|study for)\s*/i, '');

  // Keep it concise — first 80 chars
  clean = clean.trim();
  if (clean.length > 80) clean = clean.substring(0, 80).trim() + '…';
  if (!clean) return `${TYPE_LABELS[type]} Event`;
  return clean;
}

function extractSubject(line) {
  const subjects = [
    'math', 'mathematics', 'physics', 'chemistry', 'biology', 'english',
    'history', 'geography', 'computer', 'cs', 'programming', 'database',
    'networks', 'algorithms', 'data structures', 'economics', 'accounts',
    'statistics', 'calculus', 'linear algebra', 'machine learning', 'ml',
    'artificial intelligence', 'ai', 'web development', 'os', 'operating',
    'software', 'engineering', 'science', 'literature', 'sociology',
    'psychology', 'philosophy', 'arts', 'ict', 'it', 'information'
  ];
  const lower = line.toLowerCase();
  for (const s of subjects) {
    if (lower.includes(s)) return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return '';
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2,5);
}

// ══════════════════════════════════════════════
// DISPLAY PARSED RESULTS
// ══════════════════════════════════════════════
function displayParsedResults(results) {
  const section = document.getElementById('parsed-results');
  const list = document.getElementById('results-list');
  const countEl = document.getElementById('results-count');

  if (results.length === 0) {
    showToast('😕 No events detected. Try pasting messages with clearer date/time info.', 'warn');
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  countEl.textContent = `${results.length} found`;
  list.innerHTML = '';

  results.forEach((ev, idx) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.style.animationDelay = `${idx * 60}ms`;
    div.innerHTML = `
      <span class="result-type-badge badge-${ev.type}">${TYPE_LABELS[ev.type]}</span>
      <div class="result-info">
        <div class="result-title-text">${escapeHtml(ev.title)}</div>
        <div class="result-date">📅 ${formatDisplayDate(ev.date)} ${ev.time ? '⏰ ' + formatTime(ev.time) : ''} ${ev.subject ? '• ' + ev.subject : ''}</div>
      </div>
      <div class="result-actions">
        <button class="result-btn result-btn-edit" onclick="editParsedEvent(${idx})">✏️ Edit</button>
        <button class="result-btn result-btn-add" onclick="addSingleParsed(${idx})">➕ Add</button>
      </div>
    `;
    list.appendChild(div);
  });

  showToast(`🎯 Detected ${results.length} event${results.length > 1 ? 's' : ''}!`, 'success');
}

// ══════════════════════════════════════════════
// ADD EVENTS
// ══════════════════════════════════════════════
async function addAllToCalendar() {
  if (parsedQueue.length === 0) return;
  const count = parsedQueue.length;

  if (isLoggedIn()) {
    try {
      const res = await fetch(`${API_BASE}/events/bulk`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ events: parsedQueue }),
      });
      const data = await res.json();
      if (res.ok) {
        // Add returned events (with MongoDB _id) to local list
        const newEvents = data.events.map(e => ({ ...e, id: e._id }));
        events.push(...newEvents);
        showToast(`✅ ${count} events saved to MongoDB! 🗄️`, 'success');
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      // Fallback to local
      parsedQueue.forEach(ev => events.push(ev));
      showToast(`⚠️ Saved locally (server offline). ${count} events added.`, 'warn');
    }
  } else {
    // Guest: just save locally
    parsedQueue.forEach(ev => events.push(ev));
    showToast(`✅ Added ${count} events to calendar!`, 'success');
  }

  saveEvents();
  renderAll();
  parsedQueue = [];
  document.getElementById('parsed-results').style.display = 'none';
  document.getElementById('message-input').value = '';
  scheduleReminders();
}

function addSingleParsed(idx) {
  const ev = parsedQueue[idx];
  if (!ev) return;
  events.push(ev);
  parsedQueue.splice(idx, 1);
  saveEvents();
  renderAll();
  displayParsedResults(parsedQueue);
  showToast(`✅ "${ev.title.substring(0,30)}..." added!`, 'success');
  scheduleReminders();
}

function editParsedEvent(idx) {
  const ev = parsedQueue[idx];
  if (!ev) return;
  openModal(ev, true, idx);
}

// ══════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════
function openModal(ev = null, isParsed = false, parsedIdx = null) {
  document.getElementById('modal-overlay').style.display = 'block';
  document.getElementById('add-event-modal').style.display = 'block';

  if (ev) {
    document.getElementById('modal-title').value = ev.title;
    document.getElementById('modal-type').value = ev.type;
    document.getElementById('modal-subject').value = ev.subject || '';
    document.getElementById('modal-date').value = ev.date;
    document.getElementById('modal-time').value = ev.time || '';
    document.getElementById('modal-reminder').value = ev.reminderMinutes || 30;
    document.getElementById('modal-notes').value = ev.notes || '';
    document.getElementById('modal-event-id').value = isParsed ? `parsed-${parsedIdx}` : ev.id;
    editingEventId = isParsed ? null : ev.id;
  } else {
    document.getElementById('modal-title').value = '';
    document.getElementById('modal-type').value = 'assignment';
    document.getElementById('modal-subject').value = '';
    document.getElementById('modal-date').value = '';
    document.getElementById('modal-time').value = '';
    document.getElementById('modal-reminder').value = 30;
    document.getElementById('modal-notes').value = '';
    document.getElementById('modal-event-id').value = '';
    editingEventId = null;
  }
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('add-event-modal').style.display = 'none';
  editingEventId = null;
}

async function saveEvent(e) {
  e.preventDefault();
  const idField = document.getElementById('modal-event-id').value;
  const isParsed = idField.startsWith('parsed-');

  const eventData = {
    title: document.getElementById('modal-title').value.trim(),
    type: document.getElementById('modal-type').value,
    subject: document.getElementById('modal-subject').value.trim(),
    date: document.getElementById('modal-date').value,
    time: document.getElementById('modal-time').value,
    reminderMinutes: parseInt(document.getElementById('modal-reminder').value),
    notes: document.getElementById('modal-notes').value.trim(),
    source: 'manual',
  };

  const newEvent = { ...eventData, id: isParsed ? generateId() : (editingEventId || generateId()), createdAt: new Date().toISOString() };

  if (isLoggedIn()) {
    try {
      let res;
      if (editingEventId && !isParsed) {
        // Update existing event in MongoDB
        res = await fetch(`${API_BASE}/events/${editingEventId}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(eventData),
        });
      } else {
        // Create new event in MongoDB
        res = await fetch(`${API_BASE}/events`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(eventData),
        });
      }
      const data = await res.json();
      if (res.ok) {
        newEvent.id = data.event._id;
        newEvent._id = data.event._id;
        showToast(`✅ Event saved to MongoDB! 🗄️`, 'success');
      }
    } catch (err) {
      showToast('⚠️ Saved locally (server offline)', 'warn');
    }
  }

  if (isParsed) {
    const idx = parseInt(idField.split('-')[1]);
    parsedQueue.splice(idx, 1);
    events.push(newEvent);
    displayParsedResults(parsedQueue);
  } else if (editingEventId) {
    const i = events.findIndex(ev => ev.id === editingEventId);
    if (i !== -1) events[i] = { ...events[i], ...eventData, id: newEvent.id };
    else events.push(newEvent);
  } else {
    events.push(newEvent);
  }

  saveEvents();
  renderAll();
  closeModal();
  if (!isLoggedIn()) showToast(`✅ Event "${newEvent.title.substring(0,25)}..." saved!`, 'success');
  scheduleReminders();
}

async function deleteEvent(id) {
  if (isLoggedIn()) {
    try {
      await fetch(`${API_BASE}/events/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
    } catch (err) {
      // Silent fail — remove from local anyway
    }
  }
  events = events.filter(ev => ev.id !== id && ev._id !== id);
  saveEvents();
  renderAll();
  showToast('🗑️ Event deleted.', 'info');
}

function clearAllEvents() {
  if (events.length === 0) { showToast('Nothing to clear.', 'info'); return; }
  if (!confirm(`Delete all ${events.length} events? This cannot be undone.`)) return;
  events = [];
  saveEvents();
  renderAll();
  showToast('🗑️ All events cleared.', 'info');
}

function saveEvents() {
  localStorage.setItem('studysync_events', JSON.stringify(events));
}

// ══════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════
function updateStats() {
  const now = new Date(); now.setHours(0,0,0,0);
  const in7 = new Date(now); in7.setDate(now.getDate() + 7);

  const assignments = events.filter(e => e.type === 'assignment').length;
  const exams = events.filter(e => e.type === 'exam' || e.type === 'quiz').length;
  const upcoming = events.filter(e => {
    const d = new Date(e.date);
    return d >= now && d <= in7;
  }).length;

  document.getElementById('stat-assignments').textContent = assignments;
  document.getElementById('stat-exams').textContent = exams;
  document.getElementById('stat-upcoming').textContent = upcoming;
  document.getElementById('stat-total').textContent = events.length;
}

// ══════════════════════════════════════════════
// BADGES
// ══════════════════════════════════════════════
function updateBadges() {
  const now = new Date(); now.setHours(0,0,0,0);
  const in7 = new Date(now); in7.setDate(now.getDate() + 7);
  const count = events.filter(e => {
    const d = new Date(e.date);
    return d >= now && d <= in7;
  }).length;

  document.getElementById('reminder-badge').textContent = count;
  const bell = document.getElementById('bell-badge');
  bell.textContent = count;
  bell.style.display = count > 0 ? 'block' : 'none';
}

// ══════════════════════════════════════════════
// MINI CALENDAR
// ══════════════════════════════════════════════
function renderMiniCalendar() {
  const grid = document.getElementById('calendar-grid');
  const title = document.getElementById('cal-month-year');

  const date = new Date(currentYear, currentMonth, 1);
  title.textContent = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  grid.innerHTML = days.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  const startDay = date.getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevDays = new Date(currentYear, currentMonth, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  // Prev month days
  for (let i = startDay - 1; i >= 0; i--) {
    grid.innerHTML += `<div class="cal-day other-month">${prevDays - i}</div>`;
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayDate = new Date(currentYear, currentMonth, d);
    const isToday = dayDate.getTime() === today.getTime();
    const dayEvents = events.filter(e => e.date === dateStr);
    const hasExam = dayEvents.some(e => e.type === 'exam');
    const hasEvents = dayEvents.length > 0;

    const dots = dayEvents.slice(0,3).map(e => {
      const c = e.type === 'exam' ? 'var(--red)' : e.type === 'quiz' ? 'var(--yellow)' : e.type === 'assignment' ? 'var(--blue)' : 'var(--purple)';
      return `<div class="event-dot" style="background:${c}"></div>`;
    }).join('');

    grid.innerHTML += `
      <div class="cal-day ${isToday ? 'today' : ''} ${hasEvents ? (hasExam ? 'has-exam' : 'has-events') : ''}"
           onclick="showDayPopup('${dateStr}', ${d})">
        ${d}
        ${dots ? `<div class="event-dot-row">${dots}</div>` : ''}
      </div>`;
  }

  // Next month filler
  const totalCells = startDay + daysInMonth;
  const remainder = totalCells % 7;
  if (remainder > 0) {
    for (let d = 1; d <= 7 - remainder; d++) {
      grid.innerHTML += `<div class="cal-day other-month">${d}</div>`;
    }
  }
}

function showDayPopup(dateStr, dayNum) {
  const dayEvents = events.filter(e => e.date === dateStr);
  const popup = document.getElementById('day-popup');
  const title = document.getElementById('popup-date-title');
  const list = document.getElementById('popup-events-list');

  title.textContent = formatDisplayDate(dateStr);
  list.innerHTML = dayEvents.length === 0
    ? `<div style="color:var(--text-dim);font-size:13px;padding:8px 0">No events — <button style="background:none;border:none;color:var(--purple);cursor:pointer;font-size:13px;" onclick="openModal()">Add one?</button></div>`
    : dayEvents.map(e => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
          <div style="font-weight:600">${escapeHtml(e.title.substring(0,40))}</div>
          <div style="color:var(--text-secondary);font-size:11px">${TYPE_LABELS[e.type]} ${e.time ? '• ' + formatTime(e.time) : ''}</div>
        </div>
      `).join('');

  popup.style.display = 'block';
}

function closePopup() {
  document.getElementById('day-popup').style.display = 'none';
}

function changeMonth(dir) {
  currentMonth += dir;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderMiniCalendar();
  renderFullCalendar();
}

// ══════════════════════════════════════════════
// FULL CALENDAR
// ══════════════════════════════════════════════
function renderFullCalendar() {
  const grid = document.getElementById('full-calendar-grid');
  const title = document.getElementById('full-cal-title');
  if (!grid) return;

  const date = new Date(currentYear, currentMonth, 1);
  title.textContent = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  grid.innerHTML = days.map(d => `<div class="cal-day-header" style="text-align:center;padding:10px 0">${d}</div>`).join('');

  const startDay = date.getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  for (let i = 0; i < startDay; i++) {
    grid.innerHTML += `<div class="full-cal-day other-month"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayDate = new Date(currentYear, currentMonth, d);
    const isToday = dayDate.getTime() === today.getTime();
    const dayEvents = events.filter(e => e.date === dateStr);

    const chips = dayEvents.slice(0,3).map(e =>
      `<div class="full-cal-event-chip chip-${e.type}" title="${escapeHtml(e.title)}">${escapeHtml(e.title.substring(0,20))}</div>`
    ).join('');

    const more = dayEvents.length > 3 ? `<div style="font-size:10px;color:var(--text-secondary)">+${dayEvents.length-3} more</div>` : '';

    grid.innerHTML += `
      <div class="full-cal-day ${isToday ? 'today' : ''}" onclick="showDayPopup('${dateStr}', ${d})">
        <div class="full-cal-day-num">${d}</div>
        ${chips}${more}
      </div>`;
  }
}

// ══════════════════════════════════════════════
// REMINDER CARDS
// ══════════════════════════════════════════════
function getSortedUpcomingEvents() {
  const now = new Date(); now.setHours(0,0,0,0);
  return events
    .filter(e => new Date(e.date) >= now)
    .sort((a, b) => {
      const da = new Date(`${a.date}T${a.time||'00:00'}`);
      const db = new Date(`${b.date}T${b.time||'00:00'}`);
      return da - db;
    });
}

function renderDashReminders() {
  const container = document.getElementById('dash-reminders');
  const empty = document.getElementById('empty-reminders');
  const sorted = getSortedUpcomingEvents();

  if (sorted.length === 0) {
    empty.style.display = 'flex';
    // Remove old cards
    container.querySelectorAll('.reminder-card').forEach(c => c.remove());
    return;
  }
  empty.style.display = 'none';

  container.querySelectorAll('.reminder-card').forEach(c => c.remove());
  sorted.slice(0, 10).forEach(ev => {
    container.appendChild(buildReminderCard(ev));
  });
}

function renderRemindersPage() {
  const container = document.getElementById('reminders-page');
  const empty = document.getElementById('empty-reminders-page');
  if (!container) return;
  const sorted = getSortedUpcomingEvents();

  container.querySelectorAll('.reminder-card').forEach(c => c.remove());

  if (sorted.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  sorted.forEach(ev => container.appendChild(buildReminderCard(ev)));
}

function buildReminderCard(ev) {
  const color = TYPE_COLORS[ev.type] || 'var(--purple)';
  const card = document.createElement('div');
  card.className = 'reminder-card';
  card.style.setProperty('--card-color', color);
  card.dataset.eventId = ev.id;
  card.dataset.eventDate = ev.date;
  card.dataset.eventTime = ev.time || '00:00';

  const countdown = getCountdown(ev.date, ev.time);

  card.innerHTML = `
    <div class="reminder-type">${TYPE_LABELS[ev.type]}</div>
    <div class="reminder-title">${escapeHtml(ev.title.substring(0,45))}${ev.title.length > 45 ? '…' : ''}</div>
    ${ev.subject ? `<div class="reminder-subject">📚 ${escapeHtml(ev.subject)}</div>` : ''}
    <div class="reminder-datetime">📅 ${formatDisplayDate(ev.date)} ${ev.time ? '⏰ ' + formatTime(ev.time) : ''}</div>
    <div class="countdown-box">
      <div class="countdown-label">Time Remaining</div>
      <div class="countdown-timer ${countdown.expired ? 'countdown-expired' : ''}" data-event-id="${ev.id}">
        ${countdown.text}
      </div>
    </div>
    <div class="reminder-actions">
      <button class="reminder-action-btn" onclick="openModal(events.find(e=>e.id==='${ev.id}'))">✏️ Edit</button>
      <button class="reminder-action-btn" onclick="deleteEvent('${ev.id}')">🗑️ Delete</button>
    </div>
  `;
  return card;
}

function getCountdown(dateStr, timeStr) {
  const target = new Date(`${dateStr}T${timeStr || '23:59'}:00`);
  const diff = target - new Date();
  if (diff <= 0) return { text: 'Past due', expired: true };

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  if (days > 0) return { text: `${days}d ${String(hours).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m`, expired: false };
  if (hours > 0) return { text: `${String(hours).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m ${String(secs).padStart(2,'0')}s`, expired: false };
  return { text: `${String(mins).padStart(2,'0')}m ${String(secs).padStart(2,'0')}s`, expired: false };
}

function updateCountdowns() {
  document.querySelectorAll('.countdown-timer[data-event-id]').forEach(el => {
    const ev = events.find(e => e.id === el.dataset.eventId);
    if (!ev) return;
    const cd = getCountdown(ev.date, ev.time);
    el.textContent = cd.text;
    el.classList.toggle('countdown-expired', cd.expired);
  });
}

// ══════════════════════════════════════════════
// EVENTS VIEW
// ══════════════════════════════════════════════
function filterEvents(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEventsView();
}

function renderEventsView() {
  const grid = document.getElementById('events-grid');
  if (!grid) return;

  const searchVal = (document.getElementById('event-search')?.value || '').toLowerCase();
  let filtered = events.filter(ev => {
    const matchType = currentFilter === 'all' || ev.type === currentFilter;
    const matchSearch = !searchVal ||
      ev.title.toLowerCase().includes(searchVal) ||
      (ev.subject || '').toLowerCase().includes(searchVal);
    return matchType && matchSearch;
  });

  filtered = filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-reminders" style="grid-column:1/-1">
      <div class="empty-icon">📋</div>
      <div class="empty-text">No events found. Try a different filter or paste some messages!</div>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(ev => {
    const color = TYPE_COLORS[ev.type];
    const cd = getCountdown(ev.date, ev.time);
    return `
      <div class="event-card" style="--card-color: ${color}">
        <div class="event-card-header">
          <div class="event-card-title">${escapeHtml(ev.title.substring(0,50))}${ev.title.length > 50 ? '…' : ''}</div>
          <div class="event-card-actions">
            <button class="icon-btn" onclick='openModal(${JSON.stringify(ev)})'>✏️</button>
            <button class="icon-btn delete" onclick="deleteEvent('${ev.id}')">🗑️</button>
          </div>
        </div>
        <span class="result-type-badge badge-${ev.type}" style="display:inline-block;margin-bottom:10px">${TYPE_LABELS[ev.type]}</span>
        <div class="event-card-meta">
          ${ev.subject ? `<span>📚 ${escapeHtml(ev.subject)}</span>` : ''}
          <span>📅 ${formatDisplayDate(ev.date)}</span>
          ${ev.time ? `<span>⏰ ${formatTime(ev.time)}</span>` : ''}
          <span style="color:${cd.expired ? 'var(--text-dim)' : color};font-weight:600">⏳ ${cd.text}</span>
          ${ev.notes ? `<span>📝 ${escapeHtml(ev.notes.substring(0,60))}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════
// BROWSER NOTIFICATIONS
// ══════════════════════════════════════════════
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        showToast('🔔 Browser notifications enabled!', 'success');
      }
    });
  }
}

function scheduleReminders() {
  // We use setInterval in checkReminders
  checkReminders();
}

function checkReminders() {
  const now = new Date();
  events.forEach(ev => {
    if (!ev.date || !ev.reminderMinutes) return;
    const eventTime = new Date(`${ev.date}T${ev.time || '23:59'}:00`);
    const reminderTime = new Date(eventTime.getTime() - ev.reminderMinutes * 60000);
    const diff = Math.abs(now - reminderTime);

    // Fire if within 1 minute window (and not already fired)
    if (diff < 60000 && !ev._reminded) {
      ev._reminded = true;
      saveEvents();
      sendBrowserNotification(ev);
      showToast(`🔔 Reminder: "${ev.title}" in ${ev.reminderMinutes} minutes!`, 'warn');
    }
  });
}

function sendBrowserNotification(ev) {
  if (Notification.permission !== 'granted') return;
  const n = new Notification(`⏰ StudySync Reminder`, {
    body: `"${ev.title}" is in ${ev.reminderMinutes} minutes!\n${formatDisplayDate(ev.date)} at ${formatTime(ev.time)}`,
    icon: '📚',
    badge: '📚',
    tag: ev.id,
  });
  n.onclick = () => { window.focus(); showView('reminders'); };
}

// ══════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════════
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
  toast.className = `toast ${type === 'success' ? '' : type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.4s ease forwards';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// ══════════════════════════════════════════════
// SAMPLE MESSAGES
// ══════════════════════════════════════════════
function loadSampleMessages() {
  const today = new Date();
  const fmt = (offset, mon, day) => {
    const d = new Date(today);
    d.setMonth(mon !== undefined ? mon : d.getMonth());
    if (day !== undefined) d.setDate(day);
    else d.setDate(d.getDate() + offset);
    return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`;
  };

  const n1 = new Date(); n1.setDate(n1.getDate() + 3);
  const n2 = new Date(); n2.setDate(n2.getDate() + 7);
  const n3 = new Date(); n3.setDate(n3.getDate() + 10);
  const n4 = new Date(); n4.setDate(n4.getDate() + 14);
  const n5 = new Date(); n5.setDate(n5.getDate() + 2);

  const sample = `01/08/26, 8:30 AM - Lakshmi: Good morning students.
01/08/26, 8:32 AM - Lakshmi: Data Structures Assignment 1 has been given in today's class.
01/08/26, 8:33 AM - Lakshmi: Write algorithms and C programs for Linear Search and Binary Search.
01/08/26, 8:34 AM - Lakshmi: Submit the assignment on 08 August during the first hour.
01/08/26, 10:15 AM - Jishna: Java Assignment 1.
01/08/26, 10:16 AM - Jishna: Write programs for Method Overloading and Method Overriding.
01/08/26, 10:17 AM - Jishna: Last date for submission is 07 August.
01/08/26, 1:45 PM - Karthika: Mathematics Assignment 1.

[ICT Group] 👋
Hey everyone! Just a reminder about upcoming deadlines:

Math Assignment 2 is due on ${MONTHS_LONG[n1.getMonth()]} ${n1.getDate()} at 11:59 PM. Please submit via the portal.

Computer Science Midterm Exam will be held on ${MONTHS_LONG[n2.getMonth()]} ${n2.getDate()} at 9:00 AM in Hall B.

Don't forget to submit your Physics Lab Report by ${MONTHS_LONG[n3.getMonth()]} ${n3.getDate()}.

English Literature Quiz tomorrow at 10:00 AM — covers chapters 1-5.

Database Systems Assignment is due ${MONTHS_LONG[n4.getMonth()]} ${n4.getDate()} 11:59 PM — ER diagrams required.

Chemistry practical exam on ${MONTHS_LONG[n5.getMonth()]} ${n5.getDate()} at 2 PM.

Good luck everyone! 📚`;

  document.getElementById('message-input').value = sample;
  showToast('📋 Sample messages loaded! Click "Detect Events" to parse them.', 'info');
}

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayH = hour % 12 || 12;
  return `${displayH}:${m} ${ampm}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Close popup on outside click
document.addEventListener('click', (e) => {
  const popup = document.getElementById('day-popup');
  if (popup && !popup.contains(e.target) && !e.target.classList.contains('cal-day')) {
    popup.style.display = 'none';
  }
});

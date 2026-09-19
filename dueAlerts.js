/* ============================================================
   StudySync — dueAlerts.js
   Automated Due Date Pop-Up Alert System (24h, 6h, 30m thresholds)
   ============================================================ */

(function () {
  'use strict';

  // ══════════════════════════════════════════════
  // CONFIGURATION & CONSTANTS
  // ══════════════════════════════════════════════
  const CHECK_INTERVAL_MS = 5000; // Check every 5 seconds
  const LOCAL_STORAGE_KEY = 'studysync_triggered_due_alerts';
  const SNOOZE_STORAGE_KEY = 'studysync_snoozed_due_alerts';

  // Threshold definitions in milliseconds
  const THRESHOLDS = [
    {
      id: '30m',
      name: '30 Minutes Remaining',
      maxMs: 30 * 60 * 1000, // 30 mins
      minMs: 0,
      badge: '🚨 CRITICAL DEADLINE',
      color: '#f87171',
      bgGlow: 'rgba(248, 113, 113, 0.25)',
      soundFreqs: [880, 1046, 1318], // High urgent chime
    },
    {
      id: '6h',
      name: '6 Hours Remaining',
      maxMs: 6 * 60 * 60 * 1000, // 6 hours
      minMs: 30 * 60 * 1000,
      badge: '⚠️ URGENT REMINDER',
      color: '#fbbf24',
      bgGlow: 'rgba(251, 191, 36, 0.25)',
      soundFreqs: [587, 740, 880], // Medium warning chime
    },
    {
      id: '24h',
      name: '24 Hours Remaining',
      maxMs: 24 * 60 * 60 * 1000, // 24 hours
      minMs: 6 * 60 * 60 * 1000,
      badge: '📢 UPCOMING DEADLINE',
      color: '#a78bfa',
      bgGlow: 'rgba(167, 139, 250, 0.25)',
      soundFreqs: [440, 554, 659], // Soft pleasant chime
    },
  ];

  // State
  let alertQueue = [];
  let currentActiveAlert = null;
  let popupTickerInterval = null;
  let audioCtx = null;

  // Load persistence records
  function getTriggeredMap() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveTriggeredMap(map) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function getSnoozedMap() {
    try {
      return JSON.parse(localStorage.getItem(SNOOZE_STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveSnoozedMap(map) {
    try {
      localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  // ══════════════════════════════════════════════
  // DOM & CSS INJECTION
  // ══════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('due-alerts-styles')) return;
    const style = document.createElement('style');
    style.id = 'due-alerts-styles';
    style.textContent = `
      /* StudySync Due Alerts Modal Styles */
      .due-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(5, 5, 12, 0.75);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        animation: dueFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      @keyframes dueFadeIn {
        to { opacity: 1; }
      }

      .due-modal-card {
        background: rgba(17, 17, 37, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 24px;
        width: 100%;
        max-width: 480px;
        padding: 28px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), var(--modal-glow, 0 0 30px rgba(167, 139, 250, 0.25));
        color: #f1f5f9;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        transform: scale(0.9) translateY(20px);
        animation: duePopUp 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        position: relative;
        overflow: hidden;
      }

      @keyframes duePopUp {
        to { transform: scale(1) translateY(0); }
      }

      .due-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
      }

      .due-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid currentColor;
      }

      .due-queue-counter {
        font-size: 0.8rem;
        color: #94a3b8;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.06);
        padding: 4px 10px;
        border-radius: 12px;
      }

      .due-title-area {
        margin-bottom: 18px;
      }

      .due-event-title {
        font-family: 'Space Grotesk', 'Inter', sans-serif;
        font-size: 1.4rem;
        font-weight: 700;
        color: #ffffff;
        line-height: 1.3;
        margin-bottom: 6px;
        word-break: break-word;
      }

      .due-event-subject {
        font-size: 0.9rem;
        color: #94a3b8;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .due-meta-grid {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 16px;
        padding: 16px;
        margin-bottom: 22px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .due-meta-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.88rem;
      }

      .due-meta-label {
        color: #94a3b8;
        font-weight: 500;
      }

      .due-meta-value {
        color: #f8fafc;
        font-weight: 600;
      }

      .due-timer-box {
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid var(--modal-border-color, rgba(167, 139, 250, 0.3));
        border-radius: 16px;
        padding: 14px;
        text-align: center;
        margin-bottom: 24px;
      }

      .due-timer-label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #94a3b8;
        margin-bottom: 4px;
      }

      .due-timer-clock {
        font-family: 'Space Grotesk', monospace;
        font-size: 1.8rem;
        font-weight: 800;
        color: var(--modal-accent-color, #a78bfa);
        text-shadow: 0 0 15px var(--modal-glow-color, rgba(167, 139, 250, 0.4));
      }

      .due-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .due-btn {
        padding: 12px 18px;
        border-radius: 14px;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .due-btn-primary {
        grid-column: span 2;
        background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
        color: #ffffff;
        box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4);
      }

      .due-btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(124, 58, 237, 0.6);
      }

      .due-btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .due-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #ffffff;
      }

      .due-btn-snooze {
        background: rgba(251, 191, 36, 0.12);
        color: #fbbf24;
        border: 1px solid rgba(251, 191, 36, 0.25);
      }

      .due-btn-snooze:hover {
        background: rgba(251, 191, 36, 0.22);
      }

      /* Pulsing alert bar at top of modal */
      .due-pulse-bar {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 4px;
        background: var(--modal-accent-color, #a78bfa);
        box-shadow: 0 0 10px var(--modal-accent-color, #a78bfa);
        animation: dueBarPulse 1.5s ease-in-out infinite;
      }

      @keyframes dueBarPulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════
  // AUDIO CHIME GENERATOR (Web Audio API)
  // ══════════════════════════════════════════════
  function playAlertChime(frequencies) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const freqs = frequencies || [587, 740, 880];
      freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.12);

        gain.gain.setValueAtTime(0, audioCtx.currentTime + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + idx * 0.12 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.12 + 0.4);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(audioCtx.currentTime + idx * 0.12);
        osc.stop(audioCtx.currentTime + idx * 0.12 + 0.45);
      });
    } catch (e) {
      // Audio context block fallback (silent fail)
    }
  }

  // ══════════════════════════════════════════════
  // DESKTOP NOTIFICATION SENDER
  // ══════════════════════════════════════════════
  function sendDesktopNotification(event, threshold) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification(`${threshold.badge}: ${event.title}`, {
          body: `Due ${formatDisplayDate(event.date)} at ${formatTime(event.time || '23:59')} (${threshold.name})`,
          icon: '📚',
          tag: `due-${event.id}-${threshold.id}`,
        });
        n.onclick = () => {
          window.focus();
          if (typeof window.showView === 'function') {
            window.showView('reminders');
          }
        };
      } catch (e) {}
    }
  }

  // ══════════════════════════════════════════════
  // SCANNER & THRESHOLD EVALUATOR
  // ══════════════════════════════════════════════
  function getEventList() {
    if (Array.isArray(window.events) && window.events.length > 0) {
      return window.events;
    }
    try {
      return JSON.parse(localStorage.getItem('studysync_events') || '[]');
    } catch (e) {
      return [];
    }
  }

  function checkDueAlerts() {
    const events = getEventList();
    if (!events || events.length === 0) return;

    const now = new Date();
    const triggeredMap = getTriggeredMap();
    const snoozedMap = getSnoozedMap();

    events.forEach(ev => {
      if (!ev.date) return;
      const targetTimeStr = `${ev.date}T${ev.time || '23:59'}:00`;
      const targetDate = new Date(targetTimeStr);
      const remainingMs = targetDate.getTime() - now.getTime();

      // Skip past-due events
      if (remainingMs <= 0) return;

      // Evaluate threshold milestones
      THRESHOLDS.forEach(th => {
        const key = `${ev.id}_${th.id}`;

        // Check snooze timer
        const snoozedUntil = snoozedMap[key];
        if (snoozedUntil && new Date(snoozedUntil) > now) {
          return; // Currently snoozed
        }

        // Trigger condition: remaining time falls within threshold window
        if (remainingMs <= th.maxMs) {
          if (!triggeredMap[key]) {
            // Found an un-triggered threshold!
            // Add to queue if not already in queue
            const alreadyInQueue = alertQueue.some(item => item.event.id === ev.id && item.threshold.id === th.id);
            const isCurrentlyShown = currentActiveAlert && currentActiveAlert.event.id === ev.id && currentActiveAlert.threshold.id === th.id;

            if (!alreadyInQueue && !isCurrentlyShown) {
              alertQueue.push({ event: ev, threshold: th, targetDate });
            }
          }
        }
      });
    });

    // Sort queue by urgency (closest remaining time first)
    alertQueue.sort((a, b) => a.targetDate - b.targetDate);

    // If no popup currently displayed, show next in queue
    if (!currentActiveAlert && alertQueue.length > 0) {
      showNextAlertModal();
    }
  }

  // ══════════════════════════════════════════════
  // POP-UP MODAL UI RENDERER
  // ══════════════════════════════════════════════
  function showNextAlertModal() {
    if (alertQueue.length === 0) return;

    const item = alertQueue.shift();
    currentActiveAlert = item;

    const { event, threshold, targetDate } = item;

    // Mark as triggered in localStorage so it won't trigger again across refreshes
    const triggeredMap = getTriggeredMap();
    triggeredMap[`${event.id}_${threshold.id}`] = true;
    saveTriggeredMap(triggeredMap);

    // Play chime & desktop notification
    playAlertChime(threshold.soundFreqs);
    sendDesktopNotification(event, threshold);

    injectStyles();

    // Create modal DOM overlay
    const overlay = document.createElement('div');
    overlay.className = 'due-modal-overlay';
    overlay.id = 'due-alert-modal-overlay';

    const queueCountText = alertQueue.length > 0 ? `+${alertQueue.length} more` : '';

    overlay.innerHTML = `
      <div class="due-modal-card" style="--modal-accent-color: ${threshold.color}; --modal-glow: 0 0 30px ${threshold.bgGlow}; --modal-border-color: ${threshold.color}55;">
        <div class="due-pulse-bar"></div>
        <div class="due-card-header">
          <span class="due-badge" style="color: ${threshold.color}; border-color: ${threshold.color}66;">
            ${threshold.badge}
          </span>
          ${queueCountText ? `<span class="due-queue-counter">${queueCountText}</span>` : ''}
        </div>

        <div class="due-title-area">
          <h2 class="due-event-title">${escapeHtml(event.title)}</h2>
          <div class="due-event-subject">
            <span>📚 ${escapeHtml(event.subject || 'General Study')}</span>
            <span>•</span>
            <span style="text-transform: capitalize; font-weight: 600; color: ${threshold.color}">${event.type || 'Event'}</span>
          </div>
        </div>

        <div class="due-meta-grid">
          <div class="due-meta-item">
            <span class="due-meta-label">📅 Due Date:</span>
            <span class="due-meta-value">${formatDisplayDate(event.date)}</span>
          </div>
          <div class="due-meta-item">
            <span class="due-meta-label">⏰ Due Time:</span>
            <span class="due-meta-value">${formatTime(event.time || '23:59')}</span>
          </div>
          ${event.notes ? `
          <div class="due-meta-item">
            <span class="due-meta-label">📝 Notes:</span>
            <span class="due-meta-value" style="font-weight:400">${escapeHtml(event.notes)}</span>
          </div>` : ''}
        </div>

        <div class="due-timer-box" style="--modal-accent-color: ${threshold.color}; --modal-glow-color: ${threshold.bgGlow}">
          <div class="due-timer-label">Time Remaining</div>
          <div class="due-timer-clock" id="due-popup-clock">--h --m --s</div>
        </div>

        <div class="due-actions">
          <button class="due-btn due-btn-primary" id="due-btn-view">
            <span>📅 View in App</span>
          </button>
          <button class="due-btn due-btn-snooze" id="due-btn-snooze">
            <span>⏰ Snooze (15m)</span>
          </button>
          <button class="due-btn due-btn-secondary" id="due-btn-dismiss">
            <span>✅ Got It</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Update ticking clock inside modal
    function updateClock() {
      const clockEl = document.getElementById('due-popup-clock');
      if (!clockEl) return;
      const cd = calculateCountdown(targetDate);
      clockEl.textContent = cd.text;
      if (cd.expired) {
        clockEl.textContent = 'PAST DUE';
        clockEl.style.color = '#f87171';
      }
    }

    updateClock();
    popupTickerInterval = setInterval(updateClock, 1000);

    // Event listeners
    document.getElementById('due-btn-dismiss').onclick = () => {
      closeAlertModal();
    };

    document.getElementById('due-btn-snooze').onclick = () => {
      snoozeCurrentAlert(event, threshold, 15);
      closeAlertModal();
    };

    document.getElementById('due-btn-view').onclick = () => {
      closeAlertModal();
      if (typeof window.showView === 'function') {
        window.showView('reminders');
      }
    };
  }

  function snoozeCurrentAlert(event, threshold, minutes) {
    const snoozedMap = getSnoozedMap();
    const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    snoozedMap[`${event.id}_${threshold.id}`] = snoozeUntil;
    saveSnoozedMap(snoozedMap);

    if (typeof window.showToast === 'function') {
      window.showToast(`⏰ Alert snoozed for ${minutes} minutes`, 'info');
    }
  }

  function closeAlertModal() {
    if (popupTickerInterval) {
      clearInterval(popupTickerInterval);
      popupTickerInterval = null;
    }

    const overlay = document.getElementById('due-alert-modal-overlay');
    if (overlay) {
      overlay.style.animation = 'dueFadeIn 0.2s reverse forwards';
      setTimeout(() => {
        overlay.remove();
        currentActiveAlert = null;
        // Process next alert in queue if any
        if (alertQueue.length > 0) {
          setTimeout(showNextAlertModal, 300);
        }
      }, 200);
    } else {
      currentActiveAlert = null;
    }
  }

  // ══════════════════════════════════════════════
  // TIME FORMATTING HELPERS
  // ══════════════════════════════════════════════
  function calculateCountdown(targetDate) {
    const diff = targetDate.getTime() - new Date().getTime();
    if (diff <= 0) return { text: 'Past Due', expired: true };

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    const p = num => String(num).padStart(2, '0');

    if (days > 0) {
      return { text: `${days}d ${p(hours)}h ${p(mins)}m ${p(secs)}s`, expired: false };
    }
    return { text: `${p(hours)}h ${p(mins)}m ${p(secs)}s`, expired: false };
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-');
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (e) {
      return dateStr;
    }
  }

  function formatTime(timeStr) {
    if (!timeStr) return '11:59 PM';
    try {
      const [h, m] = timeStr.split(':');
      const hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayH = hour % 12 || 12;
      return `${displayH}:${m} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ══════════════════════════════════════════════
  // INITIALIZATION & STARTUP
  // ══════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    // Initial check after short delay to let app.js load events
    setTimeout(checkDueAlerts, 1500);

    // Periodic background scanning
    setInterval(checkDueAlerts, CHECK_INTERVAL_MS);
  });

  // Expose test function globally if user or developer wants to trigger manually
  window.checkDueAlerts = checkDueAlerts;
  window.triggerTestDueAlert = function (milestone = '24h') {
    const sampleEvent = {
      id: 'test_evt_' + Date.now(),
      title: 'Sample Math Assignment 2',
      subject: 'Mathematics',
      type: 'assignment',
      date: new Date(Date.now() + (milestone === '30m' ? 1700000 : milestone === '6h' ? 20000000 : 80000000)).toISOString().split('T')[0],
      time: '23:59',
      notes: 'Test alert preview generated for StudySync',
    };
    const th = THRESHOLDS.find(t => t.id === milestone) || THRESHOLDS[2];
    alertQueue.push({ event: sampleEvent, threshold: th, targetDate: new Date(Date.now() + 1800000) });
    showNextAlertModal();
  };
})();

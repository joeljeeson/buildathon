const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAppContext() {
  const appPath = path.join(__dirname, '..', 'app.js');
  const code = fs.readFileSync(appPath, 'utf8');

  const context = {
    console,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    Date,
    Math,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => [],
    },
    window: { location: { href: '' } },
    Notification: {},
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

test('parser extracts assignment-style events from the provided WhatsApp data', () => {
  const context = loadAppContext();
  const input = `01/08/26, 8:30 AM - Lakshmi: Good morning students.
01/08/26, 8:32 AM - Lakshmi: Data Structures Assignment 1 has been given in today's class.
01/08/26, 8:33 AM - Lakshmi: Write algorithms and C programs for Linear Search and Binary Search.
01/08/26, 8:34 AM - Lakshmi: Submit the assignment on 08 August during the first hour.
01/08/26, 10:15 AM - Jishna: Java Assignment 1.
01/08/26, 10:16 AM - Jishna: Write programs for Method Overloading and Method Overriding.
01/08/26, 10:17 AM - Jishna: Last date for submission is 07 August.
01/08/26, 1:45 PM - Karthika: Mathematics Assignment 1.`;

  const events = context.extractEvents(input);
  const dates = events.map((event) => event.date).sort();

  assert.ok(events.length >= 4, `Expected at least 4 events, received ${events.length}`);
  assert.ok(dates.includes('2026-08-08'));
  assert.ok(dates.includes('2026-08-07'));
  assert.ok(events.some((event) => event.title.toLowerCase().includes('assignment')));
});

test('parser accepts dot-separated times without treating them as dates', () => {
  const context = loadAppContext();
  const events = context.extractEvents('Mathematics exam is on August 15 at 11.30 AM.');

  assert.equal(events.length, 1);
  assert.equal(events[0].date, '2026-08-15');
  assert.equal(events[0].time, '11:30');
});

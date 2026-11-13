'use strict';
/*
 * Daybook: a personal planner for running several businesses.
 * Everything is stored on this device (localStorage). No accounts, no server.
 */

const KEY = 'daybook.v1';
const UI_KEY = 'daybook.ui';
const VERSION = '1.0.0';
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#ef4444', '#8b5cf6', '#14b8a6', '#64748b'];
const RECUR = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };
const KINDS = { task: 'Task', waiting: 'Waiting on', decision: 'Decision', idea: 'Idea' };
const PRI = ['None', 'Low', 'Medium', 'High'];
const STATUS = { todo: 'To do', doing: 'Doing', done: 'Done' };
const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_MS = 864e5;

const SETUP_CHECKLIST = [
  'Register the company / legal entity', 'PAN, GST and other registrations', 'Open a business bank account',
  'Name, logo and brand identity', 'Domain, website and business email', 'Reserve social media handles',
  'Accounting and invoicing setup', 'Hire or assign the first team members', 'Write down the first 90-day goals',
];

const ICON = {
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>',
  tick: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

/* ---------- utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const T = () => ymd(new Date());
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const dayDiff = (a, b) => Math.round((parseD(b) - parseD(a)) / DAY_MS);
const cmpNull = (a, b) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : 1);
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const short = n => (n.length > 14 ? n.split(/\s+/)[0] : n);

function fmtDue(due) {
  if (!due) return '';
  const t = T(), diff = dayDiff(t, due);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = parseD(due);
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  const opts = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}${m ? ':' + pad(m) : ''}${h >= 12 ? 'pm' : 'am'}`;
}
function fmtLongDate(s) {
  return parseD(s).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
function nextWeekday(name, forceNext) {
  const idx = WD.indexOf(name.slice(0, 3).toLowerCase());
  let diff = (idx - new Date().getDay() + 7) % 7;
  if (diff === 0 && forceNext) diff = 7;
  return addDays(T(), diff);
}
function nextDue(due, rec) {
  const d = parseD(due);
  if (rec.freq === 'daily') d.setDate(d.getDate() + 1);
  else if (rec.freq === 'weekly') d.setDate(d.getDate() + 7);
  else if (rec.freq === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
  else if (rec.freq === 'monthly') {
    const day = rec.day || d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return ymd(d);
}

/* ---------- data ---------- */
function newTask(p = {}) {
  return Object.assign({
    id: uid(), title: '', notes: '', spaceId: null, kind: 'task', status: 'todo', priority: 0,
    due: null, time: null, recur: null, myDay: null, top3: null, person: '', subtasks: [],
    createdAt: Date.now(), completedAt: null,
  }, p);
}
const freeColor = () => COLORS.find(c => !db.spaces.some(s => s.color === c)) || COLORS[db.spaces.length % COLORS.length];
function newSpace(name, color) { return { id: uid(), name, color, archived: false, createdAt: Date.now() }; }

function seed() {
  const t0 = T(), now = new Date();
  const sp = [newSpace('Marketing Agency', COLORS[0]), newSpace('News Channel', COLORS[5]), newSpace('Personal', COLORS[3])];
  const firstOfNext = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  return {
    v: 1, spaces: sp,
    tasks: [
      newTask({
        title: '👋 Welcome to Daybook. Tap me to read how it works',
        notes: 'Daybook keeps all your businesses in one place.\n\n' +
          '• TODAY: your plan for the day across every business. Star ★ up to 3 tasks as your Top 3.\n' +
          '• INBOX: dump anything quickly, sort it into a business later.\n' +
          '• SPACES: one per business. Add a new one whenever you start a new organisation.\n' +
          '• LISTS: Waiting on (work you delegated), Decisions, Ideas and Upcoming.\n' +
          '• REVIEW: a weekly look at where your time and attention went.\n\n' +
          'Quick-add shortcuts:  @agency  !high  today  tomorrow  fri  12 dec  4pm  every week\n\n' +
          'Your data stays on this phone. Back it up from ⚙ Settings → Export backup.\n\n' +
          'Delete this task once you have read it.',
      }),
      newTask({ title: 'Tap + and try typing: Call client tomorrow 4pm @agency !high' }),
      newTask({ title: 'Invoice all agency clients', spaceId: sp[0].id, due: firstOfNext, recur: { freq: 'monthly', day: 1 }, priority: 2 }),
      newTask({ title: "Review today's bulletin", spaceId: sp[1].id, due: t0, time: '18:00', recur: { freq: 'weekdays' } }),
    ],
    settings: { theme: 'auto', lastReview: null, lastBackup: null },
  };
}
function migrate(d) {
  d.settings = Object.assign({ theme: 'auto', lastReview: null, lastBackup: null }, d.settings);
  d.spaces = d.spaces.filter(s => s && s.id && s.name);
  d.tasks = d.tasks.filter(t => t && t.id).map(t => newTask(t));
  d.tasks.forEach(t => { t.subtasks = Array.isArray(t.subtasks) ? t.subtasks : []; });
  return d;
}
function isValidDb(d) { return d && Array.isArray(d.tasks) && Array.isArray(d.spaces); }
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); if (isValidDb(d)) return migrate(d); }
  } catch (e) { /* fall through to a fresh start */ }
  return seed();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Could not save: phone storage may be full'); }
}

let db = load();
let ui = Object.assign({ tab: 'today', filter: 'all', spaceId: null, spaceView: 'list', listTab: 'waiting', showDone: false },
  (() => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; } })());
let sheet = null;          // { type, ...state } of the open bottom sheet
let sheetPushed = false;   // whether we added a history entry (so Android back closes the sheet)
let toastUndo = null, toastTimer = null;

function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* ignore */ } }

/* ---------- selectors ---------- */
const getT = id => db.tasks.find(t => t.id === id);
const getS = id => db.spaces.find(s => s.id === id);
const isOpen = t => t.status !== 'done';
const activeSpaces = () => db.spaces.filter(s => !s.archived);
const passFilter = t => ui.filter === 'all' || t.spaceId === ui.filter;
const byDue = (a, b) => cmpNull(a.due, b.due) || cmpNull(a.time, b.time) || b.priority - a.priority || a.createdAt - b.createdAt;
const byTime = (a, b) => cmpNull(a.time, b.time) || b.priority - a.priority || cmpNull(a.due, b.due) || a.createdAt - b.createdAt;
const doneOn = (t, day) => t.completedAt && ymd(new Date(t.completedAt)) === day;
function reviewDue() {
  const last = db.settings.lastReview;
  const dow = new Date().getDay();
  return (!last || dayDiff(last, T()) >= 6) && (dow === 0 || dow === 1 || dow === 6) && db.tasks.length > 4;
}

/* ---------- mutations ---------- */
function withUndo(msg, fn) {
  const snap = JSON.stringify(db);
  fn(); save(); render(); refreshSheet();
  toast(msg, () => { db = migrate(JSON.parse(snap)); save(); render(); refreshSheet(); });
}
function complete(t) {
  t.status = 'done'; t.completedAt = Date.now();
  if (t.recur) {
    const t0 = T();
    let nd = nextDue(t.due || t0, t.recur);
    while (nd < t0) nd = nextDue(nd, t.recur); // skip occurrences missed while away
    db.tasks.push(newTask({
      ...t, id: uid(), status: 'todo', due: nd, completedAt: null, myDay: null, top3: null, createdAt: Date.now(),
      recur: { ...t.recur }, subtasks: t.subtasks.map(s => ({ ...s, id: uid(), done: false })),
    }));
    t.recur = null; // the finished copy no longer repeats; the new copy carries the schedule
  }
}
function toggleDone(id) {
  const t = getT(id); if (!t) return;
  if (isOpen(t)) {
    const rec = t.recur;
    withUndo(rec ? `Done ✓ Next one: ${fmtDue(nextDue(t.due || T(), rec))}` : 'Done ✓', () => complete(t));
  } else {
    t.status = 'todo'; t.completedAt = null; save(); render(); refreshSheet();
  }
}

/* ---------- quick-add parser ---------- */
function matchSpace(w) {
  w = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (w.length < 2) return null;
  const sp = activeSpaces();
  const flat = s => s.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return sp.find(s => flat(s) === w)
    || sp.find(s => flat(s).startsWith(w))
    || sp.find(s => s.name.toLowerCase().split(/\s+/).some(x => x.startsWith(w)))
    || sp.find(s => initials(s.name).toLowerCase() === w)
    || null;
}
function matchSpaceWord(w) {
  w = w.toLowerCase();
  if (w.length < 3) return null;
  return activeSpaces().find(s => s.name.toLowerCase().split(/\s+/).includes(w)) || null;
}
function parseQuick(input) {
  let s = ' ' + input.replace(/\s+/g, ' ') + ' ';
  const r = {};
  const t0 = T();
  const cut = (re, fn) => { s = s.replace(re, (...a) => (fn(...a) === false ? a[0] : ' ')); };
  const W = '(?=\\s)';
  const pre = '(?:on\\s|by\\s|due\\s)?';

  cut(/\s@([\p{L}\p{N}_-]+)/giu, (m, w) => { const sp = matchSpace(w); if (!sp || r.spaceId) return false; r.spaceId = sp.id; });
  if (!r.spaceId) cut(/\s(?:for|in)\s(?:the\s)?([\p{L}]{3,})(?=\s)/iu, (m, w) => { const sp = matchSpaceWord(w); if (!sp) return false; r.spaceId = sp.id; });

  cut(/\s!(high|hi|h|1|medium|med|m|2|low|lo|l|3)(?=\s)/i, (m, p) => { r.priority = { h: 3, 1: 3, m: 2, 2: 2, l: 1, 3: 1 }[p[0].toLowerCase()]; });
  if (!r.priority) cut(/\s(urgent|high priority|top priority)(?=\s)/i, () => { r.priority = 3; });

  cut(new RegExp('\\severy\\s(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)' + W, 'i'), (m, d) => { r.recur = { freq: 'weekly' }; r.due = nextWeekday(d); });
  cut(new RegExp('\\s(every\\s?day|daily)' + W, 'i'), () => { r.recur = { freq: 'daily' }; });
  cut(new RegExp('\\s(every\\s?weekday|weekdays)' + W, 'i'), () => { r.recur = { freq: 'weekdays' }; });
  cut(new RegExp('\\s(every\\s?week|weekly)' + W, 'i'), () => { r.recur = { freq: 'weekly' }; });
  cut(new RegExp('\\s(every\\s?month|monthly)' + W, 'i'), () => { r.recur = { freq: 'monthly' }; });

  cut(/\s(?:at\s)?(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm)(?=\s)/i, (m, h, mm, ap) => {
    h = +h; if (h < 1 || h > 12 || (mm && +mm > 59)) return false;
    if (/pm/i.test(ap) && h < 12) h += 12;
    if (/am/i.test(ap) && h === 12) h = 0;
    r.time = `${pad(h)}:${mm || '00'}`;
  });
  if (!r.time) cut(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m, h, mm) => { r.time = `${pad(+h)}:${mm}`; });
  if (!r.time) cut(/\s(?:at\s)?noon(?=\s)/i, () => { r.time = '12:00'; });

  cut(new RegExp('\\s' + pre + '(day after tomorrow|day after tmrw)' + W, 'i'), () => { r.due = addDays(t0, 2); });
  cut(new RegExp('\\s' + pre + '(today|tod)' + W, 'i'), () => { r.due = t0; });
  cut(new RegExp('\\s(tonight)' + W, 'i'), () => { r.due = t0; if (!r.time) r.time = '20:00'; });
  cut(new RegExp('\\s' + pre + '(tomorrow|tomorow|tmrw|tmr|tom)' + W, 'i'), () => { r.due = addDays(t0, 1); });
  cut(new RegExp('\\s' + pre + '(next week)' + W, 'i'), () => { r.due = nextWeekday('mon', true); });
  cut(new RegExp('\\s' + pre + '(this weekend|weekend)' + W, 'i'), () => { r.due = nextWeekday('sat'); });
  cut(new RegExp('\\s' + pre + 'in\\s(\\d{1,3})\\s(day|days|week|weeks|month|months)' + W, 'i'), (m, n, u) => {
    n = +n;
    if (/month/i.test(u)) { const d = parseD(t0); d.setMonth(d.getMonth() + n); r.due = ymd(d); }
    else r.due = addDays(t0, /week/i.test(u) ? n * 7 : n);
  });
  if (!r.due) cut(new RegExp('\\s' + pre + '(next\\s)?(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)' + W, 'i'),
    (m, nx, d) => { r.due = nextWeekday(d, !!nx); });

  const yearFix = (d, hadYear) => { if (!hadYear && ymd(d) < t0) d.setFullYear(d.getFullYear() + 1); return d; };
  if (!r.due) cut(new RegExp('\\s' + pre + '(\\d{1,2})[/-](\\d{1,2})(?:[/-](\\d{2,4}))?' + W), (m, dd, mm, yy) => {
    dd = +dd; mm = +mm; if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
    let y = yy ? +yy : new Date().getFullYear(); if (y < 100) y += 2000;
    r.due = ymd(yearFix(new Date(y, mm - 1, dd), !!yy));
  });
  const monRe = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
  if (!r.due) cut(new RegExp('\\s' + pre + '(\\d{1,2})(?:st|nd|rd|th)?\\s(?:of\\s)?' + monRe + '(?:\\s(\\d{4}))?' + W, 'i'), (m, dd, mo, yy) => {
    const d = new Date(yy ? +yy : new Date().getFullYear(), MON.indexOf(mo.slice(0, 3).toLowerCase()), +dd);
    r.due = ymd(yearFix(d, !!yy));
  });
  if (!r.due) cut(new RegExp('\\s' + pre + monRe + '\\s(\\d{1,2})(?:st|nd|rd|th)?(?:\\s(\\d{4}))?' + W, 'i'), (m, mo, dd, yy) => {
    const d = new Date(yy ? +yy : new Date().getFullYear(), MON.indexOf(mo.slice(0, 3).toLowerCase()), +dd);
    r.due = ymd(yearFix(d, !!yy));
  });

  if (r.recur && !r.due) r.due = t0;
  if (r.recur && r.recur.freq === 'monthly') r.recur.day = parseD(r.due).getDate();
  r.title = s.replace(/\s+/g, ' ').replace(/\s(at|on|by|due|for|in)\s*$/i, '').trim();
  return r;
}

/* ---------- rendering helpers ---------- */
function head(title, sub = '', opts = {}) {
  return `<header class="vhead"><div class="vhead-l">${opts.back || ''}<div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div></div>
    <div class="vhead-r">${opts.right || ''}<button class="icon-btn" data-action="settings" aria-label="Settings">${ICON.gear}</button></div></header>`;
}
function filterChips() {
  const sp = activeSpaces();
  if (sp.length < 2) return '';
  return `<div class="chips scroll" role="tablist" aria-label="Filter by business">
    <button class="chip ${ui.filter === 'all' ? 'on' : ''}" data-action="filter" data-v="all">All</button>
    ${sp.map(s => `<button class="chip ${ui.filter === s.id ? 'on' : ''}" data-action="filter" data-v="${s.id}"><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</button>`).join('')}
  </div>`;
}
function metaHtml(t, opts = {}) {
  const s = getS(t.spaceId), t0 = T(), meta = [];
  if (opts.showSpace !== false) {
    meta.push(s ? `<span class="chip-space"><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>` : '<span class="chip-space"><i class="dot" style="background:var(--muted)"></i>Inbox</span>');
  }
  if (t.status === 'doing') meta.push('<span class="tag doing">In progress</span>');
  if (t.kind === 'waiting') meta.push(`<span class="tag">⏳ ${esc(t.person || 'Someone')}</span>`);
  if (t.kind === 'decision') meta.push('<span class="tag">⚖ Decide</span>');
  if (t.kind === 'idea') meta.push('<span class="tag">💡 Idea</span>');
  if (t.due) {
    const cls = isOpen(t) && t.due < t0 ? 'od' : t.due === t0 ? 'td' : '';
    const pre = t.kind === 'waiting' ? 'Chase ' : '';
    meta.push(`<span class="${cls}">${pre}${fmtDue(t.due)}${t.time ? ' · ' + fmtTime(t.time) : ''}</span>`);
  } else if (t.time) meta.push(`<span>${fmtTime(t.time)}</span>`);
  if (t.recur) meta.push(`<span>↻ ${RECUR[t.recur.freq]}</span>`);
  if (t.subtasks.length) meta.push(`<span>☑ ${t.subtasks.filter(x => x.done).length}/${t.subtasks.length}</span>`);
  if (t.notes) meta.push('<span aria-label="Has notes">📝</span>');
  return meta.join('');
}
function row(t, opts = {}) {
  const s = getS(t.spaceId);
  const meta = metaHtml(t, opts);
  const extra = typeof opts.extra === 'function' ? opts.extra(t) : '';
  const star = opts.star && isOpen(t)
    ? `<button class="star ${t.top3 === T() ? 'on' : ''}" data-action="top3" data-id="${t.id}" aria-label="Top 3">${ICON.star}</button>` : '';
  return `<div class="task p${t.priority} ${isOpen(t) ? '' : 'done'}" style="--sc:${s ? s.color : 'var(--line)'}">
    <button class="check" data-action="toggle" data-id="${t.id}" aria-label="${isOpen(t) ? 'Mark done' : 'Mark not done'}"></button>
    <div class="body" data-action="open" data-id="${t.id}" role="button" tabindex="0">
      <div class="title">${esc(t.title)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}${extra}
    </div>${star}</div>`;
}
function section(title, list, opts = {}) {
  if (!list.length && !opts.empty) return '';
  return `<section class="sec ${opts.cls || ''}"><div class="sec-h"><h2>${title}</h2>${list.length ? `<span class="count">${list.length}</span>` : ''}${opts.action || ''}</div>
    ${list.length ? `<div class="list">${list.map(t => row(t, opts)).join('')}</div>` : `<div class="empty">${opts.empty}</div>`}</section>`;
}
function groupByDate(list, opts = {}) {
  const t0 = T(), wk = addDays(t0, 7);
  const g = { od: [], td: [], wk: [], later: [], none: [] };
  list.forEach(t => {
    if (!t.due) g.none.push(t);
    else if (t.due < t0) g.od.push(t);
    else if (t.due === t0) g.td.push(t);
    else if (t.due <= wk) g.wk.push(t);
    else g.later.push(t);
  });
  Object.values(g).forEach(l => l.sort(byDue));
  return section('Overdue', g.od, { ...opts, cls: 'danger' }) + section('Today', g.td, opts) +
    section('Next 7 days', g.wk, opts) + section('Later', g.later, opts) + section('No date', g.none, opts);
}

/* ---------- views ---------- */
function viewToday() {
  const t0 = T();
  const all = db.tasks.filter(passFilter);
  const open = all.filter(isOpen);
  const isTop = t => t.top3 === t0;
  const top = open.filter(isTop).sort(byTime);
  const overdue = open.filter(t => !isTop(t) && t.due && t.due < t0).sort(byDue);
  const todays = open.filter(t => !isTop(t) && !(t.due && t.due < t0) && (t.due === t0 || t.myDay === t0)).sort(byTime);
  const carried = open.filter(t => !isTop(t) && t.myDay && t.myDay < t0 && !(t.due && t.due <= t0)).sort(byDue);
  const doneToday = all.filter(t => !isOpen(t) && doneOn(t, t0)).sort((a, b) => b.completedAt - a.completedAt);
  const planned = top.length + overdue.length + todays.length + doneToday.length;
  const pct = planned ? Math.round((doneToday.length / planned) * 100) : 0;
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  let html = head('Today', `${greet} · ${fmtLongDate(t0)}`);
  html += filterChips();
  html += `<div class="card progress"><div class="pg-top"><span><b>${doneToday.length}</b> of ${planned} done${pct === 100 && planned ? ' 🎉' : ''}</span>
    <button class="btn small" data-action="plan">${ICON.sun} Plan my day</button></div><div class="bar"><span style="width:${pct}%"></span></div></div>`;
  if (reviewDue()) html += `<button class="card nudge" data-action="tab" data-v="review">📊 It's time for your weekly review →</button>`;
  html += section('★ Top 3', top, { star: true, empty: 'Tap the ☆ on any task to make it one of today’s 3 most important.' });
  html += section('Overdue', overdue, { star: true, cls: 'danger', action: `<button class="link" data-action="bump-overdue">Move all to today</button>` });
  html += section('Today', todays, {
    star: true,
    empty: overdue.length || carried.length ? '' : 'Nothing else planned. Tap <b>Plan my day</b> to pull in tasks, or <b>+</b> to add one.',
  });
  html += section('Carried over', carried, { star: true, action: `<button class="link" data-action="carry">Bring to today</button>` });
  if (doneToday.length) {
    html += `<section class="sec"><button class="sec-h" data-action="toggle-done-list"><h2>Completed today</h2><span class="count">${doneToday.length}</span>
      <span class="link">${ui.showDone ? 'Hide' : 'Show'}</span></button>
      ${ui.showDone ? `<div class="list">${doneToday.map(t => row(t)).join('')}</div>` : ''}</section>`;
  }
  return html;
}

function viewInbox() {
  const list = db.tasks.filter(t => isOpen(t) && !t.spaceId).sort((a, b) => b.createdAt - a.createdAt);
  const sp = activeSpaces();
  const extra = t => `<div class="assign">${sp.map(s =>
    `<button class="mini" style="--c:${s.color}" data-action="assign" data-id="${t.id}" data-v="${s.id}">→ ${esc(short(s.name))}</button>`).join('')}</div>`;
  return head('Inbox', 'Capture now, sort later') +
    (list.length ? `<div class="list">${list.map(t => row(t, { showSpace: false, extra })).join('')}</div>`
      : '<div class="empty">Inbox zero 🎉<br>Anything you add without a business lands here.</div>');
}

function viewSpaces() {
  if (ui.spaceId) {
    const s = getS(ui.spaceId);
    if (s) return viewSpace(s);
    ui.spaceId = null;
  }
  const t0 = T(), wkAgo = Date.now() - 7 * DAY_MS;
  const cards = activeSpaces().map(s => {
    const ts = db.tasks.filter(t => t.spaceId === s.id);
    const open = ts.filter(isOpen);
    const od = open.filter(t => t.due && t.due < t0).length;
    const td = open.filter(t => t.due === t0 || t.myDay === t0).length;
    const done7 = ts.filter(t => t.completedAt && t.completedAt >= wkAgo).length;
    const neglected = open.length && !done7 && Date.now() - s.createdAt > 5 * DAY_MS;
    return `<button class="space-card" style="--c:${s.color}" data-action="open-space" data-id="${s.id}">
      <div class="sc-top"><span class="sc-icon">${esc(initials(s.name))}</span><span class="sc-name">${esc(s.name)}</span><span class="chev">›</span></div>
      <div class="sc-stats"><span><b>${open.length}</b> open</span><span><b>${td}</b> today</span>${od ? `<span class="od"><b>${od}</b> overdue</span>` : ''}<span><b>${done7}</b> done this week</span></div>
      ${neglected ? '<div class="sc-warn">⚠ Nothing completed here in the last 7 days</div>' : ''}</button>`;
  }).join('');
  const arch = db.spaces.filter(s => s.archived);
  return head('Spaces', 'One for each business') +
    `<div class="space-grid">${cards || '<div class="empty">No businesses yet. Add your first one below.</div>'}</div>
    <button class="btn block dashed" data-action="new-space">${ICON.plus} New business / organisation</button>
    ${arch.length ? `<h3 class="sub-h">Archived</h3>${arch.map(s => `<button class="arch" data-action="edit-space" data-id="${s.id}"><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</button>`).join('')}` : ''}`;
}

function viewSpace(s) {
  const ts = db.tasks.filter(t => t.spaceId === s.id);
  const open = ts.filter(isOpen);
  let html = head(esc(s.name), `${open.length} open task${open.length === 1 ? '' : 's'}`, {
    back: `<button class="icon-btn back" data-action="close-space" aria-label="Back to spaces">${ICON.back}</button>`,
    right: `<button class="icon-btn" data-action="edit-space" data-id="${s.id}" aria-label="Edit business">${ICON.edit}</button>`,
  });
  html += `<div class="seg"><button class="${ui.spaceView === 'list' ? 'on' : ''}" data-action="space-view" data-v="list">List</button>
    <button class="${ui.spaceView === 'board' ? 'on' : ''}" data-action="space-view" data-v="board">Board</button></div>`;
  if (ui.spaceView === 'board') {
    const moves = t => {
      const b = [];
      if (t.status === 'todo') b.push(['doing', 'Start →']);
      if (t.status === 'doing') b.push(['todo', '← To do'], ['done', 'Done ✓']);
      if (t.status === 'done') b.push(['todo', '↺ Reopen']);
      return `<div class="moves">${b.map(([v, l]) => `<button data-action="status" data-id="${t.id}" data-v="${v}">${l}</button>`).join('')}</div>`;
    };
    html += `<div class="board">${Object.entries(STATUS).map(([k, name]) => {
      let l = ts.filter(t => t.status === k);
      l = k === 'done' ? l.sort((a, b) => b.completedAt - a.completedAt).slice(0, 20) : l.sort(byDue);
      return `<div class="col"><div class="col-h">${name}<span class="count">${l.length}</span></div>
        ${l.map(t => row(t, { showSpace: false, extra: moves })).join('') || '<div class="empty small">Empty</div>'}</div>`;
    }).join('')}</div>`;
  } else {
    html += open.length ? groupByDate(open, { showSpace: false, star: true })
      : `<div class="empty">No open tasks in ${esc(s.name)}.<br>Tap <b>+</b> to add one.</div>`;
    const done = ts.filter(t => !isOpen(t)).sort((a, b) => b.completedAt - a.completedAt);
    if (done.length) {
      html += `<section class="sec"><button class="sec-h" data-action="toggle-done-list"><h2>Completed</h2><span class="count">${done.length}</span>
        <span class="link">${ui.showDone ? 'Hide' : 'Show'}</span></button>
        ${ui.showDone ? `<div class="list">${done.slice(0, 30).map(t => row(t, { showSpace: false })).join('')}</div>` : ''}</section>`;
    }
  }
  return html;
}

function viewLists() {
  const tabs = [['waiting', '⏳ Waiting'], ['decision', '⚖ Decide'], ['idea', '💡 Ideas'], ['upcoming', '📅 Upcoming']];
  const open = db.tasks.filter(t => isOpen(t) && passFilter(t));
  let html = head('Lists') + filterChips();
  html += `<div class="seg tight">${tabs.map(([k, l]) => `<button class="${ui.listTab === k ? 'on' : ''}" data-action="list-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
  const t0 = T();
  if (ui.listTab === 'waiting') {
    const l = open.filter(t => t.kind === 'waiting').sort(byDue);
    html += '<p class="hint">Work you handed to someone else. Set a chase date so nothing slips through.</p>';
    html += section('Chase now', l.filter(t => t.due && t.due <= t0), { cls: 'danger' }) +
      section('Waiting', l.filter(t => !t.due || t.due > t0), { empty: l.length ? '' : 'Nothing delegated right now. Add with + and pick “Waiting on”.' });
  } else if (ui.listTab === 'decision') {
    const l = open.filter(t => t.kind === 'decision').sort(byDue);
    html += '<p class="hint">Decisions only you can make. Clearing these unblocks your teams.</p>';
    html += section('To decide', l, { empty: 'No pending decisions. Add with + and pick “Decision”.' });
  } else if (ui.listTab === 'idea') {
    const l = open.filter(t => t.kind === 'idea').sort((a, b) => b.createdAt - a.createdAt);
    html += '<p class="hint">Park ideas here so they stop distracting you. Turn one into a task when it is time.</p>';
    if (!l.length) html += '<div class="empty">No ideas parked yet. Add with + and pick “Idea”.</div>';
    const groups = [...activeSpaces(), { id: null, name: 'Unsorted' }];
    groups.forEach(s => { html += section(esc(s.name), l.filter(t => (t.spaceId || null) === s.id), { showSpace: false }); });
  } else {
    const end = addDays(t0, 14);
    const l = open.filter(t => t.due && t.due >= t0 && t.due <= end).sort(byDue);
    html += '<p class="hint">Everything with a date in the next 2 weeks.</p>';
    if (!l.length) html += '<div class="empty">Nothing scheduled for the next 2 weeks.</div>';
    for (let d = t0; d <= end; d = addDays(d, 1)) {
      const day = l.filter(t => t.due === d);
      if (day.length) html += section(d === t0 ? 'Today' : d === addDays(t0, 1) ? 'Tomorrow' : esc(fmtLongDate(d)), day);
    }
  }
  return html;
}

function viewReview() {
  const t0 = T(), now = Date.now(), wkAgo = now - 7 * DAY_MS, wkAhead = addDays(t0, 7);
  const groups = [...activeSpaces(), { id: null, name: 'Inbox (unsorted)', color: '#94a3b8' }];
  const stats = groups.map(s => {
    const ts = db.tasks.filter(t => (t.spaceId || null) === s.id);
    const open = ts.filter(isOpen);
    const lastDone = Math.max(0, ...ts.map(t => t.completedAt || 0));
    return {
      s, open: open.length,
      d7: ts.filter(t => t.completedAt && t.completedAt >= wkAgo).length,
      od: open.filter(t => t.due && t.due < t0).length,
      ahead: open.filter(t => t.due && t.due >= t0 && t.due <= wkAhead).length,
      neglected: s.id && open.length && (!lastDone || now - lastDone > 5 * DAY_MS) && now - (s.createdAt || 0) > 5 * DAY_MS,
    };
  }).filter(x => x.s.id || x.open || x.d7);
  const total = stats.reduce((a, x) => a + x.d7, 0);
  const inbox = db.tasks.filter(t => isOpen(t) && !t.spaceId).length;
  const overdue = db.tasks.filter(t => isOpen(t) && t.due && t.due < t0).length;
  const chase = db.tasks.filter(t => isOpen(t) && t.kind === 'waiting' && t.due && t.due <= t0).length;
  const decide = db.tasks.filter(t => isOpen(t) && t.kind === 'decision').length;
  const lastB = db.settings.lastBackup;

  let html = head('Weekly review', 'The last 7 days across your businesses');
  html += `<div class="card"><div class="big-num">${total}</div><div class="muted small">tasks completed this week</div>
    ${total ? `<div class="stack">${stats.filter(x => x.d7).map(x => `<span style="width:${(x.d7 / total) * 100}%;background:${x.s.color}" title="${esc(x.s.name)}"></span>`).join('')}</div>
    <div class="legend">${stats.filter(x => x.d7).map(x => `<span><i class="dot" style="background:${x.s.color}"></i>${esc(x.s.name)} ${Math.round((x.d7 / total) * 100)}%</span>`).join('')}</div>`
      : '<p class="muted small" style="margin:10px 0 0">Complete a few tasks and this shows where your attention went.</p>'}</div>`;

  html += stats.map(x => `<div class="card" style="border-left:4px solid ${x.s.color}">
    <div class="rv-h">${esc(x.s.name)}</div>
    <div class="kpis"><div class="kpi"><b>${x.d7}</b><span>done</span></div><div class="kpi"><b>${x.open}</b><span>open</span></div>
    <div class="kpi ${x.od ? 'bad' : ''}"><b>${x.od}</b><span>overdue</span></div><div class="kpi"><b>${x.ahead}</b><span>next 7 days</span></div></div>
    ${x.neglected ? '<div class="warn">⚠ Nothing completed here in over 5 days. Does this business need your attention?</div>' : ''}</div>`).join('');

  const step = (n, ok, text, action) => `<li><span class="n ${ok ? 'ok' : ''}">${ok ? '✓' : n}</span><span class="s">${text}</span>${action || ''}</li>`;
  html += `<div class="card"><div class="rv-h" style="margin-bottom:4px">Review checklist</div><ul class="steps">
    ${step(1, !inbox, `Clear your Inbox <span class="muted">(${inbox} left)</span>`, inbox ? '<button class="link" data-action="tab" data-v="inbox">Open</button>' : '')}
    ${step(2, !overdue, `Reschedule or finish overdue tasks <span class="muted">(${overdue})</span>`, overdue ? '<button class="link" data-action="tab" data-v="today">Open</button>' : '')}
    ${step(3, !chase, `Chase people you are waiting on <span class="muted">(${chase})</span>`, chase ? '<button class="link" data-action="goto-list" data-v="waiting">Open</button>' : '')}
    ${step(4, !decide, `Make pending decisions <span class="muted">(${decide})</span>`, decide ? '<button class="link" data-action="goto-list" data-v="decision">Open</button>' : '')}
    ${step(5, false, 'Look at next week and pick each business’s priority', '<button class="link" data-action="goto-list" data-v="upcoming">Open</button>')}
  </ul><button class="btn primary block" style="margin-top:10px" data-action="review-done">Mark review done</button>
  ${db.settings.lastReview ? `<p class="muted small" style="margin:8px 0 0;text-align:center">Last review: ${fmtDue(db.settings.lastReview)}</p>` : ''}</div>`;

  const bDays = lastB ? Math.floor((now - lastB) / DAY_MS) : null;
  html += `<div class="card"><div class="rv-h">Backup</div><p class="muted small" style="margin:6px 0 10px">
    ${lastB ? `Last backup ${bDays === 0 ? 'today' : bDays + ' day' + (bDays === 1 ? '' : 's') + ' ago'}.` : 'You have never backed up.'}
    Your tasks live only on this phone, so export a backup now and then.</p>
    <button class="btn block" data-action="export">Export backup</button></div>`;
  return html;
}

const VIEWS = { today: viewToday, inbox: viewInbox, spaces: viewSpaces, lists: viewLists, review: viewReview };

function render() {
  if (ui.filter !== 'all' && !activeSpaces().some(s => s.id === ui.filter)) ui.filter = 'all';
  applyTheme();
  document.querySelectorAll('.tabbar button').forEach(b => {
    const on = b.dataset.v === ui.tab;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const t0 = T();
  const od = db.tasks.filter(t => isOpen(t) && t.due && t.due < t0).length;
  const inbox = db.tasks.filter(t => isOpen(t) && !t.spaceId).length;
  setBadge('today', od, false);
  setBadge('inbox', inbox, true);
  $('#view').innerHTML = (VIEWS[ui.tab] || viewToday)();
  saveUi();
}
function setBadge(name, n, soft) {
  const b = document.querySelector(`[data-badge="${name}"]`);
  if (!b) return;
  b.hidden = !n; b.textContent = n > 99 ? '99+' : n; b.classList.toggle('soft', soft);
}
function applyTheme() {
  const th = db.settings.theme;
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
  const dark = th === 'dark' || (th !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#0d0f15' : '#f4f5f9');
}

/* ---------- bottom sheets ---------- */
function sheetWrap(title, body, foot = '') {
  return `<div class="sheet-h"><h3>${title}</h3><button class="icon-btn" data-action="close-sheet" aria-label="Close">${ICON.close}</button></div>
    <div class="sheet-b">${body}</div>${foot ? `<div class="sheet-f">${foot}</div>` : ''}`;
}
function openSheet(state) {
  sheet = state;
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true">${SHEETS[sheet.type]()}</div>`;
  root.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (!sheetPushed) { history.pushState({ sheet: 1 }, ''); sheetPushed = true; }
  afterSheet();
}
function refreshSheet() {
  if (!sheet) return;
  const el = $('#sheet-root .sheet'); if (!el) return;
  const sc = $('.sheet-b', el)?.scrollTop || 0;
  el.innerHTML = SHEETS[sheet.type]();
  const b = $('.sheet-b', el); if (b) b.scrollTop = sc;
  afterSheet(true);
}
function afterSheet(isRefresh) {
  if (sheet.type === 'add') {
    const inp = $('#qa-text');
    if (inp) { inp.value = sheet.text || ''; updatePreview(); if (!isRefresh || sheet.focus) setTimeout(() => inp.focus(), 60); }
  }
  if (sheet.type === 'space' && !isRefresh) setTimeout(() => $('#sp-name')?.focus(), 60);
}
function closeSheet(fromPop) {
  if (!sheet) return;
  stopVoice();
  sheet = null;
  const root = $('#sheet-root');
  root.classList.remove('open'); root.innerHTML = '';
  document.body.style.overflow = '';
  if (sheetPushed) { sheetPushed = false; if (!fromPop) history.back(); }
  render();
}
window.addEventListener('popstate', () => { if (sheet) { sheetPushed = false; closeSheet(true); } });

const SHEETS = {
  add() {
    const sp = activeSpaces();
    const kinds = Object.entries(KINDS).map(([k, l]) => `<button class="${sheet.kind === k ? 'on' : ''}" data-action="qa-kind" data-v="${k}">${l}</button>`).join('');
    const spaces = [`<button class="chip ${!sheet.spaceId ? 'on' : ''}" data-action="qa-space" data-v="">Inbox</button>`,
      ...sp.map(s => `<button class="chip ${sheet.spaceId === s.id ? 'on' : ''}" data-action="qa-space" data-v="${s.id}"><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</button>`)].join('');
    const ph = { task: 'e.g. Call client tomorrow 4pm @agency !high', waiting: 'e.g. Logo drafts from design team fri', decision: 'e.g. Approve new anchor hire', idea: 'e.g. Weekly podcast for the news channel' }[sheet.kind];
    return sheetWrap('Add', `
      <div class="seg tight">${kinds}</div>
      <div class="qa-row"><input id="qa-text" class="inp" placeholder="${esc(ph)}" autocomplete="off" enterkeyhint="done" aria-label="What needs doing?">
        <button class="mic ${sheet.listening ? 'rec' : ''}" data-action="qa-voice" aria-label="Speak">${ICON.mic}</button></div>
      ${sheet.kind === 'waiting' ? `<input id="qa-person" class="inp" style="margin-top:8px" placeholder="Waiting on whom?" value="${esc(sheet.person || '')}" autocomplete="off">` : ''}
      <div class="preview" id="qa-preview"></div>
      <div class="chips pick-space">${spaces}</div>
      <label class="check-row"><input type="checkbox" id="qa-myday" ${sheet.myDay ? 'checked' : ''}> Add to Today (if no date)</label>
      <p class="hint">Shortcuts: <code>@agency</code> <code>!high</code> <code>today</code> <code>tomorrow</code> <code>fri</code> <code>12 dec</code> <code>4pm</code> <code>every week</code>${sheet.kind === 'waiting' ? '. With no date, you’ll be reminded to chase in 2 days.' : ''}</p>`,
      `<button class="btn grow" data-action="qa-save" data-v="more">Add another</button><button class="btn primary grow" data-action="qa-save">Add</button>`);
  },

  task() {
    const t = getT(sheet.id);
    if (!t) return sheetWrap('Task not found', '<p class="muted">It may have been deleted.</p>');
    const t0 = T();
    const spOpts = `<option value="">Inbox (unsorted)</option>` + db.spaces.filter(s => !s.archived || s.id === t.spaceId)
      .map(s => `<option value="${s.id}" ${s.id === t.spaceId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const opt = (obj, cur) => Object.entries(obj).map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');
    const subs = t.subtasks.map(s => `<div class="subrow ${s.done ? 'done' : ''}">
        <button class="sc" data-action="sub-toggle" data-v="${s.id}" aria-label="Toggle">${s.done ? ICON.tick : ''}</button>
        <input data-f="sub-title" data-sid="${s.id}" value="${esc(s.title)}" aria-label="Subtask">
        <button class="x" data-action="sub-del" data-v="${s.id}" aria-label="Remove subtask">×</button></div>`).join('');
    const created = new Date(t.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return sheetWrap(KINDS[t.kind], `
      <textarea class="title-in" data-f="title" rows="1" aria-label="Title">${esc(t.title)}</textarea>
      <div class="seg tight">${Object.entries(KINDS).map(([k, l]) => `<button class="${t.kind === k ? 'on' : ''}" data-action="set" data-f="kind" data-v="${k}">${l}</button>`).join('')}</div>
      ${t.kind === 'waiting' ? `<label class="fld"><span>Waiting on</span><input data-f="person" value="${esc(t.person)}" placeholder="Who?"></label>` : ''}
      <div class="grid2">
        <label class="fld"><span>Business</span><select data-f="spaceId">${spOpts}</select></label>
        <label class="fld"><span>Status</span><select data-f="status">${opt(STATUS, t.status)}</select></label>
        <label class="fld"><span>${t.kind === 'waiting' ? 'Chase on' : 'Due date'}</span><input type="date" data-f="due" value="${t.due || ''}"></label>
        <label class="fld"><span>Time</span><input type="time" data-f="time" value="${t.time || ''}"></label>
      </div>
      <div class="quick">
        <button data-action="due-quick" data-v="0">Today</button><button data-action="due-quick" data-v="1">Tomorrow</button>
        <button data-action="due-quick" data-v="mon">Next Monday</button><button data-action="due-quick" data-v="7">+1 week</button>
        ${t.due || t.time ? '<button data-action="due-quick" data-v="clear">Clear date</button>' : ''}
      </div>
      <div class="grid2">
        <label class="fld"><span>Repeat</span><select data-f="recur"><option value="">Never</option>${opt(RECUR, t.recur?.freq)}</select></label>
        <div class="fld"><span>Priority</span><select data-f="priority">${PRI.map((p, i) => `<option value="${i}" ${t.priority === i ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      </div>
      <div class="toggles">
        <button class="tgl ${t.myDay === t0 || t.due === t0 ? 'on' : ''}" data-action="dt-myday">☀ In Today</button>
        <button class="tgl ${t.top3 === t0 ? 'on' : ''}" data-action="dt-top3">★ Top 3</button>
      </div>
      <div class="fld"><span>Checklist</span><div class="subs">${subs}
        <div class="subrow new"><span class="sc"></span><input id="sub-new" placeholder="Add a step…" enterkeyhint="enter" aria-label="New subtask"></div></div></div>
      <label class="fld"><span>Notes</span><textarea class="notes" data-f="notes" placeholder="Details, links, phone numbers…">${esc(t.notes)}</textarea></label>
      <p class="meta-info">Created ${created}${t.completedAt ? ' · Completed ' + new Date(t.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</p>`,
      `<button class="btn danger" data-action="dt-delete">Delete</button>
       <button class="btn primary grow" data-action="dt-done">${isOpen(t) ? 'Mark done ✓' : 'Reopen'}</button>`);
  },

  plan() {
    const t0 = T(), wk = addDays(t0, 7);
    const cand = db.tasks.filter(t => isOpen(t) && t.kind !== 'idea' && !(t.due && t.due <= t0) && t.top3 !== t0);
    const inDay = t => t.myDay === t0;
    const count = db.tasks.filter(t => isOpen(t) && (t.myDay === t0 || t.due === t0 || t.top3 === t0)).length;
    const groups = [
      ['Coming up this week', cand.filter(t => t.due && t.due <= wk)],
      ['Inbox', cand.filter(t => !t.due && !t.spaceId)],
      ...activeSpaces().map(s => [s.name, cand.filter(t => t.spaceId === s.id && (!t.due || t.due > wk))]),
    ].filter(g => g[1].length);
    const body = groups.map(([n, l]) => `<h4>${esc(n)}</h4>${l.sort(byDue).map(t => {
      const s = getS(t.spaceId);
      const meta = [s ? s.name : '', t.kind === 'waiting' ? '⏳ ' + (t.person || 'Waiting') : '', t.due ? fmtDue(t.due) : ''].filter(Boolean).join(' · ');
      return `<button class="pick ${inDay(t) ? 'on' : ''}" data-action="plan-toggle" data-id="${t.id}">
        <span class="pk">${inDay(t) ? '✓' : '+'}</span><span class="pt">${esc(t.title)}${meta ? `<small>${esc(meta)}</small>` : ''}</span></button>`;
    }).join('')}`).join('');
    return sheetWrap('Plan my day',
      `<p class="hint">Tap tasks to bring them into today. Then star ★ your Top 3. Tip: keep the day realistic, 5 to 7 tasks is plenty.</p>
       ${body || '<div class="empty">Nothing waiting to be planned. Add tasks with +.</div>'}`,
      `<button class="btn primary block" data-action="close-sheet">Done · ${count} task${count === 1 ? '' : 's'} today</button>`);
  },

  space() {
    const s = sheet.id ? getS(sheet.id) : null;
    const name = sheet.name ?? (s ? s.name : '');
    const color = sheet.color || (s ? s.color : freeColor());
    const n = s ? db.tasks.filter(t => t.spaceId === s.id).length : 0;
    return sheetWrap(s ? 'Edit business' : 'New business', `
      <label class="fld"><span>Name</span><input id="sp-name" value="${esc(name)}" placeholder="e.g. Real Estate Venture" maxlength="40" autocomplete="off"></label>
      <div class="fld"><span>Colour</span><div class="swatches">${COLORS.map(c => `<button class="sw ${c === color ? 'on' : ''}" style="background:${c}" data-action="sp-color" data-v="${c}" aria-label="Colour ${c}"></button>`).join('')}</div></div>
      ${s ? `<p class="muted small">${n} task${n === 1 ? '' : 's'} in this business.</p>
        <div class="btn-row" style="margin-top:14px"><button class="btn grow" data-action="sp-archive">${s.archived ? 'Unarchive' : 'Archive'}</button>
        <button class="btn danger grow" data-action="sp-delete">Delete</button></div>
        <p class="hint">Archive hides a business you have paused or handed off, but keeps its history.</p>`
        : `<label class="check-row"><input type="checkbox" id="sp-tpl" ${sheet.tpl === false ? '' : 'checked'}> Add a “New business setup” checklist</label>
           <p class="hint">Covers registration, GST, bank account, branding, website, social handles, accounting, hiring and 90-day goals.</p>`}`,
      `<button class="btn primary block" data-action="sp-save">${s ? 'Save' : 'Create business'}</button>`);
  },

  settings() {
    const th = db.settings.theme;
    const lastB = db.settings.lastBackup;
    return sheetWrap('Settings', `
      <h4>Appearance</h4>
      <div class="seg">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button class="${th === k ? 'on' : ''}" data-action="theme" data-v="${k}">${l}</button>`).join('')}</div>
      <h4>Businesses</h4>
      ${db.spaces.map(s => `<div class="set-row"><i class="dot" style="background:${s.color}"></i><span class="grow">${esc(s.name)}${s.archived ? ' <span class="muted small">(archived)</span>' : ''}</span>
        <button class="link" data-action="edit-space" data-id="${s.id}">Edit</button></div>`).join('')}
      <button class="btn block dashed" style="margin-top:10px" data-action="new-space">${ICON.plus} New business</button>
      <h4>Backup</h4>
      <p class="muted small" style="margin-top:0">Your data is stored only on this device. ${lastB ? 'Last backup: ' + new Date(lastB).toLocaleDateString() + '.' : 'No backup yet.'}</p>
      <div class="btn-row"><button class="btn grow" data-action="export">Export backup</button>
        <label class="btn grow" for="import-file">Restore backup</label><input type="file" id="import-file" accept="application/json,.json" hidden></div>
      <h4>Danger zone</h4>
      <button class="btn danger block" data-action="erase">Erase all data</button>
      <p class="muted small" style="text-align:center;margin-top:18px">Daybook v${VERSION}</p>`);
  },
};

/* ---------- quick add ---------- */
function updatePreview() {
  const inp = $('#qa-text'), out = $('#qa-preview');
  if (!inp || !out || !sheet) return;
  sheet.text = inp.value;
  const p = parseQuick(inp.value);
  const chips = [];
  if (p.spaceId) chips.push('@ ' + getS(p.spaceId).name);
  if (p.due) chips.push('📅 ' + fmtDue(p.due));
  if (p.time) chips.push('🕑 ' + fmtTime(p.time));
  if (p.priority) chips.push('! ' + PRI[p.priority]);
  if (p.recur) chips.push('↻ ' + RECUR[p.recur.freq]);
  out.innerHTML = chips.map(c => `<span class="pv">${esc(c)}</span>`).join('');
}
function qaSave(keepOpen) {
  const inp = $('#qa-text');
  const text = inp.value.trim();
  if (!text) { inp.focus(); return; }
  const p = parseQuick(text);
  if (!p.title) { toast('Add a title for the task'); return; }
  const kind = sheet.kind;
  const t = newTask({
    title: p.title, kind, spaceId: p.spaceId || sheet.spaceId || null, priority: p.priority || 0,
    due: p.due || null, time: p.time || null, recur: p.recur || null,
    person: kind === 'waiting' ? ($('#qa-person')?.value.trim() || '') : '',
  });
  if (kind === 'waiting' && !t.due) t.due = addDays(T(), 2);
  if ($('#qa-myday')?.checked && !t.due && kind !== 'idea') t.myDay = T();
  db.tasks.push(t); save(); render();
  const s = getS(t.spaceId);
  toast(`Added to ${s ? s.name : 'Inbox'}${t.due ? ' · ' + fmtDue(t.due) : t.myDay ? ' · Today' : ''}`);
  if (keepOpen) {
    sheet.text = ''; sheet.person = ''; inp.value = '';
    const pi = $('#qa-person'); if (pi) pi.value = '';
    updatePreview(); inp.focus();
  } else closeSheet();
}

/* voice input (Chrome on Android supports the Web Speech API) */
let recog = null;
function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Voice input is not supported in this browser'); return; }
  if (recog) { stopVoice(); return; }
  const inp = $('#qa-text');
  const base = inp.value ? inp.value.trim() + ' ' : '';
  recog = new SR();
  recog.lang = navigator.language || 'en-IN';
  recog.interimResults = true;
  recog.onresult = e => {
    let txt = '';
    for (const res of e.results) txt += res[0].transcript;
    const i = $('#qa-text'); if (i) { i.value = base + txt; updatePreview(); }
  };
  recog.onerror = e => { if (e.error === 'not-allowed') toast('Microphone permission was blocked'); };
  recog.onend = () => { recog = null; if (sheet) { sheet.listening = false; $('.mic')?.classList.remove('rec'); } };
  try { recog.start(); sheet.listening = true; $('.mic')?.classList.add('rec'); }
  catch (e) { recog = null; toast('Could not start voice input'); }
}
function stopVoice() { if (recog) { try { recog.stop(); } catch (e) { /* ignore */ } recog = null; } }

/* ---------- backup ---------- */
function exportData() {
  db.settings.lastBackup = Date.now(); save();
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `daybook-backup-${T()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup saved to your Downloads');
  render(); refreshSheet();
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!isValidDb(d)) throw new Error('bad');
      if (!confirm(`Restore this backup (${d.tasks.length} tasks, ${d.spaces.length} businesses)? It replaces everything currently on this phone.`)) return;
      db = migrate(d); save(); closeSheet(); toast('Backup restored');
    } catch (e) { toast('That file is not a Daybook backup'); }
  };
  r.readAsText(file);
}

/* ---------- actions ---------- */
const ACT = {
  tab(el, id, v) {
    if (v === 'spaces' && ui.tab === 'spaces') ui.spaceId = null;
    ui.tab = v; ui.showDone = false; render(); scrollTo(0, 0);
  },
  filter(el, id, v) { ui.filter = v; render(); },
  toggle(el, id) { toggleDone(id); },
  open(el, id) { openSheet({ type: 'task', id }); },
  top3(el, id) {
    const t = getT(id), t0 = T();
    if (t.top3 === t0) { t.top3 = null; }
    else {
      if (db.tasks.filter(x => isOpen(x) && x.top3 === t0).length >= 3) { toast('Top 3 is full. Unstar one first.'); return; }
      t.top3 = t0; if (t.due !== t0) t.myDay = t0;
    }
    save(); render(); refreshSheet();
  },
  plan() { openSheet({ type: 'plan' }); },
  'plan-toggle'(el, id) { const t = getT(id), t0 = T(); t.myDay = t.myDay === t0 ? null : t0; save(); refreshSheet(); },
  'bump-overdue'() {
    const t0 = T();
    withUndo('Moved to today', () => db.tasks.filter(t => isOpen(t) && passFilter(t) && t.due && t.due < t0).forEach(t => { t.due = t0; }));
  },
  carry() {
    const t0 = T();
    withUndo('Brought into today', () => db.tasks.filter(t => isOpen(t) && passFilter(t) && t.myDay && t.myDay < t0).forEach(t => { t.myDay = t0; }));
  },
  'toggle-done-list'() { ui.showDone = !ui.showDone; render(); },
  assign(el, id, v) { const t = getT(id); withUndo(`Moved to ${getS(v).name}`, () => { t.spaceId = v; }); },
  'open-space'(el, id) { ui.spaceId = id; ui.showDone = false; render(); scrollTo(0, 0); },
  'close-space'() { ui.spaceId = null; render(); },
  'space-view'(el, id, v) { ui.spaceView = v; render(); },
  status(el, id, v) {
    const t = getT(id);
    if (v === 'done') { toggleDone(id); return; }
    if (!isOpen(t)) t.completedAt = null;
    t.status = v; save(); render();
  },
  'list-tab'(el, id, v) { ui.listTab = v; render(); },
  'goto-list'(el, id, v) { ui.tab = 'lists'; ui.listTab = v; render(); scrollTo(0, 0); },
  'review-done'() { db.settings.lastReview = T(); save(); render(); toast('Review done. Have a focused week! 💪'); },

  'quick-add'() {
    let spaceId = null, kind = 'task';
    if (ui.tab === 'spaces' && ui.spaceId) spaceId = ui.spaceId;
    else if ((ui.tab === 'today' || ui.tab === 'lists') && ui.filter !== 'all') spaceId = ui.filter;
    if (ui.tab === 'lists' && ui.listTab !== 'upcoming') kind = ui.listTab;
    openSheet({ type: 'add', kind, spaceId, myDay: ui.tab === 'today', text: '' });
  },
  'qa-kind'(el, id, v) { sheet.kind = v; sheet.person = $('#qa-person')?.value || sheet.person; sheet.myDay = $('#qa-myday')?.checked; sheet.focus = true; refreshSheet(); },
  'qa-space'(el, id, v) { sheet.spaceId = v || null; sheet.person = $('#qa-person')?.value || sheet.person; sheet.myDay = $('#qa-myday')?.checked; sheet.focus = false; refreshSheet(); },
  'qa-save'(el, id, v) { qaSave(v === 'more'); },
  'qa-voice'() { startVoice(); },

  set(el, id, v) {
    const t = getT(sheet.id), f = el.dataset.f;
    t[f] = f === 'priority' ? +v : v;
    save(); refreshSheet();
  },
  'due-quick'(el, id, v) {
    const t = getT(sheet.id);
    if (v === 'clear') { t.due = null; t.time = null; t.recur = null; }
    else if (v === 'mon') t.due = nextWeekday('mon', true);
    else t.due = addDays(T(), +v);
    save(); refreshSheet();
  },
  'dt-myday'() {
    const t = getT(sheet.id), t0 = T();
    if (t.myDay === t0 || t.due === t0) { t.myDay = null; if (t.due === t0) t.due = null; t.top3 = null; }
    else t.myDay = t0;
    save(); refreshSheet();
  },
  'dt-top3'() { ACT.top3(null, sheet.id); },
  'sub-toggle'(el, id, v) { const s = getT(sheet.id).subtasks.find(x => x.id === v); s.done = !s.done; save(); refreshSheet(); },
  'sub-del'(el, id, v) { const t = getT(sheet.id); t.subtasks = t.subtasks.filter(x => x.id !== v); save(); refreshSheet(); },
  'dt-delete'() {
    const t = getT(sheet.id);
    closeSheet();
    withUndo('Task deleted', () => { db.tasks = db.tasks.filter(x => x.id !== t.id); });
  },
  'dt-done'() { const id = sheet.id; closeSheet(); toggleDone(id); },

  'new-space'() { openSheet({ type: 'space', id: null }); },
  'edit-space'(el, id) { openSheet({ type: 'space', id }); },
  'sp-color'(el, id, v) { sheet.name = $('#sp-name').value; sheet.color = v; sheet.tpl = $('#sp-tpl')?.checked; refreshSheet(); },
  'sp-save'() {
    const name = $('#sp-name').value.trim();
    if (!name) { toast('Give the business a name'); $('#sp-name').focus(); return; }
    const s = sheet.id ? getS(sheet.id) : null;
    const color = sheet.color || (s ? s.color : freeColor());
    if (s) { s.name = name; s.color = color; }
    else {
      const ns = newSpace(name, color);
      db.spaces.push(ns);
      if ($('#sp-tpl')?.checked) {
        db.tasks.push(newTask({ title: `🚀 Set up ${name}`, spaceId: ns.id, priority: 2, subtasks: SETUP_CHECKLIST.map(title => ({ id: uid(), title, done: false })) }));
      }
      ui.tab = 'spaces'; ui.spaceId = ns.id;
    }
    save(); closeSheet(); toast(s ? 'Saved' : `${name} created`);
  },
  'sp-archive'() {
    const s = getS(sheet.id); s.archived = !s.archived;
    if (s.archived && ui.spaceId === s.id) ui.spaceId = null;
    save(); closeSheet(); toast(s.archived ? `${s.name} archived` : `${s.name} is active again`);
  },
  'sp-delete'() {
    const s = getS(sheet.id);
    const n = db.tasks.filter(t => t.spaceId === s.id).length;
    if (!confirm(`Delete “${s.name}”${n ? ` and its ${n} task${n === 1 ? '' : 's'}` : ''}?`)) return;
    closeSheet();
    withUndo(`${s.name} deleted`, () => {
      db.spaces = db.spaces.filter(x => x.id !== s.id);
      db.tasks = db.tasks.filter(t => t.spaceId !== s.id);
      if (ui.spaceId === s.id) ui.spaceId = null;
    });
  },

  settings() { openSheet({ type: 'settings' }); },
  theme(el, id, v) { db.settings.theme = v; save(); applyTheme(); refreshSheet(); },
  export() { exportData(); },
  erase() {
    if (!confirm('Erase ALL tasks and businesses from this phone? Export a backup first if you might need them.')) return;
    if (!confirm('Are you sure? This cannot be undone.')) return;
    localStorage.removeItem(KEY); db = seed(); save(); closeSheet(); toast('All data erased');
  },
  'close-sheet'() { closeSheet(); },
  undo() { const fn = toastUndo; hideToast(); if (fn) fn(); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACT[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el, el.dataset.id, el.dataset.v, e);
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'qa-text') { updatePreview(); return; }
  if (el.id === 'qa-person' && sheet) { sheet.person = el.value; return; }
  const f = el.dataset.f;
  if (!f || !sheet || sheet.type !== 'task') return;
  const t = getT(sheet.id); if (!t) return;
  let refresh = false;
  if (f === 'sub-title') { const s = t.subtasks.find(x => x.id === el.dataset.sid); if (s) s.title = el.value; }
  else if (f === 'recur') {
    t.recur = el.value ? { freq: el.value } : null;
    if (t.recur && !t.due) { t.due = T(); refresh = true; }
    if (t.recur && t.recur.freq === 'monthly') t.recur.day = parseD(t.due).getDate();
  }
  else if (f === 'spaceId') t.spaceId = el.value || null;
  else if (f === 'priority') t.priority = +el.value;
  else if (f === 'due' || f === 'time') { t[f] = el.value || null; if (f === 'due' && t.recur?.freq === 'monthly' && t.due) t.recur.day = parseD(t.due).getDate(); }
  else if (f === 'status') {
    if (el.value === 'done' && isOpen(t)) complete(t);
    else { t.status = el.value; if (el.value !== 'done') t.completedAt = null; }
    refresh = true;
  }
  else if (f === 'title') t.title = el.value.replace(/\n/g, ' ');
  else t[f] = el.value;
  save();
  if (refresh) refreshSheet();
});

document.addEventListener('change', e => {
  if (e.target.id === 'import-file' && e.target.files[0]) importData(e.target.files[0]);
  if (e.target.id === 'qa-myday' && sheet) sheet.myDay = e.target.checked;
});

document.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Enter' && el.id === 'qa-text') { e.preventDefault(); qaSave(true); }
  if (e.key === 'Enter' && el.id === 'sub-new') {
    e.preventDefault();
    const v = el.value.trim(); if (!v) return;
    getT(sheet.id).subtasks.push({ id: uid(), title: v, done: false }); save(); refreshSheet();
    setTimeout(() => $('#sub-new')?.focus(), 0);
  }
  if (e.key === 'Enter' && el.dataset.f === 'title') { e.preventDefault(); el.blur(); }
  if (e.key === 'Enter' && el.id === 'sp-name') { e.preventDefault(); ACT['sp-save'](); }
  if (e.key === 'Enter' && el.classList.contains('body')) ACT.open(el, el.dataset.id);
  if (e.key === 'Escape' && sheet) closeSheet();
});

/* ---------- toast ---------- */
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-action="undo">Undo</button>' : ''}`;
  el.classList.add('show');
  toastUndo = undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 5000 : 2600);
}
function hideToast() { $('#toast').classList.remove('show'); toastUndo = null; }

/* ---------- boot ---------- */
render();
const params = new URLSearchParams(location.search);
if (params.has('add')) { history.replaceState(null, '', location.pathname); ACT['quick-add'](); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheet) render(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

let appData = null;
const CATEGORY_ORDER = ['Career', 'Self', 'Home Duties', 'Family'];

document.addEventListener('DOMContentLoaded', async () => {
  appData = await fetch('data.json').then(r => r.json());

  renderDateRange();
  renderMomentumDots(appData.checkins);
  renderEncouragement(appData);
  renderDailyFocus(appData.dailyFocus);
  renderYesterdayNotes(appData.yesterdayNotes);
  renderWeeklyFocus(appData.weeklyFocus);
  renderWinsAndTime(appData, 'week');
  renderDayByDay(appData.checkins);
  renderDiet(appData.diet);
  renderTasks(appData.tasks);
  renderDidYouKnow(appData.didYouKnow);
  renderNotes();
  setupToggle();
  updateSyncButton();
});

// --- Helpers ---

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function categoryTagClass(category) {
  return { 'Home Duties': 'tag-home', 'Family': 'tag-family', 'Self': 'tag-self', 'Career': 'tag-career' }[category] || '';
}

// --- Header ---

function renderDateRange() {
  const { weekStart, weekEnd } = getWeekRange();
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('dateRange').textContent = `${fmt(weekStart)} – ${fmt(weekEnd)}, ${new Date().getFullYear()}`;
}

function renderMomentumDots(checkins) {
  const container = document.getElementById('momentumDots');
  const { weekStart } = getWeekRange();
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const checkinDates = new Set((checkins || []).map(c => c.date));

  container.innerHTML = days.map((label, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const filled = checkinDates.has(dateStr);
    const isToday = dateStr === getTodayStr();
    return `<div class="dot-day ${filled ? 'dot-filled' : ''} ${isToday ? 'dot-today' : ''}">
      <span class="dot-label">${label}</span><span class="dot-circle"></span>
    </div>`;
  }).join('');
}

function renderEncouragement(data) {
  const el = document.getElementById('encouragement');
  const { weekStart, weekEnd } = getWeekRange();
  const weekCheckins = (data.checkins || []).filter(c => {
    const d = new Date(c.date + 'T12:00:00');
    return d >= weekStart && d <= weekEnd;
  });

  if (weekCheckins.length === 0) {
    el.textContent = 'Start your first check-in to see your week come alive.';
    return;
  }

  const hours = {};
  let totalHours = 0;
  for (const c of weekCheckins) {
    for (const a of (c.activities || [])) {
      hours[a.category] = (hours[a.category] || 0) + (a.hours || 0);
      totalHours += a.hours || 0;
    }
  }

  let topCat = null, topHours = 0;
  for (const [cat, h] of Object.entries(hours)) {
    if (h > topHours) { topCat = cat; topHours = h; }
  }

  const msgs = [];
  if (weekCheckins.length >= 3) msgs.push(`${weekCheckins.length} check-ins this week — you're building a rhythm.`);
  if (topCat === 'Family' && topHours >= 4) msgs.push(`${topHours} hours on Family this week — they notice.`);
  if (topCat === 'Career' && topHours >= 2) msgs.push(`${topHours} hours invested in Career — future you will thank you.`);
  if (topCat === 'Self' && topHours >= 2) msgs.push(`${topHours} hours on Self this week — you're taking care of yourself.`);
  if (totalHours > 0 && msgs.length === 0) msgs.push(`${totalHours} hours tracked across ${Object.keys(hours).length} categories — you're showing up.`);

  el.textContent = msgs[0] || `${weekCheckins.length} check-in${weekCheckins.length > 1 ? 's' : ''} this week — keep the momentum.`;
}

// --- Focus & Yesterday ---

function renderDailyFocus(focus) {
  const text = document.getElementById('dailyFocusText');
  const empty = document.getElementById('focusEmpty');
  if (!focus) { text.style.display = 'none'; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  text.style.display = 'block';
  text.textContent = focus;
}

function renderYesterdayNotes(notes) {
  const text = document.getElementById('yesterdayText');
  const empty = document.getElementById('yesterdayEmpty');
  if (!notes) { text.style.display = 'none'; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  text.style.display = 'block';
  text.textContent = notes;
}

function renderWeeklyFocus(items) {
  const list = document.getElementById('focusList');
  if (!items || items.length === 0) { list.innerHTML = '<li>No focus set yet.</li>'; return; }
  const slots = [items[0] || 'TBD', items[1] || 'TBD', items[2] || 'TBD'];
  list.innerHTML = slots.map(i => `<li>${i}</li>`).join('');
}

// --- Wins & Time (merged) ---

function renderWinsAndTime(data, range) {
  // Bars
  const barsContainer = document.getElementById('categoryBars');
  const chartEmpty = document.getElementById('chartEmpty');
  const counts = {};
  for (const cat of CATEGORY_ORDER) counts[cat] = 0;

  const { weekStart, weekEnd } = getWeekRange();
  const today = getTodayStr();

  for (const checkin of data.checkins) {
    if (range === 'week') {
      const d = new Date(checkin.date + 'T12:00:00');
      if (d < weekStart || d > weekEnd) continue;
    } else if (range === 'today') {
      if (checkin.date !== today) continue;
    }
    if (checkin.activities) {
      for (const act of checkin.activities) {
        if (counts[act.category] !== undefined) counts[act.category] += act.hours || 0;
      }
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    barsContainer.style.display = 'none';
    chartEmpty.style.display = 'block';
  } else {
    chartEmpty.style.display = 'none';
    barsContainer.style.display = 'flex';
    const maxHours = Math.max(...Object.values(counts), 1);
    const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };
    barsContainer.innerHTML = CATEGORY_ORDER.map(cat => {
      const hours = counts[cat];
      const pct = (hours / maxHours) * 100;
      return `<div class="bar-row">
        <div class="bar-label">${cat}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${colors[cat]||'#ccc'};"></div></div>
        <div class="bar-value">${hours}h</div>
      </div>`;
    }).join('');
  }

  // Wins
  const container = document.getElementById('completedList');
  const empty = document.getElementById('completedEmpty');
  let items = data.completedItems || [];

  if (range === 'today') {
    items = items.filter(i => i.date === today);
  } else if (range === 'week') {
    items = items.filter(i => {
      const d = new Date(i.date + 'T12:00:00');
      return d >= weekStart && d <= weekEnd;
    });
  }

  if (items.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent = range === 'today' ? 'Nothing logged today yet.' : 'Check in to start tracking wins.';
  } else {
    empty.style.display = 'none';
    container.style.display = 'block';
    container.innerHTML = items.map(item => {
      const tagClass = categoryTagClass(item.category);
      const hours = item.hours ? `<span class="hours">${item.hours}h</span>` : '';
      return `<div class="completed-item">
        <span class="checkmark">✓</span>
        <span class="category-tag ${tagClass}">${item.category}</span>
        <span>${item.text}</span>${hours}
      </div>`;
    }).join('');
  }
}

function setupToggle() {
  document.getElementById('mainToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    e.currentTarget.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderWinsAndTime(appData, btn.dataset.range);
  });
}

// --- Day by day ---

function renderDayByDay(checkins) {
  const container = document.getElementById('dayByDay');
  const empty = document.getElementById('daysEmpty');
  if (!checkins || checkins.length === 0) { container.style.display = 'none'; empty.style.display = 'block'; return; }

  const { weekStart, weekEnd } = getWeekRange();
  const weekCheckins = checkins.filter(c => {
    const d = new Date(c.date + 'T12:00:00');
    return d >= weekStart && d <= weekEnd;
  });

  if (weekCheckins.length === 0) { container.style.display = 'none'; empty.style.display = 'block'; return; }

  empty.style.display = 'none';
  container.style.display = 'block';
  const sorted = [...weekCheckins].sort((a, b) => b.date.localeCompare(a.date));

  container.innerHTML = sorted.map(day => {
    const d = new Date(day.date + 'T12:00:00');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const summary = day.summary || (day.activities || []).map(a => a.text).join(', ') || 'No activities logged';
    return `<div class="day-entry"><div class="day-date">${dayName}</div><div class="day-items">${summary}</div></div>`;
  }).join('');
}

// --- Diet ---

function renderDiet(diet) {
  const container = document.getElementById('dietSection');
  const empty = document.getElementById('dietEmpty');
  if (!diet || (!diet.entries.length && !diet.weights.length)) { container.style.display = 'none'; empty.style.display = 'block'; return; }

  empty.style.display = 'none';
  container.style.display = 'block';
  let html = '';

  if (diet.weights && diet.weights.length > 0) {
    const latest = diet.weights[diet.weights.length - 1];
    html += `<div class="diet-weight">Current: <strong>${latest.lbs} lbs</strong> (${latest.date}) — Target: 190 lbs</div>`;
  }

  if (diet.entries && diet.entries.length > 0) {
    const recent = [...diet.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    html += '<div class="diet-entries">' + recent.map(e => {
      const d = new Date(e.date + 'T12:00:00');
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return `<div class="diet-entry"><span class="diet-date">${dayName}</span><span class="diet-note">${e.note}</span></div>`;
    }).join('') + '</div>';
  }

  container.innerHTML = html;
}

// --- Did You Know ---

function renderDidYouKnow(facts) {
  const el = document.getElementById('dykText');
  if (!facts || facts.length === 0) { el.textContent = ''; return; }
  // Pick one based on the day so it changes daily but is consistent
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % facts.length;
  el.textContent = facts[dayIndex];
}

// --- Task list ---

function getTaskState() {
  try { return JSON.parse(localStorage.getItem('myweek-tasks')) || {}; } catch { return {}; }
}
function saveTaskState(state) { localStorage.setItem('myweek-tasks', JSON.stringify(state)); }

function countSyncChanges() {
  const state = getTaskState();
  let count = 0;
  for (const key of Object.keys(state)) { if (key !== '_added' && key !== '_synced') count++; }
  const added = state._added || {};
  for (const cat of Object.keys(added)) count += added[cat].length;
  return count;
}

function updateSyncButton() {
  const btn = document.getElementById('syncBtn');
  const countEl = document.getElementById('syncCount');
  const count = countSyncChanges();
  btn.style.display = count > 0 ? 'inline-flex' : 'none';
  countEl.textContent = count;
}

function generateSyncSummary() {
  const state = getTaskState();
  const lines = ['Task list changes to sync:\n'];
  for (const [key, val] of Object.entries(state)) {
    if (key === '_added' || key === '_synced') continue;
    const parts = key.split('::');
    lines.push(`${val ? '[x]' : '[ ]'} ${parts[0]}: ${parts[parts.length - 1]}`);
  }
  const added = state._added || {};
  for (const [cat, items] of Object.entries(added)) {
    for (const item of items) lines.push(`[NEW] ${cat}: ${item.text}`);
  }
  return lines.join('\n');
}

function renderTasks(tasks) {
  const container = document.getElementById('taskList');
  if (!tasks) { container.innerHTML = '<p class="empty-state">No tasks loaded.</p>'; return; }

  const state = getTaskState();
  const addedTasks = state._added || {};
  const { weekStart, weekEnd } = getWeekRange();

  container.innerHTML = CATEGORY_ORDER.map(cat => {
    const group = tasks[cat];
    if (!group) return '';

    const tagClass = categoryTagClass(cat);
    const desc = group.description ? `<p class="task-group-desc">${group.description}</p>` : '';
    const allItems = group.items || [];
    const extraItems = addedTasks[cat] || [];
    const totalCount = allItems.length + extraItems.length;

    const itemsHtml = allItems.map((item, i) => renderTaskItem(item, cat, i, state, weekStart, weekEnd)).join('');
    const extraHtml = extraItems.map((item, i) => renderTaskItem(item, cat, `added-${i}`, state, weekStart, weekEnd)).join('');

    return `<div class="task-group collapsed">
      <div class="task-group-header" data-cat="${cat}">
        <span class="task-group-arrow">&#9656;</span>
        <span class="category-tag ${tagClass} task-cat-title">${cat}</span>
        <span class="task-count">${totalCount}</span>
      </div>
      ${desc}
      <div class="task-group-items" data-cat="${cat}">
        ${itemsHtml}${extraHtml}
        <div class="add-task-row"><input type="text" class="add-task-input" data-cat="${cat}" placeholder="Add a task..."></div>
      </div>
    </div>`;
  }).join('');

  // Collapse toggle
  container.querySelectorAll('.task-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.task-group');
      group.classList.toggle('collapsed');
      header.querySelector('.task-group-arrow').innerHTML = group.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
    });
  });

  // Checkboxes
  container.querySelectorAll('.task-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const st = getTaskState();
      st[e.target.dataset.key] = e.target.checked;
      saveTaskState(st);
      e.target.closest('.task-item').classList.toggle('task-done', e.target.checked);
      updateSyncButton();
    });
  });

  // Add task
  container.querySelectorAll('.add-task-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const st = getTaskState();
        if (!st._added) st._added = {};
        if (!st._added[input.dataset.cat]) st._added[input.dataset.cat] = [];
        st._added[input.dataset.cat].push({ text: input.value.trim(), done: false });
        saveTaskState(st);
        renderTasks(tasks);
        updateSyncButton();
      }
    });
  });

  // Sync
  document.getElementById('syncBtn').onclick = async () => {
    const summary = generateSyncSummary();
    try {
      await navigator.clipboard.writeText(summary);
      const btn = document.getElementById('syncBtn');
      const orig = btn.innerHTML;
      btn.innerHTML = 'Copied! Paste in Claude Code';
      btn.classList.add('sync-copied');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('sync-copied'); }, 3000);
    } catch { prompt('Copy this and paste in Claude Code:', summary); }
  };
}

function renderTaskItem(item, cat, index, state, weekStart, weekEnd) {
  const key = `${cat}::${index}::${item.text}`;
  const checked = state[key] || item.done;
  const doneClass = checked ? 'task-done' : '';

  const textHtml = item.link
    ? `<a href="${item.link}" target="_blank" class="task-link">${item.text}</a>`
    : item.text;

  // Deadline badge
  let deadlineBadge = '';
  if (item.deadline) {
    const dl = new Date(item.deadline + 'T12:00:00');
    const daysUntil = Math.ceil((dl - new Date()) / (1000 * 60 * 60 * 24));
    const soonClass = daysUntil <= 7 ? 'deadline-soon' : '';
    deadlineBadge = `<span class="deadline-badge ${soonClass}">${dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`;
  }

  // Recurring sessions
  let sessionsHtml = '';
  if (item.recurring && item.sessions) {
    const thisWeek = item.sessions.filter(s => {
      const d = new Date(s.date + 'T12:00:00');
      return d >= weekStart && d <= weekEnd;
    });
    // Next open session
    const nextOpen = `<div class="session-item session-open"><span class="session-dot">○</span> Next session — open</div>`;

    if (thisWeek.length > 0 || true) {
      const sessionItems = thisWeek.map(s => {
        const d = new Date(s.date + 'T12:00:00');
        const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const note = s.note ? ` — ${s.note}` : '';
        return `<div class="session-item"><span class="session-dot">●</span> ${label}${note}</div>`;
      }).join('');
      sessionsHtml = `<div class="sessions-list">${sessionItems}${nextOpen}</div>`;
    }
  }

  // Subtasks
  let subtasksHtml = '';
  if (item.subtasks && item.subtasks.length > 0) {
    subtasksHtml = '<div class="subtask-list">' + item.subtasks.map((sub, si) => {
      const subKey = `${cat}::${index}::sub-${si}::${sub.text}`;
      const subChecked = state[subKey] || sub.done;
      return `<div class="task-item subtask ${subChecked ? 'task-done' : ''}">
        <input type="checkbox" class="task-checkbox" data-key="${subKey}" ${subChecked ? 'checked' : ''}>
        <span class="task-text">${sub.text}</span>
      </div>`;
    }).join('') + '</div>';
  }

  return `<div class="task-item ${doneClass}">
    <input type="checkbox" class="task-checkbox" data-key="${key}" ${checked ? 'checked' : ''}>
    <span class="task-text">${textHtml}</span>${deadlineBadge}
  </div>${sessionsHtml}${subtasksHtml}`;
}

// --- Notes for Claude ---

function getNotes() {
  try { return JSON.parse(localStorage.getItem('myweek-notes')) || []; } catch { return []; }
}
function saveNotes(notes) { localStorage.setItem('myweek-notes', JSON.stringify(notes)); }

function renderNotes() {
  const container = document.getElementById('savedNotes');
  const notes = getNotes();

  container.innerHTML = notes.length === 0 ? '' : notes.map((n, i) => `
    <div class="note-item">
      <span class="note-text">${n.text}</span>
      <span class="note-date">${new Date(n.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      <button class="note-delete" data-index="${i}">&times;</button>
    </div>
  `).join('');

  container.querySelectorAll('.note-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const ns = getNotes();
      ns.splice(parseInt(btn.dataset.index), 1);
      saveNotes(ns);
      renderNotes();
    });
  });

  document.getElementById('saveNoteBtn').onclick = () => {
    const input = document.getElementById('notesInput');
    const text = input.value.trim();
    if (!text) return;
    const ns = getNotes();
    ns.push({ text, timestamp: Date.now() });
    saveNotes(ns);
    input.value = '';
    renderNotes();
  };

  document.getElementById('notesInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('saveNoteBtn').click();
    }
  });
}

let appData = null;
const CATEGORY_ORDER = ['Career', 'Self', 'Home Duties', 'Family'];
const NOTES_EMAIL = 'amircohn9@gmail.com';

document.addEventListener('DOMContentLoaded', async () => {
  appData = await fetch('data.json').then(r => r.json());

  renderDateRange();
  renderMomentumDots(appData.checkins);
  renderEncouragement(appData);
  renderLastUpdated(appData);
  renderKPIStrip(appData);
  renderDailyFocus(appData);
  renderWeeklyFocus(appData.weeklyFocus, appData);
  renderWinsAndTime(appData, 'today');
  renderDayByDay(appData.checkins);
  renderDiet(appData.diet);
  renderTasks(appData.tasks);
  renderDidYouKnow(appData.didYouKnow);
  renderNotes();
  setupToggle();
  setupCollapsibleSections();
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
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function categoryTagClass(category) {
  return { 'Home Duties': 'tag-home', 'Family': 'tag-family', 'Self': 'tag-self', 'Career': 'tag-career' }[category] || '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Collapsible sections ---

function setupCollapsibleSections() {
  document.querySelectorAll('.card > h2, .card > .section-header-with-toggle > h2').forEach(h2 => {
    const card = h2.closest('.card');
    // Skip task list (has its own collapse) and notes (needs to stay open)
    if (card.classList.contains('task-list-card') || card.classList.contains('notes-card')) return;

    h2.classList.add('collapsible-header');
    h2.addEventListener('click', () => {
      card.classList.toggle('section-collapsed');
      // Save state
      const key = 'collapse-' + (card.id || h2.textContent.trim());
      localStorage.setItem(key, card.classList.contains('section-collapsed'));
    });

    // Restore state
    const key = 'collapse-' + (card.id || h2.textContent.trim());
    if (localStorage.getItem(key) === 'true') {
      card.classList.add('section-collapsed');
    }
  });
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

  if (weekCheckins.length === 0) { el.textContent = 'Start your first check-in to see your week come alive.'; return; }

  const hours = {};
  let totalHours = 0;
  for (const c of weekCheckins) {
    for (const a of (c.activities || [])) {
      hours[a.category] = (hours[a.category] || 0) + (a.hours || 0);
      totalHours += a.hours || 0;
    }
  }

  let topCat = null, topHours = 0;
  for (const [cat, h] of Object.entries(hours)) { if (h > topHours) { topCat = cat; topHours = h; } }

  const msgs = [];
  if (weekCheckins.length >= 3) msgs.push(`${weekCheckins.length} check-ins this week — you're building a rhythm.`);
  if (topCat === 'Family' && topHours >= 4) msgs.push(`${topHours} hours on Family this week — they notice.`);
  if (topCat === 'Career' && topHours >= 2) msgs.push(`${topHours} hours invested in Career — future you will thank you.`);
  if (topCat === 'Self' && topHours >= 2) msgs.push(`${topHours} hours on Self this week — you're taking care of yourself.`);
  if (totalHours > 0 && msgs.length === 0) msgs.push(`${totalHours} hours tracked across ${Object.keys(hours).length} categories — you're showing up.`);
  el.textContent = msgs[0] || `${weekCheckins.length} check-in${weekCheckins.length > 1 ? 's' : ''} this week — keep the momentum.`;
}

// --- Last Updated ---

function renderLastUpdated(data) {
  const el = document.getElementById('lastUpdated');
  const checkins = data.checkins || [];
  if (checkins.length === 0) { el.textContent = ''; return; }
  const lastDate = checkins.map(c => c.date).sort().pop();
  const d = new Date(lastDate + 'T12:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  el.textContent = `Last check-in: ${label}`;
}

// --- KPI Strip ---

function renderKPIStrip(data) {
  const container = document.getElementById('kpiStrip');
  const { weekStart, weekEnd } = getWeekRange();
  const weekCheckins = (data.checkins || []).filter(c => {
    const d = new Date(c.date + 'T12:00:00');
    return d >= weekStart && d <= weekEnd;
  });

  // Days active
  const daysActive = weekCheckins.length;

  // Total hours
  let totalHours = 0;
  for (const c of weekCheckins) {
    for (const a of (c.activities || [])) totalHours += a.hours || 0;
  }

  // Weight with trend
  let weightHtml = '';
  const diet = data.diet;
  if (diet && diet.weights && diet.weights.length > 0) {
    // Merge localStorage weights
    const localWeights = JSON.parse(localStorage.getItem('myweek-weight-updates') || '[]');
    const allWeights = [...diet.weights];
    for (const lw of localWeights) {
      if (!allWeights.find(w => w.date === lw.date && w.lbs === lw.lbs)) allWeights.push(lw);
    }
    allWeights.sort((a, b) => a.date.localeCompare(b.date));
    const latest = allWeights[allWeights.length - 1];
    const remaining = latest.lbs - (diet.goalWeight || 190);
    const arrow = remaining > 0 ? '↓' : '✓';
    weightHtml = `<div class="kpi-card"><div class="kpi-value">${latest.lbs}<span class="kpi-unit">lbs</span></div><div class="kpi-label">${remaining > 0 ? remaining + ' to goal' : 'At goal!'} ${arrow}</div></div>`;
  }

  // Streak (consecutive days with checkins ending today or yesterday)
  let streak = 0;
  const sortedDates = (data.checkins || []).map(c => c.date).sort().reverse();
  const today = getTodayStr();
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  if (sortedDates.length > 0 && (sortedDates[0] === today || sortedDates[0] === yesterday)) {
    let checkDate = new Date(sortedDates[0] + 'T12:00:00');
    const dateSet = new Set(sortedDates);
    while (dateSet.has(checkDate.getFullYear() + '-' + String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + String(checkDate.getDate()).padStart(2, '0'))) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  container.innerHTML = `
    <div class="kpi-card"><div class="kpi-value">${daysActive}</div><div class="kpi-label">days active</div></div>
    <div class="kpi-card"><div class="kpi-value">${totalHours}<span class="kpi-unit">h</span></div><div class="kpi-label">tracked</div></div>
    ${weightHtml}
    <div class="kpi-card"><div class="kpi-value">${streak}</div><div class="kpi-label">day streak</div></div>
  `;
}

// --- Focus & Yesterday ---

function getTomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function renderDailyFocus(data, dayMode) {
  dayMode = dayMode || 'today';
  const text = document.getElementById('dailyFocusText');
  const empty = document.getElementById('focusEmpty');
  const title = document.getElementById('focusTitle');
  const calContainer = document.getElementById('calendarEvents');

  const isToday = dayMode === 'today';
  const dateStr = isToday ? getTodayStr() : getTomorrowStr();
  const dayLabel = isToday ? 'Today' : 'Tomorrow';
  title.textContent = `My Focus ${dayLabel}`;

  // Today shows dailyFocus; tomorrow shows yesterdayNotes (breadcrumbs for next day)
  const focusContent = isToday ? data.dailyFocus : data.yesterdayNotes;
  if (focusContent) {
    empty.style.display = 'none'; text.style.display = 'block'; text.textContent = focusContent;
  } else {
    text.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent = isToday ? 'No focus set for today.' : 'No focus set for tomorrow yet.';
  }

  // Yesterday breadcrumb (only in today view)
  const breadcrumb = document.getElementById('yesterdayBreadcrumb');
  if (isToday && data.yesterdayNotes) {
    breadcrumb.innerHTML = `<div class="yesterday-inline"><span class="yesterday-label">From yesterday:</span> ${escapeHtml(data.yesterdayNotes)}</div>`;
    breadcrumb.style.display = 'block';
  } else {
    breadcrumb.style.display = 'none';
  }

  // Calendar events
  const events = (data.calendarEvents && data.calendarEvents[dateStr]) || [];
  if (events.length > 0) {
    const d = new Date(dateStr + 'T12:00:00');
    const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    calContainer.innerHTML = `<div class="cal-header">${dateLabel}</div>` +
      events.map(e => {
        const dot = e.color ? `<span class="cal-dot" style="background:${e.color}"></span>` : '';
        return `<div class="cal-event">${dot}<span class="cal-time">${e.time}</span><span class="cal-summary">${escapeHtml(e.summary)}</span></div>`;
      }).join('');
    calContainer.style.display = 'block';
  } else {
    calContainer.innerHTML = `<p class="empty-state">No calendar events for ${dayLabel.toLowerCase()}.</p>`;
    calContainer.style.display = 'block';
  }

  // Setup toggle (only once)
  const dayToggle = document.getElementById('dayToggle');
  if (!dayToggle._bound) {
    dayToggle._bound = true;
    dayToggle.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.toggle-btn');
      if (!btn) return;
      ev.currentTarget.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDailyFocus(data, btn.dataset.day);
    });
  }
}

function renderWeeklyFocus(items, data) {
  const list = document.getElementById('focusList');
  if (!items || items.length === 0) { list.innerHTML = '<li>No focus set yet.</li>'; return; }
  const slots = [items[0] || 'TBD', items[1] || 'TBD', items[2] || 'TBD'];

  // Count week's activity for each focus area
  const { weekStart, weekEnd } = getWeekRange();
  const weekCheckins = (data && data.checkins || []).filter(c => {
    const d = new Date(c.date + 'T12:00:00');
    return d >= weekStart && d <= weekEnd;
  });

  function countForFocus(focusText) {
    const lower = focusText.toLowerCase();
    let sessions = 0, hours = 0;
    for (const c of weekCheckins) {
      for (const a of (c.activities || [])) {
        if (a.text.toLowerCase().includes(lower) || lower.includes(a.category.toLowerCase())) {
          sessions++;
          hours += a.hours || 0;
        }
      }
    }
    return { sessions, hours };
  }

  list.innerHTML = slots.map(label => {
    if (label === 'TBD') return `<li>${label}</li>`;
    const { sessions, hours } = countForFocus(label);
    const badge = sessions > 0
      ? `<span class="focus-progress">${sessions} session${sessions > 1 ? 's' : ''}${hours > 0 ? ' · ' + hours + 'h' : ''}</span>`
      : `<span class="focus-progress focus-no-activity">not yet</span>`;
    return `<li>${escapeHtml(label)} ${badge}</li>`;
  }).join('');
}

// --- Wins & Time (merged) ---

function renderWinsAndTime(data, range) {
  const barsContainer = document.getElementById('categoryBars');
  const chartEmpty = document.getElementById('chartEmpty');
  const counts = {};
  for (const cat of CATEGORY_ORDER) counts[cat] = 0;
  const { weekStart, weekEnd } = getWeekRange();
  const today = getTodayStr();

  for (const checkin of data.checkins) {
    if (range === 'week') { const d = new Date(checkin.date + 'T12:00:00'); if (d < weekStart || d > weekEnd) continue; }
    else if (range === 'today') { if (checkin.date !== today) continue; }
    if (checkin.activities) { for (const act of checkin.activities) { if (counts[act.category] !== undefined) counts[act.category] += act.hours || 0; } }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) { barsContainer.style.display = 'none'; chartEmpty.style.display = 'block'; }
  else {
    chartEmpty.style.display = 'none'; barsContainer.style.display = 'flex';
    // Weekly target hours per category (reasonable weekly goals)
    const weeklyTargets = { 'Career': 20, 'Self': 5, 'Home Duties': 5, 'Family': 10 };
    // Scale targets based on range
    const targetScale = range === 'today' ? 1/5 : range === 'week' ? 1 : null;
    const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };
    const maxTarget = targetScale ? Math.max(...CATEGORY_ORDER.map(c => weeklyTargets[c] * targetScale)) : 0;
    const maxHours = Math.max(...Object.values(counts), maxTarget, 1);
    barsContainer.innerHTML = CATEGORY_ORDER.map(cat => {
      const hours = counts[cat], pct = (hours / maxHours) * 100;
      const target = targetScale ? weeklyTargets[cat] * targetScale : 0;
      const targetPct = target ? (target / maxHours) * 100 : 0;
      const targetMarker = targetPct > 0 ? `<div class="bar-target" style="left:${targetPct}%" title="${Math.round(target)}h target"></div>` : '';
      return `<div class="bar-row"><div class="bar-label">${cat}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${colors[cat]||'#ccc'};"></div>${targetMarker}</div><div class="bar-value">${hours}h</div></div>`;
    }).join('');
  }

  const container = document.getElementById('completedList');
  const empty = document.getElementById('completedEmpty');
  let items = data.completedItems || [];
  if (range === 'today') items = items.filter(i => i.date === today);
  else if (range === 'week') items = items.filter(i => { const d = new Date(i.date + 'T12:00:00'); return d >= weekStart && d <= weekEnd; });

  if (items.length === 0) { container.style.display = 'none'; empty.style.display = 'block'; empty.textContent = range === 'today' ? 'Nothing logged today yet.' : 'Check in to start tracking wins.'; }
  else {
    empty.style.display = 'none'; container.style.display = 'block';
    container.innerHTML = items.map(item => {
      const tagClass = categoryTagClass(item.category);
      const hours = item.hours ? `<span class="hours">${item.hours}h</span>` : '';
      return `<div class="completed-item"><span class="checkmark">✓</span><span class="category-tag ${tagClass}">${item.category}</span><span>${escapeHtml(item.text)}</span>${hours}</div>`;
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
  const weekCheckins = checkins.filter(c => { const d = new Date(c.date + 'T12:00:00'); return d >= weekStart && d <= weekEnd; });
  if (weekCheckins.length === 0) { container.style.display = 'none'; empty.style.display = 'block'; return; }
  empty.style.display = 'none'; container.style.display = 'block';
  const sorted = [...weekCheckins].sort((a, b) => b.date.localeCompare(a.date));
  container.innerHTML = sorted.map(day => {
    const d = new Date(day.date + 'T12:00:00');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const summary = day.summary || (day.activities || []).map(a => a.text).join(', ') || 'No activities logged';
    return `<div class="day-entry"><div class="day-date">${dayName}</div><div class="day-items">${escapeHtml(summary)}</div></div>`;
  }).join('');
}

// --- Diet ---

function renderDiet(diet) {
  const container = document.getElementById('dietSection');
  const empty = document.getElementById('dietEmpty');
  if (!diet || (!diet.entries.length && !diet.weights.length)) { container.style.display = 'none'; empty.style.display = 'block'; return; }
  empty.style.display = 'none'; container.style.display = 'block';

  // Merge localStorage weight updates into diet.weights (persist across refresh)
  const localWeights = JSON.parse(localStorage.getItem('myweek-weight-updates') || '[]');
  for (const lw of localWeights) {
    if (!diet.weights.find(w => w.date === lw.date && w.lbs === lw.lbs)) {
      diet.weights.push(lw);
    }
  }
  diet.weights.sort((a, b) => a.date.localeCompare(b.date));

  let html = '';
  const goalWeight = diet.goalWeight || 190;
  const startWeight = diet.startWeight || 214;
  if (diet.weights && diet.weights.length > 0) {
    const latest = diet.weights[diet.weights.length - 1];
    const totalToLose = startWeight - goalWeight;
    const lost = startWeight - latest.lbs;
    const pct = Math.max(0, Math.min(100, (lost / totalToLose) * 100));
    const latestDate = new Date(latest.date + 'T12:00:00');
    const dateLabel = latestDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Calculate avg daily calorie deficit from diet entries
    // TDEE for 40yo active man ≈ 2300 cal/day
    const TDEE = 2300;
    let deficitHtml = '';
    if (diet.entries && diet.entries.length > 0) {
      const entriesWithCals = diet.entries.filter(e => e.calories);
      if (entriesWithCals.length > 0) {
        let totalIntake = 0;
        for (const e of entriesWithCals) {
          // Parse ranges like "1600-1900" → average
          const cal = String(e.calories);
          if (cal.includes('-')) {
            const [lo, hi] = cal.split('-').map(Number);
            totalIntake += (lo + hi) / 2;
          } else {
            totalIntake += parseFloat(cal) || 0;
          }
        }
        const avgIntake = Math.round(totalIntake / entriesWithCals.length);
        const avgDeficit = TDEE - avgIntake;

        if (avgDeficit > 0 && lost > 0) {
          // Estimate goal date based on deficit (3500 cal ≈ 1 lb)
          const lbsPerDay = avgDeficit / 3500;
          const remaining = latest.lbs - goalWeight;
          const daysToGo = Math.ceil(remaining / lbsPerDay);
          const estDate = new Date();
          estDate.setDate(estDate.getDate() + daysToGo);
          const estLabel = estDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          deficitHtml = `<div class="weight-estimate">Avg intake ~<strong>${avgIntake} cal</strong> vs. ~${TDEE} burn = ~<strong>${avgDeficit} cal/day deficit</strong>. At this pace, ${goalWeight} lbs around <strong>${estLabel}</strong></div>`;
        } else if (avgDeficit > 0) {
          deficitHtml = `<div class="weight-estimate">Avg intake ~<strong>${avgIntake} cal</strong> vs. ~${TDEE} burn = ~<strong>${avgDeficit} cal/day deficit</strong></div>`;
        }
      }
    }

    html += `<div class="weight-tracker">
      <div class="weight-header">
        <span class="weight-current"><strong>${latest.lbs}</strong> lbs</span>
        <span class="weight-date">${dateLabel}</span>
      </div>
      <div class="weight-bar-container">
        <div class="weight-bar-track">
          <div class="weight-bar-fill" style="width: ${pct}%"></div>
          <div class="weight-bar-marker" style="left: ${pct}%"></div>
        </div>
        <div class="weight-bar-labels">
          <span>${startWeight}</span>
          <span class="weight-goal-label">Goal: ${goalWeight} lbs</span>
        </div>
      </div>
      ${lost > 0 ? `<div class="weight-progress">${lost} lbs down, ${latest.lbs - goalWeight} to go</div>` : ''}
      ${deficitHtml}
      <div class="weight-input-row">
        <input type="number" id="weightInput" class="weight-input" placeholder="New weight..." step="0.1" min="100" max="300">
        <button id="weightSaveBtn" class="weight-save-btn">Update</button>
      </div>
    </div>`;
  }
  if (diet.entries && diet.entries.length > 0) {
    const recent = [...diet.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    html += '<div class="diet-entries">' + recent.map(e => {
      const d = new Date(e.date + 'T12:00:00');
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      let macrosHtml = '';
      if (e.calories) {
        macrosHtml = `<div class="diet-macros">
          <span class="macro">~${e.calories} cal</span>
          ${e.protein ? `<span class="macro">P: ${e.protein}</span>` : ''}
          ${e.carbs ? `<span class="macro">C: ${e.carbs}</span>` : ''}
          ${e.fat ? `<span class="macro">F: ${e.fat}</span>` : ''}
          ${e.sodium ? `<span class="macro">Na: ${e.sodium}</span>` : ''}
          ${e.fiber ? `<span class="macro">Fib: ${e.fiber}</span>` : ''}
        </div>`;
      }
      return `<div class="diet-entry"><span class="diet-date">${dayName}</span><div><span class="diet-note">${escapeHtml(e.note)}</span>${macrosHtml}</div></div>`;
    }).join('') + '</div>';
  }
  container.innerHTML = html;

  // Weight save — stores in localStorage for sync
  const weightBtn = document.getElementById('weightSaveBtn');
  const weightInput = document.getElementById('weightInput');
  if (weightBtn && weightInput) {
    weightBtn.addEventListener('click', () => {
      const val = parseFloat(weightInput.value);
      if (!val || val < 100 || val > 300) return;
      const weights = JSON.parse(localStorage.getItem('myweek-weight-updates') || '[]');
      weights.push({ date: getTodayStr(), lbs: val });
      localStorage.setItem('myweek-weight-updates', JSON.stringify(weights));
      // Update display immediately
      diet.weights.push({ date: getTodayStr(), lbs: val });
      renderDiet(diet);
    });
    weightInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') weightBtn.click();
    });
  }
}

// --- Did You Know ---

function renderDidYouKnow(facts) {
  const el = document.getElementById('dykText');
  if (!facts || facts.length === 0) { el.textContent = ''; return; }
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % facts.length;
  el.textContent = facts[dayIndex];
}

// --- Task list ---

function getTaskState() { try { return JSON.parse(localStorage.getItem('myweek-tasks')) || {}; } catch { return {}; } }
function saveTaskState(state) { localStorage.setItem('myweek-tasks', JSON.stringify(state)); }

function getTaskEdits() { try { return JSON.parse(localStorage.getItem('myweek-task-edits')) || {}; } catch { return {}; } }
function saveTaskEdits(edits) { localStorage.setItem('myweek-task-edits', JSON.stringify(edits)); }

function getTaskMoves() { try { return JSON.parse(localStorage.getItem('myweek-task-moves')) || {}; } catch { return {}; } }
function saveTaskMoves(moves) { localStorage.setItem('myweek-task-moves', JSON.stringify(moves)); }

function getHiddenRecurring() { try { return JSON.parse(localStorage.getItem('myweek-hidden-recurring')) || {}; } catch { return {}; } }
function saveHiddenRecurring(hidden) { localStorage.setItem('myweek-hidden-recurring', JSON.stringify(hidden)); }

function countSyncChanges() {
  const state = getTaskState();
  let count = 0;
  for (const key of Object.keys(state)) { if (key !== '_added' && key !== '_synced') count++; }
  const added = state._added || {};
  for (const cat of Object.keys(added)) count += added[cat].length;
  const edits = getTaskEdits();
  count += Object.keys(edits).length;
  const moves = getTaskMoves();
  for (const cat of Object.keys(moves)) count += Object.keys(moves[cat]).length;
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
  const edits = getTaskEdits();
  const lines = ['Task list changes to sync:\n'];
  for (const [key, val] of Object.entries(state)) {
    if (key === '_added' || key === '_synced') continue;
    const parts = key.split('::');
    lines.push(`${val ? '[x]' : '[ ]'} ${parts[0]}: ${parts[parts.length - 1]}`);
  }
  for (const [key, val] of Object.entries(edits)) {
    const parts = key.split('::');
    lines.push(`[EDIT] ${parts[0]}: "${parts[parts.length - 1]}" → "${val}"`);
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
  const edits = getTaskEdits();
  const moves = getTaskMoves();
  const { weekStart, weekEnd } = getWeekRange();

  // Read collapse state from localStorage
  const collapseState = {};
  CATEGORY_ORDER.forEach(cat => {
    const stored = localStorage.getItem('task-collapse-' + cat);
    collapseState[cat] = stored === null ? true : stored === 'true'; // default collapsed
  });

  container.innerHTML = CATEGORY_ORDER.map(cat => {
    const group = tasks[cat];
    if (!group) return '';
    const tagClass = categoryTagClass(cat);
    const isCollapsed = collapseState[cat];

    // Recurring items — filter hidden
    const hiddenRecurring = getHiddenRecurring();
    const recurring = (group.recurring || []).filter((item, i) => !hiddenRecurring[`${cat}::${i}::${item.text}`]);
    const allRecurring = group.recurring || [];
    const recurringHtml = recurring.length > 0 ? recurring.map((item) => {
      const i = allRecurring.indexOf(item);
      const key = `${cat}::recurring::${i}::${item.text}`;
      const hideKey = `${cat}::${i}::${item.text}`;
      const displayText = edits[key] || item.text;

      let sessionsHtml = '';
      if (item.sessions) {
        const thisWeek = item.sessions.filter(s => { const d = new Date(s.date + 'T12:00:00'); return d >= weekStart && d <= weekEnd; });
        let nextDateValue = item.nextSession || getTodayStr();
        let nextHtml = '';
        if (item.nextSession) {
          const nextD = new Date(nextDateValue + 'T12:00:00');
          const nextLabel = nextD.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          nextHtml = `<div class="session-item session-open">
            <input type="checkbox" class="session-checkbox" data-key="${cat}::session::${i}::next">
            <span>Next: ${nextLabel}</span>
            <input type="date" class="session-date-picker session-date-hidden" data-key="${cat}::session-date::${i}" value="${nextDateValue}">
          </div>`;
        } else {
          nextHtml = `<div class="session-item session-open">
            <input type="checkbox" class="session-checkbox" data-key="${cat}::session::${i}::next">
            <span>Next session</span>
            <input type="date" class="session-date-picker session-date-hidden" data-key="${cat}::session-date::${i}" value="${nextDateValue}">
          </div>`;
        }
        const nextOpen = nextHtml;
        const sessionItems = thisWeek.map((s, si) => {
          const d = new Date(s.date + 'T12:00:00');
          const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          const note = s.note ? ` — ${escapeHtml(s.note)}` : '';
          return `<div class="session-item session-done">
            <input type="checkbox" class="session-checkbox" data-key="${cat}::session::${i}::${si}" checked disabled>
            <span class="session-done-text">${label}${note}</span>
          </div>`;
        }).join('');
        sessionsHtml = `<div class="sessions-list">${sessionItems}${nextOpen}</div>`;
      }

      return `<div class="task-item recurring-item">
        <span class="task-text" data-editable="true" data-edit-key="${key}">${escapeHtml(displayText)}</span>
        <button class="hide-recurring-btn" data-hide-key="${hideKey}" title="Hide">&times;</button>
      </div>${sessionsHtml}`;
    }).join('') : '';

    // Projects — apply moves from localStorage
    let nowItems = [...(group.now || [])];
    let backlogItems = [...(group.backlog || [])];
    const catMoves = moves[cat] || {};
    for (const [itemText, target] of Object.entries(catMoves)) {
      if (target === 'backlog') {
        const idx = nowItems.findIndex(it => it.text === itemText);
        if (idx >= 0) { backlogItems.unshift(nowItems.splice(idx, 1)[0]); }
      } else if (target === 'now') {
        const idx = backlogItems.findIndex(it => it.text === itemText);
        if (idx >= 0) { nowItems.push(backlogItems.splice(idx, 1)[0]); }
      }
    }

    const nowHtml = nowItems.map((item, i) => renderTaskItem(item, cat, `now-${i}`, state, edits, 'backlog')).join('');
    const backlogHtml = backlogItems.map((item, i) => renderTaskItem(item, cat, `backlog-${i}`, state, edits, 'now')).join('');

    const hasRecurring = recurring.length > 0;
    const hasNow = nowItems.length > 0;
    const hasBacklog = backlogItems.length > 0;
    const hasProjects = hasNow || hasBacklog;

    let projectsHtml = '';
    if (hasProjects) {
      projectsHtml = `${hasNow ? `<div class="project-section"><h4 class="project-section-title now-title">Now</h4>${nowHtml}</div>` : ''}
        ${hasBacklog ? `<div class="project-section"><h4 class="project-section-title backlog-title">Backlog</h4>${backlogHtml}</div>` : ''}`;
    }

    let recurringHtmlBlock = '';
    if (hasRecurring) {
      recurringHtmlBlock = `<div class="recurring-section">
        <h4 class="project-section-title recurring-title">Recurring</h4>
        ${recurringHtml}
      </div>`;
    }

    const totalCount = recurring.length + nowItems.length + backlogItems.length;
    const descText = group.description ? ` <span class="task-cat-desc">(${escapeHtml(group.description)})</span>` : '';

    return `<div class="task-group ${isCollapsed ? 'collapsed' : ''}" data-cat="${cat}">
      <div class="task-group-header" data-cat="${cat}">
        <span class="task-group-arrow">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
        <span class="category-tag ${tagClass} task-cat-title">${cat}</span>${descText}
        <span class="task-count">${totalCount}</span>
      </div>
      <div class="task-group-items" data-cat="${cat}">
        ${projectsHtml}${recurringHtmlBlock}
      </div>
    </div>`;
  }).join('');

  // Collapse toggle — persist state
  container.querySelectorAll('.task-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.task-group');
      const cat = group.dataset.cat;
      group.classList.toggle('collapsed');
      const collapsed = group.classList.contains('collapsed');
      header.querySelector('.task-group-arrow').innerHTML = collapsed ? '&#9656;' : '&#9662;';
      localStorage.setItem('task-collapse-' + cat, collapsed);
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

  // Session checkboxes — also capture date
  container.querySelectorAll('.session-checkbox:not([disabled])').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const st = getTaskState();
      const dateInput = e.target.closest('.session-item').querySelector('.session-date-picker');
      const dateVal = dateInput ? dateInput.value : getTodayStr();
      st[e.target.dataset.key] = e.target.checked ? dateVal : false;
      saveTaskState(st);
      updateSyncButton();
    });
  });

  // Move buttons
  container.querySelectorAll('.move-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mv = getTaskMoves();
      const cat = btn.dataset.cat;
      const text = btn.dataset.text;
      const target = btn.dataset.moveTo;
      if (!mv[cat]) mv[cat] = {};
      mv[cat][text] = target;
      saveTaskMoves(mv);
      renderTasks(tasks);
      updateSyncButton();
    });
  });

  // Double-click to edit task text
  container.querySelectorAll('.task-text[data-editable]').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const key = span.dataset.editKey;
      const current = span.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'task-edit-input';
      span.replaceWith(input);
      input.focus();
      input.select();

      const save = () => {
        const newVal = input.value.trim();
        const newSpan = document.createElement('span');
        newSpan.className = 'task-text';
        newSpan.dataset.editable = 'true';
        newSpan.dataset.editKey = key;
        newSpan.textContent = newVal || current;
        input.replaceWith(newSpan);

        if (newVal && newVal !== current) {
          const ed = getTaskEdits();
          ed[key] = newVal;
          saveTaskEdits(ed);
          updateSyncButton();
        }
      };

      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });

  // Subtask toggle
  container.querySelectorAll('.subtask-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.subtaskKey;
      const list = container.querySelector(`.subtask-list[data-subtask-key="${key}"]`);
      if (list) list.classList.toggle('subtask-collapsed');
    });
  });

  // Add subtask — trigger shows input
  container.querySelectorAll('.add-subtask-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const row = trigger.closest('.add-subtask-row');
      const input = row.querySelector('.add-subtask-input');
      trigger.style.display = 'none';
      input.classList.remove('add-subtask-hidden');
      input.focus();
    });
  });

  container.querySelectorAll('.add-subtask-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const st = getTaskState();
        if (!st._addedSubs) st._addedSubs = {};
        const parentKey = input.dataset.parent;
        if (!st._addedSubs[parentKey]) st._addedSubs[parentKey] = [];
        st._addedSubs[parentKey].push({ text: input.value.trim() });
        saveTaskState(st);
        renderTasks(tasks);
        updateSyncButton();
      }
      if (e.key === 'Escape') {
        input.classList.add('add-subtask-hidden');
        input.closest('.add-subtask-row').querySelector('.add-subtask-trigger').style.display = '';
      }
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) {
        input.classList.add('add-subtask-hidden');
        const trigger = input.closest('.add-subtask-row').querySelector('.add-subtask-trigger');
        if (trigger) trigger.style.display = '';
      }
    });
  });

  // Delete original subtask
  container.querySelectorAll('.delete-sub-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = getTaskState();
      if (!st._deletedSubs) st._deletedSubs = {};
      const parentKey = btn.dataset.parent;
      const subIdx = parseInt(btn.dataset.subIndex);
      if (!st._deletedSubs[parentKey]) st._deletedSubs[parentKey] = [];
      if (!st._deletedSubs[parentKey].includes(subIdx)) st._deletedSubs[parentKey].push(subIdx);
      saveTaskState(st);
      renderTasks(tasks);
      updateSyncButton();
    });
  });

  // Delete added subtask
  container.querySelectorAll('.delete-added-sub-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = getTaskState();
      const parentKey = btn.dataset.parent;
      const subIdx = parseInt(btn.dataset.subIndex);
      if (st._addedSubs && st._addedSubs[parentKey]) {
        st._addedSubs[parentKey].splice(subIdx, 1);
        saveTaskState(st);
        renderTasks(tasks);
        updateSyncButton();
      }
    });
  });

  // Hide recurring
  container.querySelectorAll('.hide-recurring-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = getHiddenRecurring();
      hidden[btn.dataset.hideKey] = true;
      saveHiddenRecurring(hidden);
      renderTasks(tasks);
      updateSyncButton();
    });
  });

  // Sync
  document.getElementById('syncBtn').onclick = async () => {
    const summary = generateSyncSummary();
    try {
      await navigator.clipboard.writeText(summary);
      // Clear all sync state
      const st = getTaskState();
      const keysToRemove = Object.keys(st).filter(k => k !== '_added' && k !== '_synced' && k !== '_addedSubs' && k !== '_deletedSubs');
      keysToRemove.forEach(k => delete st[k]);
      if (st._added) delete st._added;
      if (st._addedSubs) delete st._addedSubs;
      if (st._deletedSubs) delete st._deletedSubs;
      saveTaskState(st);
      saveTaskEdits({});
      saveTaskMoves({});
      localStorage.removeItem('myweek-weight-updates');
      updateSyncButton();
      const btn = document.getElementById('syncBtn');
      btn.innerHTML = 'Synced!';
      btn.classList.add('sync-copied');
      setTimeout(() => { btn.style.display = 'none'; btn.classList.remove('sync-copied'); }, 2000);
    } catch { prompt('Copy this and paste in Claude Code:', summary); }
  };
}

function renderTaskItem(item, cat, index, state, edits, moveTarget) {
  const key = `${cat}::${index}::${item.text}`;
  const checked = state[key] || item.done;
  const doneClass = checked ? 'task-done' : '';

  const displayText = edits[key] || item.text;

  let textHtml;
  if (item.link) {
    textHtml = `<span class="task-text" data-editable="true" data-edit-key="${key}"><a href="${item.link}" target="_blank" class="task-link">${escapeHtml(displayText)}</a></span>`;
  } else {
    textHtml = `<span class="task-text" data-editable="true" data-edit-key="${key}">${escapeHtml(displayText)}</span>`;
  }

  let deadlineHtml = '';
  if (item.deadline) {
    const dl = new Date(item.deadline + 'T12:00:00');
    const daysUntil = Math.ceil((dl - new Date()) / (1000 * 60 * 60 * 24));
    const dlLabel = dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (daysUntil <= 3) {
      deadlineHtml = `<span class="deadline-urgent">due ${dlLabel}</span>`;
    } else if (daysUntil <= 7) {
      deadlineHtml = `<span class="deadline-soon">due ${dlLabel}</span>`;
    } else {
      deadlineHtml = `<span class="deadline-later">due ${dlLabel}</span>`;
    }
  }

  const moveLabel = moveTarget === 'now' ? '↑' : '↓';
  const moveTitle = moveTarget === 'now' ? 'Move to Working on Now' : 'Move to Backlog';
  const moveBtn = `<button class="move-btn" data-cat="${cat}" data-text="${escapeHtml(item.text)}" data-move-to="${moveTarget}" title="${moveTitle}">${moveLabel}</button>`;

  // Subtasks
  const addedSubs = getTaskState()._addedSubs || {};
  const addedForThis = addedSubs[key] || [];
  const deletedSubs = getTaskState()._deletedSubs || {};
  const deletedForThis = deletedSubs[key] || [];

  let subtasksHtml = '';
  const allSubs = [...(item.subtasks || [])];
  const hasSubtasks = allSubs.some((s, si) => !deletedForThis.includes(si)) || addedForThis.length > 0;

  if (hasSubtasks || allSubs.length > 0) {
    const subItems = allSubs.map((sub, si) => {
      const subKey = `${cat}::${index}::sub-${si}::${sub.text}`;
      if (deletedForThis.includes(si)) return '';
      const subChecked = state[subKey] || sub.done;
      const subDisplay = edits[subKey] || sub.text;
      return `<div class="task-item subtask ${subChecked ? 'task-done' : ''}">
        <input type="checkbox" class="task-checkbox" data-key="${subKey}" ${subChecked ? 'checked' : ''}>
        <span class="task-text" data-editable="true" data-edit-key="${subKey}">${escapeHtml(subDisplay)}</span>
        <button class="delete-sub-btn" data-parent="${key}" data-sub-index="${si}" title="Remove">&times;</button>
      </div>`;
    }).join('');

    const addedSubItems = addedForThis.map((sub, si) => {
      const subKey = `${cat}::${index}::addedsub-${si}::${sub.text}`;
      const subChecked = state[subKey] || false;
      return `<div class="task-item subtask ${subChecked ? 'task-done' : ''}">
        <input type="checkbox" class="task-checkbox" data-key="${subKey}" ${subChecked ? 'checked' : ''}>
        <span class="task-text" data-editable="true" data-edit-key="${subKey}">${escapeHtml(sub.text)}</span>
        <button class="delete-added-sub-btn" data-parent="${key}" data-sub-index="${si}" title="Remove">&times;</button>
      </div>`;
    }).join('');

    const subCount = allSubs.filter((s, si) => !deletedForThis.includes(si)).length + addedForThis.length;
    subtasksHtml = `<div class="subtask-list subtask-collapsed" data-subtask-key="${key}">
      ${subItems}${addedSubItems}
      <div class="add-subtask-row">
        <span class="add-subtask-trigger" data-parent="${key}">+ subtask</span>
        <input type="text" class="add-subtask-input add-subtask-hidden" data-parent="${key}" placeholder="Add subtask and press Enter...">
      </div>
    </div>`;

    const toggleBtn = `<button class="subtask-toggle-btn" data-subtask-key="${key}" title="Show subtasks">${subCount}</button>`;
    return `<div class="task-item ${doneClass}">
      <input type="checkbox" class="task-checkbox" data-key="${key}" ${checked ? 'checked' : ''}>
      ${textHtml}${deadlineHtml}${toggleBtn}${moveBtn}
    </div>${subtasksHtml}`;
  }

  return `<div class="task-item ${doneClass}">
    <input type="checkbox" class="task-checkbox" data-key="${key}" ${checked ? 'checked' : ''}>
    ${textHtml}${deadlineHtml}${moveBtn}
  </div>`;
}

// --- Notes for Claude (via Gmail) ---

function getNotes() { try { return JSON.parse(localStorage.getItem('myweek-notes')) || []; } catch { return []; } }
function saveNotes(notes) { localStorage.setItem('myweek-notes', JSON.stringify(notes)); }

function sendNoteViaGmail(text) {
  const subject = encodeURIComponent('Notes for Claude — ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
  const body = encodeURIComponent(text);
  window.open(`https://mail.google.com/mail/?view=cm&to=${NOTES_EMAIL}&su=${subject}&body=${body}`, '_blank');
}

function renderNotes() {
  const container = document.getElementById('savedNotes');
  const notes = getNotes();

  container.innerHTML = notes.length === 0 ? '' : notes.map((n, i) => `
    <div class="note-item">
      <span class="note-text">${escapeHtml(n.text)}</span>
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

    // Save locally
    const ns = getNotes();
    ns.push({ text, timestamp: Date.now() });
    saveNotes(ns);

    // Open Gmail compose with the note
    sendNoteViaGmail(text);

    input.value = '';
    renderNotes();
  };

  document.getElementById('notesInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('saveNoteBtn').click();
    }
  });

  // FAB panel toggle
  const fab = document.getElementById('notesFab');
  const panel = document.getElementById('notesPanel');
  const overlay = document.getElementById('notesOverlay');
  const closeBtn = document.getElementById('notesPanelClose');

  function openNotes() { panel.classList.add('open'); overlay.classList.add('open'); fab.style.display = 'none'; }
  function closeNotes() { panel.classList.remove('open'); overlay.classList.remove('open'); fab.style.display = 'flex'; }

  if (!fab._bound) {
    fab._bound = true;
    fab.addEventListener('click', openNotes);
    overlay.addEventListener('click', closeNotes);
    closeBtn.addEventListener('click', closeNotes);
  }

  // Show badge on FAB if there are notes
  const noteCount = getNotes().length;
  if (noteCount > 0) {
    fab.setAttribute('data-count', noteCount);
  } else {
    fab.removeAttribute('data-count');
  }
}

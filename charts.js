// charts.js — Dashboard visualizations and rendering

// ---------------------------------------------------------------------------
// Helper: weekday-aware streak calculation
// ---------------------------------------------------------------------------
function getWeekdayStreak(checkinDates) {
  const dateSet = new Set(checkinDates);
  let streak = 0;
  let d = new Date();
  if (!dateSet.has(formatDateStr(d))) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 90; i++) {
    const ds = formatDateStr(d);
    if (isWeekday(ds)) {
      if (dateSet.has(ds)) streak++;
      else break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function getBestWeekdayStreak(checkinDates) {
  const dateSet = new Set(checkinDates);
  const sorted = [...checkinDates].sort();
  if (sorted.length === 0) return 0;
  let best = 0, current = 0;
  let d = new Date(sorted[0] + 'T12:00:00');
  const end = new Date(sorted[sorted.length - 1] + 'T12:00:00');
  while (d <= end) {
    const ds = formatDateStr(d);
    if (isWeekday(ds)) {
      if (dateSet.has(ds)) { current++; best = Math.max(best, current); }
      else current = 0;
    }
    d.setDate(d.getDate() + 1);
  }
  return best;
}

// ---------------------------------------------------------------------------
// 1. renderMomentumDots(checkins)
// ---------------------------------------------------------------------------
function renderMomentumDots(checkins) {
  const container = document.getElementById('momentumDots');
  const { weekStart } = getWeekRange();
  const days = ['M', 'T', 'W', 'T', 'F'];
  const today = getTodayStr();
  const checkinMap = {};
  for (const c of (checkins || [])) checkinMap[c.date] = c;
  const allDates = (checkins || []).map(c => c.date);
  const streak = getWeekdayStreak(allDates);
  const bestStreak = getBestWeekdayStreak(allDates);
  let streakHtml = '';
  if (streak >= 3) {
    streakHtml = `<span class="streak-flame">\uD83D\uDD25 ${streak}d streak</span>`;
    if (streak < bestStreak) streakHtml += ` <span class="streak-best">best: ${bestStreak}d</span>`;
  }
  container.innerHTML = days.map((label, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = formatDateStr(d);
    const checkin = checkinMap[dateStr];
    const filled = !!checkin;
    const isToday = dateStr === today;
    let dayHours = 0;
    if (checkin && checkin.activities) for (const a of checkin.activities) dayHours += a.hours || 0;
    const glow = dayHours >= 6;
    const classes = ['dot-day'];
    if (filled) classes.push('dot-filled');
    if (isToday) classes.push('dot-today');
    if (glow) classes.push('dot-glow');
    return `<div class="${classes.join(' ')}"><span class="dot-label">${label}</span><span class="dot-circle"></span></div>`;
  }).join('') + (streakHtml ? `<div class="streak-indicator">${streakHtml}</div>` : '');
}

// ---------------------------------------------------------------------------
// 2. renderEncouragement(data)
// ---------------------------------------------------------------------------
function renderEncouragement(data) {
  const el = document.getElementById('encouragement');
  const { weekStart, weekEnd } = getWeekRange();
  const today = getTodayStr();
  const weekCheckins = (data.checkins || []).filter(c => {
    const d = new Date(c.date + 'T12:00:00');
    return d >= weekStart && d <= weekEnd && isWeekday(c.date);
  });
  if (weekCheckins.length === 0) { el.textContent = 'Start your first check-in to see your week come alive.'; return; }
  let todayHours = 0;
  const todayCheckin = weekCheckins.find(c => c.date === today);
  if (todayCheckin && todayCheckin.activities) for (const a of todayCheckin.activities) todayHours += a.hours || 0;
  let totalWeekHours = 0;
  const hours = {};
  for (const c of weekCheckins) for (const a of (c.activities || [])) { hours[a.category] = (hours[a.category] || 0) + (a.hours || 0); totalWeekHours += a.hours || 0; }
  const daysActive = weekCheckins.length;
  const weeklyAvg = daysActive > 0 ? (totalWeekHours / daysActive).toFixed(1) : 0;
  let topCat = null, topHours = 0;
  for (const [cat, h] of Object.entries(hours)) { if (h > topHours) { topCat = cat; topHours = h; } }
  let msg = todayHours > 0 ? `${todayHours}h today, ${weeklyAvg}h avg this week` : `${weeklyAvg}h avg this week across ${daysActive} weekday${daysActive > 1 ? 's' : ''}`;
  if (topCat === 'Career' && topHours >= 2) msg += ` \u2014 ${topHours}h invested in Career. Future you will thank you.`;
  else if (topCat === 'Family' && topHours >= 4) msg += ` \u2014 ${topHours}h with Family this week. They notice.`;
  else if (topCat === 'Self' && topHours >= 2) msg += ` \u2014 ${topHours}h on Self. You're taking care of yourself.`;
  else if (totalWeekHours > 0) msg += ` \u2014 you're showing up across ${Object.keys(hours).length} categories.`;
  el.textContent = msg;
}

// ---------------------------------------------------------------------------
// 3. renderKPIStrip(data)
// ---------------------------------------------------------------------------
function renderKPIStrip(data) {
  const container = document.getElementById('kpiStrip');
  const { weekStart, weekEnd } = getWeekRange();
  const weekCheckins = (data.checkins || []).filter(c => {
    const d = new Date(c.date + 'T12:00:00');
    return d >= weekStart && d <= weekEnd && isWeekday(c.date);
  });

  const daysActive = weekCheckins.length;
  const ringRadius = 20;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringFill = (daysActive / 5) * ringCircumference;
  const ringGap = ringCircumference - ringFill;

  const daysActiveHtml = `<div class="kpi-card">
    <div class="kpi-value">
      <svg width="50" height="50" viewBox="0 0 50 50" class="kpi-ring">
        <circle cx="25" cy="25" r="${ringRadius}" fill="none" stroke="#e5e7eb" stroke-width="4"/>
        <circle cx="25" cy="25" r="${ringRadius}" fill="none" stroke="#34d399" stroke-width="4"
          stroke-dasharray="${ringFill} ${ringGap}" stroke-linecap="round" transform="rotate(-90 25 25)"/>
        <text x="25" y="25" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="600" fill="#1f2937">${daysActive}/5</text>
      </svg>
    </div>
    <div class="kpi-label">weekdays active</div>
  </div>`;

  let totalHours = 0;
  for (const c of weekCheckins) for (const a of (c.activities || [])) totalHours += a.hours || 0;
  const avgPerDay = daysActive > 0 ? (totalHours / daysActive).toFixed(1) : '0.0';
  const hoursHtml = `<div class="kpi-card"><div class="kpi-value">${totalHours}<span class="kpi-unit">h</span></div><div class="kpi-label">tracked</div><div class="kpi-secondary">avg ${avgPerDay}h/day</div></div>`;

  let weightHtml = '';
  const diet = data.diet;
  if (diet && diet.weights && diet.weights.length > 0) {
    const localWeights = JSON.parse(localStorage.getItem('myweek-weight-updates') || '[]');
    const allWeights = [...diet.weights];
    for (const lw of localWeights) { if (!allWeights.find(w => w.date === lw.date && w.lbs === lw.lbs)) allWeights.push(lw); }
    allWeights.sort((a, b) => a.date.localeCompare(b.date));
    const latest = allWeights[allWeights.length - 1];
    const remaining = latest.lbs - (diet.goalWeight || 190);
    const arrow = remaining > 0 ? '\u2193' : '\u2713';
    weightHtml = `<div class="kpi-card"><div class="kpi-value">${latest.lbs}<span class="kpi-unit">lbs</span></div><div class="kpi-label">${remaining > 0 ? remaining + ' to goal ' + arrow : 'At goal!'}</div></div>`;
  }

  const allDates = (data.checkins || []).map(c => c.date);
  const streak = getWeekdayStreak(allDates);
  const bestStreak = getBestWeekdayStreak(allDates);
  const flame = streak >= 3 ? ' \uD83D\uDD25' : '';
  const bestLabel = (streak < bestStreak && bestStreak > 1) ? `<div class="kpi-secondary">best: ${bestStreak}d</div>` : '';
  const streakHtml = `<div class="kpi-card"><div class="kpi-value">${streak}${flame}</div><div class="kpi-label">weekday streak</div>${bestLabel}</div>`;

  container.innerHTML = daysActiveHtml + hoursHtml + (weightHtml || '') + streakHtml;
}

// ---------------------------------------------------------------------------
// 4. renderWinsAndTime(data, range)
// ---------------------------------------------------------------------------
function renderWinsAndTime(data, range) {
  const barsContainer = document.getElementById('categoryBars');
  const chartEmpty = document.getElementById('chartEmpty');
  const counts = {};
  const activitiesByCat = {};
  for (const cat of CATEGORY_ORDER) { counts[cat] = 0; activitiesByCat[cat] = []; }
  const { weekStart, weekEnd } = getWeekRange();
  const today = getTodayStr();

  const allCheckins = data.checkins || [];
  const weeklyAvgByCat = {};
  if (allCheckins.length > 0) {
    const catTotals = {};
    for (const cat of CATEGORY_ORDER) catTotals[cat] = 0;
    const weekMap = {};
    for (const c of allCheckins) {
      if (!isWeekday(c.date)) continue;
      const d = new Date(c.date + 'T12:00:00');
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const ws = new Date(d); ws.setDate(d.getDate() - diff);
      const weekKey = formatDateStr(ws);
      if (!weekMap[weekKey]) weekMap[weekKey] = {};
      for (const a of (c.activities || [])) weekMap[weekKey][a.category] = (weekMap[weekKey][a.category] || 0) + (a.hours || 0);
    }
    const totalWeeks = Object.keys(weekMap).length || 1;
    for (const weekData of Object.values(weekMap)) for (const cat of CATEGORY_ORDER) catTotals[cat] += weekData[cat] || 0;
    for (const cat of CATEGORY_ORDER) weeklyAvgByCat[cat] = catTotals[cat] / totalWeeks;
  }

  for (const checkin of allCheckins) {
    if (!isWeekday(checkin.date)) continue;
    if (range === 'week') { const d = new Date(checkin.date + 'T12:00:00'); if (d < weekStart || d > weekEnd) continue; }
    else if (range === 'today') { if (checkin.date !== today) continue; }
    if (checkin.activities) for (const act of checkin.activities) {
      if (counts[act.category] !== undefined) { counts[act.category] += act.hours || 0; activitiesByCat[act.category].push({ text: act.text, hours: act.hours || 0, date: checkin.date }); }
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };

  if (total === 0) { barsContainer.style.display = 'none'; chartEmpty.style.display = 'block'; }
  else {
    chartEmpty.style.display = 'none'; barsContainer.style.display = 'flex';
    const maxHours = Math.max(...Object.values(counts), ...Object.values(weeklyAvgByCat).map(v => v || 0), 1);
    barsContainer.innerHTML = CATEGORY_ORDER.map(cat => {
      const hours = counts[cat];
      const pct = (hours / maxHours) * 100;
      const avg = weeklyAvgByCat[cat] || 0;
      const avgPct = (avg / maxHours) * 100;
      const avgMarker = avg > 0 ? `<div class="bar-avg-marker" style="left:${Math.min(avgPct, 100)}%" title="~${avg.toFixed(1)}h weekly avg"></div>` : '';
      const avgLabel = avg > 0 ? ` / ~${avg.toFixed(0)}h avg` : '';
      return `<div class="bar-row"><div class="bar-label">${cat}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${colors[cat] || '#ccc'};"></div>${avgMarker}</div><div class="bar-value">${hours}h${avgLabel}</div></div>`;
    }).join('');
  }

  // Completed items
  const container = document.getElementById('completedList');
  const empty = document.getElementById('completedEmpty');
  let items = (data.completedItems || []).filter(i => isWeekday(i.date));
  if (range === 'today') items = items.filter(i => i.date === today);
  else if (range === 'week') items = items.filter(i => { const d = new Date(i.date + 'T12:00:00'); return d >= weekStart && d <= weekEnd; });

  if (items.length === 0) {
    container.style.display = 'none'; empty.style.display = 'block';
    empty.textContent = range === 'today' ? 'Nothing logged today yet.' : 'Check in to start tracking wins.';
  } else {
    empty.style.display = 'none'; container.style.display = 'block';
    const rangeLabel = range === 'today' ? 'today' : 'this week';
    let html = `<div class="wins-headline">${items.length} win${items.length > 1 ? 's' : ''} ${rangeLabel}</div>`;
    const grouped = {};
    for (const item of items) { if (!grouped[item.date]) grouped[item.date] = []; grouped[item.date].push(item); }
    const sortedDays = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    for (const dateStr of sortedDays) {
      const d = new Date(dateStr + 'T12:00:00');
      let dayLabel;
      if (dateStr === today) dayLabel = 'Today';
      else { const yest = new Date(); yest.setDate(yest.getDate() - 1); dayLabel = dateStr === formatDateStr(yest) ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); }
      html += `<div class="completed-day-header">${dayLabel}</div>`;
      for (const item of grouped[dateStr]) {
        const tagClass = categoryTagClass(item.category);
        const hoursSpan = item.hours ? `<span class="hours">${item.hours}h</span>` : '';
        html += `<div class="completed-item"><span class="checkmark">\u2713</span><span class="category-tag ${tagClass}">${item.category}</span><span>${escapeHtml(item.text)}</span>${hoursSpan}</div>`;
      }
    }
    container.innerHTML = html;
  }
}

// ---------------------------------------------------------------------------
// 5. renderWeeklyObjectives(tasks) — Auto-generated from thisWeek subtasks
// ---------------------------------------------------------------------------
// Build list of recurring habit texts for filtering
function getRecurringTexts(tasks) {
  const texts = [];
  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group || !group.recurring) continue;
    for (const item of group.recurring) {
      if (item.recurring === 'ongoing') continue;
      texts.push(item.text.toLowerCase());
      const short = item.text.replace(/\s*\(.*?\)/g, '').trim().toLowerCase();
      if (short !== item.text.toLowerCase()) texts.push(short);
    }
  }
  return texts;
}

function renderWeeklyObjectives(tasks) {
  const list = document.getElementById('weeklyObjectives');
  if (!list) return;

  const state = getTaskState();
  const thisWeekState = getThisWeekState();
  const todayState = getTodayState();
  const edits = getTaskEdits();
  const objectives = [];
  const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };

  for (const cat of CATEGORY_ORDER) {
    const { now: nowItems } = getResolvedItems(tasks, cat);
    nowItems.forEach((item, itemIdx) => {
      if (item.done) return;
      const origIdx = (tasks[cat].now || []).findIndex(t => t.text === item.text);
      const idx = origIdx >= 0 ? origIdx : itemIdx;

      if (item.subtasks && item.subtasks.length > 0) {
        item.subtasks.forEach((sub, si) => {
          const subKey = `${cat}::now-${idx}::sub-${si}::${sub.text}`;
          const isThisWeek = thisWeekState.hasOwnProperty(subKey) ? thisWeekState[subKey] : !!sub.thisWeek;
          if (!isThisWeek) return;
          const isDone = sub.done || state[subKey];
          objectives.push({ text: edits[subKey] || sub.text, project: item.text, category: cat, color: colors[cat], key: subKey, done: isDone });
        });
        const parentKey = `${cat}::now-${idx}::${item.text}`;
        const addedSubs = (state._addedSubs || {})[parentKey] || [];
        addedSubs.forEach((sub, si) => {
          const subKey = `${cat}::now-${idx}::addedsub-${si}::${sub.text}`;
          const isThisWeek = thisWeekState.hasOwnProperty(subKey) ? thisWeekState[subKey] : false;
          if (!isThisWeek) return;
          const isDone = state[subKey] || false;
          objectives.push({ text: sub.text, project: item.text, category: cat, color: colors[cat], key: subKey, done: isDone });
        });
      } else {
        const taskKey = `${cat}::now-${idx}::${item.text}`;
        const isThisWeek = thisWeekState.hasOwnProperty(taskKey) ? thisWeekState[taskKey] : !!item.thisWeek;
        if (!isThisWeek) return;
        const isDone = item.done || state[taskKey];
        objectives.push({ text: item.text, project: null, category: cat, color: colors[cat], key: taskKey, done: isDone });
      }
    });
  }

  // Filter out items in today (they show in the Today list instead)
  // Filter out items that match recurring habits
  const recurringTexts = getRecurringTexts(tasks);
  const filtered = objectives.filter(obj => {
    if (todayState[obj.key]) return false;
    const lower = obj.text.toLowerCase();
    if (recurringTexts.some(rt => lower.includes(rt) || rt.includes(lower))) return false;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<li class="empty-state">Mark subtasks as "this week" in your projects to populate objectives.</li>';
    return;
  }

  list.innerHTML = filtered.map(obj => {
    const doneClass = obj.done ? 'obj-done' : '';
    const projectLabel = obj.project ? `<span class="obj-project-name">${escapeHtml(obj.project)}</span>` : '';
    return `<li class="${doneClass}">
      <span class="obj-cat-dot" style="background:${obj.color}"></span>
      <input type="checkbox" class="obj-checkbox" data-key="${obj.key}" ${obj.done ? 'checked' : ''}>
      <span class="obj-text" data-edit-key="${obj.key}">${escapeHtml(obj.text)}</span>
      ${projectLabel}
      <span class="obj-actions">
        <button class="obj-today-btn" data-key="${obj.key}" title="Move to today">&#9650;</button>
        <button class="obj-unstar-btn" data-key="${obj.key}" title="Remove from this week">&#9734;</button>
        <button class="obj-delete-btn" data-key="${obj.key}" title="Delete task">&times;</button>
      </span>
    </li>`;
  }).join('');

  // Wire up checkboxes
  list.querySelectorAll('.obj-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const st = getTaskState();
      st[cb.dataset.key] = cb.checked;
      saveTaskState(st);
      cb.closest('li').classList.toggle('obj-done', cb.checked);
      updateSyncButton();
      renderProjectsAgenda(appData.tasks);
    });
  });

  // Double-click to edit text inline
  list.querySelectorAll('.obj-text').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const key = span.dataset.editKey;
      const current = span.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'obj-edit-input';
      span.replaceWith(input);
      input.focus();
      input.select();
      const save = () => {
        const newVal = input.value.trim();
        const newSpan = document.createElement('span');
        newSpan.className = 'obj-text';
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
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });

  // Move to today
  list.querySelectorAll('.obj-today-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const td = getTodayState();
      td[btn.dataset.key] = true;
      saveTodayState(td);
      updateSyncButton();
      renderWeeklyObjectives(tasks);
      renderTodayTasks(appData);
      renderProjectsAgenda(appData.tasks);
    });
  });

  // Un-star: remove from weekly focus without deleting
  list.querySelectorAll('.obj-unstar-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tw = getThisWeekState();
      tw[btn.dataset.key] = false;
      saveThisWeekState(tw);
      updateSyncButton();
      renderWeeklyObjectives(tasks);
      renderProjectsAgenda(appData.tasks);
    });
  });

  // Delete: mark task as done and remove from focus
  list.querySelectorAll('.obj-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.key;
      const st = getTaskState();
      st[key] = true;
      saveTaskState(st);
      const tw = getThisWeekState();
      tw[key] = false;
      saveThisWeekState(tw);
      updateSyncButton();
      renderWeeklyObjectives(tasks);
      renderProjectsAgenda(appData.tasks);
    });
  });
}

// ---------------------------------------------------------------------------
// 6. renderWeightCard(diet) — Horizontal accomplishment-forward bar
// ---------------------------------------------------------------------------
function renderWeightCard(diet) {
  const container = document.getElementById('weightSection');
  if (!container) return;
  if (!diet || !diet.weights || diet.weights.length === 0) {
    container.innerHTML = '<p class="empty-state">No weight data yet.</p>';
    return;
  }

  const localWeights = JSON.parse(localStorage.getItem('myweek-weight-updates') || '[]');
  const allWeights = [...diet.weights];
  for (const lw of localWeights) { if (!allWeights.find(w => w.date === lw.date && w.lbs === lw.lbs)) allWeights.push(lw); }
  allWeights.sort((a, b) => a.date.localeCompare(b.date));

  const goalWeight = diet.goalWeight || 190;
  const startWeight = diet.startWeight || allWeights[0].lbs;
  const latest = allWeights[allWeights.length - 1];
  const totalToLose = startWeight - goalWeight;
  const lost = Math.max(0, startWeight - latest.lbs);
  const remaining = Math.max(0, latest.lbs - goalWeight);
  const pctLost = totalToLose > 0 ? Math.min(100, (lost / totalToLose) * 100) : 0;

  const lastDate = new Date(latest.date + 'T12:00:00');
  const lastDateLabel = lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Milestone ticks (no labels, just small tick marks on the bar)
  let milestonesHtml = '';
  for (let m = 5; m <= totalToLose; m += 5) {
    const pct = (m / totalToLose) * 100;
    const reached = lost >= m;
    milestonesHtml += `<div class="weight-milestone ${reached ? 'weight-milestone-reached' : ''}" style="left:${pct}%">
      <div class="weight-milestone-tick"></div>
    </div>`;
  }

  container.innerHTML = `<div class="weight-horizontal">
    <div class="weight-stats-row">
      <div class="weight-stat-big">
        <span class="weight-stat-value">${lost}</span>
        <span class="weight-stat-label">lbs lost</span>
      </div>
      <div class="weight-stat-secondary">
        <span class="weight-stat-value">${remaining}</span>
        <span class="weight-stat-label">to go</span>
      </div>
    </div>
    <div class="weight-bar-wrapper">
      <div class="weight-bar-labels">
        <span>${startWeight} lbs</span>
        <span>${goalWeight} lbs</span>
      </div>
      <div class="weight-bar-track">
        <div class="weight-bar-fill" style="width:${pctLost}%"></div>
        ${pctLost > 0 ? `<div class="weight-bar-marker" style="left:${pctLost}%">
          <div class="weight-marker-dot"></div>
          <span class="weight-marker-label">${latest.lbs} lbs</span>
        </div>` : ''}
        ${milestonesHtml}
      </div>
    </div>
    <div class="weight-current-label">Current: ${latest.lbs} lbs — last weighed ${lastDateLabel}</div>
    <div class="weight-input-row">
      <input type="number" id="weightInput" class="weight-input" placeholder="Log weight..." step="0.1" min="100" max="300">
      <button id="weightSaveBtn" class="weight-save-btn">Update</button>
    </div>
  </div>`;

  const weightBtn = document.getElementById('weightSaveBtn');
  const weightInput = document.getElementById('weightInput');
  if (weightBtn && weightInput) {
    weightBtn.addEventListener('click', () => {
      const val = parseFloat(weightInput.value);
      if (!val || val < 100 || val > 300) return;
      const weights = JSON.parse(localStorage.getItem('myweek-weight-updates') || '[]');
      weights.push({ date: getTodayStr(), lbs: val });
      localStorage.setItem('myweek-weight-updates', JSON.stringify(weights));
      diet.weights.push({ date: getTodayStr(), lbs: val });
      renderWeightCard(diet);
      renderKPIStrip(appData);
      updateSyncButton();
    });
    weightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') weightBtn.click(); });
  }
}

// ---------------------------------------------------------------------------
// 7. renderDayByDay(checkins, dietEntries) — Collapsible by week
// ---------------------------------------------------------------------------
function renderDayByDay(checkins, dietEntries) {
  const container = document.getElementById('dayByDay');
  const empty = document.getElementById('daysEmpty');

  if (!checkins || checkins.length === 0) {
    container.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  container.style.display = 'block';

  const dietMap = {};
  if (dietEntries && Array.isArray(dietEntries)) for (const e of dietEntries) dietMap[e.date] = e;

  const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };
  const sorted = [...checkins].sort((a, b) => b.date.localeCompare(a.date));

  // Group by week
  const weekGroups = {};
  for (const day of sorted) {
    const d = new Date(day.date + 'T12:00:00');
    const dayOfWeek = d.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const ws = new Date(d);
    ws.setDate(d.getDate() - diff);
    const weekKey = formatDateStr(ws);
    if (!weekGroups[weekKey]) weekGroups[weekKey] = [];
    weekGroups[weekKey].push(day);
  }

  const weekKeys = Object.keys(weekGroups).sort((a, b) => b.localeCompare(a));
  const today = getTodayStr();

  container.innerHTML = weekKeys.map(weekKey => {
    const ws = new Date(weekKey + 'T12:00:00');
    const we = new Date(ws);
    we.setDate(ws.getDate() + 4);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const label = `Week of ${fmt(ws)} – ${fmt(we)}`;
    const collapseKey = `collapse-week-${weekKey}`;
    const stored = localStorage.getItem(collapseKey);
    const isCollapsed = stored !== null ? stored === 'true' : true;
    const days = weekGroups[weekKey];

    const daysHtml = days.map(day => {
      const d = new Date(day.date + 'T12:00:00');
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      let totalHrs = 0;
      for (const a of (day.activities || [])) totalHrs += a.hours || 0;
      const activityHtml = (day.activities || []).map(a => {
        const color = colors[a.category] || '#ccc';
        return `<div class="day-activity-item" style="border-left: 3px solid ${color};"><span class="day-activity-text">${escapeHtml(a.text)}</span>${a.hours ? `<span class="day-activity-hours">${a.hours}h</span>` : ''}</div>`;
      }).join('');
      const wins = (day.wins || '').trim();
      const winsHtml = wins ? `<div class="day-wins"><strong>Wins:</strong> ${escapeHtml(wins)}</div>` : '';
      const mood = (day.mood || '').trim();
      const moodHtml = mood ? `<div class="day-mood">${escapeHtml(mood)}</div>` : '';
      const dietEntry = dietMap[day.date];
      const dietHtml = dietEntry && dietEntry.note ? `<div class="day-diet">${escapeHtml(dietEntry.note)}</div>` : '';
      return `<div class="day-entry"><div class="day-entry-header"><span class="day-date">${dayName}</span><span class="day-hours">${totalHrs}h tracked</span></div><div class="day-activities">${activityHtml}</div>${winsHtml}${moodHtml}${dietHtml}</div>`;
    }).join('');

    return `<div class="week-group ${isCollapsed ? 'collapsed' : ''}" data-week="${weekKey}">
      <div class="week-group-header" data-week="${weekKey}">
        <span class="week-group-arrow">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
        <span class="week-group-label">${label}</span>
        <span class="week-group-count">${days.length} day${days.length > 1 ? 's' : ''}</span>
      </div>
      <div class="week-group-items">${daysHtml}</div>
    </div>`;
  }).join('');

  // Toggle collapse
  container.querySelectorAll('.week-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.week-group');
      group.classList.toggle('collapsed');
      const collapsed = group.classList.contains('collapsed');
      header.querySelector('.week-group-arrow').innerHTML = collapsed ? '&#9656;' : '&#9662;';
      localStorage.setItem('collapse-week-' + header.dataset.week, collapsed);
    });
  });
}

// ---------------------------------------------------------------------------
// 8. renderIdentityVotes(data)
// ---------------------------------------------------------------------------
function renderIdentityVotes(data) {
  const container = document.getElementById('identityVotes');
  if (!container) return;
  const checkins = data.checkins || [];
  const { weekStart, weekEnd } = getWeekRange();
  const statements = [];
  const allDates = checkins.map(c => c.date);
  const streak = getWeekdayStreak(allDates);
  if (streak >= 2) statements.push({ priority: streak >= 5 ? 4 : 3, text: `You've tracked ${streak} consecutive weekdays \u2014 that's consistency.` });
  const weekCheckins = checkins.filter(c => { const d = new Date(c.date + 'T12:00:00'); return d >= weekStart && d <= weekEnd && isWeekday(c.date); });
  const weekCats = new Set();
  for (const c of weekCheckins) for (const a of (c.activities || [])) weekCats.add(a.category);
  if (weekCats.size === 4) statements.push({ priority: 5, text: "Activity in all 4 categories this week \u2014 that's balance." });
  const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  let workoutCount = 0;
  for (const c of checkins) { const d = new Date(c.date + 'T12:00:00'); if (d < twoWeeksAgo) continue; for (const a of (c.activities || [])) { const t = a.text.toLowerCase(); if (t.includes('workout') || t.includes('gym') || t.includes('trainer') || t.includes('exercise')) workoutCount++; } }
  if (workoutCount >= 2) statements.push({ priority: workoutCount >= 4 ? 4 : 2, text: `${workoutCount} workouts in 14 days \u2014 you're building an exercise habit.` });
  const weekCompleted = (data.completedItems || []).filter(i => { const d = new Date(i.date + 'T12:00:00'); return d >= weekStart && d <= weekEnd && isWeekday(i.date); });
  if (weekCompleted.length >= 3) statements.push({ priority: weekCompleted.length >= 8 ? 4 : 2, text: `${weekCompleted.length} wins this week \u2014 you're getting things done.` });
  if (statements.length === 0) container.innerHTML = '<p class="identity-vote">Keep showing up \u2014 your data tells your story.</p>';
  else { statements.sort((a, b) => b.priority - a.priority); container.innerHTML = `<p class="identity-vote">${statements[0].text}</p>`; }
}

// ---------------------------------------------------------------------------
// 8b. renderTodayTasks(data) — Today's task list inside focus card
// ---------------------------------------------------------------------------
function renderTodayTasks(data) {
  const container = document.getElementById('todayTasks');
  if (!container) return;

  const tasks = data.tasks;
  if (!tasks) { container.innerHTML = ''; return; }

  const todayState = getTodayState();
  const state = getTaskState();
  const edits = getTaskEdits();
  const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };
  const items = [];

  for (const cat of CATEGORY_ORDER) {
    const { now: nowItems } = getResolvedItems(tasks, cat);
    nowItems.forEach((item, itemIdx) => {
      if (item.done) return;
      const origIdx = (tasks[cat].now || []).findIndex(t => t.text === item.text);
      const idx = origIdx >= 0 ? origIdx : itemIdx;

      if (item.subtasks && item.subtasks.length > 0) {
        item.subtasks.forEach((sub, si) => {
          const subKey = `${cat}::now-${idx}::sub-${si}::${sub.text}`;
          if (!todayState[subKey]) return;
          const isDone = sub.done || state[subKey];
          items.push({ text: edits[subKey] || sub.text, project: item.text, category: cat, color: colors[cat], key: subKey, done: isDone });
        });
        const parentKey = `${cat}::now-${idx}::${item.text}`;
        const addedSubs = (state._addedSubs || {})[parentKey] || [];
        addedSubs.forEach((sub, si) => {
          const subKey = `${cat}::now-${idx}::addedsub-${si}::${sub.text}`;
          if (!todayState[subKey]) return;
          const isDone = state[subKey] || false;
          items.push({ text: sub.text, project: item.text, category: cat, color: colors[cat], key: subKey, done: isDone });
        });
      } else {
        const taskKey = `${cat}::now-${idx}::${item.text}`;
        if (!todayState[taskKey]) return;
        const isDone = item.done || state[taskKey];
        items.push({ text: item.text, project: null, category: cat, color: colors[cat], key: taskKey, done: isDone });
      }
    });
  }

  if (items.length === 0) {
    container.innerHTML = '<p class="today-empty">Pull items from Weekly Objectives using the <strong>&uarr;</strong> button.</p>';
    return;
  }

  container.innerHTML = '<div class="today-header">Today</div>' +
    '<ul class="today-list">' + items.map(obj => {
    const doneClass = obj.done ? 'obj-done' : '';
    const projectLabel = obj.project ? `<span class="obj-project-name">${escapeHtml(obj.project)}</span>` : '';
    return `<li class="${doneClass}">
      <span class="obj-cat-dot" style="background:${obj.color}"></span>
      <input type="checkbox" class="today-checkbox" data-key="${obj.key}" ${obj.done ? 'checked' : ''}>
      <span class="today-text" data-edit-key="${obj.key}">${escapeHtml(obj.text)}</span>
      ${projectLabel}
      <span class="today-actions">
        <button class="today-to-week-btn" data-key="${obj.key}" title="Move back to weekly">&darr;</button>
        <button class="today-remove-btn" data-key="${obj.key}" title="Remove from week">&times;</button>
      </span>
    </li>`;
  }).join('') + '</ul>';

  // Checkboxes
  container.querySelectorAll('.today-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const st = getTaskState();
      st[cb.dataset.key] = cb.checked;
      saveTaskState(st);
      cb.closest('li').classList.toggle('obj-done', cb.checked);
      updateSyncButton();
      renderProjectsAgenda(appData.tasks);
    });
  });

  // Double-click to edit
  container.querySelectorAll('.today-text').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const key = span.dataset.editKey;
      const current = span.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'obj-edit-input';
      span.replaceWith(input);
      input.focus();
      input.select();
      const save = () => {
        const newVal = input.value.trim();
        const newSpan = document.createElement('span');
        newSpan.className = 'today-text';
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
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });

  // Move back to week
  container.querySelectorAll('.today-to-week-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const td = getTodayState();
      delete td[btn.dataset.key];
      saveTodayState(td);
      updateSyncButton();
      renderTodayTasks(data);
      renderWeeklyObjectives(appData.tasks);
    });
  });

  // Remove from week entirely
  container.querySelectorAll('.today-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.key;
      const td = getTodayState();
      delete td[key];
      saveTodayState(td);
      const tw = getThisWeekState();
      tw[key] = false;
      saveThisWeekState(tw);
      updateSyncButton();
      renderTodayTasks(data);
      renderWeeklyObjectives(appData.tasks);
      renderProjectsAgenda(appData.tasks);
    });
  });
}

// ---------------------------------------------------------------------------
// 9. renderDailyFocus(data) — Editable focus text + today tasks
// ---------------------------------------------------------------------------
function renderDailyFocus(data) {
  const contentEl = document.getElementById('dailyFocusContent');
  const empty = document.getElementById('focusEmpty');
  const title = document.getElementById('focusTitle');
  const breadcrumb = document.getElementById('yesterdayBreadcrumb');

  title.textContent = 'My Focus Today';

  // Focus text — shows yesterdayNotes (today's plan, set during yesterday's check-in)
  const editedFocus = getDailyFocusEdit();
  const focusContent = editedFocus || data.yesterdayNotes;

  if (focusContent) {
    empty.style.display = 'none';
    contentEl.style.display = 'block';
    const isEdited = !!editedFocus;
    contentEl.innerHTML = `<div class="focus-text-editable ${isEdited ? 'focus-edited' : ''}" contenteditable="true" data-placeholder="Click to set your focus for today...">${escapeHtml(focusContent || '')}</div>`;

    const editable = contentEl.querySelector('.focus-text-editable');
    if (!editable.textContent.trim()) editable.textContent = '';
    editable.addEventListener('blur', () => {
      const newText = editable.textContent.trim();
      if (newText && newText !== data.yesterdayNotes) {
        saveDailyFocusEdit(newText);
        editable.classList.add('focus-edited');
        updateSyncButton();
      } else if (!newText || newText === data.yesterdayNotes) {
        saveDailyFocusEdit('');
        editable.classList.remove('focus-edited');
      }
    });
    editable.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); editable.blur(); }
    });
  } else {
    contentEl.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent = 'No focus set for today.';
  }

  // Overarching goal breadcrumb
  if (breadcrumb) {
    if (data.dailyFocus) {
      breadcrumb.innerHTML = `<div class="yesterday-reminder"><div class="yesterday-reminder-label">Overarching goal</div><div class="yesterday-reminder-text">${escapeHtml(data.dailyFocus)}</div></div>`;
      breadcrumb.style.display = 'block';
    } else {
      breadcrumb.style.display = 'none';
    }
  }

  // Render today tasks below focus text
  renderTodayTasks(data);

  // Day toggle removed — card is always "today"
  const dayToggle = document.getElementById('dayToggle');
  if (dayToggle) dayToggle.style.display = 'none';
}

// ---------------------------------------------------------------------------
// 10. renderProjectsAgenda(tasks) — Card grid with thisWeek toggle
// ---------------------------------------------------------------------------
let _expandedProjIdx = null;

function renderProjectsAgenda(tasks) {
  const container = document.getElementById('projectsAgenda');
  const empty = document.getElementById('projectsEmpty');
  if (!container) return;

  const projects = [];
  const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };

  for (const cat of CATEGORY_ORDER) {
    const { now: nowItems } = getResolvedItems(tasks, cat);
    nowItems.forEach((item) => {
      if (item.done) return;
      const origIdx = (tasks[cat].now || []).findIndex(t => t.text === item.text);
      projects.push({
        text: item.text,
        category: cat,
        color: colors[cat],
        deadline: item.deadline || null,
        subtasks: item.subtasks || [],
        thisWeek: item.thisWeek || false,
        origIdx: origIdx >= 0 ? origIdx : 0
      });
    });
  }

  if (projects.length === 0) {
    container.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  container.style.display = 'grid';

  const state = getTaskState();
  const thisWeekState = getThisWeekState();
  const todayState = getTodayState();
  const addedSubs = state._addedSubs || {};
  const deletedSubs = state._deletedSubs || {};

  container.innerHTML = projects.map((proj, pi) => {
    const totalSubs = proj.subtasks.length;
    const doneSubs = proj.subtasks.filter((s, si) => {
      const key = `${proj.category}::now-${proj.origIdx}::sub-${si}::${s.text}`;
      return s.done || state[key];
    }).length;
    const pct = totalSubs > 0 ? Math.round((doneSubs / totalSubs) * 100) : 0;
    const barColor = pct === 100 ? '#7db87d' : proj.color;

    let deadlineHtml = '';
    if (proj.deadline) {
      const dl = new Date(proj.deadline + 'T12:00:00');
      const daysUntil = Math.ceil((dl - new Date()) / (1000 * 60 * 60 * 24));
      const dlLabel = dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (daysUntil <= 3) deadlineHtml = `<span class="deadline-urgent">due ${dlLabel}</span>`;
      else if (daysUntil <= 7) deadlineHtml = `<span class="deadline-soon">due ${dlLabel}</span>`;
      else deadlineHtml = `<span class="deadline-later">due ${dlLabel}</span>`;
    }

    const tagClass = categoryTagClass(proj.category);

    // Expanded content: subtasks with checkboxes and thisWeek toggles
    const parentKey = `${proj.category}::now-${proj.origIdx}::${proj.text}`;
    const addedForThis = addedSubs[parentKey] || [];
    const deletedForThis = deletedSubs[parentKey] || [];

    const subtasksHtml = proj.subtasks.map((sub, si) => {
      if (deletedForThis.includes(si)) return '';
      const subKey = `${proj.category}::now-${proj.origIdx}::sub-${si}::${sub.text}`;
      const isDone = sub.done || state[subKey];
      const twKey = subKey;
      const isTW = thisWeekState.hasOwnProperty(twKey) ? thisWeekState[twKey] : !!sub.thisWeek;
      const isTD = todayState[twKey] || false;
      const edits = getTaskEdits();
      const displayText = edits[subKey] || sub.text;
      const todayBtn = isTW ? `<button class="today-toggle ${isTD ? 'today-active' : ''}" data-today-key="${twKey}" title="Toggle today">T</button>` : '';
      return `<div class="proj-subtask ${isDone ? 'proj-subtask-done' : ''}">
        <input type="checkbox" class="proj-subtask-checkbox" data-key="${subKey}" ${isDone ? 'checked' : ''}>
        <span class="proj-subtask-text" data-editable="true" data-edit-key="${subKey}">${escapeHtml(displayText)}</span>
        ${todayBtn}
        <button class="this-week-toggle ${isTW ? 'this-week-active' : ''}" data-tw-key="${twKey}" title="Toggle this week">${isTW ? '\u2605' : '\u2606'}</button>
      </div>`;
    }).join('');

    const addedSubsHtml = addedForThis.map((sub, si) => {
      const subKey = `${proj.category}::now-${proj.origIdx}::addedsub-${si}::${sub.text}`;
      const isDone = state[subKey] || false;
      const isTW = thisWeekState.hasOwnProperty(subKey) ? thisWeekState[subKey] : false;
      const isTD = todayState[subKey] || false;
      const todayBtn = isTW ? `<button class="today-toggle ${isTD ? 'today-active' : ''}" data-today-key="${subKey}" title="Toggle today">T</button>` : '';
      return `<div class="proj-subtask ${isDone ? 'proj-subtask-done' : ''}">
        <input type="checkbox" class="proj-subtask-checkbox" data-key="${subKey}" ${isDone ? 'checked' : ''}>
        <span class="proj-subtask-text">${escapeHtml(sub.text)}</span>
        ${todayBtn}
        <button class="this-week-toggle ${isTW ? 'this-week-active' : ''}" data-tw-key="${subKey}" title="Toggle this week">${isTW ? '\u2605' : '\u2606'}</button>
        <button class="delete-added-sub-btn" data-parent="${parentKey}" data-sub-index="${si}" title="Remove">&times;</button>
      </div>`;
    }).join('');

    // For tasks without subtasks, show thisWeek toggle on the task itself
    let taskThisWeekHtml = '';
    if (totalSubs === 0) {
      const taskTwKey = `${proj.category}::now-${proj.origIdx}::${proj.text}`;
      const isTW = thisWeekState.hasOwnProperty(taskTwKey) ? thisWeekState[taskTwKey] : !!proj.thisWeek;
      const isTD = todayState[taskTwKey] || false;
      const todayBtn = isTW ? `<button class="today-toggle ${isTD ? 'today-active' : ''}" data-today-key="${taskTwKey}" title="Toggle today">T</button>` : '';
      taskThisWeekHtml = `${todayBtn}<button class="this-week-toggle ${isTW ? 'this-week-active' : ''}" data-tw-key="${taskTwKey}" title="Toggle this week">${isTW ? '\u2605' : '\u2606'}</button>`;
    }

    return `<div class="proj-card" data-proj="${pi}">
      <button class="proj-close-btn" data-proj="${pi}">&times;</button>
      <div class="proj-card-header" data-proj="${pi}">
        <span class="category-tag ${tagClass} proj-cat-tag">${proj.category}</span>
        <span class="proj-title">${escapeHtml(proj.text)}</span>
        ${deadlineHtml}
        ${taskThisWeekHtml}
        <span class="proj-progress-label">${totalSubs > 0 ? `${doneSubs}/${totalSubs}` : ''}</span>
      </div>
      <div class="proj-bar-track">
        <div class="proj-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="proj-expanded-content">
        ${subtasksHtml}${addedSubsHtml}
        <div class="proj-add-subtask-row">
          <span class="proj-add-trigger" data-parent="${parentKey}">+ add subtask</span>
          <input type="text" class="proj-add-subtask-input" data-parent="${parentKey}" placeholder="Add subtask and press Enter..." style="display:none;">
        </div>
        <div class="proj-move-backlog" data-cat="${proj.category}" data-text="${escapeHtml(proj.text)}" data-move-to="backlog">Move to Backlog</div>
      </div>
    </div>`;
  }).join('');

  // Restore expanded state after re-render
  if (_expandedProjIdx !== null) {
    const cards = container.querySelectorAll('.proj-card');
    if (cards[_expandedProjIdx]) {
      cards[_expandedProjIdx].classList.add('proj-card-expanded');
      cards.forEach((c, i) => { if (i !== _expandedProjIdx) c.classList.add('proj-card-hidden'); });
    }
  }

  // --- Event listeners ---

  // Card expand/collapse
  container.querySelectorAll('.proj-card-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.this-week-toggle') || e.target.closest('.today-toggle')) return;
      const card = header.closest('.proj-card');
      const pi = parseInt(card.dataset.proj);
      if (card.classList.contains('proj-card-expanded')) {
        card.classList.remove('proj-card-expanded');
        container.querySelectorAll('.proj-card').forEach(c => c.classList.remove('proj-card-hidden'));
        _expandedProjIdx = null;
      } else {
        container.querySelectorAll('.proj-card').forEach(c => {
          if (c !== card) c.classList.add('proj-card-hidden');
        });
        card.classList.add('proj-card-expanded');
        _expandedProjIdx = pi;
      }
    });
  });

  // Close button
  container.querySelectorAll('.proj-close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.proj-card');
      card.classList.remove('proj-card-expanded');
      container.querySelectorAll('.proj-card').forEach(c => c.classList.remove('proj-card-hidden'));
      _expandedProjIdx = null;
    });
  });

  // Subtask checkboxes
  container.querySelectorAll('.proj-subtask-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const st = getTaskState();
      st[cb.dataset.key] = cb.checked;
      saveTaskState(st);
      cb.closest('.proj-subtask').classList.toggle('proj-subtask-done', cb.checked);
      updateSyncButton();
      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
    });
  });

  // Double-click to edit subtask text
  container.querySelectorAll('.proj-subtask-text[data-editable]').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const key = span.dataset.editKey;
      const current = span.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'task-edit-input';
      span.replaceWith(input);
      input.focus(); input.select();
      const save = () => {
        const newVal = input.value.trim();
        const newSpan = document.createElement('span');
        newSpan.className = 'proj-subtask-text';
        newSpan.dataset.editable = 'true';
        newSpan.dataset.editKey = key;
        newSpan.textContent = newVal || current;
        input.replaceWith(newSpan);
        if (newVal && newVal !== current) {
          const ed = getTaskEdits();
          ed[key] = newVal;
          saveTaskEdits(ed);
          updateSyncButton();
          renderWeeklyObjectives(tasks);
        }
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });

  // This week toggles
  container.querySelectorAll('.this-week-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tw = getThisWeekState();
      const key = btn.dataset.twKey;
      tw[key] = !tw[key];
      if (!tw[key]) {
        delete tw[key];
        const td = getTodayState();
        if (td[key]) { delete td[key]; saveTodayState(td); }
      }
      saveThisWeekState(tw);
      updateSyncButton();
      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
      renderTodayTasks(appData);
    });
  });

  // Today toggles
  container.querySelectorAll('.today-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const td = getTodayState();
      const key = btn.dataset.todayKey;
      td[key] = !td[key];
      if (!td[key]) delete td[key];
      saveTodayState(td);
      updateSyncButton();
      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
      renderTodayTasks(appData);
    });
  });

  // Add subtask trigger
  container.querySelectorAll('.proj-add-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const row = trigger.closest('.proj-add-subtask-row');
      const input = row.querySelector('.proj-add-subtask-input');
      trigger.style.display = 'none';
      input.style.display = 'block';
      input.focus();
    });
  });

  container.querySelectorAll('.proj-add-subtask-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const st = getTaskState();
        if (!st._addedSubs) st._addedSubs = {};
        const parentKey = input.dataset.parent;
        if (!st._addedSubs[parentKey]) st._addedSubs[parentKey] = [];
        st._addedSubs[parentKey].push({ text: input.value.trim() });
        saveTaskState(st);
        renderProjectsAgenda(tasks);
        updateSyncButton();
      }
      if (e.key === 'Escape') {
        input.style.display = 'none';
        input.closest('.proj-add-subtask-row').querySelector('.proj-add-trigger').style.display = '';
      }
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) {
        input.style.display = 'none';
        const trigger = input.closest('.proj-add-subtask-row').querySelector('.proj-add-trigger');
        if (trigger) trigger.style.display = '';
      }
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
        renderProjectsAgenda(tasks);
        updateSyncButton();
      }
    });
  });

  // Move to backlog
  container.querySelectorAll('.proj-move-backlog').forEach(el => {
    el.addEventListener('click', () => {
      const mv = getTaskMoves();
      const cat = el.dataset.cat;
      const text = el.dataset.text;
      if (!mv[cat]) mv[cat] = {};
      mv[cat][text] = 'backlog';
      saveTaskMoves(mv);
      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
      renderBacklog(tasks);
      updateSyncButton();
    });
  });
}

// Helper: find the index of a project item within its category's now array
function getProjectIndex(tasks, category, text) {
  const group = tasks[category];
  if (!group || !group.now) return 0;
  return group.now.findIndex(item => item.text === text);
}

// ---------------------------------------------------------------------------
// 11. renderRecurringHabits(tasks) — Visual weekly progress cards
// ---------------------------------------------------------------------------
function getHiddenHabits() { try { return JSON.parse(localStorage.getItem('myweek-hidden-habits')) || []; } catch { return []; } }
function saveHiddenHabits(arr) { localStorage.setItem('myweek-hidden-habits', JSON.stringify(arr)); }

function renderRecurringHabits(tasks) {
  const container = document.getElementById('recurringHabits');
  if (!container) return;

  const { weekStart, weekEnd } = getWeekRange();
  const hiddenHabits = getHiddenHabits();
  const habits = [];

  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group || !group.recurring) continue;
    for (const item of group.recurring) {
      // Skip "ongoing" items (no trackable sessions)
      if (item.recurring === 'ongoing') continue;
      // Skip hidden habits
      if (hiddenHabits.includes(item.text)) continue;

      let target = 1;
      if (item.text.match(/2x/i)) target = 2;
      else if (item.text.match(/3x/i)) target = 3;

      let thisWeekCount = 0;
      if (item.sessions) {
        thisWeekCount = item.sessions.filter(s => {
          const d = new Date(s.date + 'T12:00:00');
          return d >= weekStart && d <= weekEnd;
        }).length;
      }

      // Check localStorage for logged sessions
      const state = getTaskState();
      const catIdx = (group.recurring || []).indexOf(item);
      const sessionKey = `${cat}::session::${catIdx}::next`;
      if (state[sessionKey]) thisWeekCount++;

      habits.push({
        text: item.text,
        category: cat,
        target,
        count: thisWeekCount,
        complete: thisWeekCount >= target
      });
    }
  }

  if (habits.length === 0) {
    container.innerHTML = '<p class="empty-state">No recurring habits defined.</p>';
    return;
  }

  container.innerHTML = habits.map((h, i) => {
    const r = 18;
    const circumference = 2 * Math.PI * r;
    const fill = Math.min(1, h.count / h.target) * circumference;
    const gap = circumference - fill;
    const strokeColor = h.complete ? '#7db87d' : '#f59e0b';
    const textColor = h.complete ? '#065f46' : '#333';

    // Short name: remove parenthetical details
    const shortName = h.text.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*—\s*.*/g, '').replace(/\s*\d+x\/week/i, '').trim();

    return `<div class="habit-card ${h.complete ? 'habit-card-complete' : ''}" data-habit-idx="${i}">
      <button class="habit-hide-btn" title="Hide this habit">&times;</button>
      <svg width="48" height="48" viewBox="0 0 48 48" class="habit-ring">
        <circle cx="24" cy="24" r="${r}" fill="none" stroke="#e8e8e8" stroke-width="3"/>
        <circle cx="24" cy="24" r="${r}" fill="none" stroke="${strokeColor}" stroke-width="3"
          stroke-dasharray="${fill} ${gap}" stroke-linecap="round" transform="rotate(-90 24 24)"/>
        <text x="24" y="24" text-anchor="middle" dominant-baseline="central"
          font-size="11" font-weight="600" fill="${textColor}">${h.count}/${h.target}</text>
      </svg>
      <div class="habit-name">${escapeHtml(shortName)}</div>
    </div>`;
  }).join('');

  if (hiddenHabits.length > 0) {
    container.innerHTML += `<div class="habits-show-hidden">
      <button class="habits-unhide-btn">${hiddenHabits.length} hidden — show all</button>
    </div>`;
    container.querySelector('.habits-unhide-btn').addEventListener('click', () => {
      saveHiddenHabits([]);
      renderRecurringHabits(tasks);
    });
  }

  container.querySelectorAll('.habit-hide-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.closest('.habit-card').dataset.habitIdx);
      const text = habits[idx].text;
      const hidden = getHiddenHabits();
      hidden.push(text);
      saveHiddenHabits(hidden);
      renderRecurringHabits(tasks);
    });
  });
}

// ---------------------------------------------------------------------------
// setupToggle — Main Today/Week toggle for Wins & Time
// ---------------------------------------------------------------------------
function setupToggle() {
  const mainToggle = document.getElementById('mainToggle');
  if (!mainToggle) return;
  mainToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    e.currentTarget.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderWinsAndTime(appData, btn.dataset.range);
  });
}

// charts.js — Dashboard visualizations and rendering
// Supabase-backed: all state lives on task/habit objects, persisted via db.*

// ---------------------------------------------------------------------------
// Week view offset (0 = current week, -1 = last week, +1 = next week)
// ---------------------------------------------------------------------------
let viewWeekOffset = 0;

function getViewWeekRange() {
  const { weekStart, weekEnd } = getWeekRange();
  if (viewWeekOffset === 0) return { weekStart, weekEnd };
  const offsetMs = viewWeekOffset * 7 * 24 * 60 * 60 * 1000;
  const newStart = new Date(weekStart.getTime() + offsetMs);
  newStart.setHours(0, 0, 0, 0);
  const newEnd = new Date(weekEnd.getTime() + offsetMs);
  newEnd.setHours(23, 59, 59, 999);
  return { weekStart: newStart, weekEnd: newEnd };
}

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
  const { weekStart } = getViewWeekRange();
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
  const { weekStart, weekEnd } = getViewWeekRange();

  // 1. Projects completed — count tasks where done=true in all categories' now lists
  let projectsDone = 0;
  const tasks = data.tasks || {};
  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group) continue;
    for (const item of (group.now || [])) {
      if (item.done) projectsDone++;
    }
  }
  const projectsHtml = `<div class="kpi-card"><div class="kpi-value">${projectsDone}</div><div class="kpi-label">projects done</div></div>`;

  // 2. Tasks completed this week — count from completedItems where date is in view week
  const weekItems = (data.completedItems || []).filter(i => {
    const d = new Date(i.date + 'T12:00:00');
    return d >= weekStart && d <= weekEnd;
  });
  const winsCount = weekItems.length;
  const winsHtml = `<div class="kpi-card"><div class="kpi-value">${winsCount}</div><div class="kpi-label">wins this week</div></div>`;

  // 3. Hours tracked (secondary)
  const weekCheckins = (data.checkins || []).filter(c => {
    const d = new Date(c.date + 'T12:00:00');
    return d >= weekStart && d <= weekEnd && isWeekday(c.date);
  });
  let totalHours = 0;
  const daysActive = weekCheckins.length;
  for (const c of weekCheckins) for (const a of (c.activities || [])) totalHours += a.hours || 0;
  const avgPerDay = daysActive > 0 ? (totalHours / daysActive).toFixed(1) : '0.0';
  const hoursHtml = `<div class="kpi-card"><div class="kpi-value">${totalHours}<span class="kpi-unit">h</span></div><div class="kpi-label">tracked</div><div class="kpi-secondary">avg ${avgPerDay}h/day</div></div>`;

  // 4. Weight progress (last position)
  let weightHtml = '';
  const diet = data.diet;
  if (diet && diet.weights && diet.weights.length > 0) {
    const allWeights = [...diet.weights].sort((a, b) => a.date.localeCompare(b.date));
    const latest = allWeights[allWeights.length - 1];
    const remaining = latest.lbs - (diet.goalWeight || 190);
    const arrow = remaining > 0 ? '\u2193' : '\u2713';
    weightHtml = `<div class="kpi-card"><div class="kpi-value">${latest.lbs}<span class="kpi-unit">lbs</span></div><div class="kpi-label">${remaining > 0 ? remaining + ' to goal ' + arrow : 'At goal!'}</div></div>`;
  }

  container.innerHTML = projectsHtml + winsHtml + hoursHtml + (weightHtml || '');
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
  const { weekStart, weekEnd } = getViewWeekRange();
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

  // Handle different weeks based on viewWeekOffset
  if (viewWeekOffset === -1) {
    // Show last week's completed items as accomplishments summary
    const { weekStart, weekEnd } = getViewWeekRange();
    const lastWeekItems = (appData.completedItems || []).filter(i => {
      const d = new Date(i.date + 'T12:00:00');
      return d >= weekStart && d <= weekEnd;
    });
    if (lastWeekItems.length === 0) {
      list.innerHTML = '<li class="empty-state" style="list-style:none;padding:12px 0;color:#999;font-style:italic;">No completed items recorded for last week.</li>';
    } else {
      const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };
      list.innerHTML = '<li class="obj-last-week-header" style="list-style:none;padding:0 0 8px;font-size:0.78rem;font-weight:600;color:#7db87d;text-transform:uppercase;letter-spacing:0.5px;">Last week you accomplished</li>' +
        lastWeekItems.map(item => {
          const color = colors[item.category] || '#ccc';
          return `<li style="list-style:none;display:flex;align-items:center;gap:8px;padding:5px 0;font-size:0.85rem;color:#888;">
            <span class="obj-cat-dot" style="background:${color}"></span>
            <span style="color:#7db87d;font-weight:600;">&#10003;</span>
            <span>${escapeHtml(item.text)}</span>
            ${item.hours ? `<span style="margin-left:auto;font-size:0.75rem;color:#bbb;">${item.hours}h</span>` : ''}
          </li>`;
        }).join('');
    }
    return;
  }

  // Next week: show planning input plus existing thisWeek objectives
  if (viewWeekOffset === 1) {
    // Gather existing thisWeek objectives for preview
    const existingObjs = [];
    const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };
    for (const cat of CATEGORY_ORDER) {
      const group = tasks[cat];
      if (!group) continue;
      for (const item of (group.now || [])) {
        if (item.done) continue;
        if (item.subtasks && item.subtasks.length > 0) {
          item.subtasks.forEach((sub, si) => {
            if (sub.thisWeek && !sub.done) {
              existingObjs.push({ text: sub.text, project: item.text, color: colors[cat] });
            }
          });
        } else if (item.thisWeek && !item.done) {
          existingObjs.push({ text: item.text, project: null, color: colors[cat] });
        }
      }
    }

    let existingHtml = '';
    if (existingObjs.length > 0) {
      existingHtml = `<li style="list-style:none;padding:8px 0 4px;font-size:0.72rem;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.5px;">Current objectives (${existingObjs.length})</li>` +
        existingObjs.map(obj => `<li style="list-style:none;display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.82rem;color:#888;">
          <span class="obj-cat-dot" style="background:${obj.color}"></span>
          <span>${escapeHtml(obj.text)}</span>
          ${obj.project ? `<span class="obj-project-name">${escapeHtml(obj.project)}</span>` : ''}
        </li>`).join('');
    }

    list.innerHTML = `<li class="obj-next-week-header" style="list-style:none;padding:0 0 8px;font-size:0.78rem;font-weight:600;color:#60a5fa;text-transform:uppercase;letter-spacing:0.5px;">Planning next week</li>
      <li class="empty-state" style="list-style:none;color:#999;font-style:italic;padding:4px 0 8px;">Add objectives you want to tackle next week.</li>
      ${_buildAddInputHtml('+ add objective for next week', tasks)}${existingHtml}`;
    _bindAddInput(list, tasks, 'week');
    return;
  }

  const objectives = [];
  const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };

  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group) continue;
    const nowItems = group.now || [];

    nowItems.forEach((item) => {
      if (item.done) return;

      if (item.subtasks && item.subtasks.length > 0) {
        item.subtasks.forEach((sub, si) => {
          if (!sub.thisWeek) return;
          objectives.push({
            text: sub.text, project: item.text, category: cat, color: colors[cat],
            done: sub.done, today: sub.today,
            taskId: item.id, subtaskIndex: si
          });
        });
      } else {
        if (!item.thisWeek) return;
        objectives.push({
          text: item.text, project: null, category: cat, color: colors[cat],
          done: item.done, today: item.today,
          taskId: item.id, subtaskIndex: -1
        });
      }
    });
  }

  // Filter out items marked for today (they show in the Today list)
  // Filter out items that match recurring habits
  const recurringTexts = getRecurringTexts(tasks);
  const filtered = objectives.filter(obj => {
    if (obj.today) return false;
    const lower = obj.text.toLowerCase();
    if (recurringTexts.some(rt => lower.includes(rt) || rt.includes(lower))) return false;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<li class="empty-state">Mark subtasks as "this week" in your projects, or add one below.</li>' +
      _buildAddInputHtml('+ add objective', tasks);
    _bindAddInput(list, tasks, 'week');
    return;
  }

  // Sort: incomplete first, done items sink to bottom
  const incomplete = filtered.filter(o => !o.done);
  const complete = filtered.filter(o => o.done);

  // Show subtitle for in-progress objectives
  let subtitleHtml = '';
  if (incomplete.length > 0) {
    subtitleHtml = `<li class="obj-in-progress-note" style="list-style:none;padding:0 0 6px;font-size:0.72rem;color:#999;font-style:italic;">${incomplete.length} objective${incomplete.length > 1 ? 's' : ''} in progress</li>`;
  }
  const sorted = [...incomplete, ...complete];
  const hasBoth = incomplete.length > 0 && complete.length > 0;

  // Apply saved sort order from localStorage
  const savedWeekOrder = JSON.parse(localStorage.getItem('obj-week-order') || '[]');
  if (savedWeekOrder.length > 0) {
    const orderMap = {};
    savedWeekOrder.forEach((key, idx) => orderMap[key] = idx);
    incomplete.sort((a, b) => {
      const ka = a.taskId + ':' + a.subtaskIndex;
      const kb = b.taskId + ':' + b.subtaskIndex;
      const oa = ka in orderMap ? orderMap[ka] : 9999;
      const ob = kb in orderMap ? orderMap[kb] : 9999;
      return oa - ob;
    });
  }

  const allSorted = [...incomplete, ...complete];
  list.innerHTML = subtitleHtml + allSorted.map((obj, i) => {
    const divider = (hasBoth && i === incomplete.length) ? '<li class="obj-divider"><span>completed</span></li>' : '';
    const objKey = obj.taskId + ':' + obj.subtaskIndex;
    return divider + `<li class="${obj.done ? 'obj-done' : ''}" data-obj-key="${objKey}">
      <span class="drag-handle obj-drag-handle">&#8942;</span>
      <span class="obj-cat-dot" style="background:${obj.color}"></span>
      <input type="checkbox" class="obj-checkbox" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" ${obj.done ? 'checked' : ''}>
      <span class="obj-text" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}">${escapeHtml(obj.text)}</span>
      ${obj.project ? `<span class="obj-project-name obj-project-editable" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" title="Tap to change project">${escapeHtml(obj.project)}</span>` : ''}
      <span class="obj-actions">
        ${obj.project ? `<button class="obj-move-btn" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" title="Change project">&#128193;</button>` : ''}
        <button class="obj-today-btn" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" title="Move to today">&#9650;</button>
        <button class="obj-defer-btn" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" title="Defer (remove from this week, keep in project)">&#8595;</button>
        <button class="obj-unstar-btn" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" title="Remove from this week">&#9734;</button>
        <button class="obj-delete-btn" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" title="Delete task">&times;</button>
      </span>
    </li>`;
  }).join('') + _buildAddInputHtml('+ add objective', tasks);

  // Init Sortable on weekly objectives
  if (typeof Sortable !== 'undefined') {
    const objCard = list.closest('.card');
    const focusCard = document.querySelector('.daily-focus');
    new Sortable(list, {
      animation: 150,
      handle: '.obj-drag-handle',
      ghostClass: 'sortable-ghost',
      draggable: 'li[data-obj-key]',
      preventOnFilter: false,
      forceFallback: true,
      fallbackClass: 'sortable-fallback',
      fallbackOnBody: false,
      onStart: function () {
        // Lock BOTH cards in the grid row so nothing shifts during drag
        if (objCard) { objCard.style.height = objCard.offsetHeight + 'px'; objCard.style.overflow = 'hidden'; }
        if (focusCard) { focusCard.style.height = focusCard.offsetHeight + 'px'; }
        list.style.minHeight = list.offsetHeight + 'px';
      },
      onEnd: function () {
        if (objCard) { objCard.style.height = ''; objCard.style.overflow = ''; }
        if (focusCard) { focusCard.style.height = ''; }
        list.style.minHeight = '';
        const items = list.querySelectorAll('li[data-obj-key]');
        const newOrder = Array.from(items).map(li => li.dataset.objKey).filter(Boolean);
        localStorage.setItem('obj-week-order', JSON.stringify(newOrder));
      }
    });
  }

  // Wire up checkboxes — toggle done
  list.querySelectorAll('.obj-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const taskId = cb.dataset.taskId;
      const subIdx = parseInt(cb.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        task.subtasks[subIdx].done = cb.checked;
      } else {
        task.done = cb.checked;
      }

      renderWeeklyObjectives(tasks);
      renderProjectsAgenda(appData.tasks);
      db.updateTask(taskId, { subtasks: task.subtasks, done: task.done });
    });
  });

  // Double-click to edit text inline
  list.querySelectorAll('.obj-text').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const taskId = span.dataset.taskId;
      const subIdx = parseInt(span.dataset.subIdx);
      const current = span.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'obj-edit-input';
      span.replaceWith(input);
      input.focus();
      input.select();
      const save = async () => {
        const newVal = input.value.trim();
        const newSpan = document.createElement('span');
        newSpan.className = 'obj-text';
        newSpan.dataset.taskId = taskId;
        newSpan.dataset.subIdx = subIdx;
        newSpan.textContent = newVal || current;
        input.replaceWith(newSpan);
        if (newVal && newVal !== current) {
          const found = findTaskById(tasks, taskId);
          if (!found) return;
          const task = found.task;
          if (subIdx >= 0 && task.subtasks[subIdx]) {
            task.subtasks[subIdx].text = newVal;
          } else {
            task.text = newVal;
          }
          db.updateTask(taskId, subIdx >= 0 ? { subtasks: task.subtasks } : { text: newVal });
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
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        task.subtasks[subIdx].today = true;
      } else {
        task.today = true;
      }

      // Re-render all affected views first (optimistic UI)
      renderWeeklyObjectives(tasks);
      renderTodayTasks(appData);
      renderProjectsAgenda(appData.tasks);

      // Then persist to Supabase
      if (subIdx >= 0) {
        await db.updateTask(taskId, { subtasks: task.subtasks });
      } else {
        await db.updateTask(taskId, { today: true });
      }
    });
  });

  // Defer: remove from this week but keep in project
  list.querySelectorAll('.obj-defer-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        task.subtasks[subIdx].thisWeek = false;
        task.subtasks[subIdx].today = false;
        db.updateTask(taskId, { subtasks: task.subtasks });
      } else {
        task.thisWeek = false;
        task.today = false;
        db.updateTask(taskId, { thisWeek: false, today: false });
      }

      renderWeeklyObjectives(tasks);
      renderProjectsAgenda(appData.tasks);
      renderTodayTasks(appData);
    });
  });

  // Un-star: remove from weekly focus
  list.querySelectorAll('.obj-unstar-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        task.subtasks[subIdx].thisWeek = false;
        task.subtasks[subIdx].today = false;
        db.updateTask(taskId, { subtasks: task.subtasks });
      } else {
        task.thisWeek = false;
        task.today = false;
        db.updateTask(taskId, { thisWeek: false, today: false });
      }

      renderWeeklyObjectives(tasks);
      renderProjectsAgenda(appData.tasks);
    });
  });

  // Delete: mark as done and remove from focus
  list.querySelectorAll('.obj-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        task.subtasks[subIdx].done = true;
        task.subtasks[subIdx].thisWeek = false;
        task.subtasks[subIdx].today = false;
        db.updateTask(taskId, { subtasks: task.subtasks });
      } else {
        task.done = true;
        task.thisWeek = false;
        task.today = false;
        db.updateTask(taskId, { done: true, thisWeek: false, today: false });
      }

      renderWeeklyObjectives(tasks);
      renderProjectsAgenda(appData.tasks);
    });
  });

  // Change project button — shows dropdown to move subtask to a different project
  list.querySelectorAll('.obj-move-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found || subIdx < 0) return;

      // Replace the button with a select dropdown
      const select = document.createElement('select');
      select.className = 'obj-project-picker';
      for (const cat of CATEGORY_ORDER) {
        const group = tasks[cat];
        if (!group) continue;
        for (const item of (group.now || [])) {
          if (item.done) continue;
          const opt = document.createElement('option');
          opt.value = item.id;
          opt.textContent = `${item.text} (${cat})`;
          if (item.id === taskId) opt.selected = true;
          select.appendChild(opt);
        }
      }
      btn.replaceWith(select);
      select.focus();

      const finish = async (newParentId) => {
        if (newParentId && newParentId !== taskId) {
          const newParent = findTaskById(tasks, newParentId);
          if (newParent) {
            const sub = found.task.subtasks.splice(subIdx, 1)[0];
            if (!newParent.task.subtasks) newParent.task.subtasks = [];
            newParent.task.subtasks.push(sub);
            await Promise.all([
              db.updateTask(taskId, { subtasks: found.task.subtasks }),
              db.updateTask(newParentId, { subtasks: newParent.task.subtasks }),
            ]);
          }
        }
        renderWeeklyObjectives(tasks);
        renderProjectsAgenda(appData.tasks);
      };

      select.addEventListener('change', () => finish(select.value));
      select.addEventListener('blur', () => finish(select.value));
    });
  });

  // Bind add-objective input for current week
  _bindAddInput(list, tasks, 'week');
}

// Helper: build project <option> list including "New project..." option
function _buildProjectOptions(tasks) {
  // Find or remember the "Amir General" project id for default selection
  let amirGeneralId = '';
  let options = '';
  const projectEntries = [];
  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group) continue;
    for (const item of (group.now || [])) {
      if (item.done) continue;
      projectEntries.push({ id: item.id, text: item.text, cat });
      if (item.text === 'Amir General') amirGeneralId = item.id;
    }
  }
  options += `<option value=""${!amirGeneralId ? ' selected' : ''}>No project (standalone)</option>`;
  for (const p of projectEntries) {
    const sel = (p.id === amirGeneralId) ? ' selected' : '';
    options += `<option value="${p.id}"${sel}>${escapeHtml(p.text)} (${p.cat})</option>`;
  }
  options += '<option value="__new__">+ New project...</option>';
  return options;
}

// Helper: build the add-task input row HTML
function _buildAddInputHtml(placeholder, tasks) {
  return `<li class="obj-add-row" style="list-style:none;padding:8px 0 0;">
    <input type="text" class="obj-add-input" placeholder="${placeholder}" style="width:100%;border:1px dashed #d0cdc8;border-radius:8px;padding:8px 12px;font-size:0.82rem;font-family:inherit;background:#fafaf8;">
    <select class="obj-project-select" style="width:100%;margin-top:6px;border:1px solid #d0cdc8;border-radius:8px;padding:8px 12px;font-size:0.82rem;font-family:inherit;background:#fafaf8;color:#666;">
      ${_buildProjectOptions(tasks)}
    </select>
    <div class="obj-new-project-fields" style="display:none;margin-top:6px;">
      <input type="text" class="obj-new-project-name" placeholder="Project name" style="width:100%;border:1px solid #d0cdc8;border-radius:8px;padding:8px 12px;font-size:0.82rem;font-family:inherit;background:#fafaf8;margin-bottom:6px;">
      <select class="obj-new-project-cat" style="width:100%;border:1px solid #d0cdc8;border-radius:8px;padding:8px 12px;font-size:0.82rem;font-family:inherit;background:#fafaf8;color:#666;">
        <option value="Career">Career</option>
        <option value="Self">Self</option>
        <option value="Home Duties">Home Duties</option>
        <option value="Family">Family</option>
      </select>
    </div>
  </li>`;
}

// Helper: bind the "add" input for objectives/today — mode: 'week' | 'today'
function _bindAddInput(container, tasks, mode) {
  const input = container.querySelector('.obj-add-input');
  const projectSelect = container.querySelector('.obj-project-select');
  const newProjectFields = container.querySelector('.obj-new-project-fields');
  if (!input) return;

  // Show/hide new project fields when "New project..." is selected
  if (projectSelect && newProjectFields) {
    projectSelect.addEventListener('change', () => {
      newProjectFields.style.display = projectSelect.value === '__new__' ? 'block' : 'none';
      if (projectSelect.value === '__new__') {
        newProjectFields.querySelector('.obj-new-project-name').focus();
      }
    });
  }

  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const selectedProjectId = projectSelect ? projectSelect.value : '';
    const thisWeek = true;
    const today = mode === 'today';

    // Handle "New project..." selection
    if (selectedProjectId === '__new__') {
      const projectName = newProjectFields.querySelector('.obj-new-project-name').value.trim();
      const projectCat = newProjectFields.querySelector('.obj-new-project-cat').value;
      if (!projectName) { input.placeholder = 'Enter a project name first'; return; }

      // Create the new project with the task as its first subtask
      const newSub = { text, done: false, thisWeek, today };
      const newRow = await db.insertTask({ text: projectName, category: projectCat, list: 'now', subtasks: [newSub] });
      if (!tasks[projectCat]) tasks[projectCat] = { description: '', now: [], backlog: [], recurring: [] };
      tasks[projectCat].now.push({
        id: newRow.id, text: projectName, done: false, deadline: null, link: null,
        thisWeek: false, today: false, subtasks: [newSub],
      });

      // Reset new project fields
      newProjectFields.querySelector('.obj-new-project-name').value = '';
      newProjectFields.style.display = 'none';
      projectSelect.value = '';

      _reRenderAfterAdd(tasks);
      return;
    }

    if (selectedProjectId) {
      // Add as subtask of the selected project
      const found = findTaskById(tasks, selectedProjectId);
      if (found) {
        const newSub = { text, done: false, thisWeek, today };
        found.task.subtasks.push(newSub);
        _reRenderAfterAdd(tasks);
        await db.updateTask(selectedProjectId, { subtasks: found.task.subtasks });
        return;
      }
    }

    // No project selected — try to add to "Amir General", else create standalone in Career
    let amirGeneral = null;
    for (const cat of CATEGORY_ORDER) {
      const group = tasks[cat];
      if (!group) continue;
      const found = (group.now || []).find(t => t.text === 'Amir General' && !t.done);
      if (found) { amirGeneral = { task: found, category: cat }; break; }
    }
    if (amirGeneral) {
      const newSub = { text, done: false, thisWeek, today };
      amirGeneral.task.subtasks.push(newSub);
      _reRenderAfterAdd(tasks);
      await db.updateTask(amirGeneral.task.id, { subtasks: amirGeneral.task.subtasks });
    } else {
      const newRow = await db.insertTask({ text, category: 'Career', list: 'now', thisWeek, today, subtasks: [] });
      if (!tasks['Career']) tasks['Career'] = { description: '', now: [], backlog: [], recurring: [] };
      tasks['Career'].now.push({
        id: newRow.id, text: newRow.text, done: false, deadline: null, link: null,
        thisWeek, today, subtasks: [],
      });
      _reRenderAfterAdd(tasks);
    }
  });

  input.addEventListener('focus', () => {
    input.style.borderColor = '#60a5fa';
    input.style.borderStyle = 'solid';
    input.style.background = '#fff';
    input.style.outline = 'none';
  });
  input.addEventListener('blur', () => {
    input.style.borderColor = '#d0cdc8';
    input.style.borderStyle = 'dashed';
    input.style.background = '#fafaf8';
  });
}

// Helper: re-render all task views after adding
function _reRenderAfterAdd(tasks) {
  renderWeeklyObjectives(tasks);
  renderTodayTasks(appData);
  renderProjectsAgenda(tasks);
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

  const allWeights = [...diet.weights].sort((a, b) => a.date.localeCompare(b.date));

  const goalWeight = diet.goalWeight || 190;
  const startWeight = diet.startWeight || allWeights[0].lbs;
  const latest = allWeights[allWeights.length - 1];
  const totalToLose = startWeight - goalWeight;
  const lost = Math.max(0, startWeight - latest.lbs);
  const remaining = Math.max(0, latest.lbs - goalWeight);
  const pctLost = totalToLose > 0 ? Math.min(100, (lost / totalToLose) * 100) : 0;

  const lastDate = new Date(latest.date + 'T12:00:00');
  const lastDateLabel = lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Milestone ticks
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
    weightBtn.addEventListener('click', async () => {
      const val = parseFloat(weightInput.value);
      if (!val || val < 100 || val > 300) return;
      const todayDate = getTodayStr();
      // Optimistic: update local data and re-render immediately
      diet.weights.push({ date: todayDate, lbs: val });
      renderWeightCard(diet);
      renderKPIStrip(appData);
      // Persist to Supabase
      db.insertWeight(todayDate, val);
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
  const viewWeek = getViewWeekRange();
  const viewWeekKey = formatDateStr(viewWeek.weekStart);

  // Use sessionStorage for collapse state (transient UI preference, not data)
  // When viewWeekOffset is non-zero, auto-expand that week
  container.innerHTML = weekKeys.map(weekKey => {
    const ws = new Date(weekKey + 'T12:00:00');
    const we = new Date(ws);
    we.setDate(ws.getDate() + 4);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const label = `Week of ${fmt(ws)} – ${fmt(we)}`;
    const collapseKey = `collapse-week-${weekKey}`;
    const stored = sessionStorage.getItem(collapseKey);
    const isViewWeek = weekKey === viewWeekKey;
    const isCollapsed = isViewWeek ? false : (stored !== null ? stored === 'true' : true);
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

  // Toggle collapse — use sessionStorage for transient UI state
  container.querySelectorAll('.week-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.week-group');
      group.classList.toggle('collapsed');
      const collapsed = group.classList.contains('collapsed');
      header.querySelector('.week-group-arrow').innerHTML = collapsed ? '&#9656;' : '&#9662;';
      sessionStorage.setItem('collapse-week-' + header.dataset.week, collapsed);
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

  const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };
  const items = [];

  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group) continue;
    // Check both now and backlog lists for today-flagged items
    const allItems = [...(group.now || []), ...(group.backlog || [])];

    allItems.forEach((item) => {
      if (item.done) return;

      if (item.subtasks && item.subtasks.length > 0) {
        item.subtasks.forEach((sub, si) => {
          if (!sub.today) return;
          items.push({
            text: sub.text, project: item.text, category: cat, color: colors[cat],
            done: sub.done, priority: sub.priority || 'normal', taskId: item.id, subtaskIndex: si
          });
        });
      } else {
        if (!item.today) return;
        const standaloneP = localStorage.getItem('task-priority-' + item.id);
        items.push({
          text: item.text, project: null, category: cat, color: colors[cat],
          done: item.done, priority: standaloneP === 'high' ? 'high' : 'normal', taskId: item.id, subtaskIndex: -1
        });
      }
    });
  }

  if (items.length === 0) {
    container.innerHTML = '<p class="today-empty">Pull items from Weekly Objectives using the <strong>&uarr;</strong> button, or add one below.</p>' +
      '<ul class="today-list">' + _buildAddInputHtml('+ add task for today', tasks) + '</ul>';
    container.style.display = 'block';
    _bindAddInput(container, tasks, 'today');
    return;
  }
  container.style.display = 'block';

  // Split into priority tiers: important, less important, done
  const important = items.filter(o => !o.done && o.priority === 'high');
  const lessImportant = items.filter(o => !o.done && o.priority !== 'high');
  const todayComplete = items.filter(o => o.done);

  // Apply saved sort order from localStorage within each tier
  const savedTodayOrder = JSON.parse(localStorage.getItem('obj-today-order') || '[]');
  if (savedTodayOrder.length > 0) {
    const orderMap = {};
    savedTodayOrder.forEach((key, idx) => orderMap[key] = idx);
    const applyOrder = (arr) => arr.sort((a, b) => {
      const ka = a.taskId + ':' + a.subtaskIndex;
      const kb = b.taskId + ':' + b.subtaskIndex;
      const oa = ka in orderMap ? orderMap[ka] : 9999;
      const ob = kb in orderMap ? orderMap[kb] : 9999;
      return oa - ob;
    });
    applyOrder(important);
    applyOrder(lessImportant);
  }

  const renderTodayItem = (obj) => {
    const objKey = obj.taskId + ':' + obj.subtaskIndex;
    const isHigh = obj.priority === 'high';
    return `<li class="${obj.done ? 'obj-done' : ''}" data-obj-key="${objKey}">
      <span class="drag-handle today-drag-handle">&#8942;</span>
      <span class="obj-cat-dot" style="background:${obj.color}"></span>
      <input type="checkbox" class="today-checkbox" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" ${obj.done ? 'checked' : ''}>
      <span class="today-text" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}">${escapeHtml(obj.text)}</span>
      ${obj.project ? `<span class="obj-project-name">${escapeHtml(obj.project)}</span>` : ''}
      <button class="today-priority-btn ${isHigh ? 'priority-high' : ''}" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" title="${isHigh ? 'Set normal priority' : 'Set high priority'}">!</button>
      <span class="today-actions">
        <button class="today-to-week-btn" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" title="Move back to weekly">&darr;</button>
        <button class="today-remove-btn" data-task-id="${obj.taskId}" data-sub-idx="${obj.subtaskIndex}" title="Remove from week">&times;</button>
      </span>
    </li>`;
  };

  let listHtml = '';
  if (important.length > 0) {
    listHtml += '<li class="today-tier-label today-tier-important"><span>Important</span></li>';
    listHtml += important.map(renderTodayItem).join('');
  }
  if (lessImportant.length > 0) {
    if (important.length > 0) {
      listHtml += '<li class="today-tier-label today-tier-other"><span>Less Important</span></li>';
    }
    listHtml += lessImportant.map(renderTodayItem).join('');
  }
  if (todayComplete.length > 0) {
    listHtml += '<li class="obj-divider"><span>completed</span></li>';
    listHtml += todayComplete.map(renderTodayItem).join('');
  }

  container.innerHTML = '<div class="today-header">Today</div>' +
    '<ul class="today-list">' + listHtml + _buildAddInputHtml('+ add task for today', tasks) + '</ul>';

  // Priority toggle
  container.querySelectorAll('.today-priority-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        task.subtasks[subIdx].priority = task.subtasks[subIdx].priority === 'high' ? 'normal' : 'high';
        db.updateTask(taskId, { subtasks: task.subtasks });
      } else {
        // Standalone tasks: store priority in localStorage
        const key = 'task-priority-' + taskId;
        const current = localStorage.getItem(key) === 'high' ? 'high' : 'normal';
        const newVal = current === 'high' ? 'normal' : 'high';
        localStorage.setItem(key, newVal);
      }

      renderTodayTasks(data);
    });
  });

  // Checkboxes — toggle done
  container.querySelectorAll('.today-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const taskId = cb.dataset.taskId;
      const subIdx = parseInt(cb.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        task.subtasks[subIdx].done = cb.checked;
      } else {
        task.done = cb.checked;
      }

      renderTodayTasks(data);
      renderProjectsAgenda(appData.tasks);
      db.updateTask(taskId, { subtasks: task.subtasks, done: task.done });
    });
  });

  // Double-click to edit
  container.querySelectorAll('.today-text').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const taskId = span.dataset.taskId;
      const subIdx = parseInt(span.dataset.subIdx);
      const current = span.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'obj-edit-input';
      span.replaceWith(input);
      input.focus();
      input.select();
      const save = async () => {
        const newVal = input.value.trim();
        const newSpan = document.createElement('span');
        newSpan.className = 'today-text';
        newSpan.dataset.taskId = taskId;
        newSpan.dataset.subIdx = subIdx;
        newSpan.textContent = newVal || current;
        input.replaceWith(newSpan);
        if (newVal && newVal !== current) {
          const found = findTaskById(tasks, taskId);
          if (!found) return;
          const task = found.task;
          if (subIdx >= 0 && task.subtasks[subIdx]) {
            task.subtasks[subIdx].text = newVal;
          } else {
            task.text = newVal;
          }
          db.updateTask(taskId, subIdx >= 0 ? { subtasks: task.subtasks } : { text: newVal });
        }
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });

  // Move back to week (remove from today, keep in thisWeek)
  container.querySelectorAll('.today-to-week-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        task.subtasks[subIdx].today = false;
        db.updateTask(taskId, { subtasks: task.subtasks });
      } else {
        task.today = false;
        db.updateTask(taskId, { today: false });
      }

      renderTodayTasks(data);
      renderWeeklyObjectives(appData.tasks);
    });
  });

  // Remove from week entirely (remove both today and thisWeek)
  container.querySelectorAll('.today-remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        task.subtasks[subIdx].today = false;
        task.subtasks[subIdx].thisWeek = false;
        db.updateTask(taskId, { subtasks: task.subtasks });
      } else {
        task.today = false;
        task.thisWeek = false;
        db.updateTask(taskId, { today: false, thisWeek: false });
      }

      renderTodayTasks(data);
      renderWeeklyObjectives(appData.tasks);
      renderProjectsAgenda(appData.tasks);
    });
  });

  // Bind add-task input for today
  _bindAddInput(container, tasks, 'today');

  // Init Sortable on today list
  const todayList = container.querySelector('.today-list');
  if (todayList && typeof Sortable !== 'undefined') {
    new Sortable(todayList, {
      animation: 150,
      handle: '.today-drag-handle',
      ghostClass: 'sortable-ghost',
      draggable: 'li[data-obj-key]',
      preventOnFilter: false,
      onEnd: function () {
        const items = todayList.querySelectorAll('li[data-obj-key]');
        const newOrder = Array.from(items).map(li => li.dataset.objKey).filter(Boolean);
        localStorage.setItem('obj-today-order', JSON.stringify(newOrder));
      }
    });
  }
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
  const focusContent = data.yesterdayNotes;

  if (focusContent) {
    empty.style.display = 'none';
    contentEl.style.display = 'block';
    contentEl.innerHTML = `<div class="focus-text-editable" contenteditable="true" data-placeholder="Click to set your focus for today...">${escapeHtml(focusContent || '')}</div>`;

    const editable = contentEl.querySelector('.focus-text-editable');
    if (!editable.textContent.trim()) editable.textContent = '';
    editable.addEventListener('blur', async () => {
      const newText = editable.textContent.trim();
      if (newText && newText !== data.yesterdayNotes) {
        data.yesterdayNotes = newText;
        editable.classList.add('focus-edited');
        db.updateSettings({ yesterdayNotes: newText });
      } else if (!newText || newText === data.yesterdayNotes) {
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

  // Overarching goal breadcrumb (double-click to edit)
  if (breadcrumb) {
    if (data.dailyFocus) {
      breadcrumb.innerHTML = `<div class="yesterday-reminder"><div class="yesterday-reminder-label">Overarching goal</div><div class="yesterday-reminder-text" title="Double-click to edit">${escapeHtml(data.dailyFocus)}</div></div>`;
      breadcrumb.style.display = 'block';
      const goalText = breadcrumb.querySelector('.yesterday-reminder-text');
      if (goalText) {
        goalText.style.cursor = 'text';
        goalText.addEventListener('dblclick', () => {
          const current = data.dailyFocus;
          const input = document.createElement('input');
          input.type = 'text';
          input.value = current;
          input.className = 'task-edit-input';
          input.style.width = '100%';
          input.style.fontSize = '0.88rem';
          goalText.textContent = '';
          goalText.appendChild(input);
          input.focus();
          input.select();
          const save = async () => {
            const newVal = input.value.trim();
            if (newVal && newVal !== current) {
              data.dailyFocus = newVal;
              await db.updateSettings({ dailyFocus: newVal });
            }
            renderDailyFocus(data);
          };
          input.addEventListener('blur', save);
          input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
            if (ev.key === 'Escape') { input.value = current; input.blur(); }
          });
        });
      }
    } else {
      breadcrumb.innerHTML = `<div class="yesterday-reminder"><div class="yesterday-reminder-label">Overarching goal</div><div class="yesterday-reminder-text" style="color:#ccc;font-style:italic;cursor:text;" title="Double-click to set">Click to set an overarching goal...</div></div>`;
      breadcrumb.style.display = 'block';
      const goalText = breadcrumb.querySelector('.yesterday-reminder-text');
      if (goalText) {
        goalText.addEventListener('dblclick', () => {
          const input = document.createElement('input');
          input.type = 'text';
          input.value = '';
          input.className = 'task-edit-input';
          input.style.width = '100%';
          input.style.fontSize = '0.88rem';
          input.placeholder = 'Enter your overarching goal...';
          goalText.textContent = '';
          goalText.appendChild(input);
          input.focus();
          const save = async () => {
            const newVal = input.value.trim();
            if (newVal) {
              data.dailyFocus = newVal;
              await db.updateSettings({ dailyFocus: newVal });
            }
            renderDailyFocus(data);
          };
          input.addEventListener('blur', save);
          input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
            if (ev.key === 'Escape') { renderDailyFocus(data); }
          });
        });
      }
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
let _expandedProjId = null;

function renderProjectsAgenda(tasks) {
  const container = document.getElementById('projectsAgenda');
  const empty = document.getElementById('projectsEmpty');
  if (!container) return;

  const projects = [];
  const colors = { 'Career': '#34d399', 'Self': '#60a5fa', 'Home Duties': '#fbbf24', 'Family': '#f472b6' };

  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group) continue;
    const nowItems = group.now || [];

    nowItems.forEach((item) => {
      if (item.done) return;
      projects.push({
        id: item.id,
        text: item.text,
        category: cat,
        color: colors[cat],
        deadline: item.deadline || null,
        description: item.description || '',
        subtasks: item.subtasks || [],
        thisWeek: item.thisWeek || false,
        today: item.today || false,
      });
    });
  }

  if (projects.length === 0) {
    container.style.display = 'block';
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    // Append the add project form — container must be visible so users can add their first project
    _appendAddProjectUI(container, tasks);
    return;
  }
  if (empty) empty.style.display = 'none';
  container.style.display = 'grid';

  container.innerHTML = projects.map((proj, pi) => {
    const totalSubs = proj.subtasks.length;
    const doneSubs = proj.subtasks.filter(s => s.done).length;
    const pct = totalSubs > 0 ? Math.round((doneSubs / totalSubs) * 100) : 0;
    const barColor = pct === 100 ? '#7db87d' : proj.color;

    let deadlineHtml = '';
    if (proj.deadline) {
      const dl = new Date(proj.deadline + 'T12:00:00');
      const daysUntil = Math.ceil((dl - new Date()) / (1000 * 60 * 60 * 24));
      const dlLabel = dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (daysUntil <= 3) deadlineHtml = `<span class="proj-deadline-badge deadline-urgent" data-task-id="${proj.id}" title="Click to change deadline">due ${dlLabel}</span>`;
      else if (daysUntil <= 7) deadlineHtml = `<span class="proj-deadline-badge deadline-soon" data-task-id="${proj.id}" title="Click to change deadline">due ${dlLabel}</span>`;
      else deadlineHtml = `<span class="proj-deadline-badge deadline-later" data-task-id="${proj.id}" title="Click to change deadline">due ${dlLabel}</span>`;
    } else {
      deadlineHtml = `<span class="proj-deadline-badge proj-set-date" data-task-id="${proj.id}" title="Set deadline">set date</span>`;
    }

    const tagClass = categoryTagClass(proj.category);

    // Subtasks with checkboxes and thisWeek/today toggles
    const subtasksHtml = proj.subtasks.map((sub, si) => {
      const isTW = !!sub.thisWeek;
      const isTD = !!sub.today;
      const todayBtn = isTW ? `<button class="today-toggle ${isTD ? 'today-active' : ''}" data-task-id="${proj.id}" data-sub-idx="${si}" title="Toggle today">T</button>` : '';
      return `<div class="proj-subtask ${sub.done ? 'proj-subtask-done' : ''}">
        <input type="checkbox" class="proj-subtask-checkbox" data-task-id="${proj.id}" data-sub-idx="${si}" ${sub.done ? 'checked' : ''}>
        <span class="proj-subtask-text" data-editable="true" data-task-id="${proj.id}" data-sub-idx="${si}">${escapeHtml(sub.text)}</span>
        ${todayBtn}
        <button class="this-week-toggle ${isTW ? 'this-week-active' : ''}" data-task-id="${proj.id}" data-sub-idx="${si}" title="Toggle this week">${isTW ? '\u2605' : '\u2606'}</button>
        <button class="proj-subtask-move" data-task-id="${proj.id}" data-sub-idx="${si}" title="Move to another project">&#8594;</button>
        <button class="proj-subtask-delete" data-task-id="${proj.id}" data-sub-idx="${si}" title="Delete subtask">&times;</button>
      </div>`;
    }).join('');

    // For tasks without subtasks, show thisWeek toggle on the task itself
    let taskThisWeekHtml = '';
    if (totalSubs === 0) {
      const isTW = !!proj.thisWeek;
      const isTD = !!proj.today;
      const todayBtn = isTW ? `<button class="today-toggle ${isTD ? 'today-active' : ''}" data-task-id="${proj.id}" data-sub-idx="-1" title="Toggle today">T</button>` : '';
      taskThisWeekHtml = `${todayBtn}<button class="this-week-toggle ${isTW ? 'this-week-active' : ''}" data-task-id="${proj.id}" data-sub-idx="-1" title="Toggle this week">${isTW ? '\u2605' : '\u2606'}</button>`;
    }

    return `<div class="proj-card" data-proj="${pi}">
      <button class="proj-close-btn" data-proj="${pi}">&times;</button>
      <div class="proj-card-header" data-proj="${pi}">
        <span class="category-tag ${tagClass} proj-cat-tag">${proj.category}</span>
        <span class="proj-title" data-editable="true" data-task-id="${proj.id}">${escapeHtml(proj.text)}</span>
        ${deadlineHtml}
        ${taskThisWeekHtml}
        <span class="proj-progress-label">${totalSubs > 0 ? `${doneSubs}/${totalSubs}` : ''}</span>
      </div>
      <div class="proj-bar-track">
        <div class="proj-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="proj-expanded-content">
        <div class="proj-description${proj.description ? '' : ' proj-description-empty'}" data-task-id="${proj.id}" title="Click to add description">${proj.description ? escapeHtml(proj.description).replace(/\n/g, '<br>') : '<span class="proj-desc-placeholder">+ add description, links, or notes</span>'}</div>
        ${subtasksHtml}
        <div class="proj-add-subtask-row">
          <span class="proj-add-trigger" data-task-id="${proj.id}">+ add subtask</span>
          <input type="text" class="proj-add-subtask-input" data-task-id="${proj.id}" placeholder="Add subtask and press Enter..." style="display:none;">
        </div>
        <div class="proj-actions-row">
          <div class="proj-complete" data-task-id="${proj.id}">&#10003; Complete Project</div>
          <div class="proj-move-backlog" data-task-id="${proj.id}">Move to Backlog</div>
          <div class="proj-delete-added" data-task-id="${proj.id}">&#128465; Delete</div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Restore expanded state after re-render
  if (_expandedProjId !== null) {
    const cards = container.querySelectorAll('.proj-card');
    const expandedProj = projects.findIndex(p => p.id === _expandedProjId);
    if (expandedProj !== -1 && cards[expandedProj]) {
      cards[expandedProj].classList.add('proj-card-expanded');
      cards.forEach((c, i) => { if (i !== expandedProj) c.classList.add('proj-card-hidden'); });
    }
  }

  // --- Event listeners ---

  // Card expand/collapse
  container.querySelectorAll('.proj-card-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.this-week-toggle') || e.target.closest('.today-toggle') || e.target.closest('.task-edit-input')) return;
      const card = header.closest('.proj-card');
      const pi = parseInt(card.dataset.proj);
      const projId = projects[pi] ? projects[pi].id : null;
      if (card.classList.contains('proj-card-expanded')) {
        card.classList.remove('proj-card-expanded');
        container.querySelectorAll('.proj-card').forEach(c => c.classList.remove('proj-card-hidden'));
        _expandedProjId = null;
      } else {
        container.querySelectorAll('.proj-card').forEach(c => {
          if (c !== card) c.classList.add('proj-card-hidden');
        });
        card.classList.add('proj-card-expanded');
        _expandedProjId = projId;
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
      _expandedProjId = null;
    });
  });

  // Click deadline badge to edit due date
  container.querySelectorAll('.proj-deadline-badge').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = badge.dataset.taskId;
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      // Create a date picker inline
      const picker = document.createElement('input');
      picker.type = 'date';
      picker.className = 'proj-date-picker';
      picker.value = found.task.deadline || '';
      badge.replaceWith(picker);
      picker.focus();
      if (picker.showPicker) picker.showPicker();
      const finish = async () => {
        const val = picker.value;
        found.task.deadline = val || null;
        renderProjectsAgenda(tasks);
        await db.updateTask(taskId, { deadline: val || null });
      };
      picker.addEventListener('change', finish);
      picker.addEventListener('blur', () => {
        setTimeout(() => {
          if (picker.parentElement) {
            renderProjectsAgenda(tasks);
          }
        }, 200);
      });
    });
  });

  // Double-click to edit project title
  container.querySelectorAll('.proj-title[data-editable]').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const taskId = span.dataset.taskId;
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const current = found.task.text;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'task-edit-input';
      span.replaceWith(input);
      input.focus();
      input.select();
      const save = async () => {
        const newVal = input.value.trim();
        const newSpan = document.createElement('span');
        newSpan.className = 'proj-title';
        newSpan.dataset.editable = 'true';
        newSpan.dataset.taskId = taskId;
        newSpan.textContent = newVal || current;
        input.replaceWith(newSpan);
        if (newVal && newVal !== current) {
          found.task.text = newVal;
          renderProjectsAgenda(tasks);
          renderWeeklyObjectives(tasks);
          await db.updateTask(taskId, { text: newVal });
        }
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });

  // Click description to edit
  container.querySelectorAll('.proj-description').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (el.querySelector('textarea')) return;
      const taskId = el.dataset.taskId;
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const current = found.task.description || '';
      const ta = document.createElement('textarea');
      ta.className = 'proj-description-edit';
      ta.value = current;
      ta.rows = 4;
      ta.placeholder = 'Add description, links, action items...';
      el.innerHTML = '';
      el.appendChild(ta);
      ta.focus();
      const save = async () => {
        const newVal = ta.value.trim();
        found.task.description = newVal;
        renderProjectsAgenda(tasks);
        await db.updateTask(taskId, { description: newVal });
      };
      ta.addEventListener('blur', save);
      ta.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && ev.ctrlKey) { ev.preventDefault(); ta.blur(); }
        if (ev.key === 'Escape') { renderProjectsAgenda(tasks); }
      });
    });
  });

  // Subtask checkboxes — toggle done
  container.querySelectorAll('.proj-subtask-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const taskId = cb.dataset.taskId;
      const subIdx = parseInt(cb.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (task.subtasks[subIdx]) {
        task.subtasks[subIdx].done = cb.checked;
      }
      cb.closest('.proj-subtask').classList.toggle('proj-subtask-done', cb.checked);

      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
      db.updateTask(taskId, { subtasks: task.subtasks });
    });
  });

  // Delete subtask
  container.querySelectorAll('.proj-subtask-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;
      task.subtasks.splice(subIdx, 1);
      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
      db.updateTask(taskId, { subtasks: task.subtasks });
    });
  });

  // Move subtask to another project
  container.querySelectorAll('.proj-subtask-move').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // If menu already open, close it
      const existing = btn.parentElement.querySelector('.proj-move-dropdown');
      if (existing) { existing.remove(); return; }

      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);

      // Build dropdown of other projects
      const otherProjects = projects.filter(p => p.id !== taskId);
      if (otherProjects.length === 0) return;

      const dropdown = document.createElement('div');
      dropdown.className = 'proj-move-dropdown';
      dropdown.innerHTML = otherProjects.map(p =>
        `<div class="proj-move-option" data-target-id="${p.id}">${escapeHtml(p.text)}</div>`
      ).join('');
      btn.parentElement.style.position = 'relative';
      btn.parentElement.appendChild(dropdown);

      dropdown.querySelectorAll('.proj-move-option').forEach(opt => {
        opt.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const targetId = opt.dataset.targetId;
          const sourceFound = findTaskById(tasks, taskId);
          const targetFound = findTaskById(tasks, targetId);
          if (!sourceFound || !targetFound) return;

          // Remove subtask from source
          const [movedSub] = sourceFound.task.subtasks.splice(subIdx, 1);
          // Add to target
          targetFound.task.subtasks.push(movedSub);

          // Persist both
          renderProjectsAgenda(tasks);
          renderWeeklyObjectives(tasks);
          await db.updateTask(taskId, { subtasks: sourceFound.task.subtasks });
          await db.updateTask(targetId, { subtasks: targetFound.task.subtasks });
        });
      });

      // Close on outside click
      const closeHandler = (ev) => {
        if (!dropdown.contains(ev.target) && ev.target !== btn) {
          dropdown.remove();
          document.removeEventListener('click', closeHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 0);
    });
  });

  // Double-click to edit subtask text
  container.querySelectorAll('.proj-subtask-text[data-editable]').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const taskId = span.dataset.taskId;
      const subIdx = parseInt(span.dataset.subIdx);
      const current = span.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'task-edit-input';
      span.replaceWith(input);
      input.focus(); input.select();
      const save = async () => {
        const newVal = input.value.trim();
        const newSpan = document.createElement('span');
        newSpan.className = 'proj-subtask-text';
        newSpan.dataset.editable = 'true';
        newSpan.dataset.taskId = taskId;
        newSpan.dataset.subIdx = subIdx;
        newSpan.textContent = newVal || current;
        input.replaceWith(newSpan);
        if (newVal && newVal !== current) {
          const found = findTaskById(tasks, taskId);
          if (!found) return;
          const task = found.task;
          if (task.subtasks[subIdx]) {
            task.subtasks[subIdx].text = newVal;
          }
          renderWeeklyObjectives(tasks);
          db.updateTask(taskId, { subtasks: task.subtasks });
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
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        const newVal = !task.subtasks[subIdx].thisWeek;
        task.subtasks[subIdx].thisWeek = newVal;
        if (!newVal) task.subtasks[subIdx].today = false;
        db.updateTask(taskId, { subtasks: task.subtasks });
      } else {
        const newVal = !task.thisWeek;
        task.thisWeek = newVal;
        if (!newVal) task.today = false;
        db.updateTask(taskId, { thisWeek: newVal, today: newVal ? task.today : false });
      }

      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
      renderTodayTasks(appData);
    });
  });

  // Today toggles
  container.querySelectorAll('.today-toggle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const subIdx = parseInt(btn.dataset.subIdx);
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const task = found.task;

      if (subIdx >= 0 && task.subtasks[subIdx]) {
        task.subtasks[subIdx].today = !task.subtasks[subIdx].today;
        db.updateTask(taskId, { subtasks: task.subtasks });
      } else {
        task.today = !task.today;
        db.updateTask(taskId, { today: task.today });
      }

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
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const taskId = input.dataset.taskId;
        const found = findTaskById(tasks, taskId);
        if (!found) return;
        const task = found.task;
        task.subtasks.push({ text: input.value.trim(), done: false, thisWeek: false, today: false });
        renderProjectsAgenda(tasks);
        db.updateTask(taskId, { subtasks: task.subtasks });
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

  // Complete project
  container.querySelectorAll('.proj-complete').forEach(el => {
    el.addEventListener('click', async () => {
      const taskId = el.dataset.taskId;
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      found.task.done = true;
      _expandedProjId = null;
      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
      db.updateTask(taskId, { done: true });
    });
  });

  // Delete project
  container.querySelectorAll('.proj-delete-added').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = el.dataset.taskId;
      if (!confirm('Delete this project permanently?')) return;
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      const group = tasks[found.category];
      const list = group[found.list];
      const idx = list.findIndex(t => t.id === taskId);
      if (idx >= 0) list.splice(idx, 1);
      _expandedProjId = null;
      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
      renderBacklog(tasks);
      if (typeof renderKPIStrip === 'function') renderKPIStrip(appData);
      await db.deleteTask(taskId);
    });
  });

  // Move to backlog
  container.querySelectorAll('.proj-move-backlog').forEach(el => {
    el.addEventListener('click', async () => {
      const taskId = el.dataset.taskId;
      const found = findTaskById(tasks, taskId);
      if (!found) return;
      // Move from now to backlog in local data
      const group = tasks[found.category];
      const idx = group.now.findIndex(t => t.id === taskId);
      if (idx >= 0) {
        const [item] = group.now.splice(idx, 1);
        group.backlog.unshift(item);
      }
      _expandedProjId = null;
      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
      renderBacklog(tasks);
      db.updateTask(taskId, { list: 'backlog' });
    });
  });

  // Add project form — appended fresh each render
  _appendAddProjectUI(container, tasks);
}

function _appendAddProjectUI(container, tasks) {
  // Always append add-project form at the end of the projects container
  container.insertAdjacentHTML('beforeend', `
    <div class="add-project-row" id="addProjectRow" style="grid-column: 1 / -1;">
      <button class="add-project-trigger" id="addProjectTrigger">+ add project</button>
      <div class="add-project-form" id="addProjectForm" style="display:none;">
        <input type="text" class="add-project-input" id="addProjectInput" placeholder="Project name...">
        <select class="add-project-cat" id="addProjectCat">
          <option value="Career">Career</option>
          <option value="Self">Self</option>
          <option value="Home Duties">Home Duties</option>
          <option value="Family">Family</option>
        </select>
        <button class="add-project-submit" id="addProjectSubmit">Add</button>
        <button class="add-project-cancel" id="addProjectCancel">&times;</button>
      </div>
    </div>
  `);

  const addTrigger = document.getElementById('addProjectTrigger');
  const addForm = document.getElementById('addProjectForm');
  const addInput = document.getElementById('addProjectInput');
  const addCat = document.getElementById('addProjectCat');
  const addSubmit = document.getElementById('addProjectSubmit');
  const addCancel = document.getElementById('addProjectCancel');

  if (!addTrigger) return;

  addTrigger.addEventListener('click', () => {
    addTrigger.style.display = 'none';
    addForm.style.display = 'flex';
    addInput.focus();
  });

  addCancel.addEventListener('click', () => {
    addForm.style.display = 'none';
    addTrigger.style.display = '';
    addInput.value = '';
  });

  const submitProject = async () => {
    const text = addInput.value.trim();
    if (!text) return;
    const category = addCat.value;
    try {
      const newTask = await db.insertTask({ text, category, list: 'now', subtasks: [] });
      if (!tasks[category]) tasks[category] = { now: [], backlog: [], recurring: [] };
      tasks[category].now.push({
        id: newTask.id,
        text: newTask.text,
        done: false,
        deadline: null,
        link: null,
        thisWeek: false,
        today: false,
        subtasks: [],
      });
    } catch (err) {
      console.error('Failed to add project:', err);
    }
    addInput.value = '';
    addForm.style.display = 'none';
    addTrigger.style.display = '';
    renderProjectsAgenda(tasks);
    renderWeeklyObjectives(tasks);
  };

  addSubmit.addEventListener('click', submitProject);
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitProject(); }
    if (e.key === 'Escape') { addCancel.click(); }
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
function renderRecurringHabits(tasks) {
  const container = document.getElementById('recurringHabits');
  if (!container) return;

  const { weekStart, weekEnd } = getWeekRange();
  const habits = [];

  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group || !group.recurring) continue;
    for (const item of group.recurring) {
      if (item.recurring === 'ongoing') continue;
      if (item.hidden) continue;

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

      // Check if already logged today
      const todayStr = getTodayStr();
      const loggedToday = item.sessions ? item.sessions.some(s => s.date === todayStr) : false;

      habits.push({
        id: item.id,
        text: item.text,
        category: cat,
        target,
        count: thisWeekCount,
        complete: thisWeekCount >= target,
        loggedToday,
        sessions: item.sessions || [],
        defaultHours: item.defaultHours || null,
      });
    }
  }

  // Count hidden habits
  let hiddenCount = 0;
  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group || !group.recurring) continue;
    for (const item of group.recurring) {
      if (item.recurring === 'ongoing') continue;
      if (item.hidden) hiddenCount++;
    }
  }

  let html = '';

  if (habits.length === 0 && hiddenCount === 0) {
    html = '<p class="empty-state">No recurring habits defined.</p>';
  } else {
    html = habits.map((h, i) => {
      const r = 18;
      const circumference = 2 * Math.PI * r;
      const fill = Math.min(1, h.count / h.target) * circumference;
      const gap = circumference - fill;
      const strokeColor = h.complete ? '#7db87d' : '#f59e0b';
      const textColor = h.complete ? '#065f46' : '#333';
      const shortName = h.text.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*—\s*.*/g, '').replace(/\s*\d+x\/week/i, '').trim();

      return `<div class="habit-card ${h.complete ? 'habit-card-complete' : ''}${h.loggedToday ? ' habit-logged-today' : ''}" data-habit-idx="${i}" data-habit-id="${h.id}">
        <button class="habit-hide-btn" data-habit-id="${h.id}" title="Hide this habit">&times;</button>
        <button class="habit-delete-btn" data-habit-id="${h.id}" title="Delete habit">&#128465;</button>
        <div class="habit-ring-area" data-habit-id="${h.id}" title="${h.loggedToday ? 'Already logged today' : 'Log session for today'}">
          <svg width="48" height="48" viewBox="0 0 48 48" class="habit-ring">
            <circle cx="24" cy="24" r="${r}" fill="none" stroke="#e8e8e8" stroke-width="3"/>
            <circle cx="24" cy="24" r="${r}" fill="none" stroke="${strokeColor}" stroke-width="3"
              stroke-dasharray="${fill} ${gap}" stroke-linecap="round" transform="rotate(-90 24 24)"/>
            <text x="24" y="24" text-anchor="middle" dominant-baseline="central"
              font-size="11" font-weight="600" fill="${textColor}">${h.count}/${h.target}</text>
          </svg>
        </div>
        <div class="habit-name" data-habit-id="${h.id}">${escapeHtml(shortName)}</div>
        <div class="habit-hours-badge" data-habit-id="${h.id}" title="Click to set default hours">${h.defaultHours ? h.defaultHours + 'h' : '—'}</div>
      </div>`;
    }).join('');
  }

  // Hidden habits toggle
  if (hiddenCount > 0) {
    html += `<div class="habits-show-hidden">
      <button class="habits-unhide-btn">${hiddenCount} hidden</button>
    </div>`;
  }

  // Add habit button
  html += `<div class="habit-add-area">
    <button class="habit-add-btn" id="habitAddBtn">+ add habit</button>
    <div class="habit-add-form" id="habitAddForm" style="display:none;">
      <input type="text" class="habit-add-input" id="habitAddInput" placeholder="Habit name...">
      <select class="habit-add-cat" id="habitAddCat">
        <option value="Career">Career</option>
        <option value="Self">Self</option>
        <option value="Home Duties">Home Duties</option>
        <option value="Family">Family</option>
      </select>
      <select class="habit-add-freq" id="habitAddFreq">
        <option value="weekly">Weekly</option>
        <option value="daily">Daily</option>
      </select>
      <button class="habit-add-submit" id="habitAddSubmit">Add</button>
      <button class="habit-add-cancel" id="habitAddCancel">&times;</button>
    </div>
  </div>`;

  container.innerHTML = html;

  // --- Event listeners ---

  // Click ring to log session for today
  container.querySelectorAll('.habit-ring-area').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const habitId = el.dataset.habitId;
      // Find the habit data in tasks
      let item = null;
      for (const cat of CATEGORY_ORDER) {
        const group = tasks[cat];
        if (!group || !group.recurring) continue;
        item = group.recurring.find(r => r.id === habitId);
        if (item) break;
      }
      if (!item) return;
      const todayStr = getTodayStr();
      const alreadyLogged = (item.sessions || []).some(s => s.date === todayStr);

      // Figure out this week's count and target
      let target = 1;
      if (item.text.match(/2x/i)) target = 2;
      else if (item.text.match(/3x/i)) target = 3;
      const { weekStart, weekEnd } = getWeekRange();
      const thisWeekCount = (item.sessions || []).filter(s => {
        const d = new Date(s.date + 'T12:00:00');
        return d >= weekStart && d <= weekEnd;
      }).length;

      if (alreadyLogged && thisWeekCount >= target) {
        // Target met and already logged today — show undo option
        const card = el.closest('.habit-card');
        if (card && !card.querySelector('.habit-undo-tooltip')) {
          const tip = document.createElement('div');
          tip.className = 'habit-undo-tooltip';
          tip.innerHTML = 'Done this week! <span class="habit-undo-link">Undo last?</span>';
          card.appendChild(tip);
          const undoLink = tip.querySelector('.habit-undo-link');
          undoLink.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            // Remove most recent session
            if (item.sessions && item.sessions.length > 0) {
              item.sessions.pop();
            }
            renderRecurringHabits(tasks);
            await db.updateHabit(habitId, { sessions: item.sessions });
          });
          setTimeout(() => { if (tip.parentElement) tip.remove(); }, 3000);
        }
        return;
      }
      // Allow logging — even if logged today, if target not met yet
      if (!item.sessions) item.sessions = [];
      item.sessions.push({ date: todayStr, note: '' });
      renderRecurringHabits(tasks);
      await db.updateHabit(habitId, { sessions: item.sessions });
    });
  });

  // Double-click habit name to edit
  container.querySelectorAll('.habit-name').forEach(el => {
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const habitId = el.dataset.habitId;
      let item = null;
      for (const cat of CATEGORY_ORDER) {
        const group = tasks[cat];
        if (!group || !group.recurring) continue;
        item = group.recurring.find(r => r.id === habitId);
        if (item) break;
      }
      if (!item) return;
      const current = item.text;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'habit-edit-input';
      el.textContent = '';
      el.appendChild(input);
      input.focus();
      input.select();
      const save = async () => {
        const newVal = input.value.trim();
        if (newVal && newVal !== current) {
          item.text = newVal;
          await db.updateHabit(habitId, { text: newVal });
        }
        renderRecurringHabits(tasks);
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });

  // Click hours badge to edit default hours
  container.querySelectorAll('.habit-hours-badge').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const habitId = el.dataset.habitId;
      let item = null;
      for (const cat of CATEGORY_ORDER) {
        const group = tasks[cat];
        if (!group || !group.recurring) continue;
        item = group.recurring.find(r => r.id === habitId);
        if (item) break;
      }
      if (!item) return;
      const current = item.defaultHours || '';
      const input = document.createElement('input');
      input.type = 'number';
      input.value = current;
      input.step = '0.5';
      input.min = '0';
      input.max = '24';
      input.className = 'habit-hours-input';
      input.placeholder = 'hrs';
      el.textContent = '';
      el.appendChild(input);
      input.focus();
      input.select();
      const save = async () => {
        const val = input.value.trim();
        const newHours = val ? parseFloat(val) : null;
        item.defaultHours = newHours;
        renderRecurringHabits(tasks);
        await db.updateHabit(habitId, { default_hours: newHours });
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });

  // Hide habit
  container.querySelectorAll('.habit-hide-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const habitId = btn.dataset.habitId;
      for (const cat of CATEGORY_ORDER) {
        const group = tasks[cat];
        if (!group || !group.recurring) continue;
        const item = group.recurring.find(r => r.id === habitId);
        if (item) {
          item.hidden = true;
          break;
        }
      }
      renderRecurringHabits(tasks);
      await db.updateHabit(habitId, { hidden: true });
    });
  });

  // Delete habit
  container.querySelectorAll('.habit-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const habitId = btn.dataset.habitId;
      if (!confirm('Delete this habit permanently?')) return;
      for (const cat of CATEGORY_ORDER) {
        const group = tasks[cat];
        if (!group || !group.recurring) continue;
        const idx = group.recurring.findIndex(r => r.id === habitId);
        if (idx >= 0) {
          group.recurring.splice(idx, 1);
          break;
        }
      }
      renderRecurringHabits(tasks);
      await db.deleteHabit(habitId);
    });
  });

  // Unhide all
  const unhideBtn = container.querySelector('.habits-unhide-btn');
  if (unhideBtn) {
    unhideBtn.addEventListener('click', async () => {
      for (const cat of CATEGORY_ORDER) {
        const group = tasks[cat];
        if (!group || !group.recurring) continue;
        for (const item of group.recurring) {
          if (item.hidden) {
            item.hidden = false;
            db.updateHabit(item.id, { hidden: false });
          }
        }
      }
      renderRecurringHabits(tasks);
    });
  }

  // Add habit form
  const addBtn = container.querySelector('#habitAddBtn');
  const addForm = container.querySelector('#habitAddForm');
  const addInput = container.querySelector('#habitAddInput');
  const addCat = container.querySelector('#habitAddCat');
  const addFreq = container.querySelector('#habitAddFreq');
  const addSubmit = container.querySelector('#habitAddSubmit');
  const addCancel = container.querySelector('#habitAddCancel');

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      addForm.style.display = 'flex';
      addInput.focus();
    });
  }
  if (addCancel) {
    addCancel.addEventListener('click', () => {
      addForm.style.display = 'none';
      addBtn.style.display = '';
      addInput.value = '';
    });
  }

  const submitHabit = async () => {
    const text = addInput.value.trim();
    if (!text) return;
    const category = addCat.value;
    const recurring = addFreq.value;
    try {
      const newHabit = await db.insertHabit({ text, category, recurring });
      if (!tasks[category]) tasks[category] = { now: [], backlog: [], recurring: [] };
      if (!tasks[category].recurring) tasks[category].recurring = [];
      tasks[category].recurring.push({
        id: newHabit.id,
        text: newHabit.text,
        recurring: newHabit.recurring,
        nextSession: newHabit.next_session,
        hidden: false,
        sessions: [],
      });
    } catch (err) {
      console.error('Failed to add habit:', err);
    }
    addInput.value = '';
    addForm.style.display = 'none';
    addBtn.style.display = '';
    renderRecurringHabits(tasks);
  };

  if (addSubmit) addSubmit.addEventListener('click', submitHabit);
  if (addInput) {
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitHabit(); }
      if (e.key === 'Escape') { addCancel.click(); }
    });
  }
}

// ---------------------------------------------------------------------------
// setupToggle — Main Today/Week toggle for Wins & Time
// ---------------------------------------------------------------------------
function setupToggle() {
  const mainToggle = document.getElementById('mainToggle');
  if (!mainToggle || mainToggle._bound) return;
  mainToggle._bound = true;

  // On weekends, default to "This Week" instead of "Today"
  if (isWeekend()) {
    mainToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    const weekBtn = mainToggle.querySelector('.toggle-btn[data-range="week"]');
    if (weekBtn) weekBtn.classList.add('active');
    renderWinsAndTime(appData, 'week');
  }

  mainToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    e.currentTarget.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderWinsAndTime(appData, btn.dataset.range);
  });
}

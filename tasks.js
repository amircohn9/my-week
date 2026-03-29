// tasks.js — Task list rendering and state management

// --- localStorage state helpers ---
function getTaskState() { try { return JSON.parse(localStorage.getItem('myweek-tasks')) || {}; } catch { return {}; } }
function saveTaskState(state) { localStorage.setItem('myweek-tasks', JSON.stringify(state)); }

function getTaskEdits() { try { return JSON.parse(localStorage.getItem('myweek-task-edits')) || {}; } catch { return {}; } }
function saveTaskEdits(edits) { localStorage.setItem('myweek-task-edits', JSON.stringify(edits)); }

function getTaskMoves() { try { return JSON.parse(localStorage.getItem('myweek-task-moves')) || {}; } catch { return {}; } }
function saveTaskMoves(moves) { localStorage.setItem('myweek-task-moves', JSON.stringify(moves)); }

function getThisWeekState() { try { return JSON.parse(localStorage.getItem('myweek-this-week')) || {}; } catch { return {}; } }
function saveThisWeekState(state) { localStorage.setItem('myweek-this-week', JSON.stringify(state)); }

function getTodayState() { try { return JSON.parse(localStorage.getItem('myweek-today')) || {}; } catch { return {}; } }
function saveTodayState(state) { localStorage.setItem('myweek-today', JSON.stringify(state)); }

function getDailyFocusEdit() { return localStorage.getItem('myweek-daily-focus-edit') || ''; }
function saveDailyFocusEdit(text) {
  if (text) localStorage.setItem('myweek-daily-focus-edit', text);
  else localStorage.removeItem('myweek-daily-focus-edit');
}

// --- Resolve items accounting for moves ---
function getResolvedItems(tasks, category) {
  const group = tasks[category];
  if (!group) return { now: [], backlog: [] };
  const moves = getTaskMoves();
  const catMoves = moves[category] || {};
  let nowItems = [...(group.now || [])];
  let backlogItems = [...(group.backlog || [])];
  for (const [itemText, target] of Object.entries(catMoves)) {
    if (target === 'backlog') {
      const idx = nowItems.findIndex(it => it.text === itemText);
      if (idx >= 0) backlogItems.unshift(nowItems.splice(idx, 1)[0]);
    } else if (target === 'now') {
      const idx = backlogItems.findIndex(it => it.text === itemText);
      if (idx >= 0) nowItems.push(backlogItems.splice(idx, 1)[0]);
    }
  }
  return { now: nowItems, backlog: backlogItems };
}

// --- Sync ---
function countSyncChanges() {
  const state = getTaskState();
  const edits = getTaskEdits();
  const moves = getTaskMoves();
  let count = 0;
  for (const [k, v] of Object.entries(state)) {
    if (k === '_addedSubs' || k === '_deletedSubs' || k === '_added' || k === '_synced') continue;
    if (v) count++;
  }
  count += Object.keys(edits).length;
  for (const cat of Object.keys(moves)) count += Object.keys(moves[cat]).length;
  if (state._addedSubs) for (const key of Object.keys(state._addedSubs)) count += state._addedSubs[key].length;
  if (state._deletedSubs) for (const key of Object.keys(state._deletedSubs)) count += state._deletedSubs[key].length;
  if (state._added) for (const cat of Object.keys(state._added)) count += state._added[cat].length;
  if (state._addedProjects) count += state._addedProjects.length;
  const hidden = getHiddenHabits();
  count += hidden.length;
  try { const wu = JSON.parse(localStorage.getItem('myweek-weight-updates')) || []; count += wu.length; } catch {}
  // thisWeek changes
  const tw = getThisWeekState();
  count += Object.keys(tw).length;
  // today changes not counted — todayState persists across syncs
  // Daily focus edit
  if (getDailyFocusEdit()) count++;
  try { const fc = JSON.parse(localStorage.getItem('family-hub-changes')) || []; count += fc.length; } catch {}
  try { const fa = JSON.parse(localStorage.getItem('family-hub-added')) || []; count += fa.length; } catch {}
  return count;
}

function updateSyncButton() {
  const btn = document.getElementById('syncBtn');
  if (!btn) return;
  const count = countSyncChanges();
  if (count > 0) {
    btn.innerHTML = `Sync Changes (${count})`;
    btn.style.display = '';
  } else {
    btn.innerHTML = 'Sync Changes';
    btn.style.display = 'none';
  }
}

function generateSyncSummary() {
  const state = getTaskState();
  const edits = getTaskEdits();
  const moves = getTaskMoves();
  const hidden = getHiddenHabits();
  const lines = ['=== MyWeek Sync Summary ===', ''];

  const completions = Object.entries(state).filter(([k, v]) => v === true && !k.startsWith('_'));
  if (completions.length) { lines.push('COMPLETED:'); completions.forEach(([k]) => lines.push('  [x] ' + k)); lines.push(''); }

  const sessions = Object.entries(state).filter(([k, v]) => typeof v === 'string' && k.includes('::session::'));
  if (sessions.length) { lines.push('SESSIONS LOGGED:'); sessions.forEach(([k, v]) => lines.push('  ' + k + ' on ' + v)); lines.push(''); }

  if (Object.keys(edits).length) { lines.push('TEXT EDITS:'); Object.entries(edits).forEach(([k, v]) => lines.push('  ' + k + ' → ' + v)); lines.push(''); }

  for (const [cat, catMoves] of Object.entries(moves)) {
    if (Object.keys(catMoves).length) { lines.push('MOVES (' + cat + '):'); Object.entries(catMoves).forEach(([text, target]) => lines.push('  ' + text + ' → ' + target)); lines.push(''); }
  }

  if (state._addedSubs) {
    const entries = Object.entries(state._addedSubs).filter(([, v]) => v.length > 0);
    if (entries.length) { lines.push('ADDED SUBTASKS:'); entries.forEach(([parent, subs]) => { subs.forEach(s => lines.push('  ' + parent + ' → + ' + s.text)); }); lines.push(''); }
  }

  if (state._deletedSubs) {
    const entries = Object.entries(state._deletedSubs).filter(([, v]) => v.length > 0);
    if (entries.length) { lines.push('DELETED SUBTASKS:'); entries.forEach(([parent, indices]) => { indices.forEach(i => lines.push('  ' + parent + ' → remove sub #' + i)); }); lines.push(''); }
  }

  if (hidden.length) { lines.push('HIDDEN RECURRING:'); hidden.forEach(k => lines.push('  ' + k)); lines.push(''); }

  try {
    const wu = JSON.parse(localStorage.getItem('myweek-weight-updates')) || [];
    if (wu.length) { lines.push('WEIGHT UPDATES:'); wu.forEach(w => lines.push('  ' + w.date + ': ' + w.lbs + ' lbs')); lines.push(''); }
  } catch {}

  // thisWeek changes
  const tw = getThisWeekState();
  if (Object.keys(tw).length) { lines.push('THIS WEEK TOGGLES:'); Object.entries(tw).forEach(([k, v]) => lines.push('  ' + k + ' → ' + (v ? 'ON' : 'OFF'))); lines.push(''); }

  // today changes
  const td = getTodayState();
  if (Object.keys(td).length) { lines.push('TODAY TOGGLES:'); Object.entries(td).forEach(([k, v]) => lines.push('  ' + k + ' → ' + (v ? 'ON' : 'OFF'))); lines.push(''); }

  // Added projects
  if (state._addedProjects && state._addedProjects.length) {
    lines.push('ADDED PROJECTS:');
    state._addedProjects.forEach(p => lines.push('  [' + p.category + '] ' + p.text));
    lines.push('');
  }

  // Added tasks
  if (state._added) {
    const entries = Object.entries(state._added).filter(([, v]) => v.length > 0);
    if (entries.length) { lines.push('ADDED TASKS:'); entries.forEach(([cat, items]) => { items.forEach(t => lines.push('  [' + cat + '] ' + t.text)); }); lines.push(''); }
  }

  // Daily focus edit
  const focusEdit = getDailyFocusEdit();
  if (focusEdit) { lines.push('DAILY FOCUS EDIT:'); lines.push('  ' + focusEdit); lines.push(''); }

  // Family hub changes
  try {
    const fc = JSON.parse(localStorage.getItem('family-hub-changes')) || [];
    if (fc.length) {
      lines.push('FAMILY HUB CHANGES:');
      fc.forEach(c => {
        if (c.type === 'toggle') lines.push('  [' + c.section + '] ' + c.text + ' → ' + (c.done ? 'HANDLED' : 'REOPENED'));
        else if (c.type === 'add') lines.push('  Added to ' + c.section + ': ' + c.text);
        else if (c.type === 'edit') lines.push('  Edited [' + c.section + ']: "' + c.oldText + '" → "' + c.newText + '"');
        else if (c.type === 'assign') lines.push('  [' + c.section + '] ' + c.text + ' → ' + (c.assignee || 'unassigned'));
        else if (c.type === 'deadline') lines.push('  [' + c.section + '] ' + c.text + ' deadline: ' + (c.deadline || 'removed'));
        else if (c.type === 'move') lines.push('  Moved "' + c.text + '" from ' + c.from + ' → ' + c.to);
        else if (c.type === 'moveToAmir') lines.push('  Move to Amir\'s tasks: ' + c.text + ' (from ' + c.section + ')');
      });
      lines.push('');
    }
  } catch {}

  return lines.join('\n');
}

// --- Backlog rendering (only backlog items) ---

function renderTaskItem(item, cat, section, state, edits, moveTarget) {
  const key = `${cat}::${section}::${item.text}`;
  const checked = state[key] || item.done;
  const doneClass = checked ? 'task-done' : '';

  let urgentClass = '';
  if (item.deadline) {
    const dl = new Date(item.deadline + 'T12:00:00');
    const daysUntil = Math.ceil((dl - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 3) urgentClass = 'task-item-urgent';
  }

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
    if (daysUntil <= 3) deadlineHtml = `<span class="deadline-urgent">due ${dlLabel}</span>`;
    else if (daysUntil <= 7) deadlineHtml = `<span class="deadline-soon">due ${dlLabel}</span>`;
    else deadlineHtml = `<span class="deadline-later">due ${dlLabel}</span>`;
  }

  const moveLabel = moveTarget === 'now' ? '\u2191' : '\u2193';
  const moveTitle = moveTarget === 'now' ? 'Move to Agenda' : 'Move to Backlog';
  const moveBtn = `<button class="move-btn" data-cat="${cat}" data-text="${escapeHtml(item.text)}" data-move-to="${moveTarget}" title="${moveTitle}">${moveLabel}</button>`;

  const addedSubs = getTaskState()._addedSubs || {};
  const addedForThis = addedSubs[key] || [];
  const deletedSubs = getTaskState()._deletedSubs || {};
  const deletedForThis = deletedSubs[key] || [];

  let subtasksHtml = '';
  const allSubs = [...(item.subtasks || [])];
  const hasSubtasks = allSubs.some((s, si) => !deletedForThis.includes(si)) || addedForThis.length > 0;

  if (hasSubtasks || allSubs.length > 0) {
    const subItems = allSubs.map((sub, si) => {
      const subKey = `${cat}::${section}::${item.text}::${sub.text}`;
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
      const subKey = `${cat}::${section}::${item.text}::added::${sub.text}`;
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
    return `<div class="task-item ${doneClass} ${urgentClass}">
      <input type="checkbox" class="task-checkbox" data-key="${key}" ${checked ? 'checked' : ''}>
      ${textHtml}${deadlineHtml}${toggleBtn}${moveBtn}
    </div>${subtasksHtml}`;
  }

  return `<div class="task-item ${doneClass} ${urgentClass}">
    <input type="checkbox" class="task-checkbox" data-key="${key}" ${checked ? 'checked' : ''}>
    ${textHtml}${deadlineHtml}${moveBtn}
  </div>`;
}

function renderBacklog(tasks) {
  const container = document.getElementById('taskList');
  if (!tasks) { container.innerHTML = '<p class="empty-state">No tasks loaded.</p>'; return; }

  const state = getTaskState();
  const edits = getTaskEdits();

  const collapseState = {};
  CATEGORY_ORDER.forEach(cat => {
    const stored = localStorage.getItem('task-collapse-' + cat);
    collapseState[cat] = stored === null ? true : stored === 'true';
  });

  const addedTasks = state._added || {};

  container.innerHTML = CATEGORY_ORDER.map(cat => {
    const { backlog: backlogItems } = getResolvedItems(tasks, cat);
    const addedItems = addedTasks[cat] || [];
    if (backlogItems.length === 0 && addedItems.length === 0) return '';

    const tagClass = categoryTagClass(cat);
    const isCollapsed = collapseState[cat];
    const backlogHtml = backlogItems.map((item) => renderTaskItem(item, cat, 'backlog', state, edits, 'now')).join('');
    const addedHtml = addedItems.map((item, i) => `<div class="task-item">
      <input type="checkbox" class="task-checkbox added-task-checkbox" data-cat="${cat}" data-idx="${i}">
      <span class="task-text">${escapeHtml(item.text)}</span>
      <button class="move-added-task-btn" data-cat="${cat}" data-idx="${i}" title="Move to Agenda">&#8593;</button>
      <button class="delete-added-task-btn" data-cat="${cat}" data-idx="${i}" title="Remove">&times;</button>
    </div>`).join('');

    return `<div class="task-group ${isCollapsed ? 'collapsed' : ''}" data-cat="${cat}">
      <div class="task-group-header" data-cat="${cat}">
        <span class="task-group-arrow">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
        <span class="category-tag ${tagClass} task-cat-title">${cat}</span>
        <span class="task-count">${backlogItems.length + addedItems.length}</span>
      </div>
      <div class="task-group-items" data-cat="${cat}">
        ${backlogHtml}${addedHtml}
        <div class="add-task-row" data-cat="${cat}">
          <span class="add-task-trigger" data-cat="${cat}">+ add task</span>
          <input type="text" class="add-task-input" data-cat="${cat}" placeholder="New task... press Enter" style="display:none;">
        </div>
      </div>
    </div>`;
  }).join('');

  // --- Event listeners ---

  // Collapse toggle
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
      renderBacklog(tasks);
      renderProjectsAgenda(tasks);
      renderWeeklyObjectives(tasks);
      updateSyncButton();
    });
  });

  // Double-click to edit
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

  // Add subtask trigger
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
        renderBacklog(tasks);
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

  // Delete subtask
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
      renderBacklog(tasks);
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
        renderBacklog(tasks);
        updateSyncButton();
      }
    });
  });

  // Added task checkboxes
  container.querySelectorAll('.added-task-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.task-item').classList.toggle('task-done', cb.checked);
    });
  });

  // Add task trigger
  container.querySelectorAll('.add-task-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      trigger.style.display = 'none';
      const input = trigger.closest('.add-task-row').querySelector('.add-task-input');
      input.style.display = 'block';
      input.focus();
    });
  });

  container.querySelectorAll('.add-task-input').forEach(input => {
    const cat = input.dataset.cat;
    const save = () => {
      const text = input.value.trim();
      if (text) {
        const st = getTaskState();
        if (!st._added) st._added = {};
        if (!st._added[cat]) st._added[cat] = [];
        st._added[cat].push({ text });
        saveTaskState(st);
        renderBacklog(tasks);
        updateSyncButton();
      } else {
        input.style.display = 'none';
        const trigger = input.closest('.add-task-row').querySelector('.add-task-trigger');
        if (trigger) trigger.style.display = '';
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { input.value = ''; input.style.display = 'none'; const trigger = input.closest('.add-task-row').querySelector('.add-task-trigger'); if (trigger) trigger.style.display = ''; }
    });
    input.addEventListener('blur', () => { if (!input.value.trim()) { input.style.display = 'none'; const trigger = input.closest('.add-task-row').querySelector('.add-task-trigger'); if (trigger) trigger.style.display = ''; } });
  });

  // Move added task to agenda
  container.querySelectorAll('.move-added-task-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = getTaskState();
      const cat = btn.dataset.cat;
      const idx = parseInt(btn.dataset.idx);
      if (st._added && st._added[cat] && st._added[cat][idx]) {
        const item = st._added[cat][idx];
        const mv = getTaskMoves();
        if (!mv[cat]) mv[cat] = {};
        mv[cat][item.text] = 'now';
        saveTaskMoves(mv);
        st._added[cat].splice(idx, 1);
        saveTaskState(st);
        renderBacklog(tasks);
        renderProjectsAgenda(tasks);
        renderWeeklyObjectives(tasks);
        updateSyncButton();
      }
    });
  });

  // Delete added task
  container.querySelectorAll('.delete-added-task-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = getTaskState();
      const cat = btn.dataset.cat;
      const idx = parseInt(btn.dataset.idx);
      if (st._added && st._added[cat]) {
        st._added[cat].splice(idx, 1);
        saveTaskState(st);
        renderBacklog(tasks);
        updateSyncButton();
      }
    });
  });

  // Sync button
  document.getElementById('syncBtn').onclick = () => {
    const summary = generateSyncSummary();
    const subject = encodeURIComponent('Dashboard Sync — ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    const body = encodeURIComponent(summary);
    window.open('https://mail.google.com/mail/?view=cm&to=' + NOTES_EMAIL + '&su=' + subject + '&body=' + body, '_blank');

    const btn = document.getElementById('syncBtn');
    btn.style.display = 'none';
    let strip = document.getElementById('dashSyncConfirm');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'dashSyncConfirm';
      strip.className = 'family-sync-confirm';
      btn.parentElement.appendChild(strip);
    }
    strip.innerHTML = '<span>Did you send it?</span><button class="family-sync-yes">Yes, clear</button><button class="family-sync-no">No, keep</button>';
    strip.style.display = 'flex';
    strip.querySelector('.family-sync-yes').addEventListener('click', () => {
      // Clear all sync-related localStorage
      localStorage.removeItem('myweek-tasks');
      localStorage.removeItem('myweek-task-edits');
      localStorage.removeItem('myweek-task-moves');
      localStorage.removeItem('myweek-this-week');
      localStorage.removeItem('myweek-weight-updates');
      localStorage.removeItem('myweek-daily-focus-edit');
      localStorage.removeItem('family-hub-changes');
      localStorage.removeItem('family-hub-added');
      saveDailyFocusEdit('');
      strip.style.display = 'none';
      updateSyncButton();
      updateFamilySyncBtn && updateFamilySyncBtn();
    });
    strip.querySelector('.family-sync-no').addEventListener('click', () => {
      strip.style.display = 'none';
      btn.style.display = '';
    });
  };
}

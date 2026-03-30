// app.js — Init, data loading, notes, collapsible sections

let appData = null;

document.addEventListener('DOMContentLoaded', async () => {
  const [hotData, archiveData] = await Promise.all([
    fetch('data.json').then(r => r.json()),
    fetch('archive.json').then(r => r.json()).catch(() => ({ checkins: [], completedItems: [], diet: { entries: [], weights: [] } }))
  ]);
  appData = hotData;
  // Merge archive into hot data so dashboard sees full history
  appData.checkins = [...(archiveData.checkins || []), ...(appData.checkins || [])];
  appData.completedItems = [...(archiveData.completedItems || []), ...(appData.completedItems || [])];
  if (archiveData.diet) {
    appData.diet.entries = [...(archiveData.diet.entries || []), ...(appData.diet.entries || [])];
    appData.diet.weights = [...(archiveData.diet.weights || []), ...(appData.diet.weights || [])];
  }

  // Clear stale sync queue (>7 days old)
  cleanStaleFamilyChanges();

  // Render all sections
  renderDateRange();
  renderMomentumDots(appData.checkins);
  renderEncouragement(appData);
  renderLastUpdated(appData);
  renderKPIStrip(appData);
  renderDailyFocus(appData);
  renderWeeklyObjectives(appData.tasks);
  renderWinsAndTime(appData, 'today');
  renderWeightCard(appData.diet);
  renderProjectsAgenda(appData.tasks);
  renderRecurringHabits(appData.tasks);
  renderBacklog(appData.tasks);
  renderDayByDay(appData.checkins, appData.diet ? appData.diet.entries : []);
  renderIdentityVotes(appData);
  renderNotes();
  setupToggle();
  setupCollapsibleSections();
  setupTabRail();
  updateSyncButton();
});

// --- Header ---

function renderDateRange() {
  const { weekStart } = getWeekRange();
  const fri = new Date(weekStart);
  fri.setDate(weekStart.getDate() + 4);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('dateRange').textContent = `${fmt(weekStart)} – ${fmt(fri)}, ${new Date().getFullYear()}`;
}

function renderLastUpdated(data) {
  const el = document.getElementById('lastUpdated');
  const checkins = data.checkins || [];
  if (checkins.length === 0) { el.textContent = ''; return; }
  const lastDate = checkins.map(c => c.date).sort().pop();
  const d = new Date(lastDate + 'T12:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  el.textContent = `Last check-in: ${label}`;
}

// --- Collapsible sections ---

function setupCollapsibleSections() {
  document.querySelectorAll('.card > h2, .card > .section-header-with-toggle > h2').forEach(h2 => {
    const card = h2.closest('.card');
    if (card.classList.contains('backlog-card') || card.classList.contains('notes-card')) return;

    h2.classList.add('collapsible-header');
    h2.addEventListener('click', () => {
      card.classList.toggle('section-collapsed');
      const key = 'collapse-' + (card.id || h2.textContent.trim());
      localStorage.setItem(key, card.classList.contains('section-collapsed'));
    });

    const key = 'collapse-' + (card.id || h2.textContent.trim());
    if (localStorage.getItem(key) === 'true') {
      card.classList.add('section-collapsed');
    }
  });
}

// --- Tab Rail ---

function setupTabRail() {
  document.querySelectorAll('.tab-rail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-rail-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab === 'dashboard' ? 'tabDashboard' : 'tabFamily';
      document.getElementById(tabId).classList.add('active');
      if (btn.dataset.tab === 'family') { renderFamilyHub(); setupFamilySync(); }
    });
  });
}

const FAMILY_SECTIONS = ['thisWeek', 'backlog', 'decisions', 'purchases'];
const FAMILY_LABELS = { thisWeek: 'This Week', backlog: 'Backlog', decisions: 'Decisions', purchases: 'Purchases' };

function getFamilyHub() {
  if (!appData.familyHub) appData.familyHub = {};
  // Migrate old keys
  if (appData.familyHub.now) { appData.familyHub.thisWeek = appData.familyHub.now; delete appData.familyHub.now; }
  if (appData.familyHub.comingUp) { appData.familyHub.backlog = appData.familyHub.comingUp; delete appData.familyHub.comingUp; }
  for (const s of FAMILY_SECTIONS) if (!appData.familyHub[s]) appData.familyHub[s] = [];
  // Apply local additions
  let added;
  try { added = JSON.parse(localStorage.getItem('family-hub-added')) || []; } catch { added = []; }
  for (const a of added) {
    const list = appData.familyHub[a.section];
    if (list && !list.find(i => i.text === a.item.text)) list.push(a.item);
  }
  return appData.familyHub;
}

function saveFamilyChange(type, payload) {
  const key = 'family-hub-changes';
  let changes;
  try { changes = JSON.parse(localStorage.getItem(key)) || []; } catch { changes = []; }
  changes.push({ type, ...payload, timestamp: Date.now() });
  localStorage.setItem(key, JSON.stringify(changes));
  updateSyncButton();
  updateFamilySyncBtn();
}

function countFamilyChanges() {
  const deduped = deduplicateFamilyChanges();
  let count = deduped.length;
  try {
    const added = JSON.parse(localStorage.getItem('family-hub-added')) || [];
    const seen = new Set();
    for (const a of added) { const k = a.section + '::' + a.item.text; if (!seen.has(k)) { seen.add(k); count++; } }
  } catch {}
  return count;
}

function updateFamilySyncBtn() {
  const btn = document.getElementById('familySyncBtn');
  const countEl = document.getElementById('familySyncCount');
  if (!btn) return;
  const count = countFamilyChanges();
  if (count === 0) {
    btn.style.display = 'none';
  } else {
    btn.style.display = '';
    countEl.textContent = count;
  }
}

function deduplicateFamilyChanges() {
  let changes;
  try { changes = JSON.parse(localStorage.getItem('family-hub-changes')) || []; } catch { return []; }
  // For toggles, assigns, deadlines, comments — only keep the latest per item
  const latest = {};
  const ordered = [];
  for (const c of changes) {
    const key = c.type + '::' + (c.section || c.from || '') + '::' + c.text;
    if (['toggle', 'assign', 'deadline', 'comment'].includes(c.type)) {
      latest[key] = c;
    } else {
      ordered.push(c);
    }
  }
  return [...ordered, ...Object.values(latest)];
}

function generateFamilySyncSummary() {
  const lines = ['FAMILY HUB SYNC — ' + new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), ''];
  const changes = deduplicateFamilyChanges();
  for (const c of changes) {
    if (c.type === 'toggle') lines.push((c.done ? 'HANDLED' : 'REOPENED') + ': ' + c.text + ' [' + c.section + ']');
    else if (c.type === 'add') lines.push('ADDED to ' + c.section + ': ' + c.text);
    else if (c.type === 'edit') lines.push('EDITED [' + c.section + ']: "' + c.oldText + '" → "' + c.newText + '"');
    else if (c.type === 'assign') lines.push('ASSIGNED [' + c.section + ']: ' + c.text + ' → ' + (c.assignee || 'unassigned'));
    else if (c.type === 'deadline') lines.push('DEADLINE [' + c.section + ']: ' + c.text + ' → ' + (c.deadline || 'removed'));
    else if (c.type === 'move') lines.push('MOVED: "' + c.text + '" from ' + c.from + ' → ' + c.to);
    else if (c.type === 'moveToAmir') lines.push('→ AMIR\'S TASKS: ' + c.text + ' (from ' + c.section + ')');
    else if (c.type === 'comment') lines.push('NOTE [' + c.section + ']: ' + c.text + ' → "' + (c.comment || '') + '"');
  }
  try {
    const added = JSON.parse(localStorage.getItem('family-hub-added')) || [];
    // Deduplicate adds
    const seen = new Set();
    for (const a of added) {
      const key = a.section + '::' + a.item.text;
      if (!seen.has(key)) { seen.add(key); lines.push('ADDED to ' + a.section + ': ' + a.item.text); }
    }
  } catch {}
  return lines.join('\n');
}

function setupFamilySync() {
  const btn = document.getElementById('familySyncBtn');
  if (!btn || btn._bound) return;
  btn._bound = true;
  btn.addEventListener('click', () => {
    const summary = generateFamilySyncSummary();
    const subject = encodeURIComponent('Family Hub Sync — ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    const body = encodeURIComponent(summary);
    window.open('https://mail.google.com/mail/?view=cm&to=' + NOTES_EMAIL + '&su=' + subject + '&body=' + body, '_blank');
    // Auto-clear queue after opening Gmail
    localStorage.removeItem('family-hub-changes');
    localStorage.removeItem('family-hub-added');
    btn.style.display = 'none';
    updateFamilySyncBtn();
    updateSyncButton();
  });
  updateFamilySyncBtn();
}

function renderFamilyHandled(hub) {
  const container = document.getElementById('familyHandled');
  const allDone = [];
  const { weekStart } = getWeekRange();
  for (const s of FAMILY_SECTIONS) {
    for (const item of (hub[s] || [])) {
      if (item.done && item.doneDate) {
        const doneTime = new Date(item.doneDate + 'T12:00:00');
        if (doneTime >= weekStart) allDone.push(item);
      }
    }
  }
  if (allDone.length === 0) {
    container.innerHTML = '';
    document.getElementById('familySummary').textContent = 'Our shared space';
    return;
  }
  const decisionsDone = allDone.filter(i => i._section === 'decisions').length;
  let summary = `${allDone.length} thing${allDone.length !== 1 ? 's' : ''} handled this week`;
  if (decisionsDone > 0) summary += `, ${decisionsDone} decision${decisionsDone !== 1 ? 's' : ''} made`;
  document.getElementById('familySummary').textContent = summary;

  container.innerHTML = `<div class="family-handled-list">${allDone.slice(0, 5).map(i =>
    `<span class="family-handled-item">${escapeHtml(i.text)}</span>`
  ).join('')}</div>`;
}

function renderFamilyHub() {
  const hub = getFamilyHub();
  const { weekStart } = getWeekRange();

  // Tag done items with their section for the handled summary
  for (const s of FAMILY_SECTIONS) {
    for (const item of (hub[s] || [])) item._section = s;
  }
  renderFamilyHandled(hub);

  for (const section of FAMILY_SECTIONS) {
    const items = hub[section] || [];
    const capSection = section.charAt(0).toUpperCase() + section.slice(1);
    const container = document.getElementById('family' + capSection);
    const empty = document.getElementById('family' + capSection + 'Empty');

    // Filter: hide done items from before this week (Mon-Sun)
    const visible = items.filter(i => {
      if (!i.done) return true;
      if (!i.doneDate) return true;
      const doneTime = new Date(i.doneDate + 'T12:00:00');
      return doneTime >= weekStart;
    });
    const active = visible.filter(i => !i.done);
    const done = visible.filter(i => i.done);

    if (visible.length === 0) {
      container.style.display = 'none';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      container.style.display = 'block';
    }

    const otherSections = FAMILY_SECTIONS.filter(s => s !== section);
    const sorted = [...active, ...done];
    container.innerHTML = sorted.map(item => {
      const isDecision = section === 'decisions';
      const assignee = item.assignee || '';
      const ownerClass = assignee === 'Amir' ? 'owner-amir' : assignee === 'Arielle' ? 'owner-arielle' : assignee === 'Both' ? 'owner-both' : 'owner-none';
      const ownerLabel = assignee || '—';
      const deadlineHtml = item.deadline
        ? `<span class="family-item-deadline">${new Date(item.deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`
        : '';
      const hasComment = item.comment && item.comment.trim();
      const commentToggle = `<span class="family-comment-toggle${hasComment ? ' has-comment' : ''}" data-section="${section}" data-text="${escapeHtml(item.text)}" title="${hasComment ? 'View note' : 'Add note'}">&#9998;</span>`;
      const moveOptions = otherSections.map(s =>
        `<span class="family-move-option" data-to="${s}" data-from="${section}" data-text="${escapeHtml(item.text)}">${FAMILY_LABELS[s]}</span>`
      ).join('');

      const commentHtml = item._showComment ? (
        `<div class="family-item-comment" data-section="${section}" data-text="${escapeHtml(item.text)}">${escapeHtml(item.comment || '')}</div>`
      ) : '';

      return `<div class="family-item-wrapper"><div class="family-item${item.done ? ' done' : ''}">
        <div class="family-item-check${isDecision ? ' decision' : ''}" data-section="${section}" data-text="${escapeHtml(item.text)}">${item.done ? '&#10003;' : ''}</div>
        <div class="family-item-body">
          <span class="family-item-text" data-section="${section}" data-text="${escapeHtml(item.text)}">${escapeHtml(item.text)}</span>
          <span class="family-owner ${ownerClass}" data-section="${section}" data-text="${escapeHtml(item.text)}">${ownerLabel}</span>
          ${deadlineHtml}
        </div>
        <div class="family-item-actions">
          ${commentToggle}
          <span class="family-item-date-btn" data-section="${section}" data-text="${escapeHtml(item.text)}" title="Date">&#128197;</span>
          <span class="family-item-move-btn" data-section="${section}" data-text="${escapeHtml(item.text)}" title="Move">&#8596;</span>
          <div class="family-move-menu" style="display:none;">
            ${moveOptions}
            <span class="family-move-option move-to-amir" data-to="_amirTasks" data-from="${section}" data-text="${escapeHtml(item.text)}">Amir's tasks</span>
          </div>
        </div>
      </div>${commentHtml}</div>`;
    }).join('');

    // --- Events ---

    // Toggle done
    container.querySelectorAll('.family-item-check').forEach(el => {
      el.addEventListener('click', () => {
        const text = el.dataset.text;
        const item = (hub[section] || []).find(i => i.text === text);
        if (!item) return;
        item.done = !item.done;
        item.doneDate = item.done ? getTodayStr() : null;
        saveFamilyChange('toggle', { section, text, done: item.done });
        renderFamilyHub();
      });
    });

    // Inline edit
    container.querySelectorAll('.family-item-text').forEach(el => {
      el.addEventListener('click', () => {
        if (el.querySelector('input')) return;
        const oldText = el.dataset.text;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'family-inline-edit';
        input.value = oldText;
        el.textContent = '';
        el.appendChild(input);
        input.focus();
        input.select();
        const save = () => {
          const newText = input.value.trim();
          if (newText && newText !== oldText) {
            const item = (hub[section] || []).find(i => i.text === oldText);
            if (item) item.text = newText;
            saveFamilyChange('edit', { section, oldText, newText });
          }
          renderFamilyHub();
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); save(); }
          if (ev.key === 'Escape') renderFamilyHub();
        });
      });
    });

    // Toggle assignee
    container.querySelectorAll('.family-owner').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = el.dataset.text;
        const item = (hub[section] || []).find(i => i.text === text);
        if (!item) return;
        const cycle = ['Amir', 'Arielle', 'Both', ''];
        const idx = cycle.indexOf(item.assignee || '');
        item.assignee = cycle[(idx + 1) % cycle.length];
        saveFamilyChange('assign', { section, text, assignee: item.assignee });
        renderFamilyHub();
      });
    });

    // Deadline picker
    container.querySelectorAll('.family-item-date-btn').forEach(el => {
      el.addEventListener('click', () => {
        const text = el.dataset.text;
        const item = (hub[section] || []).find(i => i.text === text);
        const picker = document.createElement('input');
        picker.type = 'date';
        picker.className = 'family-date-picker';
        picker.value = item && item.deadline ? item.deadline : '';
        el.parentElement.appendChild(picker);
        picker.focus();
        picker.showPicker && picker.showPicker();
        const finish = () => {
          const val = picker.value;
          if (item) item.deadline = val || null;
          saveFamilyChange('deadline', { section, text, deadline: val || null });
          picker.remove();
          renderFamilyHub();
        };
        picker.addEventListener('change', finish);
        picker.addEventListener('blur', () => setTimeout(() => picker.remove(), 200));
      });
    });

    // Move menu
    container.querySelectorAll('.family-item-move-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = el.parentElement.querySelector('.family-move-menu');
        const isOpen = menu.style.display !== 'none';
        document.querySelectorAll('.family-move-menu').forEach(m => m.style.display = 'none');
        menu.style.display = isOpen ? 'none' : 'flex';
      });
    });

    container.querySelectorAll('.family-move-option').forEach(el => {
      el.addEventListener('click', () => {
        const from = el.dataset.from;
        const to = el.dataset.to;
        const text = el.dataset.text;
        if (to === '_amirTasks') {
          saveFamilyChange('moveToAmir', { section: from, text });
          const row = el.closest('.family-item');
          if (row) { row.style.opacity = '0.3'; row.style.pointerEvents = 'none'; }
          return;
        }
        const fromList = hub[from] || [];
        const idx = fromList.findIndex(i => i.text === text);
        if (idx === -1) return;
        const [item] = fromList.splice(idx, 1);
        if (!hub[to]) hub[to] = [];
        hub[to].push(item);
        saveFamilyChange('move', { from, to, text });
        renderFamilyHub();
      });
    });

    // Comment toggle
    container.querySelectorAll('.family-comment-toggle').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = el.dataset.text;
        const item = (hub[section] || []).find(i => i.text === text);
        if (!item) return;
        item._showComment = !item._showComment;
        renderFamilyHub();
      });
    });

    // Comment edit
    container.querySelectorAll('.family-item-comment').forEach(el => {
      el.addEventListener('click', () => {
        if (el.querySelector('textarea')) return;
        const text = el.dataset.text;
        const item = (hub[section] || []).find(i => i.text === text);
        const ta = document.createElement('textarea');
        ta.className = 'family-item-comment-edit';
        ta.value = item ? (item.comment || '') : '';
        ta.rows = 2;
        el.style.display = 'none';
        el.parentElement.insertBefore(ta, el.nextSibling);
        ta.focus();
        const save = () => {
          const val = ta.value.trim();
          if (item) item.comment = val;
          saveFamilyChange('comment', { section, text, comment: val });
          ta.remove();
          renderFamilyHub();
        };
        ta.addEventListener('blur', save);
        ta.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); save(); }
          if (ev.key === 'Escape') { ta.remove(); renderFamilyHub(); }
        });
      });
    });
  }

  // Add item inputs
  document.querySelectorAll('.family-add-input').forEach(input => {
    if (input._bound) return;
    input._bound = true;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const text = input.value.trim();
      if (!text) return;
      const section = input.dataset.section;
      const item = { text, date: getTodayStr(), addedBy: '', assignee: '', done: false, deadline: null };
      if (!hub[section]) hub[section] = [];
      hub[section].push(item);
      let added;
      try { added = JSON.parse(localStorage.getItem('family-hub-added')) || []; } catch { added = []; }
      added.push({ section, item });
      localStorage.setItem('family-hub-added', JSON.stringify(added));
      saveFamilyChange('add', { section, text });
      input.value = '';
      renderFamilyHub();
    });
  });

  // Close move menus on outside click
  if (!document._familyClickBound) {
    document._familyClickBound = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.family-item-actions')) {
        document.querySelectorAll('.family-move-menu').forEach(m => m.style.display = 'none');
      }
    });
  }

  // Render upcoming + ahead
  renderFamilyUpcoming();
  renderFamilyAhead();
}

// --- Stale sync cleanup ---

function cleanStaleFamilyChanges() {
  const cutoff = Date.now() - 7 * 86400000;
  try {
    const changes = JSON.parse(localStorage.getItem('family-hub-changes')) || [];
    const fresh = changes.filter(c => c.timestamp && c.timestamp > cutoff);
    if (fresh.length < changes.length) {
      if (fresh.length === 0) localStorage.removeItem('family-hub-changes');
      else localStorage.setItem('family-hub-changes', JSON.stringify(fresh));
    }
  } catch { localStorage.removeItem('family-hub-changes'); }
  try {
    const added = JSON.parse(localStorage.getItem('family-hub-added')) || [];
    const freshAdded = added.filter(a => {
      if (!a.item || !a.item.date) return false;
      const age = (Date.now() - new Date(a.item.date + 'T12:00:00').getTime()) / 86400000;
      return age <= 7;
    });
    if (freshAdded.length < added.length) {
      if (freshAdded.length === 0) localStorage.removeItem('family-hub-added');
      else localStorage.setItem('family-hub-added', JSON.stringify(freshAdded));
    }
  } catch { localStorage.removeItem('family-hub-added'); }
}

// --- Upcoming events: hide/highlight ---

function getUpcomingHidden() {
  try { return JSON.parse(localStorage.getItem('family-upcoming-hidden')) || []; } catch { return []; }
}

function getUpcomingHighlighted() {
  try { return JSON.parse(localStorage.getItem('family-upcoming-highlighted')) || []; } catch { return []; }
}

function upcomingKey(evt) { return evt.date + '::' + evt.summary; }

function renderFamilyUpcoming() {
  const container = document.getElementById('familyUpcoming');
  if (!container) return;
  const events = (appData && appData.familyHub && appData.familyHub.upcomingEvents) || [];
  const hidden = getUpcomingHidden();
  const highlighted = getUpcomingHighlighted();

  if (events.length === 0) {
    container.innerHTML = '<p class="empty-state family-empty">Calendar events will appear here after next check-in.</p>';
    return;
  }

  // Group by week, skip hidden and past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = {};

  for (const evt of events) {
    const d = new Date(evt.date + 'T12:00:00');
    if (d < today) continue;
    if (hidden.includes(upcomingKey(evt))) continue;
    const daysOut = Math.floor((d - today) / 86400000);
    let groupLabel;
    if (daysOut <= 0) groupLabel = 'Today';
    else if (daysOut <= 1) groupLabel = 'Tomorrow';
    else if (daysOut <= 7) groupLabel = 'This Week';
    else if (daysOut <= 14) groupLabel = 'Next Week';
    else groupLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' week';
    if (!groups[groupLabel]) groups[groupLabel] = [];
    groups[groupLabel].push(evt);
  }

  let html = '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const [label, evts] of Object.entries(groups)) {
    const isThisWeek = label === 'Today' || label === 'Tomorrow' || label === 'This Week';
    html += `<div class="upcoming-group"><div class="upcoming-group-label${isThisWeek ? ' upcoming-soon' : ''}">${label}</div>`;
    for (const evt of evts) {
      const d = new Date(evt.date + 'T12:00:00');
      const dayName = dayNames[d.getDay()];
      const key = upcomingKey(evt);
      const isHighlighted = highlighted.includes(key);
      const typeClass = evt.type === 'daycare-closed' ? ' upcoming-alert' : evt.type === 'travel' ? ' upcoming-travel' : '';
      const hlClass = isHighlighted ? ' upcoming-highlighted' : '';
      html += `<div class="upcoming-event${typeClass}${hlClass}" data-key="${escapeHtml(key)}">
        <span class="upcoming-day">${dayName}</span>
        <span class="upcoming-text">${escapeHtml(evt.summary)}</span>
        ${evt.time ? `<span class="upcoming-time">${evt.time}</span>` : ''}
        <span class="upcoming-actions">
          <span class="upcoming-star${isHighlighted ? ' active' : ''}" data-key="${escapeHtml(key)}" title="Highlight">&#9733;</span>
          <span class="upcoming-hide" data-key="${escapeHtml(key)}" title="Hide">&times;</span>
        </span>
      </div>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;

  // Highlight toggle
  container.querySelectorAll('.upcoming-star').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = el.dataset.key;
      const hl = getUpcomingHighlighted();
      const idx = hl.indexOf(key);
      if (idx === -1) {
        hl.push(key);
        saveFamilyChange('highlight-event', { key });
      } else {
        hl.splice(idx, 1);
        saveFamilyChange('unhighlight-event', { key });
      }
      localStorage.setItem('family-upcoming-highlighted', JSON.stringify(hl));
      renderFamilyUpcoming();
    });
  });

  // Hide
  container.querySelectorAll('.upcoming-hide').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = el.dataset.key;
      const h = getUpcomingHidden();
      h.push(key);
      localStorage.setItem('family-upcoming-hidden', JSON.stringify(h));
      saveFamilyChange('hide-event', { key });
      renderFamilyUpcoming();
    });
  });
}

// --- Anticipation Engine ---

let _aheadPrompts = null;

async function loadAheadPrompts() {
  if (_aheadPrompts) return _aheadPrompts;
  try {
    const res = await fetch('prompts.json');
    const data = await res.json();
    _aheadPrompts = data.prompts || [];
  } catch { _aheadPrompts = []; }
  return _aheadPrompts;
}

function getAheadCompleted() {
  try { return JSON.parse(localStorage.getItem('ahead-completed')) || {}; } catch { return {}; }
}

function markAheadCompleted(id) {
  const c = getAheadCompleted();
  c[id + '-' + new Date().getFullYear()] = getTodayStr();
  localStorage.setItem('ahead-completed', JSON.stringify(c));
}

function isAheadCompleted(id) {
  const c = getAheadCompleted();
  return !!c[id + '-' + new Date().getFullYear()];
}

function getActivePrompts(prompts) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const completed = getAheadCompleted();
  const year = now.getFullYear();

  return prompts.filter(p => {
    // Date window check
    const start = p.month;
    const end = p.endMonth || p.month;
    let inWindow;
    if (start <= end) {
      inWindow = month >= start && month <= end;
    } else {
      inWindow = month >= start || month <= end;
    }
    if (!inWindow) return false;

    // Already completed this year?
    if (completed[p.id + '-' + year]) return false;

    return true;
  });
}

async function renderFamilyAhead() {
  const container = document.getElementById('familyAhead');
  if (!container) return;

  const prompts = await loadAheadPrompts();
  const active = getActivePrompts(prompts);

  if (active.length === 0) {
    container.innerHTML = '<p class="empty-state family-empty">Nothing to think about right now.</p>';
    return;
  }

  // Sort: act first, then think, then routine
  const order = { act: 0, think: 1, routine: 2 };
  active.sort((a, b) => (order[a.urgency] || 9) - (order[b.urgency] || 9));

  const urgencyLabels = { act: 'Act Now', think: 'Think Ahead', routine: 'Routine' };
  const urgencyIcons = { act: '🔴', think: '🟡', routine: '🟢' };

  let lastUrgency = '';
  let html = '';
  for (const p of active) {
    if (p.urgency !== lastUrgency) {
      lastUrgency = p.urgency;
      html += `<div class="ahead-urgency-label">${urgencyIcons[p.urgency] || ''} ${urgencyLabels[p.urgency] || ''}</div>`;
    }
    html += `<div class="ahead-item">
      <div class="ahead-item-content">
        <div class="ahead-item-title">${escapeHtml(p.title)}</div>
        <div class="ahead-item-desc">${escapeHtml(p.desc)}</div>
      </div>
      <div class="ahead-item-actions">
        <button class="ahead-add-btn" data-id="${p.id}" data-text="${escapeHtml(p.title)}" data-section="thisWeek" title="Add to This Week">+TW</button>
        <button class="ahead-add-btn" data-id="${p.id}" data-text="${escapeHtml(p.title)}" data-section="backlog" title="Add to Backlog">+BL</button>
        <button class="ahead-done-btn" data-id="${p.id}" title="Done / dismiss">✓</button>
      </div>
    </div>`;
  }
  container.innerHTML = html;

  // Add to section
  container.querySelectorAll('.ahead-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      const text = btn.dataset.text;
      const id = btn.dataset.id;
      const hub = getFamilyHub();
      if (!hub[section]) hub[section] = [];
      const item = { text, date: getTodayStr(), addedBy: 'Ahead', assignee: '', done: false, deadline: null };
      hub[section].push(item);
      let added;
      try { added = JSON.parse(localStorage.getItem('family-hub-added')) || []; } catch { added = []; }
      added.push({ section, item });
      localStorage.setItem('family-hub-added', JSON.stringify(added));
      saveFamilyChange('add', { section, text });
      markAheadCompleted(id);
      renderFamilyHub();
    });
  });

  // Dismiss
  container.querySelectorAll('.ahead-done-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      markAheadCompleted(btn.dataset.id);
      renderFamilyAhead();
    });
  });
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
    const ns = getNotes();
    ns.push({ text, timestamp: Date.now() });
    saveNotes(ns);
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

  const noteCount = getNotes().length;
  if (noteCount > 0) fab.setAttribute('data-count', noteCount);
  else fab.removeAttribute('data-count');
}

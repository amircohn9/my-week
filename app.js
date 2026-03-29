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

const FAMILY_SECTIONS = ['thisWeek', 'comingUp', 'decisions', 'someday'];
const FAMILY_LABELS = { thisWeek: 'This Week', comingUp: 'Coming Up', decisions: 'Decisions', someday: 'Someday' };

function getFamilyHub() {
  if (!appData.familyHub) appData.familyHub = {};
  // Migrate old keys
  if (appData.familyHub.now) { appData.familyHub.thisWeek = appData.familyHub.now; delete appData.familyHub.now; }
  if (appData.familyHub.backlog) { appData.familyHub.comingUp = appData.familyHub.backlog; delete appData.familyHub.backlog; }
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
  let count = 0;
  try { count += (JSON.parse(localStorage.getItem('family-hub-changes')) || []).length; } catch {}
  try { count += (JSON.parse(localStorage.getItem('family-hub-added')) || []).length; } catch {}
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

function generateFamilySyncSummary() {
  const lines = ['FAMILY HUB SYNC — ' + new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), ''];
  try {
    const changes = JSON.parse(localStorage.getItem('family-hub-changes')) || [];
    for (const c of changes) {
      if (c.type === 'toggle') lines.push((c.done ? 'HANDLED' : 'REOPENED') + ': ' + c.text + ' [' + c.section + ']');
      else if (c.type === 'add') lines.push('ADDED to ' + c.section + ': ' + c.text);
      else if (c.type === 'edit') lines.push('EDITED [' + c.section + ']: "' + c.oldText + '" → "' + c.newText + '"');
      else if (c.type === 'assign') lines.push('ASSIGNED [' + c.section + ']: ' + c.text + ' → ' + (c.assignee || 'unassigned'));
      else if (c.type === 'deadline') lines.push('DEADLINE [' + c.section + ']: ' + c.text + ' → ' + (c.deadline || 'removed'));
      else if (c.type === 'move') lines.push('MOVED: "' + c.text + '" from ' + c.from + ' → ' + c.to);
      else if (c.type === 'moveToAmir') lines.push('→ AMIR\'S TASKS: ' + c.text + ' (from ' + c.section + ')');
    }
  } catch {}
  try {
    const added = JSON.parse(localStorage.getItem('family-hub-added')) || [];
    for (const a of added) lines.push('ADDED to ' + a.section + ': ' + a.item.text);
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
    // Show confirm/undo strip
    btn.style.display = 'none';
    let strip = document.getElementById('familySyncConfirm');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'familySyncConfirm';
      strip.className = 'family-sync-confirm';
      btn.parentElement.appendChild(strip);
    }
    strip.innerHTML = '<span>Did you send it?</span><button class="family-sync-yes">Yes, clear queue</button><button class="family-sync-no">No, keep changes</button>';
    strip.style.display = 'flex';
    strip.querySelector('.family-sync-yes').addEventListener('click', () => {
      localStorage.removeItem('family-hub-changes');
      localStorage.removeItem('family-hub-added');
      strip.style.display = 'none';
      updateFamilySyncBtn();
      updateSyncButton();
    });
    strip.querySelector('.family-sync-no').addEventListener('click', () => {
      strip.style.display = 'none';
      btn.style.display = '';
    });
  });
  updateFamilySyncBtn();
}

function renderFamilyHandled(hub) {
  const container = document.getElementById('familyHandled');
  const allDone = [];
  for (const s of FAMILY_SECTIONS) {
    for (const item of (hub[s] || [])) {
      if (item.done && item.doneDate) {
        const age = (Date.now() - new Date(item.doneDate + 'T12:00:00').getTime()) / 86400000;
        if (age <= 7) allDone.push(item);
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

    // Filter: hide done items older than 2 days (they fade out)
    const now = Date.now();
    const visible = items.filter(i => {
      if (!i.done) return true;
      if (!i.doneDate) return true;
      const age = (now - new Date(i.doneDate + 'T12:00:00').getTime()) / 86400000;
      return age <= 2;
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
      const assigneeHtml = assignee
        ? `<span class="family-owner ${assignee === 'Amir' ? 'owner-amir' : 'owner-arielle'}" data-section="${section}" data-text="${escapeHtml(item.text)}">${assignee}'s got this</span>`
        : `<span class="family-owner owner-none" data-section="${section}" data-text="${escapeHtml(item.text)}">who's got this?</span>`;
      const deadlineHtml = item.deadline
        ? `<span class="family-item-deadline">by ${new Date(item.deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`
        : '';
      const flaggedBy = item.addedBy ? `<span class="family-flagged">flagged by ${item.addedBy}</span>` : '';
      const moveOptions = otherSections.map(s =>
        `<span class="family-move-option" data-to="${s}" data-from="${section}" data-text="${escapeHtml(item.text)}">${FAMILY_LABELS[s]}</span>`
      ).join('');

      return `<div class="family-item${item.done ? ' done' : ''}">
        <div class="family-item-check${isDecision ? ' decision' : ''}" data-section="${section}" data-text="${escapeHtml(item.text)}">${item.done ? '&#10003;' : ''}</div>
        <div class="family-item-body">
          <span class="family-item-text" data-section="${section}" data-text="${escapeHtml(item.text)}">${escapeHtml(item.text)}</span>
          ${deadlineHtml}
          <div class="family-item-meta">
            ${assigneeHtml}
            ${flaggedBy}
          </div>
        </div>
        <div class="family-item-actions">
          <span class="family-item-date-btn" data-section="${section}" data-text="${escapeHtml(item.text)}" title="Set deadline">&#128197;</span>
          <span class="family-item-move-btn" data-section="${section}" data-text="${escapeHtml(item.text)}" title="Move">&#8596;</span>
          <div class="family-move-menu" style="display:none;">
            ${moveOptions}
            <span class="family-move-option move-to-amir" data-to="_amirTasks" data-from="${section}" data-text="${escapeHtml(item.text)}">Amir's personal tasks</span>
          </div>
        </div>
      </div>`;
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
        const cycle = ['Amir', 'Arielle', ''];
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

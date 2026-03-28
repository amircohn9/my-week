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
      if (btn.dataset.tab === 'family') renderFamilyHub();
    });
  });
}

const FAMILY_SECTIONS = ['now', 'backlog', 'decisions', 'shopping'];

function renderFamilyHub() {
  const hub = (appData && appData.familyHub) || {};
  for (const section of FAMILY_SECTIONS) {
    const items = hub[section] || [];
    const container = document.getElementById('family' + section.charAt(0).toUpperCase() + section.slice(1));
    const empty = document.getElementById('family' + section.charAt(0).toUpperCase() + section.slice(1) + 'Empty');
    const count = document.getElementById('family' + section.charAt(0).toUpperCase() + section.slice(1) + 'Count');
    const active = items.filter(i => !i.done);
    const done = items.filter(i => i.done);

    if (count) count.textContent = active.length > 0 ? active.length : '';

    if (items.length === 0) {
      container.style.display = 'none';
      empty.style.display = 'block';
      continue;
    }

    empty.style.display = 'none';
    container.style.display = 'block';

    const sorted = [...active, ...done];
    container.innerHTML = sorted.map(item => {
      const d = item.date ? new Date(item.date + 'T12:00:00') : null;
      const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      const byBadge = item.addedBy ? `<span class="family-item-by">${escapeHtml(item.addedBy)}</span>` : '';
      const isDecision = section === 'decisions';
      const checkLabel = isDecision ? (item.done ? '&#10003;' : '') : (item.done ? '&#10003;' : '');
      return `<div class="family-item${item.done ? ' done' : ''}">
        <div class="family-item-check${isDecision ? ' decision' : ''}" data-section="${section}" data-text="${escapeHtml(item.text)}">${checkLabel}</div>
        <div class="family-item-body">
          <div class="family-item-text">${escapeHtml(item.text)}</div>
          <div class="family-item-meta">${byBadge}${dateStr}</div>
        </div>
      </div>`;
    }).join('');

    // Toggle done via click
    container.querySelectorAll('.family-item-check').forEach(el => {
      el.addEventListener('click', () => {
        const sec = el.dataset.section;
        const text = el.dataset.text;
        const hubData = appData.familyHub || {};
        const list = hubData[sec] || [];
        const item = list.find(i => i.text === text);
        if (item) item.done = !item.done;
        // Save toggle to localStorage for sync
        const key = 'family-hub-toggles';
        let toggles;
        try { toggles = JSON.parse(localStorage.getItem(key)) || []; } catch { toggles = []; }
        toggles.push({ section: sec, text, done: item ? item.done : true, timestamp: Date.now() });
        localStorage.setItem(key, JSON.stringify(toggles));
        renderFamilyHub();
      });
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

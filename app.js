// app.js — Init, data loading, collapsible sections (Supabase backend)
//
// SQL required for Trips + Susie + Notes features (run once in Supabase SQL editor):
// ALTER TABLE family_hub_items DROP CONSTRAINT family_hub_items_section_check;
// ALTER TABLE family_hub_items ADD CONSTRAINT family_hub_items_section_check CHECK (section IN ('thisWeek','backlog','decisions','purchases','trips','susie','notes'));
// Note: 'purchases' items are treated as 'decisions' in the app (merged into Decisions & Purchases)

let appData = null;

// Remove thisWeek flag from done items at the start of each new week
function weeklyCleanup(tasks) {
  const { weekStart } = getWeekRange();
  const weekKey = formatDateStr(weekStart);
  const lastCleanup = localStorage.getItem('last-weekly-cleanup');
  if (lastCleanup === weekKey) return;

  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group) continue;
    for (const item of (group.now || [])) {
      let subtasksChanged = false;
      if (item.subtasks) {
        for (const sub of item.subtasks) {
          if (sub.done && sub.thisWeek) {
            sub.thisWeek = false;
            subtasksChanged = true;
          }
        }
        if (subtasksChanged) {
          db.updateTask(item.id, { subtasks: item.subtasks });
        }
      }
      if (item.done && item.thisWeek) {
        item.thisWeek = false;
        db.updateTask(item.id, { thisWeek: false });
      }
    }
  }

  localStorage.setItem('last-weekly-cleanup', weekKey);
}

async function initApp() {
  const session = await db.getSession();
  if (!session) {
    window.addEventListener('authenticated', initApp, { once: true });
    return;
  }

  appData = await db.loadAll();
  appData._completedPrompts = await db.getCompletedPrompts();

  // Ensure an A&A project exists
  const hasAA = Object.values(appData.tasks).some(cat =>
    (cat.now || []).concat(cat.backlog || []).some(t => t.text === 'A&A' || t.text === 'Amir & Arielle')
  );
  if (!hasAA) {
    const newTask = await db.insertTask({ text: 'A&A', category: 'Family', list: 'now', subtasks: [] });
    if (!appData.tasks.Family) appData.tasks.Family = { description: '', now: [], backlog: [], recurring: [] };
    appData.tasks.Family.now.push({ id: newTask.id, text: 'A&A', done: false, deadline: null, link: null, thisWeek: false, today: false, subtasks: [] });
  }

  // Ensure an "Amir General" project exists (default bucket for quick tasks)
  const hasAmirGeneral = Object.values(appData.tasks).some(cat =>
    (cat.now || []).concat(cat.backlog || []).some(t => t.text === 'Amir General')
  );
  if (!hasAmirGeneral) {
    const newTask = await db.insertTask({ text: 'Amir General', category: 'Career', list: 'now', subtasks: [] });
    if (!appData.tasks.Career) appData.tasks.Career = { description: '', now: [], backlog: [], recurring: [] };
    appData.tasks.Career.now.push({ id: newTask.id, text: 'Amir General', done: false, deadline: null, link: null, thisWeek: false, today: false, subtasks: [] });
  }

  // Weekly cleanup: unstar done objectives from previous weeks
  weeklyCleanup(appData.tasks);

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
  setupToggle();
  setupWeekToggle();
  setupCollapsibleSections();
  setupTabRail();
  setupCheckinForm();
}

// --- Weekend Week Toggle ---

function setupWeekToggle() {
  const toggle = document.getElementById('weekToggle');
  if (!toggle) return;

  // Show toggle on weekends
  if (isWeekend()) {
    toggle.style.display = 'flex';
    // Default to "Last Week" on weekends
    viewWeekOffset = -1;
    toggle.querySelectorAll('.week-toggle-btn').forEach(b => b.classList.remove('active'));
    const lastWeekBtn = toggle.querySelector('.week-toggle-btn[data-offset="-1"]');
    if (lastWeekBtn) lastWeekBtn.classList.add('active');
    // Re-render affected sections with last week's data
    reRenderWeekSections();
  }

  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.week-toggle-btn');
    if (!btn) return;
    toggle.querySelectorAll('.week-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    viewWeekOffset = parseInt(btn.dataset.offset);
    reRenderWeekSections();
  });
}

function reRenderWeekSections() {
  if (!appData) return;
  renderDateRange();
  renderKPIStrip(appData);
  renderMomentumDots(appData.checkins);
  renderDayByDay(appData.checkins, appData.diet ? appData.diet.entries : []);
  renderWeeklyObjectives(appData.tasks);
  // Re-render wins with the currently active toggle range
  const activeToggle = document.querySelector('#mainToggle .toggle-btn.active');
  const range = activeToggle ? activeToggle.dataset.range : 'week';
  renderWinsAndTime(appData, range);
}

document.addEventListener('DOMContentLoaded', initApp);

db.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
  }
});

// --- Header ---

function renderDateRange() {
  const { weekStart } = getViewWeekRange();
  const fri = new Date(weekStart);
  fri.setDate(weekStart.getDate() + 4);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('dateRange').textContent = `${fmt(weekStart)} – ${fmt(fri)}, ${weekStart.getFullYear()}`;
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
  const tabMap = { dashboard: 'tabDashboard', family: 'tabFamily', weekend: 'tabWeekend', jobs: 'tabJobs', contacts: 'tabContacts', notes: 'tabNotes' };
  document.querySelectorAll('.tab-rail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-rail-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const tabId = tabMap[btn.dataset.tab] || 'tabDashboard';
      document.getElementById(tabId).classList.add('active');
      if (btn.dataset.tab === 'family') { renderFamilyHub(); }
      if (btn.dataset.tab === 'weekend') { setupWeekendIdeas(); }
      if (btn.dataset.tab === 'jobs') { renderJobApplications(); setupJobAppForm(); }
      if (btn.dataset.tab === 'contacts') { initContacts(); }
      if (btn.dataset.tab === 'notes') { initNotes(); }
    });
  });
}

const FAMILY_SECTIONS = ['thisWeek', 'backlog', 'decisions', 'trips', 'susie', 'notes'];
const FAMILY_LABELS = { thisWeek: 'This Week', backlog: 'Backlog', decisions: 'Decisions & Purchases', trips: 'Upcoming Trips', susie: 'Susie', notes: 'Notes for Amir' };

function getFamilyHub() {
  if (!appData.familyHub) appData.familyHub = {};
  for (const s of FAMILY_SECTIONS) if (!appData.familyHub[s]) appData.familyHub[s] = [];
  return appData.familyHub;
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

function renderFamilyCompleted(hub) {
  const container = document.getElementById('familyCompleted');
  const countEl = document.getElementById('familyCompletedCount');
  const toggle = document.getElementById('familyCompletedToggle');
  if (!container || !toggle) return;

  // Collect all done items across all sections
  const allDone = [];
  for (const s of FAMILY_SECTIONS) {
    for (const item of (hub[s] || [])) {
      if (item.done && item.doneDate) {
        allDone.push({ ...item, _section: s });
      }
    }
  }

  if (countEl) countEl.textContent = allDone.length > 0 ? allDone.length : '';

  if (allDone.length === 0) {
    container.innerHTML = '<p class="empty-state family-empty">No completed items yet.</p>';
    return;
  }

  // Group by week (Mon-Sun)
  const weekGroups = {};
  for (const item of allDone) {
    const d = new Date(item.doneDate + 'T12:00:00');
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const ws = new Date(d);
    ws.setDate(d.getDate() - diff);
    const weekKey = formatDateStr(ws);
    if (!weekGroups[weekKey]) weekGroups[weekKey] = [];
    weekGroups[weekKey].push(item);
  }

  // Sort weeks newest first
  const weekKeys = Object.keys(weekGroups).sort((a, b) => b.localeCompare(a));
  const { weekStart } = getWeekRange();
  const thisWeekKey = formatDateStr(weekStart);

  container.innerHTML = weekKeys.map(weekKey => {
    const ws = new Date(weekKey + 'T12:00:00');
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const isThisWeek = weekKey === thisWeekKey;
    const label = isThisWeek ? 'This Week' : `${fmt(ws)} – ${fmt(we)}`;
    const items = weekGroups[weekKey];

    const itemsHtml = items.map(item => {
      const sectionLabel = FAMILY_LABELS[item._section] || item._section;
      const doneDate = new Date(item.doneDate + 'T12:00:00');
      const dayLabel = doneDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return `<div class="family-completed-item">
        <span class="family-completed-check">&#10003;</span>
        <span class="family-completed-text">${escapeHtml(item.text)}</span>
        <span class="family-completed-meta">${sectionLabel} &middot; ${dayLabel}</span>
      </div>`;
    }).join('');

    return `<div class="family-completed-week">
      <div class="family-completed-week-label">${label} <span class="family-completed-week-count">(${items.length})</span></div>
      ${itemsHtml}
    </div>`;
  }).join('');

  // Toggle expand/collapse
  if (!toggle._bound) {
    toggle._bound = true;
    toggle.addEventListener('click', () => {
      const isHidden = container.style.display === 'none';
      container.style.display = isHidden ? 'block' : 'none';
      toggle.querySelector('.family-completed-arrow').innerHTML = isHidden ? '&#9662;' : '&#9656;';
    });
  }
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
    // Trips section has its own special renderer
    if (section === 'trips') {
      renderFamilyTrips(hub);
      continue;
    }

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
      const commentToggle = `<span class="family-comment-toggle${hasComment ? ' has-comment' : ''}" data-id="${item.id}" title="${hasComment ? 'View note' : 'Add note'}">&#9998;</span>`;
      const moveOptions = otherSections.map(s =>
        `<span class="family-move-option" data-to="${s}" data-from="${section}" data-id="${item.id}">${FAMILY_LABELS[s]}</span>`
      ).join('');

      const commentHtml = item._showComment ? (
        `<div class="family-item-comment" data-id="${item.id}">${escapeHtml(item.comment || '')}</div>`
      ) : '';

      return `<div class="family-item-wrapper"><div class="family-item${item.done ? ' done' : ''}">
        <span class="drag-handle">\u2807</span>
        <div class="family-item-check${isDecision ? ' decision' : ''}" data-id="${item.id}">${item.done ? '&#10003;' : ''}</div>
        <div class="family-item-body">
          <span class="family-item-text" data-id="${item.id}">${escapeHtml(item.text)}</span>
          <span class="family-owner ${ownerClass}" data-id="${item.id}">${ownerLabel}</span>
          ${deadlineHtml}
        </div>
        <div class="family-item-actions">
          ${commentToggle}
          <span class="family-item-date-btn" data-id="${item.id}" title="Date">&#128197;</span>
          <span class="family-item-move-btn" data-id="${item.id}" title="Move">&#8596;</span>
          <span class="family-item-delete-btn" data-id="${item.id}" data-section="${section}" title="Delete">&times;</span>
          <div class="family-move-menu" style="display:none;">
            ${moveOptions}
            <span class="family-move-option move-to-amir" data-to="_amirTasks" data-from="${section}" data-id="${item.id}">Amir's tasks</span>
            ${item.comment && item.comment.includes('Moved to dashboard') ? `<span class="family-move-option undo-move-to-amir" data-from="${section}" data-id="${item.id}">Undo move to Amir</span>` : ''}
          </div>
        </div>
      </div>${commentHtml}</div>`;
    }).join('');

    // --- Events ---

    // Toggle done
    container.querySelectorAll('.family-item-check').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.dataset.id;
        const item = (hub[section] || []).find(i => i.id === id);
        if (!item) return;
        // Optimistic UI update
        item.done = !item.done;
        item.doneDate = item.done ? getTodayStr() : null;
        renderFamilyHub();
        // Write to Supabase
        await db.updateFamilyItem(id, { done: item.done, doneDate: item.doneDate });
      });
    });

    // Inline edit
    container.querySelectorAll('.family-item-text').forEach(el => {
      el.addEventListener('click', () => {
        if (el.querySelector('input')) return;
        const id = el.dataset.id;
        const item = (hub[section] || []).find(i => i.id === id);
        if (!item) return;
        const oldText = item.text;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'family-inline-edit';
        input.value = oldText;
        el.textContent = '';
        el.appendChild(input);
        input.focus();
        input.select();
        const save = async () => {
          const newText = input.value.trim();
          if (newText && newText !== oldText) {
            item.text = newText;
            await db.updateFamilyItem(id, { text: newText });
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
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        const item = (hub[section] || []).find(i => i.id === id);
        if (!item) return;
        const cycle = ['Amir', 'Arielle', 'Both', ''];
        const idx = cycle.indexOf(item.assignee || '');
        item.assignee = cycle[(idx + 1) % cycle.length];
        renderFamilyHub();
        await db.updateFamilyItem(id, { assignee: item.assignee });
      });
    });

    // Deadline picker
    container.querySelectorAll('.family-item-date-btn').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const item = (hub[section] || []).find(i => i.id === id);
        const picker = document.createElement('input');
        picker.type = 'date';
        picker.className = 'family-date-picker';
        picker.value = item && item.deadline ? item.deadline : '';
        el.parentElement.appendChild(picker);
        picker.focus();
        picker.showPicker && picker.showPicker();
        const finish = async () => {
          const val = picker.value;
          if (item) item.deadline = val || null;
          picker.remove();
          renderFamilyHub();
          await db.updateFamilyItem(id, { deadline: val || null });
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
      el.addEventListener('click', async () => {
        const from = el.dataset.from;
        const to = el.dataset.to;
        const id = el.dataset.id;

        // Undo move to Amir
        if (el.classList.contains('undo-move-to-amir')) {
          const item = (hub[from] || []).find(i => i.id === id);
          if (!item) return;
          // Remove "Moved to dashboard" from comment
          item.comment = (item.comment || '').replace(/\s*\|?\s*Moved to dashboard \d{4}-\d{2}-\d{2}/g, '').trim();
          item.assignee = '';
          await db.updateFamilyItem(id, { assignee: '', comment: item.comment });

          // Find and remove the subtask from the A&A project
          const taskData = appData.tasks || {};
          for (const cat of CATEGORY_ORDER) {
            const group = taskData[cat];
            if (!group) continue;
            for (const t of (group.now || [])) {
              if (t.text && (t.text.includes('A&A') || t.text.toLowerCase().includes('amir & arielle'))) {
                const subIdx = t.subtasks.findIndex(s => s.text === item.text);
                if (subIdx !== -1) {
                  t.subtasks.splice(subIdx, 1);
                  db.updateTask(t.id, { subtasks: t.subtasks });
                }
              }
            }
          }
          renderFamilyHub();
          renderProjectsAgenda(appData.tasks);
          renderWeeklyObjectives(appData.tasks);
          return;
        }

        if (to === '_amirTasks') {
          const item = (hub[from] || []).find(i => i.id === id);
          if (!item) return;
          // Optimistic UI
          const row = el.closest('.family-item');
          if (row) { row.style.opacity = '0.3'; row.style.pointerEvents = 'none'; }

          // Check if an A&A project exists in any category
          let aaProject = null;
          const taskData = appData.tasks || {};
          for (const cat of CATEGORY_ORDER) {
            const group = taskData[cat];
            if (!group) continue;
            for (const t of (group.now || [])) {
              if (t.text && (t.text.includes('A&A') || t.text.toLowerCase().includes('amir & arielle') || t.text.toLowerCase().includes('amir and arielle'))) {
                aaProject = { task: t, category: cat };
                break;
              }
            }
            if (aaProject) break;
          }

          if (aaProject) {
            // Add as subtask of the A&A project
            const newSub = { text: item.text, done: false, thisWeek: true, today: false };
            aaProject.task.subtasks.push(newSub);
          } else {
            // No A&A project found — create one, then add subtask
            const newTask = await db.insertTask({ text: 'A&A', category: 'Family', list: 'now', subtasks: [{ text: item.text, done: false, thisWeek: true, today: false }] });
            if (!appData.tasks.Family) appData.tasks.Family = { now: [], backlog: [], recurring: [] };
            appData.tasks.Family.now.push({ id: newTask.id, text: 'A&A', done: false, deadline: null, link: null, subtasks: newTask.subtasks || [{ text: item.text, done: false, thisWeek: true, today: false }], thisWeek: false, today: false });
          }

          // Mark the family item as moved (don't delete it)
          const todayStr = getTodayStr();
          item.comment = (item.comment ? item.comment + ' | ' : '') + 'Moved to dashboard ' + todayStr;
          item.assignee = 'Amir';

          // Re-render immediately (optimistic UI) before persisting
          renderFamilyHub();
          renderProjectsAgenda(appData.tasks);
          renderWeeklyObjectives(appData.tasks);
          renderTodayTasks(appData);

          // Persist to Supabase in background
          if (aaProject) {
            db.updateTask(aaProject.task.id, { subtasks: aaProject.task.subtasks });
          }
          db.updateFamilyItem(id, { assignee: 'Amir', comment: item.comment });
          return;
        }

        const fromList = hub[from] || [];
        const idx = fromList.findIndex(i => i.id === id);
        if (idx === -1) return;
        const [item] = fromList.splice(idx, 1);
        if (!hub[to]) hub[to] = [];
        hub[to].push(item);
        renderFamilyHub();
        await db.updateFamilyItem(id, { section: to });
      });
    });

    // Comment toggle
    container.querySelectorAll('.family-comment-toggle').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        const item = (hub[section] || []).find(i => i.id === id);
        if (!item) return;
        item._showComment = !item._showComment;
        renderFamilyHub();
      });
    });

    // Delete item
    container.querySelectorAll('.family-item-delete-btn').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        const sec = el.dataset.section;
        if (!confirm('Delete this item?')) return;
        const list = hub[sec] || [];
        const idx = list.findIndex(i => i.id === id);
        if (idx >= 0) list.splice(idx, 1);
        renderFamilyHub();
        await db.deleteFamilyItem(id);
      });
    });

    // Comment edit
    container.querySelectorAll('.family-item-comment').forEach(el => {
      el.addEventListener('click', () => {
        if (el.querySelector('textarea')) return;
        const id = el.dataset.id;
        const item = (hub[section] || []).find(i => i.id === id);
        const ta = document.createElement('textarea');
        ta.className = 'family-item-comment-edit';
        ta.value = item ? (item.comment || '') : '';
        ta.rows = 2;
        el.style.display = 'none';
        el.parentElement.insertBefore(ta, el.nextSibling);
        ta.focus();
        const save = async () => {
          const val = ta.value.trim();
          if (item) item.comment = val;
          ta.remove();
          renderFamilyHub();
          await db.updateFamilyItem(id, { comment: val });
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

    const addItem = async () => {
      const text = input.value.trim();
      if (!text) return;
      const section = input.dataset.section;
      input.value = '';
      input.blur();
      const returned = await db.insertFamilyItem({ text, section, addedBy: 'Amir' });
      const hub = getFamilyHub();
      if (!hub[section]) hub[section] = [];
      hub[section].push({
        id: returned.id,
        text: returned.text,
        date: returned.date,
        addedBy: returned.added_by,
        assignee: returned.assignee || '',
        done: returned.done,
        doneDate: returned.done_date,
        deadline: returned.deadline,
        comment: returned.comment || '',
      });
      renderFamilyHub();
    };

    // Desktop: Enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addItem(); }
    });

    // Android fallback: detect newline inserted by virtual keyboard
    input.addEventListener('input', () => {
      if (input.value.includes('\n')) {
        input.value = input.value.replace(/\n/g, '');
        addItem();
      }
    });

    // Wire up the "Add" button next to the input
    const addBtn = input.parentElement.querySelector('.family-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        addItem();
      });
    }
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

  // Render upcoming + ahead + completed archive
  renderFamilyUpcoming();
  renderFamilyAhead();
  renderFamilyCompleted(hub);

  // Init drag-and-drop on all family list sections
  initFamilySortable();
}

// --- Drag-and-drop for family hub lists ---

function initFamilySortable() {
  if (typeof Sortable === 'undefined') return;
  for (const section of FAMILY_SECTIONS) {
    if (section === 'trips') continue;
    const capSection = section.charAt(0).toUpperCase() + section.slice(1);
    const container = document.getElementById('family' + capSection);
    if (!container || container.children.length === 0) continue;
    new Sortable(container, {
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd: async function () {
        const hub = getFamilyHub();
        const items = hub[section] || [];
        const wrappers = container.querySelectorAll('.family-item-wrapper');
        const newOrder = Array.from(wrappers).map(w => {
          const check = w.querySelector('.family-item-check');
          return check ? check.dataset.id : null;
        }).filter(Boolean);
        const reordered = newOrder.map(id => items.find(i => i.id === id)).filter(Boolean);
        hub[section].length = 0;
        reordered.forEach(item => hub[section].push(item));
        for (let i = 0; i < reordered.length; i++) {
          db.updateFamilyItem(reordered[i].id, { sort_order: i });
        }
      }
    });
  }
}

// --- Trips section ---

function renderFamilyTrips(hub) {
  const container = document.getElementById('familyTrips');
  const empty = document.getElementById('familyTripsEmpty');
  if (!container) return;

  const items = hub.trips || [];

  if (items.length === 0) {
    container.style.display = 'none';
    if (empty) empty.style.display = 'block';
  } else {
    if (empty) empty.style.display = 'none';
    container.style.display = 'block';
  }

  container.innerHTML = items.map(item => {
    // Parse checklist from comment field
    let checklist = [];
    try { checklist = JSON.parse(item.comment || '[]'); } catch (e) { checklist = []; }
    if (!Array.isArray(checklist)) checklist = [];

    const checklistHtml = checklist.map((cl, ci) => {
      return `<div class="trip-checklist-item ${cl.done ? 'trip-cl-done' : ''}">
        <input type="checkbox" class="trip-cl-checkbox" data-id="${item.id}" data-cl-idx="${ci}" ${cl.done ? 'checked' : ''}>
        <span class="trip-cl-text">${escapeHtml(cl.text)}</span>
        <button class="trip-cl-delete" data-id="${item.id}" data-cl-idx="${ci}" title="Remove">&times;</button>
      </div>`;
    }).join('');

    const deadlineHtml = item.deadline
      ? `<span class="trip-dates">${new Date(item.deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>`
      : '<span class="trip-dates-empty">No date set</span>';

    const doneCount = checklist.filter(c => c.done).length;
    const totalCount = checklist.length;
    const progressHtml = totalCount > 0 ? `<span class="trip-progress">${doneCount}/${totalCount}</span>` : '';

    return `<div class="trip-card" data-id="${item.id}">
      <div class="trip-card-header">
        <span class="trip-name" data-id="${item.id}">${escapeHtml(item.text)}</span>
        ${progressHtml}
        <button class="trip-expand-btn" data-id="${item.id}" title="Expand/collapse">&#9662;</button>
        <button class="trip-delete-btn" data-id="${item.id}" title="Delete trip">&times;</button>
      </div>
      <div class="trip-date-row">
        <span class="trip-date-icon">&#128197;</span>
        ${deadlineHtml}
        <button class="trip-date-btn" data-id="${item.id}" title="Set date">edit</button>
      </div>
      <div class="trip-checklist" data-id="${item.id}" style="display:none;">
        ${checklistHtml}
        <div class="trip-add-row">
          <input type="text" class="trip-add-input" data-id="${item.id}" placeholder="+ add checklist item">
        </div>
      </div>
    </div>`;
  }).join('');

  // --- Event listeners ---

  // Expand/collapse checklist
  container.querySelectorAll('.trip-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const cl = container.querySelector(`.trip-checklist[data-id="${id}"]`);
      if (!cl) return;
      const isHidden = cl.style.display === 'none';
      cl.style.display = isHidden ? 'block' : 'none';
      btn.innerHTML = isHidden ? '&#9652;' : '&#9662;';
    });
  });

  // Checklist checkbox toggle
  container.querySelectorAll('.trip-cl-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = cb.dataset.id;
      const clIdx = parseInt(cb.dataset.clIdx);
      const item = (hub.trips || []).find(i => i.id === id);
      if (!item) return;
      let checklist = [];
      try { checklist = JSON.parse(item.comment || '[]'); } catch (e) { checklist = []; }
      if (!Array.isArray(checklist) || !checklist[clIdx]) return;
      checklist[clIdx].done = cb.checked;
      item.comment = JSON.stringify(checklist);
      renderFamilyTrips(hub);
      await db.updateFamilyItem(id, { comment: item.comment });
    });
  });

  // Delete checklist item
  container.querySelectorAll('.trip-cl-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const clIdx = parseInt(btn.dataset.clIdx);
      const item = (hub.trips || []).find(i => i.id === id);
      if (!item) return;
      let checklist = [];
      try { checklist = JSON.parse(item.comment || '[]'); } catch (e) { checklist = []; }
      if (!Array.isArray(checklist)) return;
      checklist.splice(clIdx, 1);
      item.comment = JSON.stringify(checklist);
      renderFamilyTrips(hub);
      await db.updateFamilyItem(id, { comment: item.comment });
    });
  });

  // Add checklist item
  container.querySelectorAll('.trip-add-input').forEach(input => {
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const text = input.value.trim();
      if (!text) return;
      const id = input.dataset.id;
      const item = (hub.trips || []).find(i => i.id === id);
      if (!item) return;
      let checklist = [];
      try { checklist = JSON.parse(item.comment || '[]'); } catch (e) { checklist = []; }
      if (!Array.isArray(checklist)) checklist = [];
      checklist.push({ text, done: false });
      item.comment = JSON.stringify(checklist);
      input.value = '';
      renderFamilyTrips(hub);
      await db.updateFamilyItem(id, { comment: item.comment });
    });
  });

  // Edit trip name (click)
  container.querySelectorAll('.trip-name').forEach(el => {
    el.addEventListener('click', () => {
      if (el.querySelector('input')) return;
      const id = el.dataset.id;
      const item = (hub.trips || []).find(i => i.id === id);
      if (!item) return;
      const oldText = item.text;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'family-inline-edit';
      input.value = oldText;
      el.textContent = '';
      el.appendChild(input);
      input.focus();
      input.select();
      const save = async () => {
        const newText = input.value.trim();
        if (newText && newText !== oldText) {
          item.text = newText;
          await db.updateFamilyItem(id, { text: newText });
        }
        renderFamilyTrips(hub);
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); save(); }
        if (ev.key === 'Escape') renderFamilyTrips(hub);
      });
    });
  });

  // Set trip date
  container.querySelectorAll('.trip-date-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = (hub.trips || []).find(i => i.id === id);
      const picker = document.createElement('input');
      picker.type = 'date';
      picker.className = 'family-date-picker';
      picker.value = item && item.deadline ? item.deadline : '';
      btn.parentElement.appendChild(picker);
      picker.focus();
      if (picker.showPicker) picker.showPicker();
      const finish = async () => {
        const val = picker.value;
        if (item) item.deadline = val || null;
        picker.remove();
        renderFamilyTrips(hub);
        await db.updateFamilyItem(id, { deadline: val || null });
      };
      picker.addEventListener('change', finish);
      picker.addEventListener('blur', () => setTimeout(() => picker.remove(), 200));
    });
  });

  // Delete trip
  container.querySelectorAll('.trip-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!confirm('Delete this trip?')) return;
      const idx = (hub.trips || []).findIndex(i => i.id === id);
      if (idx >= 0) hub.trips.splice(idx, 1);
      renderFamilyTrips(hub);
      await db.deleteFamilyItem(id);
    });
  });

  // Init Sortable on trip cards
  if (typeof Sortable !== 'undefined' && container.children.length > 0) {
    new Sortable(container, {
      animation: 150,
      handle: '.trip-card-header',
      ghostClass: 'sortable-ghost',
      draggable: '.trip-card',
      onEnd: async function () {
        const cards = container.querySelectorAll('.trip-card');
        const newOrder = Array.from(cards).map(c => c.dataset.id);
        const reordered = newOrder.map(id => (hub.trips || []).find(i => i.id === id)).filter(Boolean);
        hub.trips.length = 0;
        reordered.forEach(item => hub.trips.push(item));
        for (let i = 0; i < reordered.length; i++) {
          db.updateFamilyItem(reordered[i].id, { sort_order: i });
        }
      }
    });
  }
}

// --- Upcoming events ---

let _showRecurringUpcoming = false;

function renderFamilyUpcoming() {
  const container = document.getElementById('familyUpcoming');
  if (!container) return;
  const events = (appData && appData.familyHub && appData.familyHub.upcomingEvents) || [];

  // Add "Last synced" indicator to the section header
  const upcomingSection = container.closest('.family-section');
  if (upcomingSection) {
    const header = upcomingSection.querySelector('.family-section-header');
    if (header) {
      // Remove old sync note if present
      const oldSync = header.querySelector('.upcoming-sync-indicator');
      if (oldSync) oldSync.remove();
      const oldNote = upcomingSection.querySelector('.upcoming-sync-note');
      if (oldNote) oldNote.remove();
      // Show the most recent check-in date as "last synced"
      const lastCheckin = (appData.checkins || []).map(c => c.date).sort().pop();
      const syncLabel = lastCheckin
        ? new Date(lastCheckin + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'never';
      const syncSpan = document.createElement('span');
      syncSpan.className = 'upcoming-sync-indicator';
      syncSpan.textContent = `Synced ${syncLabel}`;
      syncSpan.title = 'Calendar synced during check-ins';
      header.appendChild(syncSpan);
      // Add prominent sync note below header
      const noteEl = document.createElement('p');
      noteEl.className = 'upcoming-sync-note';
      noteEl.textContent = `Calendar synced during check-ins. Last sync: ${syncLabel}`;
      header.insertAdjacentElement('afterend', noteEl);
    }
  }

  if (events.length === 0) {
    container.innerHTML = '<p class="empty-state family-empty">Calendar events will appear here after next check-in.</p>';
    return;
  }

  // Filter: visible (not hidden), exclude sensitive keywords, and future only
  const EXCLUDED_KEYWORDS = ['sylvia', 'nina', 'chemo'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const visible = events.filter(e => {
    if (e.hidden) return false;
    const lower = (e.summary || '').toLowerCase();
    return !EXCLUDED_KEYWORDS.some(kw => lower.includes(kw));
  });
  const future = visible.filter(e => {
    const d = new Date(e.date + 'T12:00:00');
    return d >= today;
  });

  if (future.length === 0) {
    container.innerHTML = '<p class="empty-state family-empty">No upcoming events.</p>';
    return;
  }

  // Detect recurring: summary appears 3+ times
  const summaryCounts = {};
  for (const evt of future) {
    const key = (evt.summary || '').trim().toLowerCase();
    summaryCounts[key] = (summaryCounts[key] || 0) + 1;
  }

  const isRecurring = (evt) => {
    const key = (evt.summary || '').trim().toLowerCase();
    return (summaryCounts[key] || 0) >= 3;
  };

  // Split: flagged, one-off, recurring
  const flagged = future.filter(e => e.highlighted);
  const nonFlagged = future.filter(e => !e.highlighted);
  const oneOff = nonFlagged.filter(e => !isRecurring(e));
  const recurring = nonFlagged.filter(e => isRecurring(e));

  // Sort chronologically
  const byDate = (a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');
  flagged.sort(byDate);
  oneOff.sort(byDate);
  recurring.sort(byDate);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const renderRow = (evt) => {
    const d = new Date(evt.date + 'T12:00:00');
    const dayName = dayNames[d.getDay()];
    const dateLabel = months[d.getMonth()] + ' ' + d.getDate();
    const typeClass = evt.type === 'daycare-closed' ? ' upcoming-alert' : evt.type === 'travel' ? ' upcoming-travel' : '';
    const isHL = evt.highlighted;

    return `<div class="upcoming-row${typeClass}${isHL ? ' upcoming-row-flagged' : ''}" data-id="${evt.id}">
      <span class="upcoming-row-date">${dateLabel}</span>
      <span class="upcoming-row-day">${dayName}</span>
      <span class="upcoming-row-summary">${escapeHtml(evt.summary)}</span>
      ${evt.time ? `<span class="upcoming-row-time">${evt.time}</span>` : '<span class="upcoming-row-time"></span>'}
      <span class="upcoming-row-actions">
        <span class="upcoming-star${isHL ? ' active' : ''}" data-id="${evt.id}" title="${isHL ? 'Unflag' : 'Flag'}">&#9733;</span>
        <span class="upcoming-hide" data-id="${evt.id}" title="Hide">&times;</span>
      </span>
    </div>`;
  };

  let html = '';

  // Flagged section
  if (flagged.length > 0) {
    html += '<div class="upcoming-section-label upcoming-needs-attention">Needs Attention</div>';
    html += flagged.map(renderRow).join('');
  }

  // Coming up (one-off, non-recurring)
  html += '<div class="upcoming-section-label">Coming Up</div>';
  if (oneOff.length > 0) {
    html += oneOff.map(renderRow).join('');
  } else {
    html += '<p class="empty-state family-empty" style="padding:4px 0;font-size:0.8rem;">Only recurring events ahead.</p>';
  }

  // Recurring toggle
  if (recurring.length > 0) {
    if (_showRecurringUpcoming) {
      html += `<div class="upcoming-recurring-toggle"><button class="upcoming-recurring-btn" id="upcomingRecurringToggle">Hide ${recurring.length} recurring events</button></div>`;
      html += recurring.map(renderRow).join('');
    } else {
      html += `<div class="upcoming-recurring-toggle"><button class="upcoming-recurring-btn" id="upcomingRecurringToggle">Show ${recurring.length} recurring events</button></div>`;
    }
  }

  container.innerHTML = html;

  // --- Event listeners ---

  // Recurring toggle
  const recurToggle = container.querySelector('#upcomingRecurringToggle');
  if (recurToggle) {
    recurToggle.addEventListener('click', () => {
      _showRecurringUpcoming = !_showRecurringUpcoming;
      renderFamilyUpcoming();
    });
  }

  // Highlight toggle
  container.querySelectorAll('.upcoming-star').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const evt = events.find(ev => ev.id === id);
      if (!evt) return;
      evt.highlighted = !evt.highlighted;
      renderFamilyUpcoming();
      await db.updateFamilyEvent(id, { highlighted: evt.highlighted });
    });
  });

  // Hide
  container.querySelectorAll('.upcoming-hide').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const evt = events.find(ev => ev.id === id);
      if (evt) evt.hidden = true;
      renderFamilyUpcoming();
      await db.updateFamilyEvent(id, { hidden: true });
    });
  });

  // Calendar sync button
  const syncBtn = document.getElementById('calendarSyncBtn');
  if (syncBtn && !syncBtn._bound) {
    syncBtn._bound = true;
    syncBtn.addEventListener('click', async () => {
      syncBtn.classList.add('syncing');
      syncBtn.disabled = true;
      try {
        const resp = await fetch('/api/sync-calendar', { method: 'POST' });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Sync failed');
        // Reload data from Supabase and re-render
        appData = await db.loadAll();
        renderFamilyUpcoming();
        renderFamilyHub();
        // Flash success
        syncBtn.classList.remove('syncing');
        syncBtn.classList.add('sync-done');
        setTimeout(() => syncBtn.classList.remove('sync-done'), 2000);
      } catch (err) {
        console.error('Calendar sync error:', err);
        syncBtn.classList.remove('syncing');
        syncBtn.classList.add('sync-error');
        syncBtn.title = `Sync failed: ${err.message}`;
        setTimeout(() => { syncBtn.classList.remove('sync-error'); syncBtn.title = 'Sync Google Calendar'; }, 3000);
      } finally {
        syncBtn.disabled = false;
      }
    });
  }
}

// --- Anticipation Engine ---

function getActivePrompts(prompts) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const completedPrompts = appData._completedPrompts || [];

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
    if (completedPrompts.some(c => c.prompt_id === p.id && c.year === year)) return false;

    return true;
  });
}

function renderFamilyAhead() {
  const container = document.getElementById('familyAhead');
  if (!container) return;

  const prompts = appData.prompts || [];
  const active = getActivePrompts(prompts);

  if (active.length === 0) {
    container.innerHTML = '<p class="empty-state family-empty">Nothing to think about right now.</p>';
    return;
  }

  // Sort: closest month first, then by urgency within the same month
  const currentMonth = new Date().getMonth() + 1;
  const order = { act: 0, think: 1, routine: 2 };

  // Calculate how many months until the prompt's start month (wrapping around year boundary)
  const monthDistance = (m) => {
    if (m >= currentMonth) return m - currentMonth;
    return (12 - currentMonth) + m;
  };

  active.sort((a, b) => {
    const distA = monthDistance(a.month);
    const distB = monthDistance(b.month);
    if (distA !== distB) return distA - distB;
    return (order[a.urgency] || 9) - (order[b.urgency] || 9);
  });

  const urgencyLabels = { act: 'Act Now', think: 'Think Ahead', routine: 'Routine' };
  const urgencyIcons = { act: '\u{1F534}', think: '\u{1F7E1}', routine: '\u{1F7E2}' };

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
        <button class="ahead-done-btn" data-id="${p.id}" title="Done / dismiss">\u2713</button>
      </div>
    </div>`;
  }
  container.innerHTML = html;

  // Add to section
  container.querySelectorAll('.ahead-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const section = btn.dataset.section;
      const text = btn.dataset.text;
      const id = btn.dataset.id;
      const year = new Date().getFullYear();

      // Insert into Supabase family hub
      const returned = await db.insertFamilyItem({ text, section, addedBy: 'Ahead' });
      const hub = getFamilyHub();
      if (!hub[section]) hub[section] = [];
      hub[section].push({
        id: returned.id,
        text: returned.text,
        date: returned.date,
        addedBy: returned.added_by,
        assignee: returned.assignee || '',
        done: returned.done,
        doneDate: returned.done_date,
        deadline: returned.deadline,
        comment: returned.comment || '',
      });

      // Mark prompt completed
      await db.completePrompt(id, year);
      appData._completedPrompts.push({ prompt_id: id, year });

      renderFamilyHub();
    });
  });

  // Dismiss
  container.querySelectorAll('.ahead-done-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const year = new Date().getFullYear();
      await db.completePrompt(id, year);
      appData._completedPrompts.push({ prompt_id: id, year });
      renderFamilyAhead();
    });
  });
}

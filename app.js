// app.js — Init, data loading, collapsible sections (Supabase backend)

let appData = null;

async function initApp() {
  const session = await db.getSession();
  if (!session) {
    window.addEventListener('authenticated', initApp);
    return;
  }

  appData = await db.loadAll();
  appData._completedPrompts = await db.getCompletedPrompts();

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
  setupCollapsibleSections();
  setupTabRail();
  setupCheckinForm();
}

document.addEventListener('DOMContentLoaded', initApp);

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
      if (btn.dataset.tab === 'family') { renderFamilyHub(); }
    });
  });
}

const FAMILY_SECTIONS = ['thisWeek', 'backlog', 'decisions', 'purchases'];
const FAMILY_LABELS = { thisWeek: 'This Week', backlog: 'Backlog', decisions: 'Decisions', purchases: 'Purchases' };

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
      const commentToggle = `<span class="family-comment-toggle${hasComment ? ' has-comment' : ''}" data-id="${item.id}" title="${hasComment ? 'View note' : 'Add note'}">&#9998;</span>`;
      const moveOptions = otherSections.map(s =>
        `<span class="family-move-option" data-to="${s}" data-from="${section}" data-id="${item.id}">${FAMILY_LABELS[s]}</span>`
      ).join('');

      const commentHtml = item._showComment ? (
        `<div class="family-item-comment" data-id="${item.id}">${escapeHtml(item.comment || '')}</div>`
      ) : '';

      return `<div class="family-item-wrapper"><div class="family-item${item.done ? ' done' : ''}">
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
          <div class="family-move-menu" style="display:none;">
            ${moveOptions}
            <span class="family-move-option move-to-amir" data-to="_amirTasks" data-from="${section}" data-id="${item.id}">Amir's tasks</span>
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

        if (to === '_amirTasks') {
          const item = (hub[from] || []).find(i => i.id === id);
          if (!item) return;
          // Optimistic UI
          const row = el.closest('.family-item');
          if (row) { row.style.opacity = '0.3'; row.style.pointerEvents = 'none'; }
          // Insert into Amir's tasks and delete from family hub
          await db.insertTask({ text: item.text, category: 'Home Duties', list: 'backlog' });
          await db.deleteFamilyItem(id);
          // Remove from in-memory array
          const fromList = hub[from] || [];
          const idx = fromList.findIndex(i => i.id === id);
          if (idx !== -1) fromList.splice(idx, 1);
          renderFamilyHub();
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
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const text = input.value.trim();
      if (!text) return;
      const section = input.dataset.section;
      input.value = '';
      // Insert into Supabase
      const returned = await db.insertFamilyItem({ text, section, addedBy: 'Amir' });
      // Add returned item (with id) to in-memory hub
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

// --- Upcoming events ---

function upcomingKey(evt) { return evt.date + '::' + evt.summary; }

function renderFamilyUpcoming() {
  const container = document.getElementById('familyUpcoming');
  if (!container) return;
  const events = (appData && appData.familyHub && appData.familyHub.upcomingEvents) || [];

  if (events.length === 0) {
    container.innerHTML = '<p class="empty-state family-empty">Calendar events will appear here after next check-in.</p>';
    return;
  }

  // Group by week, skip hidden and past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = {};

  const visible = events.filter(e => !e.hidden);
  for (const evt of visible) {
    const d = new Date(evt.date + 'T12:00:00');
    if (d < today) continue;
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
      const isHighlighted = evt.highlighted;
      const typeClass = evt.type === 'daycare-closed' ? ' upcoming-alert' : evt.type === 'travel' ? ' upcoming-travel' : '';
      const hlClass = isHighlighted ? ' upcoming-highlighted' : '';
      html += `<div class="upcoming-event${typeClass}${hlClass}" data-id="${evt.id}">
        <span class="upcoming-day">${dayName}</span>
        <span class="upcoming-text">${escapeHtml(evt.summary)}</span>
        ${evt.time ? `<span class="upcoming-time">${evt.time}</span>` : ''}
        <span class="upcoming-actions">
          <span class="upcoming-star${isHighlighted ? ' active' : ''}" data-id="${evt.id}" title="Highlight">&#9733;</span>
          <span class="upcoming-hide" data-id="${evt.id}" title="Hide">&times;</span>
        </span>
      </div>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;

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

  // Sort: act first, then think, then routine
  const order = { act: 0, think: 1, routine: 2 };
  active.sort((a, b) => (order[a.urgency] || 9) - (order[b.urgency] || 9));

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

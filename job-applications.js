// job-applications.js — Job Application Tracker
//
// Requires Supabase table. Run this SQL once in Supabase SQL editor:
//
// CREATE TABLE job_applications (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id uuid REFERENCES auth.users(id) NOT NULL,
//   company text NOT NULL,
//   role text DEFAULT '',
//   date_applied date DEFAULT CURRENT_DATE,
//   method text DEFAULT 'direct' CHECK (method IN ('linkedin', 'direct')),
//   sort_order int DEFAULT 0,
//   created_at timestamptz DEFAULT now()
// );
// ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users see own job apps" ON job_applications
//   FOR ALL USING (auth.uid() = user_id);

function renderJobApplications() {
  const container = document.getElementById('jobAppsList');
  if (!container) return;

  const apps = appData.jobApplications || [];

  // Count display
  const countEl = document.getElementById('jobAppsCount');
  if (countEl) countEl.textContent = apps.length > 0 ? `${apps.length} application${apps.length !== 1 ? 's' : ''}` : '';

  // Sort by date descending (most recent first)
  const sorted = [...apps].sort((a, b) => (b.date_applied || '').localeCompare(a.date_applied || ''));

  if (sorted.length === 0) {
    container.innerHTML = '<p class="empty-state">No applications tracked yet.</p>';
    return;
  }

  container.innerHTML = sorted.map(app => {
    const dateLabel = app.date_applied
      ? new Date(app.date_applied + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '\u2014';
    const methodClass = app.method === 'linkedin' ? 'method-linkedin' : 'method-direct';
    const methodLabel = app.method === 'linkedin' ? 'LinkedIn' : 'Direct';
    return `<div class="job-app-row" data-id="${app.id}">
      <span class="drag-handle" title="Drag to reorder">\u2807</span>
      <span class="job-col-company job-app-editable" data-id="${app.id}" data-field="company">${escapeHtml(app.company)}</span>
      <span class="job-col-role job-app-editable" data-id="${app.id}" data-field="role">${escapeHtml(app.role || '')}</span>
      <span class="job-col-date">${dateLabel}</span>
      <span class="job-col-method"><span class="method-badge ${methodClass}" data-id="${app.id}" title="Click to toggle">${methodLabel}</span></span>
      <label class="job-col-unemp" title="Submitted for unemployment"><input type="checkbox" class="unemp-checkbox" data-id="${app.id}" ${app.unemployment ? 'checked' : ''}><span class="unemp-label">UE</span></label>
      <span class="job-col-actions"><button class="job-app-delete" data-id="${app.id}" title="Delete">&times;</button></span>
    </div>`;
  }).join('');

  // Click to edit company/role
  container.querySelectorAll('.job-app-editable').forEach(el => {
    el.addEventListener('click', () => {
      if (el.querySelector('input')) return;
      const id = el.dataset.id;
      const field = el.dataset.field;
      const app = apps.find(a => a.id === id);
      if (!app) return;
      const oldVal = app[field] || '';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'family-inline-edit';
      input.value = oldVal;
      el.textContent = '';
      el.appendChild(input);
      input.focus();
      input.select();
      const save = async () => {
        const newVal = input.value.trim();
        if (newVal && newVal !== oldVal) {
          app[field] = newVal;
          await db.updateJobApplication(id, { [field]: newVal });
        }
        renderJobApplications();
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); save(); }
        if (ev.key === 'Escape') renderJobApplications();
      });
    });
  });

  // Toggle method badge
  container.querySelectorAll('.method-badge').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const app = apps.find(a => a.id === id);
      if (!app) return;
      app.method = app.method === 'linkedin' ? 'direct' : 'linkedin';
      renderJobApplications();
      await db.updateJobApplication(id, { method: app.method });
    });
  });

  // Unemployment checkbox
  container.querySelectorAll('.unemp-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = cb.dataset.id;
      const app = apps.find(a => a.id === id);
      if (!app) return;
      app.unemployment = cb.checked;
      await db.updateJobApplication(id, { unemployment: cb.checked });
    });
  });

  // Delete
  container.querySelectorAll('.job-app-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const idx = apps.findIndex(a => a.id === id);
      if (idx >= 0) apps.splice(idx, 1);
      renderJobApplications();
      await db.deleteJobApplication(id);
    });
  });

  // Init Sortable
  initJobAppSortable();
}

function initJobAppSortable() {
  if (typeof Sortable === 'undefined') return;
  const container = document.getElementById('jobAppsList');
  if (!container || container.children.length === 0) return;
  new Sortable(container, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    onEnd: async function () {
      const apps = appData.jobApplications || [];
      const rows = container.querySelectorAll('.job-app-row');
      const newOrder = Array.from(rows).map(r => r.dataset.id);
      const reordered = newOrder.map(id => apps.find(a => a.id === id)).filter(Boolean);
      appData.jobApplications = reordered;
      for (let i = 0; i < reordered.length; i++) {
        db.updateJobApplication(reordered[i].id, { sort_order: i });
      }
    }
  });
}

function setupJobAppForm() {
  const form = document.getElementById('jobAppForm');
  if (!form || form._bound) return;
  form._bound = true;

  // Set default date
  const dateInput = form.querySelector('#jobAppDate');
  if (dateInput && !dateInput.value) dateInput.value = getTodayStr();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const company = form.querySelector('#jobAppCompany').value.trim();
    const role = form.querySelector('#jobAppRole').value.trim();
    const date = form.querySelector('#jobAppDate').value;
    const method = form.querySelector('#jobAppMethod').value;

    if (!company) return;

    const returned = await db.insertJobApplication({
      company,
      role,
      date_applied: date || getTodayStr(),
      method,
    });

    if (!appData.jobApplications) appData.jobApplications = [];
    appData.jobApplications.push({
      id: returned.id,
      company: returned.company,
      role: returned.role,
      date_applied: returned.date_applied,
      method: returned.method,
      unemployment: false,
    });

    // Reset form
    form.querySelector('#jobAppCompany').value = '';
    form.querySelector('#jobAppRole').value = '';
    form.querySelector('#jobAppDate').value = getTodayStr();
    form.querySelector('#jobAppMethod').value = 'direct';

    renderJobApplications();
  });
}

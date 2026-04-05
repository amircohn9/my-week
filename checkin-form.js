// checkin-form.js — Daily check-in form UI

function setupCheckinForm() {
  const triggerBtn = document.getElementById('checkinTriggerBtn');
  const modal = document.getElementById('checkinModal');
  const overlay = document.getElementById('checkinOverlay');
  const closeBtn = document.getElementById('checkinClose');
  const submitBtn = document.getElementById('checkinSubmit');
  const addActivityBtn = document.getElementById('checkinAddActivity');
  const dietToggle = document.getElementById('checkinDietToggle');
  const dietField = document.getElementById('checkinDiet');

  if (!triggerBtn || !modal) return;

  function openModal() {
    modal.style.display = 'flex';
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    loadExistingCheckin();
  }

  function closeModal() {
    modal.style.display = 'none';
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  triggerBtn.addEventListener('click', openModal);
  overlay.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);

  // Diet toggle
  dietToggle.addEventListener('click', () => {
    const hidden = dietField.style.display === 'none';
    dietField.style.display = hidden ? 'block' : 'none';
    dietToggle.querySelector('.chevron').textContent = hidden ? '\u25B4' : '\u25BE';
  });

  // Add activity row
  addActivityBtn.addEventListener('click', () => addActivityRow());

  // Submit
  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    try {
      await submitCheckin();
      closeModal();
      // Reload data and re-render dashboard
      appData = await db.loadAll();
      appData._completedPrompts = await db.getCompletedPrompts();
      renderAll();
    } catch (err) {
      console.error('Check-in failed:', err);
      alert('Check-in failed. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Check-In';
    }
  });

  // Add initial empty activity row
  ensureActivityRows();
}

function ensureActivityRows() {
  const container = document.getElementById('checkinActivities');
  if (container.children.length === 0) {
    addActivityRow();
  }
}

function addActivityRow(category, text, hours) {
  const container = document.getElementById('checkinActivities');
  const row = document.createElement('div');
  row.className = 'checkin-activity-row';
  row.innerHTML = `
    <select class="checkin-activity-cat">
      <option value="Career"${category === 'Career' ? ' selected' : ''}>Career</option>
      <option value="Self"${category === 'Self' ? ' selected' : ''}>Self</option>
      <option value="Home Duties"${category === 'Home Duties' ? ' selected' : ''}>Home</option>
      <option value="Family"${category === 'Family' ? ' selected' : ''}>Family</option>
    </select>
    <input type="text" class="checkin-activity-text" placeholder="What did you do?" value="${escapeHtml(text || '')}">
    <input type="number" class="checkin-activity-hours" placeholder="hrs" step="0.5" min="0" max="24" value="${hours || ''}">
    <button class="checkin-activity-remove" title="Remove">&times;</button>
  `;
  container.appendChild(row);

  row.querySelector('.checkin-activity-remove').addEventListener('click', () => {
    row.remove();
    ensureActivityRows();
  });
}

async function loadExistingCheckin() {
  const container = document.getElementById('checkinActivities');
  container.innerHTML = '';

  const today = getTodayStr();
  const existing = await db.getCheckinByDate(today);

  if (existing) {
    // Pre-fill from existing check-in
    (existing.activities || []).forEach(a => addActivityRow(a.category, a.text, a.hours));
    document.getElementById('checkinWins').value = existing.wins || '';
    document.getElementById('checkinObstacles').value = existing.obstacles || '';
    document.getElementById('checkinMood').value = existing.mood || '';
    document.getElementById('checkinSummary').value = existing.summary || '';
  } else {
    addActivityRow();
    document.getElementById('checkinWins').value = '';
    document.getElementById('checkinObstacles').value = '';
    document.getElementById('checkinMood').value = '';
    document.getElementById('checkinSummary').value = '';
  }

  // Pre-fill tomorrow's focus from current setting
  document.getElementById('checkinFocus').value = '';
  document.getElementById('checkinWeight').value = '';
  document.getElementById('checkinDiet').value = '';
  document.getElementById('checkinDiet').style.display = 'none';
  document.getElementById('checkinDietToggle').querySelector('.chevron').textContent = '\u25BE';
}

async function submitCheckin() {
  const today = getTodayStr();

  // Gather activities
  const activityRows = document.querySelectorAll('.checkin-activity-row');
  const activities = [];
  activityRows.forEach(row => {
    const text = row.querySelector('.checkin-activity-text').value.trim();
    if (!text) return;
    const category = row.querySelector('.checkin-activity-cat').value;
    const hoursVal = row.querySelector('.checkin-activity-hours').value;
    const hours = hoursVal ? parseFloat(hoursVal) : undefined;
    activities.push({ category, text, hours });
  });

  if (activities.length === 0) {
    alert('Add at least one activity.');
    throw new Error('No activities');
  }

  const wins = document.getElementById('checkinWins').value.trim();
  const obstacles = document.getElementById('checkinObstacles').value.trim();
  const mood = document.getElementById('checkinMood').value.trim();
  const focus = document.getElementById('checkinFocus').value.trim();
  const weightVal = document.getElementById('checkinWeight').value;
  const dietNote = document.getElementById('checkinDiet').value.trim();
  let summary = document.getElementById('checkinSummary').value.trim();

  // Auto-generate summary if blank
  if (!summary) {
    const totalHours = activities.reduce((sum, a) => sum + (a.hours || 0), 0);
    const parts = activities.slice(0, 3).map(a => a.text);
    summary = totalHours > 0
      ? `${totalHours} hours tracked — ${parts.join(', ')}`
      : parts.join(', ');
  }

  // 1. Upsert check-in
  await db.upsertCheckin({ date: today, activities, mood, obstacles, wins, summary });

  // 2. Insert completed items (one per activity)
  // Delete existing completed items for today to prevent duplicates on re-submit
  await db.deleteCompletedItemsByDate(today);
  await db.insertCompletedItems(activities.map(a => ({
    category: a.category,
    text: a.text,
    hours: a.hours,
    date: today,
  })));

  // 3. Weight log
  if (weightVal) {
    const lbs = parseFloat(weightVal);
    if (lbs >= 100 && lbs <= 300) {
      await db.insertWeight(today, lbs);
    }
  }

  // 4. Diet entry
  if (dietNote) {
    await db.upsertDietEntry({ date: today, note: dietNote });
  }

  // 5. Tomorrow's focus
  if (focus) {
    await db.updateSettings({ yesterdayNotes: focus });
  }
}

// renderAll is called after check-in to refresh the dashboard
function renderAll() {
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
}

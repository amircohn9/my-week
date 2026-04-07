// checkin-form.js — Dictation-friendly daily check-in

function setupCheckinForm() {
  const triggerBtn = document.getElementById('checkinTriggerBtn');
  const modal = document.getElementById('checkinModal');
  const overlay = document.getElementById('checkinOverlay');
  const closeBtn = document.getElementById('checkinClose');
  const submitBtn = document.getElementById('checkinSubmit');
  const checkinDateInput = document.getElementById('checkinDate');

  if (!triggerBtn || !modal) return;

  function openModal() {
    modal.style.display = 'flex';
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    checkinDateInput.value = getTodayStr();
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

  // Submit: parse via AI then save
  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    const statusEl = document.getElementById('checkinParseStatus');
    const errorEl = document.getElementById('checkinParseError');
    errorEl.style.display = 'none';

    try {
      const activitiesText = document.getElementById('checkinDictateActivities').value.trim();
      if (!activitiesText) {
        alert('Tell me what you did today!');
        return;
      }

      // Show parsing spinner
      statusEl.style.display = 'flex';

      // Gather current habits and intentions to send for matching
      const allHabits = [];
      if (appData && appData.tasks) {
        for (const cat of CATEGORY_ORDER) {
          const group = appData.tasks[cat];
          if (!group || !group.recurring) continue;
          for (const h of group.recurring) {
            if (h.recurring === 'ongoing' || h.hidden) continue;
            allHabits.push({ id: h.id, text: h.text, category: cat, recurring: h.recurring });
          }
        }
      }

      // Send free-form text to AI for parsing
      const parsed = await parseCheckinViaAI({
        activities: activitiesText,
        winsObstaclesMood: document.getElementById('checkinDictateWOM').value.trim(),
        diet: document.getElementById('checkinDictateDiet').value.trim(),
        weight: document.getElementById('checkinDictateWeight').value.trim(),
        tomorrowFocus: document.getElementById('checkinDictateFocus').value.trim(),
        habits: allHabits,
        weeklyIntentions: appData ? appData.weeklyIntentions : [],
      });

      statusEl.style.display = 'none';

      // Save the parsed structured data
      await saveCheckin(parsed);

      closeModal();
      // Reload data and re-render dashboard
      appData = await db.loadAll();
      appData._completedPrompts = await db.getCompletedPrompts();
      renderAll();
    } catch (err) {
      console.error('Check-in failed:', err);
      statusEl.style.display = 'none';
      errorEl.textContent = 'Something went wrong: ' + err.message;
      errorEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Check-In';
    }
  });

  // Date change — load that date's existing check-in
  checkinDateInput.addEventListener('change', () => {
    loadExistingCheckin();
  });
}

async function parseCheckinViaAI(freeFormData) {
  const resp = await fetch('/api/parse-checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(freeFormData),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'Failed to parse check-in');
  }

  return resp.json();
}

async function saveCheckin(parsed) {
  const checkinDateInput = document.getElementById('checkinDate');
  const today = (checkinDateInput && checkinDateInput.value) ? checkinDateInput.value : getTodayStr();

  const activities = parsed.activities || [];
  if (activities.length === 0) {
    throw new Error('No activities parsed from your check-in');
  }

  const wins = parsed.wins || '';
  const obstacles = parsed.obstacles || '';
  const mood = parsed.mood || '';
  const summary = parsed.summary || activities.slice(0, 3).map(a => a.text).join(', ');
  const focus = parsed.tomorrowFocus || '';
  const dietNote = parsed.diet || '';
  const weightVal = parsed.weight;

  // 1. Auto-update habit sessions + backfill default hours BEFORE saving
  const habitUpdates = parsed.habitUpdates || [];
  if (habitUpdates.length > 0 && appData && appData.tasks) {
    for (const update of habitUpdates) {
      let habitItem = null;
      for (const cat of CATEGORY_ORDER) {
        const group = appData.tasks[cat];
        if (!group || !group.recurring) continue;
        habitItem = group.recurring.find(r => r.id === update.habitId);
        if (habitItem) break;
      }
      if (!habitItem) continue;

      // Log session if not already logged today
      const alreadyLogged = (habitItem.sessions || []).some(s => s.date === today);
      if (!alreadyLogged) {
        if (!habitItem.sessions) habitItem.sessions = [];
        habitItem.sessions.push({ date: today, note: update.note || '' });
        await db.updateHabit(update.habitId, { sessions: habitItem.sessions });
      }

      // Backfill default hours on matching activities that have no hours
      if (habitItem.defaultHours) {
        for (const act of activities) {
          if (act.hours == null && act.category === update.category) {
            act.hours = habitItem.defaultHours;
          }
        }
      }
    }
  }

  // 2. Upsert check-in (after hours backfill so data is complete)
  await db.upsertCheckin({ date: today, activities, mood, obstacles, wins, summary });

  // 3. Insert completed items (one per activity)
  await db.deleteCompletedItemsByDate(today);
  await db.insertCompletedItems(activities.map(a => ({
    category: a.category,
    text: a.text,
    hours: a.hours,
    date: today,
  })));

  // 4. Weight log
  if (weightVal && weightVal >= 100 && weightVal <= 300) {
    await db.insertWeight(today, weightVal);
  }

  // 5. Diet entry
  if (dietNote) {
    await db.upsertDietEntry({ date: today, note: dietNote });
  }

  // 6. Tomorrow's focus
  if (focus) {
    await db.updateSettings({ yesterdayNotes: focus });
  }
}

async function loadExistingCheckin() {
  const checkinDateInput = document.getElementById('checkinDate');
  const dateToLoad = (checkinDateInput && checkinDateInput.value) ? checkinDateInput.value : getTodayStr();
  const existing = await db.getCheckinByDate(dateToLoad);

  // Get field references
  const activitiesEl = document.getElementById('checkinDictateActivities');
  const womEl = document.getElementById('checkinDictateWOM');
  const dietEl = document.getElementById('checkinDictateDiet');
  const weightEl = document.getElementById('checkinDictateWeight');
  const focusEl = document.getElementById('checkinDictateFocus');

  if (existing) {
    // Reconstruct a readable summary from structured activities
    const actText = (existing.activities || [])
      .map(a => {
        let line = a.text;
        if (a.hours) line += ` (${a.hours}h)`;
        return line;
      })
      .join(', ');
    activitiesEl.value = actText;

    // Combine wins/obstacles/mood into one field
    const parts = [];
    if (existing.wins) parts.push(existing.wins);
    if (existing.obstacles) parts.push(existing.obstacles);
    if (existing.mood) parts.push(existing.mood);
    womEl.value = parts.join('. ');
  } else {
    activitiesEl.value = '';
    womEl.value = '';
  }

  dietEl.value = '';
  weightEl.value = '';
  focusEl.value = '';

  // Clear any previous parse status/errors
  document.getElementById('checkinParseStatus').style.display = 'none';
  document.getElementById('checkinParseError').style.display = 'none';
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
  const activeWinsToggle = document.querySelector('#mainToggle .toggle-btn.active');
  const winsRange = activeWinsToggle ? activeWinsToggle.dataset.range : 'today';
  renderWinsAndTime(appData, winsRange);
  renderWeightCard(appData.diet);
  renderProjectsAgenda(appData.tasks);
  renderRecurringHabits(appData.tasks);
  renderBacklog(appData.tasks);
  renderDayByDay(appData.checkins, appData.diet ? appData.diet.entries : []);
  renderIdentityVotes(appData);
  setupToggle();
}

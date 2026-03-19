document.addEventListener('DOMContentLoaded', async () => {
  const data = await fetch('data.json').then(r => r.json());

  renderDateRange();
  renderIntentions(data.weeklyIntentions);
  renderCompleted(data.completedItems);
  renderChart(data);
  renderDayByDay(data.checkins);
  renderMood(data.checkins);
});

function renderDateRange() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('dateRange').textContent = `${fmt(weekStart)} – ${fmt(weekEnd)}, ${now.getFullYear()}`;
}

function renderIntentions(intentions) {
  const list = document.getElementById('intentionsList');
  if (!intentions || intentions.length === 0) {
    list.innerHTML = '<li>No intentions set yet.</li>';
    return;
  }
  list.innerHTML = intentions.map(i => `<li>${i}</li>`).join('');
}

function renderCompleted(items) {
  const container = document.getElementById('completedList');
  const empty = document.getElementById('completedEmpty');

  if (!items || items.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.style.display = 'block';
  container.innerHTML = items.map(item => {
    const tagClass = categoryTagClass(item.category);
    return `
      <div class="completed-item">
        <span class="checkmark">✓</span>
        <span class="category-tag ${tagClass}">${item.category}</span>
        <span>${item.text}</span>
      </div>
    `;
  }).join('');
}

function renderChart(data) {
  const canvas = document.getElementById('categoryChart');
  const empty = document.getElementById('chartEmpty');

  // Count activities per category from checkins
  const counts = {};
  for (const cat of data.categories) {
    counts[cat] = 0;
  }

  for (const checkin of data.checkins) {
    if (checkin.activities) {
      for (const act of checkin.activities) {
        if (counts[act.category] !== undefined) {
          counts[act.category] += act.hours || 1;
        }
      }
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    canvas.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  canvas.style.display = 'block';

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: ['#fbbf24', '#f472b6', '#60a5fa', '#34d399'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10,
            font: { family: 'Inter', size: 13 }
          }
        }
      }
    }
  });
}

function renderDayByDay(checkins) {
  const container = document.getElementById('dayByDay');
  const empty = document.getElementById('daysEmpty');

  if (!checkins || checkins.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.style.display = 'block';

  // Show most recent first
  const sorted = [...checkins].sort((a, b) => b.date.localeCompare(a.date));

  container.innerHTML = sorted.map(day => {
    const d = new Date(day.date + 'T12:00:00');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const items = (day.activities || []).map(a => a.text).join(', ') || 'No activities logged';
    return `
      <div class="day-entry">
        <div class="day-date">${dayName}</div>
        <div class="day-items">${items}</div>
      </div>
    `;
  }).join('');
}

function renderMood(checkins) {
  const container = document.getElementById('moodList');
  const empty = document.getElementById('moodEmpty');

  if (!checkins || checkins.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  const withMood = checkins.filter(c => c.mood);
  if (withMood.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.style.display = 'block';

  const sorted = [...withMood].sort((a, b) => b.date.localeCompare(a.date));

  container.innerHTML = sorted.map(day => {
    const d = new Date(day.date + 'T12:00:00');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    return `
      <div class="mood-entry">
        <div class="mood-date">${dayName}</div>
        <div class="mood-text">"${day.mood}"</div>
      </div>
    `;
  }).join('');
}

function categoryTagClass(category) {
  const map = {
    'Home Duties': 'tag-home',
    'Family': 'tag-family',
    'Self': 'tag-self',
    'Career': 'tag-career'
  };
  return map[category] || '';
}

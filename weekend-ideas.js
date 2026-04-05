// weekend-ideas.js — Weekend Ideas tab logic

const LIKED_KEY = 'weekend-liked';
const DISMISSED_KEY = 'weekend-dismissed';
const CACHE_KEY = 'weekend-ideas-cache';

function getLiked() { try { return JSON.parse(localStorage.getItem(LIKED_KEY)) || []; } catch { return []; } }
function getDismissed() { try { return JSON.parse(localStorage.getItem(DISMISSED_KEY)) || []; } catch { return []; } }
function saveLiked(list) { localStorage.setItem(LIKED_KEY, JSON.stringify(list)); }
function saveDismissed(list) { localStorage.setItem(DISMISSED_KEY, JSON.stringify(list)); }
function getCachedIdeas() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } }
function cacheIdeas(data) { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); }

function setupWeekendIdeas() {
  const refreshBtn = document.getElementById('refreshIdeasBtn');
  if (!refreshBtn) return;

  if (refreshBtn._bound) {
    // Already bound — just re-render cached data
    const cached = getCachedIdeas();
    if (cached) renderWeekendIdeas(cached.ideas, cached.timestamp);
    return;
  }
  refreshBtn._bound = true;
  refreshBtn.addEventListener('click', fetchAndRenderIdeas);

  // Load cached data on tab switch
  const cached = getCachedIdeas();
  if (cached) {
    renderWeekendIdeas(cached.ideas, cached.timestamp);
  }
}

async function fetchAndRenderIdeas() {
  const loading = document.getElementById('weekendLoading');
  const content = document.getElementById('weekendContent');
  const btn = document.getElementById('refreshIdeasBtn');

  loading.style.display = 'flex';
  content.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Loading...';

  try {
    const liked = getLiked();
    const dismissed = getDismissed();
    const res = await fetch('/api/weekend-ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        likedTitles: liked.map(i => i.title).slice(-20),
        dismissedTitles: dismissed.map(i => i.title).slice(-20),
      }),
    });
    if (!res.ok) throw new Error('Server error: ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    cacheIdeas(data);
    renderWeekendIdeas(data.ideas, data.timestamp);
  } catch (err) {
    console.error('Failed to fetch ideas:', err);
    alert('Failed to load ideas. Try again.');
  } finally {
    loading.style.display = 'none';
    content.style.display = '';
    btn.disabled = false;
    btn.textContent = 'Refresh Ideas';
  }
}

function renderWeekendIdeas(ideas, timestamp) {
  const dismissed = getDismissed();
  const liked = getLiked();
  const dismissedTitles = new Set(dismissed.map(i => i.title));
  const likedTitles = new Set(liked.map(i => i.title));

  // Filter out dismissed
  const visible = ideas.filter(i => !dismissedTitles.has(i.title));

  // Categorize
  const now = new Date();
  const day = now.getDay();
  const daysToSat = (6 - day + 7) % 7;
  const thisSat = new Date(now);
  thisSat.setDate(now.getDate() + daysToSat);
  const thisWeekEnd = new Date(thisSat);
  thisWeekEnd.setDate(thisSat.getDate() + 2);

  const thisWeekend = [];
  const nextWeekend = [];
  const anytime = [];

  for (const idea of visible) {
    if (!idea.date_time || idea.date_time.toLowerCase() === 'anytime') {
      anytime.push(idea);
    } else {
      // Try to parse the date
      const d = new Date(idea.date_time);
      if (isNaN(d.getTime())) {
        anytime.push(idea);
      } else if (d < thisWeekEnd) {
        thisWeekend.push(idea);
      } else {
        nextWeekend.push(idea);
      }
    }
  }

  renderRow('weekendThisWeek', thisWeekend, likedTitles, ideas);
  renderRow('weekendNextWeek', nextWeekend, likedTitles, ideas);
  renderRow('weekendAnytime', anytime, likedTitles, ideas);
  renderLikedSection(liked);

  // Update timestamp
  if (timestamp) {
    const d = new Date(timestamp);
    document.getElementById('weekendLastUpdated').textContent =
      'Updated ' + d.toLocaleDateString('en-US', { weekday: 'long' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}

function renderRow(containerId, ideas, likedTitles, allIdeas) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (ideas.length === 0) {
    container.innerHTML = '<div class="weekend-empty">No ideas yet — hit Refresh Ideas</div>';
    return;
  }

  container.innerHTML = ideas.map(idea => {
    const isLiked = likedTitles.has(idea.title);
    return `<div class="weekend-card${isLiked ? ' weekend-card-liked' : ''}">
      <div class="weekend-card-title">${escapeHtml(idea.title)}</div>
      <div class="weekend-card-location">${escapeHtml(idea.location_name || '')}${idea.town ? ', ' + escapeHtml(idea.town) : ''}</div>
      <div class="weekend-card-meta">
        <span>${escapeHtml(idea.date_time || 'Anytime')}</span>
        ${idea.approximate_drive_minutes ? `<span>~${escapeHtml(String(idea.approximate_drive_minutes))} min drive</span>` : ''}
        <span>${idea.cost === 'free' || idea.cost === 'Free' ? 'Free' : escapeHtml(String(idea.cost || 'varies'))}</span>
      </div>
      ${idea.signup_required ? '<div class="weekend-card-badge">Signup required</div>' : ''}
      <div class="weekend-card-hook">${escapeHtml(idea.hook || '')}</div>
      <div class="weekend-card-actions">
        ${idea.source_url ? `<a href="${escapeHtml(idea.source_url)}" target="_blank" rel="noopener" class="weekend-card-link">Learn More</a>` : ''}
        <button class="weekend-like-btn${isLiked ? ' liked' : ''}" data-title="${escapeHtml(idea.title)}" title="Like">&#128077;</button>
        <button class="weekend-dismiss-btn" data-title="${escapeHtml(idea.title)}" title="Dismiss">&#10005;</button>
      </div>
    </div>`;
  }).join('');

  // Like buttons
  container.querySelectorAll('.weekend-like-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const title = btn.dataset.title;
      const idea = ideas.find(i => i.title === title);
      if (!idea) return;
      const liked = getLiked();
      const exists = liked.findIndex(i => i.title === title);
      if (exists >= 0) {
        liked.splice(exists, 1);
      } else {
        liked.push({ title: idea.title, location: idea.location_name, hook: idea.hook });
      }
      saveLiked(liked);
      const cached = getCachedIdeas();
      if (cached) renderWeekendIdeas(cached.ideas, cached.timestamp);
    });
  });

  // Dismiss buttons
  container.querySelectorAll('.weekend-dismiss-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const title = btn.dataset.title;
      const dismissed = getDismissed();
      if (!dismissed.find(i => i.title === title)) {
        dismissed.push({ title });
        saveDismissed(dismissed);
      }
      const cached = getCachedIdeas();
      if (cached) renderWeekendIdeas(cached.ideas, cached.timestamp);
    });
  });
}

function renderLikedSection(liked) {
  const section = document.getElementById('weekendLikedSection');
  const container = document.getElementById('weekendLiked');
  if (!section || !container) return;

  if (liked.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  container.innerHTML = liked.map(item =>
    `<div class="weekend-card weekend-card-liked weekend-card-mini">
      <div class="weekend-card-title">${escapeHtml(item.title)}</div>
      <div class="weekend-card-location">${escapeHtml(item.location || '')}</div>
      <div class="weekend-card-hook">${escapeHtml(item.hook || '')}</div>
    </div>`
  ).join('');

  // Toggle liked section
  const toggle = section.querySelector('.weekend-liked-toggle');
  if (toggle && !toggle._bound) {
    toggle._bound = true;
    toggle.addEventListener('click', () => {
      const isHidden = container.style.display === 'none';
      container.style.display = isHidden ? 'flex' : 'none';
      toggle.querySelector('.chevron').textContent = isHidden ? '\u25B4' : '\u25BE';
    });
  }
}

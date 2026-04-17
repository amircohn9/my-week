import { createClient } from '@supabase/supabase-js';

const FAMILY_EXCLUDE_PATTERNS = [
  /^focus time/i, /^lunch/i, /^lili walk/i, /^networking/i,
  /^gym\b/i, /^workout\b/i, /^personal meeting/i,
];

const FAMILY_INCLUDE_PATTERNS = [
  /alma/i, /carmel/i, /carmeli/i, /arielle/i,
  /doctor/i, /dentist/i, /pediatrician/i, /appointment/i,
  /birthday/i, /party/i, /seder/i, /holiday/i,
  /flight/i, /trip/i, /travel/i, /vacation/i,
  /school/i, /daycare/i, /closure/i, /closed/i,
  /ballet/i, /swim/i, /flippers/i, /hebrew/i,
  /babysit/i, /family/i, /dinner/i,
];

const TRAVEL_PATTERNS = [/flight/i, /trip/i, /travel/i, /vacation/i, /hotel/i];

function isFamilyRelevant(summary, calendarKey) {
  if (calendarKey === 'acc') return true; // all daycare events are relevant
  if (FAMILY_EXCLUDE_PATTERNS.some(p => p.test(summary))) return false;
  if (FAMILY_INCLUDE_PATTERNS.some(p => p.test(summary))) return true;
  // For non-main calendars (blattner, deadlines), include by default
  if (calendarKey !== 'main') return true;
  // For main calendar, include everything that wasn't explicitly excluded
  return true;
}

function classifyEventType(summary, calendarKey) {
  if (calendarKey === 'acc') return 'daycare-closed';
  if (TRAVEL_PATTERNS.some(p => p.test(summary))) return 'travel';
  return 'event';
}

function formatTime(dateTimeStr) {
  if (!dateTimeStr) return null;
  const d = new Date(dateTimeStr);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m === 0 ? `${h}:00 ${ampm}` : `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

async function getAccessToken(clientId, clientSecret, refreshToken) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Google token refresh failed: ${err}`);
  }
  const data = await resp.json();
  return data.access_token;
}

async function fetchCalendarEvents(accessToken, calendarId, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '500',
  });
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Calendar API error for ${calendarId}: ${err}`);
  }
  const data = await resp.json();
  return data.items || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const calendarIdsJson = process.env.GOOGLE_CALENDAR_IDS;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.USER_ID;

  if (!clientId || !clientSecret || !refreshToken) {
    return res.status(500).json({ error: 'Google credentials not configured' });
  }
  if (!calendarIdsJson) {
    return res.status(500).json({ error: 'GOOGLE_CALENDAR_IDS not configured' });
  }

  let calendarMap;
  try {
    calendarMap = JSON.parse(calendarIdsJson);
  } catch {
    return res.status(500).json({ error: 'GOOGLE_CALENDAR_IDS is not valid JSON' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

    // Date ranges
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    // Main dashboard: current week Mon-Sun
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    // Family upcoming: today through 6 weeks out
    const familyStart = new Date(now);
    familyStart.setHours(0, 0, 0, 0);
    const familyEnd = new Date(familyStart);
    familyEnd.setDate(familyStart.getDate() + 42);

    // Fetch from all calendars
    const allMainEvents = []; // for calendar_events table (main calendar, current week)
    const allFamilyEvents = []; // for family_upcoming_events table

    for (const [key, calendarId] of Object.entries(calendarMap)) {
      // Fetch the wider range (6 weeks) — we'll filter for the dashboard week separately
      const events = await fetchCalendarEvents(accessToken, calendarId, weekStart, familyEnd);

      for (const evt of events) {
        const isAllDay = !!evt.start?.date;
        const startStr = isAllDay ? evt.start.date : evt.start?.dateTime;
        if (!startStr) continue;

        const eventDate = isAllDay ? startStr : startStr.slice(0, 10);
        const time = isAllDay ? null : formatTime(startStr);
        const summary = evt.summary || '(No title)';

        // Main dashboard calendar_events: only main calendar, current week
        if (key === 'main') {
          const d = new Date(eventDate + 'T12:00:00');
          if (d >= weekStart && d < weekEnd) {
            allMainEvents.push({
              user_id: userId,
              date: eventDate,
              time,
              summary,
              color: null,
              type: 'event',
              calendar: 'main',
              source: 'google-calendar',
            });
          }
        }

        // Family upcoming events: all calendars, filtered for family relevance
        const d2 = new Date(eventDate + 'T12:00:00');
        if (d2 >= familyStart && d2 < familyEnd && isFamilyRelevant(summary, key)) {
          allFamilyEvents.push({
            user_id: userId,
            date: eventDate,
            summary,
            time,
            type: classifyEventType(summary, key),
            calendar: key,
            hidden: false,
            highlighted: false,
          });
        }
      }
    }

    // Clear old google-sourced calendar_events for this week, then insert new ones
    await supabase
      .from('calendar_events')
      .delete()
      .eq('user_id', userId)
      .eq('source', 'google-calendar')
      .gte('date', weekStart.toISOString().slice(0, 10))
      .lt('date', weekEnd.toISOString().slice(0, 10));

    if (allMainEvents.length > 0) {
      const { error } = await supabase.from('calendar_events').insert(allMainEvents);
      if (error) throw new Error(`Insert calendar_events: ${error.message}`);
    }

    // For family events: preserve hidden/highlighted state
    // First get existing hidden/highlighted IDs
    const { data: existingFamily } = await supabase
      .from('family_upcoming_events')
      .select('summary, date, hidden, highlighted')
      .eq('user_id', userId);

    const preservedState = {};
    for (const ef of (existingFamily || [])) {
      const key = `${ef.date}|${ef.summary}`;
      if (ef.hidden || ef.highlighted) {
        preservedState[key] = { hidden: ef.hidden, highlighted: ef.highlighted };
      }
    }

    // Clear and re-insert family events
    await supabase
      .from('family_upcoming_events')
      .delete()
      .eq('user_id', userId);

    // Restore hidden/highlighted state
    for (const evt of allFamilyEvents) {
      const key = `${evt.date}|${evt.summary}`;
      if (preservedState[key]) {
        evt.hidden = preservedState[key].hidden;
        evt.highlighted = preservedState[key].highlighted;
      }
    }

    if (allFamilyEvents.length > 0) {
      const { error } = await supabase.from('family_upcoming_events').insert(allFamilyEvents);
      if (error) throw new Error(`Insert family_upcoming_events: ${error.message}`);
    }

    return res.status(200).json({
      ok: true,
      dashboardEvents: allMainEvents.length,
      familyEvents: allFamilyEvents.length,
      calendars: Object.keys(calendarMap),
    });
  } catch (err) {
    console.error('Sync calendar error:', err);
    return res.status(500).json({ error: err.message });
  }
}

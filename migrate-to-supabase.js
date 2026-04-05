#!/usr/bin/env node
/**
 * One-time migration: data.json + archive.json + prompts.json → Supabase
 *
 * Usage:
 *   1. Create .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USER_ID
 *   2. npm install @supabase/supabase-js dotenv
 *   3. node migrate-to-supabase.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = process.env.USER_ID;

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

async function upsertBatch(table, rows) {
  if (!rows.length) return console.log(`  ${table}: 0 rows (skipped)`);
  const { error } = await supabase.from(table).upsert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ${table}: ${rows.length} rows`);
}

async function insertBatch(table, rows) {
  if (!rows.length) return console.log(`  ${table}: 0 rows (skipped)`);
  // Insert in chunks of 500 to avoid payload limits
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table} (chunk ${i}): ${error.message}`);
  }
  console.log(`  ${table}: ${rows.length} rows`);
}

async function migrate() {
  console.log('Reading data files...');
  const data = readJSON('./data.json');
  const archive = readJSON('./archive.json');
  const promptsFile = readJSON('./prompts.json');

  // -----------------------------------------------------------
  // 1. App settings
  // -----------------------------------------------------------
  console.log('\n1. App settings');
  await upsertBatch('app_settings', [{
    user_id: USER_ID,
    daily_focus: data.dailyFocus || '',
    weekly_focus: data.weeklyFocus || [],
    weekly_intentions: data.weeklyIntentions || [],
    categories: data.categories || ['Career', 'Self', 'Home Duties', 'Family'],
    start_date: data.startDate || null,
    yesterday_notes: data.yesterdayNotes || '',
    did_you_know: data.didYouKnow || [],
    goal_weight: data.diet?.goalWeight || null,
    start_weight: data.diet?.startWeight || null,
  }]);

  // -----------------------------------------------------------
  // 2. Tasks + Habits (by category)
  // -----------------------------------------------------------
  console.log('\n2. Tasks & Habits');
  const taskRows = [];
  const habitRows = [];

  for (const category of (data.categories || [])) {
    const cat = data.tasks?.[category];
    if (!cat) continue;

    // Now tasks
    (cat.now || []).forEach((t, i) => {
      taskRows.push({
        user_id: USER_ID,
        text: t.text,
        done: t.done || false,
        category,
        list: 'now',
        deadline: t.deadline || null,
        link: t.link || null,
        this_week: t.thisWeek || false,
        today: false,
        sort_order: i,
        subtasks: (t.subtasks || []).map(s => ({
          text: s.text,
          done: s.done || false,
          thisWeek: s.thisWeek || false,
          today: false,
        })),
      });
    });

    // Backlog tasks
    (cat.backlog || []).forEach((t, i) => {
      taskRows.push({
        user_id: USER_ID,
        text: t.text,
        done: t.done || false,
        category,
        list: 'backlog',
        deadline: t.deadline || null,
        link: t.link || null,
        this_week: t.thisWeek || false,
        today: false,
        sort_order: i,
        subtasks: (t.subtasks || []).map(s => ({
          text: s.text,
          done: s.done || false,
          thisWeek: s.thisWeek || false,
          today: false,
        })),
      });
    });

    // Recurring habits
    (cat.recurring || []).forEach((h, i) => {
      if (!h.text) return;
      habitRows.push({
        user_id: USER_ID,
        text: h.text,
        category,
        recurring: h.recurring || 'weekly',
        next_session: h.nextSession || null,
        hidden: h.hidden || false,
        sessions: h.sessions || [],
        sort_order: i,
      });
    });
  }

  await insertBatch('tasks', taskRows);
  await insertBatch('habits', habitRows);

  // -----------------------------------------------------------
  // 3. Checkins (data.json + archive.json merged)
  // -----------------------------------------------------------
  console.log('\n3. Checkins');
  const allCheckins = [...(data.checkins || []), ...(archive.checkins || [])];
  // Deduplicate by date
  const checkinMap = new Map();
  for (const c of allCheckins) {
    checkinMap.set(c.date, c);
  }
  const checkinRows = Array.from(checkinMap.values()).map(c => ({
    user_id: USER_ID,
    date: c.date,
    activities: c.activities || [],
    mood: c.mood || '',
    obstacles: c.obstacles || '',
    wins: c.wins || '',
    summary: c.summary || '',
  }));
  await insertBatch('checkins', checkinRows);

  // -----------------------------------------------------------
  // 4. Completed items (data.json + archive.json merged)
  // -----------------------------------------------------------
  console.log('\n4. Completed items');
  const allCompleted = [...(data.completedItems || []), ...(archive.completedItems || [])];
  const completedRows = allCompleted.map(c => ({
    user_id: USER_ID,
    category: c.category,
    text: c.text,
    hours: c.hours || null,
    date: c.date,
  }));
  await insertBatch('completed_items', completedRows);

  // -----------------------------------------------------------
  // 5. Diet entries (data.json + archive.json merged)
  // -----------------------------------------------------------
  console.log('\n5. Diet entries');
  const allDiet = [...(data.diet?.entries || []), ...(archive.diet?.entries || [])];
  const dietMap = new Map();
  for (const d of allDiet) {
    dietMap.set(d.date, d);
  }
  const dietRows = Array.from(dietMap.values()).map(d => ({
    user_id: USER_ID,
    date: d.date,
    note: d.note || '',
    calories: d.calories || '',
    protein: d.protein || '',
    carbs: d.carbs || '',
    fat: d.fat || '',
    sodium: d.sodium || '',
    fiber: d.fiber || '',
  }));
  await insertBatch('diet_entries', dietRows);

  // -----------------------------------------------------------
  // 6. Weight logs (data.json + archive.json merged)
  // -----------------------------------------------------------
  console.log('\n6. Weight logs');
  const allWeights = [...(data.diet?.weights || []), ...(archive.diet?.weights || [])];
  const weightMap = new Map();
  for (const w of allWeights) {
    weightMap.set(w.date, w);
  }
  const weightRows = Array.from(weightMap.values()).map(w => ({
    user_id: USER_ID,
    date: w.date,
    lbs: w.lbs,
  }));
  await insertBatch('weight_logs', weightRows);

  // -----------------------------------------------------------
  // 7. Calendar events
  // -----------------------------------------------------------
  console.log('\n7. Calendar events');
  const calendarRows = [];
  for (const [date, events] of Object.entries(data.calendarEvents || {})) {
    for (const e of events) {
      calendarRows.push({
        user_id: USER_ID,
        date,
        time: e.time || null,
        summary: e.summary,
        color: e.color || null,
        type: e.type || 'event',
        calendar: e.calendar || 'main',
        source: 'google-calendar',
      });
    }
  }
  await insertBatch('calendar_events', calendarRows);

  // -----------------------------------------------------------
  // 8. Family hub items
  // -----------------------------------------------------------
  console.log('\n8. Family hub items');
  const familyRows = [];
  for (const section of ['thisWeek', 'backlog', 'decisions', 'purchases']) {
    const items = data.familyHub?.[section] || [];
    items.forEach((item, i) => {
      familyRows.push({
        user_id: USER_ID,
        text: item.text,
        section,
        date: item.date || null,
        added_by: item.addedBy || 'Amir',
        assignee: item.assignee || '',
        done: item.done || false,
        done_date: item.doneDate || null,
        deadline: item.deadline || null,
        comment: item.comment || '',
        sort_order: i,
      });
    });
  }
  await insertBatch('family_hub_items', familyRows);

  // -----------------------------------------------------------
  // 9. Family upcoming events
  // -----------------------------------------------------------
  console.log('\n9. Family upcoming events');
  const upcomingRows = (data.familyHub?.upcomingEvents || []).map(e => ({
    user_id: USER_ID,
    date: e.date,
    summary: e.summary,
    time: e.time || null,
    type: e.type || 'event',
    calendar: e.calendar || 'main',
    hidden: false,
    highlighted: false,
  }));
  await insertBatch('family_upcoming_events', upcomingRows);

  // -----------------------------------------------------------
  // 10. Prompts
  // -----------------------------------------------------------
  console.log('\n10. Prompts');
  const promptRows = (promptsFile.prompts || []).map(p => ({
    id: p.id,
    category: p.category,
    urgency: p.urgency,
    title: p.title,
    description: p.desc,
    month: p.month,
    end_month: p.endMonth || null,
    tags: p.tags || [],
    age_min: p.ageMin || null,
    age_max: p.ageMax || null,
  }));
  await upsertBatch('prompts', promptRows);

  // -----------------------------------------------------------
  // Done
  // -----------------------------------------------------------
  console.log('\n✓ Migration complete!');
  console.log('\nSummary:');
  console.log(`  Tasks: ${taskRows.length}`);
  console.log(`  Habits: ${habitRows.length}`);
  console.log(`  Checkins: ${checkinRows.length}`);
  console.log(`  Completed items: ${completedRows.length}`);
  console.log(`  Diet entries: ${dietRows.length}`);
  console.log(`  Weight logs: ${weightRows.length}`);
  console.log(`  Calendar events: ${calendarRows.length}`);
  console.log(`  Family hub items: ${familyRows.length}`);
  console.log(`  Family upcoming events: ${upcomingRows.length}`);
  console.log(`  Prompts: ${promptRows.length}`);
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

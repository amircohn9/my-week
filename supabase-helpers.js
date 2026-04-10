// supabase-helpers.js — DB wrapper layer for the weekly dashboard
// Provides db.loadAll(), db.update*(), db.insert*(), db.delete*()

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const db = {
  // ============================================================
  // AUTH
  // ============================================================
  async signIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async getSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  },

  async signOut() {
    await supabaseClient.auth.signOut();
  },

  // ============================================================
  // LOAD ALL DATA (parallel fetch, reshape for renderers)
  // ============================================================
  async loadAll() {
    const [
      settingsRes,
      tasksRes,
      habitsRes,
      checkinsRes,
      completedRes,
      dietRes,
      weightsRes,
      calendarRes,
      familyItemsRes,
      familyEventsRes,
      promptsRes,
      jobAppsRes,
    ] = await Promise.all([
      supabaseClient.from('app_settings').select('*').limit(1).single(),
      supabaseClient.from('tasks').select('*').order('sort_order'),
      supabaseClient.from('habits').select('*').order('sort_order'),
      supabaseClient.from('checkins').select('*').order('date', { ascending: false }),
      supabaseClient.from('completed_items').select('*').order('date', { ascending: false }),
      supabaseClient.from('diet_entries').select('*').order('date', { ascending: false }),
      supabaseClient.from('weight_logs').select('*').order('date', { ascending: true }),
      supabaseClient.from('calendar_events').select('*').order('date'),
      supabaseClient.from('family_hub_items').select('*').order('sort_order'),
      supabaseClient.from('family_upcoming_events').select('*').order('date'),
      supabaseClient.from('prompts').select('*'),
      supabaseClient.from('job_applications').select('*').order('sort_order'),
    ]);

    return this.reshapeForRenderers(
      settingsRes.data,
      tasksRes.data || [],
      habitsRes.data || [],
      checkinsRes.data || [],
      completedRes.data || [],
      dietRes.data || [],
      weightsRes.data || [],
      calendarRes.data || [],
      familyItemsRes.data || [],
      familyEventsRes.data || [],
      promptsRes.data || [],
      jobAppsRes.data || [],
    );
  },

  // Transform flat Supabase rows into the nested appData structure
  // that existing renderers expect
  reshapeForRenderers(settings, tasks, habits, checkins, completed, diet, weights, calendar, familyItems, familyEvents, prompts, jobApps) {
    const categories = (settings?.categories) || ['Career', 'Self', 'Home Duties', 'Family'];

    // Build tasks object: { Career: { description, now, backlog, recurring }, ... }
    const tasksObj = {};
    for (const cat of categories) {
      const catHabits = habits.filter(h => h.category === cat);
      tasksObj[cat] = {
        description: '',
        now: tasks.filter(t => t.category === cat && t.list === 'now').map(t => ({
          id: t.id,
          text: t.text,
          done: t.done,
          deadline: t.deadline,
          link: t.link,
          description: t.description || '',
          thisWeek: t.this_week,
          today: t.today,
          subtasks: (t.subtasks || []).map(s => ({
            text: s.text,
            done: s.done,
            thisWeek: s.thisWeek || false,
            today: s.today || false,
          })),
        })),
        backlog: tasks.filter(t => t.category === cat && t.list === 'backlog').map(t => ({
          id: t.id,
          text: t.text,
          done: t.done,
          deadline: t.deadline,
          link: t.link,
          description: t.description || '',
          thisWeek: t.this_week,
          today: t.today,
          subtasks: (t.subtasks || []).map(s => ({
            text: s.text,
            done: s.done,
            thisWeek: s.thisWeek || false,
            today: s.today || false,
          })),
        })),
        recurring: catHabits.map(h => ({
          id: h.id,
          text: h.text,
          recurring: h.recurring,
          nextSession: h.next_session,
          hidden: h.hidden,
          sessions: h.sessions || [],
          defaultHours: h.default_hours || null,
        })),
      };
    }

    // Build calendarEvents: { "2026-03-23": [ {time, summary, color}, ... ] }
    const calendarEvents = {};
    for (const e of calendar) {
      if (!calendarEvents[e.date]) calendarEvents[e.date] = [];
      calendarEvents[e.date].push({
        id: e.id,
        time: e.time,
        summary: e.summary,
        color: e.color,
        type: e.type,
        calendar: e.calendar,
        source: e.source,
      });
    }

    // Build familyHub
    const familyHub = {
      thisWeek: familyItems.filter(i => i.section === 'thisWeek').map(this._mapFamilyItem),
      backlog: familyItems.filter(i => i.section === 'backlog').map(this._mapFamilyItem),
      decisions: familyItems.filter(i => i.section === 'decisions' || i.section === 'purchases').map(this._mapFamilyItem),
      trips: familyItems.filter(i => i.section === 'trips').map(this._mapFamilyItem),
      susie: familyItems.filter(i => i.section === 'susie').map(this._mapFamilyItem),
      notes: familyItems.filter(i => i.section === 'notes').map(this._mapFamilyItem),
      upcomingEvents: familyEvents.map(e => ({
        id: e.id,
        date: e.date,
        summary: e.summary,
        time: e.time,
        type: e.type,
        calendar: e.calendar,
        hidden: e.hidden,
        highlighted: e.highlighted,
      })),
    };

    return {
      _settings: settings, // keep raw settings for update operations
      dailyFocus: settings?.daily_focus || '',
      weeklyFocus: settings?.weekly_focus || [],
      weeklyIntentions: settings?.weekly_intentions || [],
      categories,
      startDate: settings?.start_date || '',
      yesterdayNotes: settings?.yesterday_notes || '',
      didYouKnow: settings?.did_you_know || [],
      diet: {
        entries: diet.map(d => ({
          date: d.date,
          note: d.note,
          calories: d.calories,
          protein: d.protein,
          carbs: d.carbs,
          fat: d.fat,
          sodium: d.sodium,
          fiber: d.fiber,
        })),
        weights: weights.map(w => ({ date: w.date, lbs: Number(w.lbs) })),
        goalWeight: settings?.goal_weight ? Number(settings.goal_weight) : null,
        startWeight: settings?.start_weight ? Number(settings.start_weight) : null,
      },
      calendarEvents,
      familyHub,
      checkins: checkins.map(c => ({
        id: c.id,
        date: c.date,
        activities: c.activities || [],
        mood: c.mood,
        obstacles: c.obstacles,
        wins: c.wins,
        summary: c.summary,
      })),
      completedItems: completed.map(c => ({
        id: c.id,
        category: c.category,
        text: c.text,
        hours: c.hours ? Number(c.hours) : undefined,
        date: c.date,
      })),
      tasks: tasksObj,
      jobApplications: jobApps.map(a => ({
        id: a.id,
        company: a.company,
        role: a.role,
        date_applied: a.date_applied,
        method: a.method,
        unemployment: a.unemployment || false,
        sort_order: a.sort_order,
      })),
      notes: [], // removed — kept for renderer compat
      prompts: prompts.map(p => ({
        id: p.id,
        category: p.category,
        urgency: p.urgency,
        title: p.title,
        desc: p.description,
        month: p.month,
        endMonth: p.end_month,
        tags: p.tags || [],
        ageMin: p.age_min,
        ageMax: p.age_max,
      })),
    };
  },

  _mapFamilyItem(item) {
    return {
      id: item.id,
      text: item.text,
      date: item.date,
      addedBy: item.added_by,
      assignee: item.assignee,
      done: item.done,
      doneDate: item.done_date,
      deadline: item.deadline,
      comment: item.comment,
    };
  },

  // ============================================================
  // TASKS
  // ============================================================
  async updateTask(id, fields) {
    // Map camelCase to snake_case
    const mapped = {};
    if ('done' in fields) mapped.done = fields.done;
    if ('text' in fields) mapped.text = fields.text;
    if ('list' in fields) mapped.list = fields.list;
    if ('thisWeek' in fields) mapped.this_week = fields.thisWeek;
    if ('today' in fields) mapped.today = fields.today;
    if ('deadline' in fields) mapped.deadline = fields.deadline;
    if ('subtasks' in fields) mapped.subtasks = fields.subtasks;
    if ('sort_order' in fields) mapped.sort_order = fields.sort_order;
    if ('description' in fields) mapped.description = fields.description;
    const { error } = await supabaseClient.from('tasks').update(mapped).eq('id', id);
    if (error) throw error;
  },

  async insertTask(task) {
    const { data, error } = await supabaseClient.from('tasks').insert({
      user_id: (await this.getSession()).user.id,
      text: task.text,
      done: task.done || false,
      category: task.category,
      list: task.list || 'now',
      deadline: task.deadline || null,
      link: task.link || null,
      this_week: task.thisWeek || false,
      today: task.today || false,
      sort_order: task.sort_order || 0,
      subtasks: task.subtasks || [],
    }).select().single();
    if (error) throw error;
    return data;
  },

  async deleteTask(id) {
    const { error } = await supabaseClient.from('tasks').delete().eq('id', id);
    if (error) throw error;
  },

  // ============================================================
  // HABITS
  // ============================================================
  async updateHabit(id, fields) {
    const mapped = {};
    if ('hidden' in fields) mapped.hidden = fields.hidden;
    if ('sessions' in fields) mapped.sessions = fields.sessions;
    if ('next_session' in fields) mapped.next_session = fields.next_session;
    if ('text' in fields) mapped.text = fields.text;
    if ('recurring' in fields) mapped.recurring = fields.recurring;
    if ('default_hours' in fields) mapped.default_hours = fields.default_hours;
    const { error } = await supabaseClient.from('habits').update(mapped).eq('id', id);
    if (error) throw error;
  },

  async insertHabit(habit) {
    const { data, error } = await supabaseClient.from('habits').insert({
      user_id: (await this.getSession()).user.id,
      text: habit.text,
      category: habit.category,
      recurring: habit.recurring || 'weekly',
      hidden: false,
      sessions: [],
      sort_order: habit.sort_order || 0,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async deleteHabit(id) {
    const { error } = await supabaseClient.from('habits').delete().eq('id', id);
    if (error) throw error;
  },

  // ============================================================
  // APP SETTINGS
  // ============================================================
  async updateSettings(fields) {
    const mapped = {};
    if ('dailyFocus' in fields) mapped.daily_focus = fields.dailyFocus;
    if ('weeklyFocus' in fields) mapped.weekly_focus = fields.weeklyFocus;
    if ('weeklyIntentions' in fields) mapped.weekly_intentions = fields.weeklyIntentions;
    if ('yesterdayNotes' in fields) mapped.yesterday_notes = fields.yesterdayNotes;
    if ('goalWeight' in fields) mapped.goal_weight = fields.goalWeight;
    if ('didYouKnow' in fields) mapped.did_you_know = fields.didYouKnow;
    const userId = (await this.getSession()).user.id;
    const { error } = await supabaseClient.from('app_settings').update(mapped).eq('user_id', userId);
    if (error) throw error;
  },

  // ============================================================
  // CHECKINS
  // ============================================================
  async upsertCheckin(checkin) {
    const userId = (await this.getSession()).user.id;
    const { data, error } = await supabaseClient.from('checkins').upsert({
      user_id: userId,
      date: checkin.date,
      activities: checkin.activities || [],
      mood: checkin.mood || '',
      obstacles: checkin.obstacles || '',
      wins: checkin.wins || '',
      summary: checkin.summary || '',
    }, { onConflict: 'user_id,date' }).select().single();
    if (error) throw error;
    return data;
  },

  async getCheckinByDate(date) {
    const { data } = await supabaseClient.from('checkins').select('*').eq('date', date).maybeSingle();
    return data;
  },

  // ============================================================
  // COMPLETED ITEMS
  // ============================================================
  async deleteCompletedItemsByDate(date) {
    const userId = (await this.getSession()).user.id;
    const { error } = await supabaseClient.from('completed_items').delete().eq('user_id', userId).eq('date', date);
    if (error) throw error;
  },

  async insertCompletedItem(item) {
    const { error } = await supabaseClient.from('completed_items').insert({
      user_id: (await this.getSession()).user.id,
      category: item.category,
      text: item.text,
      hours: item.hours || null,
      date: item.date,
    });
    if (error) throw error;
  },

  async insertCompletedItems(items) {
    if (!items.length) return;
    const userId = (await this.getSession()).user.id;
    const rows = items.map(i => ({
      user_id: userId,
      category: i.category,
      text: i.text,
      hours: i.hours || null,
      date: i.date,
    }));
    const { error } = await supabaseClient.from('completed_items').insert(rows);
    if (error) throw error;
  },

  // ============================================================
  // DIET
  // ============================================================
  async upsertDietEntry(entry) {
    const userId = (await this.getSession()).user.id;
    const { error } = await supabaseClient.from('diet_entries').upsert({
      user_id: userId,
      date: entry.date,
      note: entry.note || '',
      calories: entry.calories || '',
      protein: entry.protein || '',
      carbs: entry.carbs || '',
      fat: entry.fat || '',
      sodium: entry.sodium || '',
      fiber: entry.fiber || '',
    }, { onConflict: 'user_id,date' });
    if (error) throw error;
  },

  // ============================================================
  // WEIGHT
  // ============================================================
  async insertWeight(date, lbs) {
    const userId = (await this.getSession()).user.id;
    // Remove existing entry for this date to prevent duplicates
    await supabaseClient.from('weight_logs').delete().eq('user_id', userId).eq('date', date);
    const { error } = await supabaseClient.from('weight_logs').insert({
      user_id: userId,
      date,
      lbs,
    });
    if (error) throw error;
  },

  // ============================================================
  // CALENDAR EVENTS
  // ============================================================
  async insertCalendarEvent(event) {
    const { data, error } = await supabaseClient.from('calendar_events').insert({
      user_id: (await this.getSession()).user.id,
      date: event.date,
      time: event.time || null,
      summary: event.summary,
      color: event.color || null,
      type: event.type || 'event',
      calendar: event.calendar || 'main',
      source: event.source || 'manual',
    }).select().single();
    if (error) throw error;
    return data;
  },

  async updateCalendarEvent(id, fields) {
    const { error } = await supabaseClient.from('calendar_events').update(fields).eq('id', id);
    if (error) throw error;
  },

  async deleteCalendarEvent(id) {
    const { error } = await supabaseClient.from('calendar_events').delete().eq('id', id);
    if (error) throw error;
  },

  // ============================================================
  // FAMILY HUB
  // ============================================================
  async updateFamilyItem(id, fields) {
    const mapped = {};
    if ('text' in fields) mapped.text = fields.text;
    if ('done' in fields) mapped.done = fields.done;
    if ('doneDate' in fields) mapped.done_date = fields.doneDate;
    if ('assignee' in fields) mapped.assignee = fields.assignee;
    if ('deadline' in fields) mapped.deadline = fields.deadline;
    if ('comment' in fields) mapped.comment = fields.comment;
    if ('section' in fields) mapped.section = fields.section;
    if ('sort_order' in fields) mapped.sort_order = fields.sort_order;
    const { error } = await supabaseClient.from('family_hub_items').update(mapped).eq('id', id);
    if (error) throw error;
  },

  async insertFamilyItem(item) {
    const { data, error } = await supabaseClient.from('family_hub_items').insert({
      user_id: (await this.getSession()).user.id,
      text: item.text,
      section: item.section,
      date: item.date || new Date().toISOString().slice(0, 10),
      added_by: item.addedBy || 'Amir',
      assignee: item.assignee || '',
      done: item.done || false,
      deadline: item.deadline || null,
      comment: item.comment || '',
      sort_order: item.sort_order || 0,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async deleteFamilyItem(id) {
    const { error } = await supabaseClient.from('family_hub_items').delete().eq('id', id);
    if (error) throw error;
  },

  // ============================================================
  // FAMILY UPCOMING EVENTS
  // ============================================================
  async updateFamilyEvent(id, fields) {
    const { error } = await supabaseClient.from('family_upcoming_events').update(fields).eq('id', id);
    if (error) throw error;
  },

  async insertFamilyEvent(event) {
    const { data, error } = await supabaseClient.from('family_upcoming_events').insert({
      user_id: (await this.getSession()).user.id,
      date: event.date,
      summary: event.summary,
      time: event.time || null,
      type: event.type || 'event',
      calendar: event.calendar || 'main',
    }).select().single();
    if (error) throw error;
    return data;
  },

  async deleteFamilyEvent(id) {
    const { error } = await supabaseClient.from('family_upcoming_events').delete().eq('id', id);
    if (error) throw error;
  },

  // ============================================================
  // PROMPTS
  // ============================================================
  async completePrompt(promptId, year) {
    const { error } = await supabaseClient.from('prompt_completions').upsert({
      user_id: (await this.getSession()).user.id,
      prompt_id: promptId,
      year,
      completed_date: new Date().toISOString().slice(0, 10),
    }, { onConflict: 'prompt_id,year' });
    if (error) throw error;
  },

  async getCompletedPrompts() {
    const { data } = await supabaseClient.from('prompt_completions').select('prompt_id, year');
    return data || [];
  },

  // ============================================================
  // JOB APPLICATIONS
  // ============================================================
  async updateJobApplication(id, fields) {
    const { error } = await supabaseClient.from('job_applications').update(fields).eq('id', id);
    if (error) throw error;
  },

  async insertJobApplication(app) {
    const { data, error } = await supabaseClient.from('job_applications').insert({
      user_id: (await this.getSession()).user.id,
      company: app.company,
      role: app.role || '',
      date_applied: app.date_applied || new Date().toISOString().slice(0, 10),
      method: app.method || 'direct',
      unemployment: app.unemployment || false,
      sort_order: app.sort_order || 0,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async deleteJobApplication(id) {
    const { error } = await supabaseClient.from('job_applications').delete().eq('id', id);
    if (error) throw error;
  },

  onAuthStateChange(callback) {
    supabaseClient.auth.onAuthStateChange(callback);
  },
};

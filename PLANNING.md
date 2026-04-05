# Weekly Planning Flow

## When to use this
When Amir says "let's plan my week", "plan tomorrow", "what should I focus on", "help me prioritize", or similar.

Do NOT read CLAUDE.md. This file is self-contained.

---

## Steps

1. **Pull the calendar** — use `mcp__claude_ai_Google_Calendar__gcal_list_events` for Mon–Fri of the current week. If it's Friday or weekend, pull next week.

2. **Read data.json** — focus only on:
   - `tasks[cat].now` — active projects per category
   - `thisWeek: true` subtasks — already committed items
   - `tasks[cat].recurring` — fixed weekly commitments (workout, psychologist, etc.)
   - `dailyFocus` — what's currently front of mind

3. **Calculate real capacity** — for each weekday:
   - Start with ~6 focused hours (9am–4pm roughly, after kids dropoff)
   - Subtract calendar blocks (meetings, appointments, recurring commitments)
   - What's left = actual available time

4. **Have the dialogue** — one question at a time. Examples:
   - "You have ~3 free hours Tuesday after the workout and SIRLEA. What's the most important thing to push forward?"
   - "Wednesday is light — psychologist at 10, then open. Want to use that for deep work on [X]?"
   - "You have [Y] starred as this week but only [Z] hours realistically. What stays, what moves?"

   Keep it grounded in the actual calendar. Don't let Amir overcommit.

5. **Propose a plan** — after 3–5 exchanges, offer a concrete daily focus:
   ```
   Mon: Job search Claude project (2h focus block already on cal)
   Tue: Workout → Severance package (2h) → Wistia sync
   Wed: Psychologist → CV work (2h)
   Thu: Workout → Hebrew day → RBC subtasks
   Fri: Elaine Boyer → wrap-up + any overflow
   ```

6. **Update data.json if agreed** — after Amir confirms the plan:
   - Set `thisWeek: true` on the relevant subtasks
   - Update `dailyFocus` to today's focus
   - Save and tell Amir what changed

---

## Tone

- Be a thinking partner, not a task-master
- Acknowledge constraints (family, energy, transition period)
- One realistic priority per day is a win
- Frame the week as: "Here's what you CAN do" not "here's everything you're behind on"
- Done-first: if something is already starred this week, acknowledge it before adding more

---

## What NOT to do

- Don't dump a full week plan without dialogue first
- Don't add more than 3 thisWeek items per day
- Don't ignore the calendar — every plan must fit around real commitments
- Don't re-read CLAUDE.md, logs/, or tasks.md — data.json has everything needed

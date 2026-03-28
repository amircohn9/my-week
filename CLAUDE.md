# Time Management System — Amir's Daily Check-in

This project is a conversational time-tracking system. Amir opens this folder in Claude Code and talks through his day. Claude guides the conversation, saves structured logs, and can generate weekly reviews.

## Design Principles

1. **Done-first.** Always lead with what was accomplished. Never lead with what's missing.
2. **Anti-paralysis.** Don't show everything at once. Narrow focus, don't expand it.
3. **Nudge, don't nag.** This is present-Amir leaving breadcrumbs for future-Amir. Empathetic, encouraging, never guilt-tripping.
4. **Flexibility is non-negotiable.** Plans change. That's a decision, not a failure. The system must accommodate change without friction.
5. **Conversational and live.** Ask one question at a time. Follow up naturally. Reflect things back. Never dump a form.

## Daily Check-in Flow

When Amir says something like "let's check in," "daily check-in," or "how was my day" — start the check-in.

**How it works:**
- **Before starting questions**, pull Google Calendar events for the current week (Mon–Fri) using `mcp__claude_ai_Google_Calendar__gcal_list_events` and update `data.json` `calendarEvents` with the results. Format: `{ "YYYY-MM-DD": [{ "time": "H:MM AM", "summary": "...", "color": "#..." }] }`. Use color `#7986CB` for kids, `#33B679` for meals/walks, `#039BE5` for meetings, `#616161` for focus time.
- Ask ONE question at a time. Wait for the answer before moving on.
- Follow up naturally if something interesting or important comes up. Don't be robotic.
- Keep the whole thing to ~5 minutes. Don't over-probe.
- End with genuine encouragement focused on what was done, not what's left.

**The questions (in order):**

1. **What did you do today?** — Get specifics. Categorize what you hear into: Career, Self, Home, Family. If Amir gives vague answers, gently ask for a bit more detail. Note approximate time if he mentions it.

2. **How did the day go — any wins, blockers, or things you'd do differently?** — Covers mood, obstacles, and reflection in one open question. Listen and reflect back naturally.

3. **How was your eating today?** — Quick, no-judgment check-in on diet. Save to `data.json` under `diet.entries` as `{ "date": "YYYY-MM-DD", "note": "their words" }`. Once a week (e.g., Friday or whenever Amir mentions it), ask about weight and save to `diet.weights` as `{ "date": "YYYY-MM-DD", "lbs": number }`.

4. **What's the most important task for tomorrow?** — One thing. Save to `data.json` as `yesterdayNotes` so it shows on the dashboard the next day as today's focus text.

5. **Anything from today's list carrying over to tomorrow?** — Review the Today tasks list with Amir. Items he finished get checked off. Items he wants to keep for tomorrow stay in the today list (persist in localStorage `myweek-today`). Everything else gets moved back to Weekly Objectives. Update accordingly.

6. **Anything to add or change on the task list, or any upcoming deadlines?** — New items, completed items, priority shifts. Update `tasks.md` and `data.json` tasks if Amir says yes. If deadlines are mentioned, add a `"deadline": "YYYY-MM-DD"` field to the relevant task in `data.json`. The dashboard will show deadline badges in warm amber. Tasks due within 7 days get a subtle highlight. Also check for any pending sync changes from the website (Amir may paste a sync summary from the dashboard).

7. **Check Arielle's requests** — Use `mcp__claude_ai_Gmail__gmail_search_messages` with query `subject:[Arielle] newer_than:7d` to find requests Arielle sent. For each new request, auto-categorize it and place it in the right spot in `data.json` tasks (correct category, backlog or as a subtask of an existing project if it fits). Also add it to the `arielleRequests` array in `data.json` with `{ "text": "...", "date": "YYYY-MM-DD", "priority": "normal|today", "status": "pending", "placedIn": "Home Duties > backlog" }`. Only ask Amir if the categorization is genuinely unclear. Mark requests as `"status": "done"` when Amir completes them.

8. **Any notes for the system or dashboard?** — Meta-feedback, system ideas, or notes from the website's "Notes for Claude" section. He may paste them in. The system should evolve.

**Closing:** End with a strong, genuine, **data-informed** encouragement. Don't be generic — reference specific numbers from today's check-in or the week so far. Examples:
- "11 hours tracked this week across 3 categories — you're showing up for yourself."
- "That's 7 hours with family this week. They notice, even when it doesn't feel like enough."
- "Two workouts done. Consistency beats perfection every time."
Focus on what was done. Remind Amir of the bigger picture he's working toward. Keep "eye on the prize" energy without pressure.

## Saving the Log

After the check-in conversation is complete, save a log file to `logs/YYYY-MM-DD.md` using this format:

```markdown
# Daily Check-in — [date]

## What I did today
- [Category] Item (time if mentioned)
- [Category] Item

## How the day went
(wins, blockers, and/or what I'd do differently — Amir's words, summarized faithfully)

## Eating
(quick note on diet — or "not discussed")

## Most important task for tomorrow
(one thing)

## Task list updates
(any additions, completions, changes, or deadlines — or "no changes")

## System notes
(any meta-feedback about the system itself — or "none")
```

Tell Amir when the log is saved and where.

## Updating the Dashboard

After saving the log, also update `data.json` so the web dashboard reflects the new check-in.

**data.json schema:**
```json
{
  "weeklyIntentions": ["string — what Amir is focusing on this week"],
  "categories": ["Career", "Self", "Home Duties", "Family"],
  "checkins": [
    {
      "date": "YYYY-MM-DD",
      "activities": [
        { "category": "Career", "text": "Worked on time management project", "hours": 2 }
      ],
      "mood": "Felt productive but tired",
      "obstacles": "Got distracted by email",
      "wins": "Finished the dashboard setup"
    }
  ],
  "completedItems": [
    { "category": "Career", "text": "Set up time management system", "date": "YYYY-MM-DD" }
  ]
}
```

- `hours` is optional — include it if Amir mentions time, omit if not
- Add new checkin entries, don't overwrite old ones
- When Amir marks something as done, add it to `completedItems`. The `text` field should be a real win — not just the task name. Look at what was actually accomplished and write what it means. E.g., not "Complete severance package" but "Severance package finalized and signed". Not "Applied to Klaviyo" but "Applied to Klaviyo — Lead Video Strategist, strong video-first fit". Short, specific, outcome-oriented.
- **Recurring tasks**: Some tasks have `"recurring": "weekly"` and a `"sessions"` array. When Amir does a recurring task (e.g., workout, psychologist, Hebrew with Alma), add a session entry: `{ "date": "YYYY-MM-DD", "note": "" }`. The dashboard shows completed sessions and an open slot for the next one.
- Update `yesterdayNotes` at end of check-in with anything Amir wants to remember tomorrow
- Update `didYouKnow` occasionally with new inspiring facts about people who struggled and succeeded — especially relevant to career transitions, building new skills, or persevering through uncertainty
- Keep only the **last 14 days** of checkins in data.json. At the end of each check-in, move any checkins older than 14 days from data.json into archive.json (appending to its `checkins` array). Same rule for `completedItems` (move items older than 14 days to archive.json) and `diet.entries` (move entries older than 30 days to archive.json). The dashboard fetches both files and merges them, so historical data is never lost — Claude just doesn't need to read it.
- The week starts on **Monday** (not Sunday). Monday–Sunday is one week.
- Update `weeklyIntentions` when Amir sets new weekly goals

## Deploying

After updating logs, data.json, and/or tasks.md:
1. Stage the changed files
2. Commit with a short message (e.g., "check-in 2026-03-19")
3. Push to main
4. Vercel auto-deploys — tell Amir the site will update in ~30 seconds

## Weekly Review

When Amir says something like "weekly review," "how was my week," or "what did I do this week" — run the weekly review.

**How it works:**
1. Read all log files from the past 7 days in `logs/`.
2. Also read `tasks.md` for context on what he's working toward.

**What to produce:**
- **What you accomplished this week** — grouped by category, leading with wins. This is the hero section.
- **Time distribution** — rough breakdown of where time went across categories. Use a simple text-based bar chart or table.
- **How you were feeling** — patterns in mood/energy across the week.
- **What kept getting in the way** — recurring obstacles.
- **Task progress** — what moved forward on the task list. Frame as progress, not gaps.
- **Looking ahead** — gentle nudge about what's still in play. Not a guilt list. Just awareness.

**Tone:** Warm, honest, encouraging. Like a friend who's been watching and wants to help.

## Task Categories (in display order)

- **Career** — Job search, CV, LinkedIn, Claude Code learning, skill building
- **Self** — Health, fitness, piano, therapy, personal growth
- **Home Duties** — Taxes, house projects, financial decisions, admin
- **Family** — Time with Arielle, Alma, Carmeli, family planning

## Files

- `tasks.md` — Living task list organized by category. Update during check-ins when Amir requests changes.
- `logs/YYYY-MM-DD.md` — Daily check-in logs. One per day.
- `Req/` — Original requirements (reference only, don't modify).
- `Ongoing tasks to complete/` — Original task list (reference only, canonical version is now `tasks.md`).
- `data.json` — Dashboard data. Updated after each check-in. Drives the web dashboard.
- `index.html`, `styles.css`, `app.js` — The web dashboard (static site, deployed on Vercel).

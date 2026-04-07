import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { activities, winsObstaclesMood, diet, weight, tomorrowFocus, habits, weeklyIntentions } = req.body || {};

  if (!activities) {
    return res.status(400).json({ error: 'Missing activities field' });
  }

  // Build the habits context for the AI
  let habitsContext = '';
  if (habits && habits.length > 0) {
    habitsContext = `\n\n**The user's recurring habits (these are tracked separately — match activities to them when relevant):**\n`;
    habitsContext += habits.map(h => `- [id: ${h.id}] "${h.text}" (category: ${h.category}, frequency: ${h.recurring})`).join('\n');
  }

  let intentionsContext = '';
  if (weeklyIntentions && weeklyIntentions.length > 0) {
    intentionsContext = `\n\n**This week's objectives:**\n`;
    intentionsContext += weeklyIntentions.map(i => `- ${i}`).join('\n');
  }

  const prompt = `You are parsing a daily check-in for a time management app. The user dictated their answers to a few questions. Extract structured data from their free-form text.

The four categories are: Career, Self, Home Duties, Family.
- Career: Job search, CV, LinkedIn, skill building, Claude Code, work projects
- Self: Health, fitness, workouts, piano, therapy, personal growth, reading
- Home Duties: Taxes, house projects, financial decisions, admin, errands, cooking, cleaning
- Family: Time with Arielle (wife), Alma (daughter ~5), Carmeli/Carmel (daughter ~3), family outings
${habitsContext}${intentionsContext}

Here are the user's answers:

**What did you do today?**
${activities}

**Wins, obstacles, mood?**
${winsObstaclesMood || '(not provided)'}

**Diet?**
${diet || '(not provided)'}

**Weight?**
${weight || '(not provided)'}

**Tomorrow's focus?**
${tomorrowFocus || '(not provided)'}

Return ONLY valid JSON with this exact structure:
{
  "activities": [
    { "category": "Career|Self|Home Duties|Family", "text": "brief description of what was done", "hours": number_or_null }
  ],
  "wins": "string summarizing actual wins/achievements, or empty string",
  "obstacles": "string summarizing obstacles, or empty string",
  "mood": "string summarizing mood/how day felt, or empty string",
  "diet": "string with diet note, or empty string",
  "weight": number_or_null,
  "tomorrowFocus": "string with tomorrow's main focus, or empty string",
  "summary": "one-line summary of the day",
  "habitUpdates": [
    { "habitId": "the habit id from the list above", "note": "optional short note about the session" }
  ]
}

Rules:
- Split distinct activities into separate items. If someone says "worked on my CV for 2 hours then hit the gym for an hour" that's two activities.
- Assign each activity to the best-fit category.
- Extract hours when mentioned (can be decimals like 0.5, 1.5). Use null if not mentioned.
- For the "text" field, write clean short descriptions (not the raw dictation). E.g., "Worked on CV and cover letter" not "I was working on my CV you know and also the cover letter".

**WINS — be selective:**
- NOT everything the user did is a win. Routine activities (had lunch, did errands, drove kids) are NOT wins.
- A win is something noteworthy: finishing a milestone, making real progress on a goal, overcoming something hard, a meaningful personal achievement, hitting a target.
- If the user explicitly mentions wins, use those. Otherwise, infer only genuine achievements from what they described.
- If nothing stands out as a win, leave it empty. That's fine.

**HABIT MATCHING:**
- When an activity clearly matches one of the user's recurring habits, include it in habitUpdates with the habit's id.
- E.g., if the user says "had my workout with the trainer" and there's a habit "Workout with trainer (2x/week)", match it.
- E.g., if the user says "did Hebrew with Alma", match to "Hebrew day with Alma".
- Only match when you're confident. Don't force matches.
- The note is optional — include it if the user said something specific about that session.

- Keep the obstacles/mood faithful to what the user said, just clean up dictation artifacts.
- For weight, extract the number only. Null if not mentioned.
- The summary should be a concise one-liner capturing the day.
- Return ONLY the JSON object, no markdown fences, no other text.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'No valid JSON in response', raw: text });

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Parse check-in error:', err);
    return res.status(500).json({ error: err.message });
  }
}

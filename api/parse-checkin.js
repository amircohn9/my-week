import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { activities, winsObstaclesMood, diet, weight, tomorrowFocus } = req.body || {};

  if (!activities) {
    return res.status(400).json({ error: 'Missing activities field' });
  }

  const prompt = `You are parsing a daily check-in for a time management app. The user dictated their answers to a few questions. Extract structured data from their free-form text.

The four categories are: Career, Self, Home Duties, Family.
- Career: Job search, CV, LinkedIn, skill building, Claude Code, work projects
- Self: Health, fitness, workouts, piano, therapy, personal growth, reading
- Home Duties: Taxes, house projects, financial decisions, admin, errands, cooking, cleaning
- Family: Time with Arielle (wife), Alma (daughter ~5), Carmeli/Carmel (daughter ~3), family outings

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
  "wins": "string summarizing wins, or empty string",
  "obstacles": "string summarizing obstacles, or empty string",
  "mood": "string summarizing mood/how day felt, or empty string",
  "diet": "string with diet note, or empty string",
  "weight": number_or_null,
  "tomorrowFocus": "string with tomorrow's main focus, or empty string",
  "summary": "one-line summary of the day"
}

Rules:
- Split distinct activities into separate items. If someone says "worked on my CV for 2 hours then hit the gym for an hour" that's two activities.
- Assign each activity to the best-fit category.
- Extract hours when mentioned (can be decimals like 0.5, 1.5). Use null if not mentioned.
- For the "text" field, write clean short descriptions (not the raw dictation). E.g., "Worked on CV and cover letter" not "I was working on my CV you know and also the cover letter".
- Keep the wins/obstacles/mood faithful to what the user said, just clean up dictation artifacts.
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

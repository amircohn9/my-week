import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { likedTitles = [], dismissedTitles = [] } = req.body || {};

  // Calculate this and next weekend dates
  const now = new Date();
  const day = now.getDay();
  const daysToSat = (6 - day + 7) % 7;
  const thisSat = new Date(now);
  thisSat.setDate(now.getDate() + daysToSat);
  const thisSun = new Date(thisSat);
  thisSun.setDate(thisSat.getDate() + 1);
  const nextSat = new Date(thisSat);
  nextSat.setDate(thisSat.getDate() + 7);
  const nextSun = new Date(nextSat);
  nextSun.setDate(nextSat.getDate() + 1);

  const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  let feedbackSection = '';
  if (likedTitles.length > 0 || dismissedTitles.length > 0) {
    feedbackSection = '\n\nBased on past feedback, this family has enjoyed activities like: ' +
      likedTitles.slice(-20).join(', ') + '. ' +
      (dismissedTitles.length > 0 ? 'They have dismissed activities like: ' + dismissedTitles.slice(-20).join(', ') + '. ' : '') +
      'Use this to inform your recommendations.';
  }

  const prompt = `Search for family-friendly weekend events and activities near Arlington, Massachusetts for this weekend (${fmt(thisSat)} and ${fmt(thisSun)}) and next weekend (${fmt(nextSat)} and ${fmt(nextSun)}). The family has kids ages 3 and 5. Look for: outdoor activities, festivals, farm events, library programs, museum exhibits, kids shows, seasonal activities, nature walks, farmer's markets, playgrounds worth visiting, community events, and anything else a young family would enjoy. Include both structured events with specific times AND open-ended ideas like "the tulips are blooming at Garden in the Woods" or "Spy Pond is great for feeding ducks this time of year." For each result return a JSON object with: title, date_time (specific date and time, or "Anytime" for undated ideas), location_name, town, approximate_drive_minutes from Arlington MA, cost (free or dollar amount or "varies"), hook (one sentence explaining why this family would like it), source_url, signup_required (boolean). Return ONLY a valid JSON array, no other text. Prioritize quality over quantity — 8-15 great curated ideas, not 40 mediocre ones. Bias toward outdoor and active stuff when weather is good.${feedbackSection}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 10
      }],
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract text from response
    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: 'No valid JSON in response', raw: text });

    const ideas = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ ideas, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Claude API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

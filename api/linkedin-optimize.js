import { pipeline } from './_redis.js';

const SYSTEM = `You are a LinkedIn profile expert and personal branding coach with 10+ years helping professionals get hired. You write punchy, keyword-rich LinkedIn profiles that rank in recruiter searches and convert profile views into conversations.`;

const buildPrompt = (profileText, targetRole) => `Analyse this LinkedIn profile${targetRole ? ` for someone targeting "${targetRole}" roles` : ''} and return ONLY a valid JSON object — no markdown fences, no preamble, no extra text.

Required JSON structure:
{
  "score": <integer 0–100, overall LinkedIn profile strength>,
  "grade": "<Excellent | Good | Average | Needs Work>",
  "summary": "<2–3 sentences: honest overall verdict on profile quality and visibility>",
  "headlines": [
    "<headline option 1 — keyword-rich, under 220 chars>",
    "<headline option 2 — achievement-focused, under 220 chars>",
    "<headline option 3 — bold/differentiated, under 220 chars>"
  ],
  "aboutSection": "<full rewritten About / Summary section — 3–5 sentences, first-person, keyword-rich, ends with a clear call to action>",
  "skillsToAdd": ["<skill 1>", "<skill 2>", "<skill 3>", "<skill 4>", "<skill 5>"],
  "quickWins": [
    "<specific actionable improvement #1 — name the section it applies to>",
    "<specific actionable improvement #2>",
    "<specific actionable improvement #3>",
    "<specific actionable improvement #4>",
    "<specific actionable improvement #5>"
  ]${targetRole ? `,
  "jobMatchScore": <integer 0–100, how well this profile positions them for "${targetRole}">,
  "jobMatchTips": [
    "<specific tip to better position for this role>",
    "<specific tip 2>",
    "<specific tip 3>"
  ]` : ''}
}

LinkedIn Profile:
${profileText.slice(0, 5000)}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { profileText, targetRole, proToken } = req.body;

  if (!profileText || profileText.trim().length < 50)
    return res.status(400).json({ error: 'Profile text is too short. Paste your full LinkedIn profile.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server is missing API key.' });

  // Pro token check
  let isPro = false;
  if (proToken && typeof proToken === 'string' && proToken.length >= 4) {
    const proResult = await pipeline([['GET', `pro:sale:${proToken}`]]).catch(() => null);
    isPro = proResult?.[0]?.result === '1';
  }

  // Rate limit: 3 optimisations per IP per day (free)
  const today = new Date().toISOString().slice(0, 10);
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  if (!isPro) {
    const rlKey = `linkedin:rl:${ip}:${today}`;
    const rlResult = await pipeline([['INCR', rlKey], ['EXPIRE', rlKey, 86400]]).catch(() => null);
    const count = rlResult?.[0]?.result || 1;
    if (count > 3) {
      return res.status(429).json({
        error: 'Free tier allows 3 LinkedIn optimisations per day. Upgrade to Pro for unlimited access.',
        rateLimited: true,
      });
    }
  }

  let anthropicRes;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1600,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildPrompt(profileText, targetRole?.trim() || '') }],
      }),
    });
  } catch {
    return res.status(500).json({ error: 'Failed to reach AI service.' });
  }

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json().catch(() => ({}));
    return res.status(anthropicRes.status).json({ error: err?.error?.message || `API error: ${anthropicRes.status}` });
  }

  const data = await anthropicRes.json();
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch {
    return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
  }

  // Analytics
  const inputTokens  = data.usage?.input_tokens  || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  await pipeline([
    ['INCR',   'linkedin:total'],
    ['INCR',   `linkedin:today:${today}`],
    ['EXPIRE', `linkedin:today:${today}`, 172800],
    ['INCRBY', 'tokens:input',  String(inputTokens)],
    ['INCRBY', 'tokens:output', String(outputTokens)],
  ]).catch(() => {});

  return res.status(200).json({ ...parsed, isPro });
}

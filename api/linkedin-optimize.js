import { pipeline } from './_redis.js';

const SYSTEM = `You are a LinkedIn profile expert and personal branding coach with 10+ years helping professionals get hired. You write punchy, keyword-rich LinkedIn profiles that rank in recruiter searches and convert profile views into conversations.`;

const buildPrompt = (profileText, targetRole) => `Analyse this LinkedIn profile${targetRole ? ` for someone targeting "${targetRole}" roles` : ''} and return ONLY a valid JSON object — no markdown fences, no preamble, no extra text.

Required JSON structure:
{
  "score": <integer 0–100>,
  "grade": "<Excellent | Good | Average | Needs Work>",
  "summary": "<2–3 sentences: honest overall verdict on profile quality and recruiter visibility>",

  "sectionScores": {
    "headline":   <integer 0–10>,
    "about":      <integer 0–10>,
    "experience": <integer 0–10>,
    "skills":     <integer 0–10>,
    "education":  <integer 0–10>
  },

  "weaknesses": [
    {
      "section":  "<Headline | About | Experience | Skills | Education>",
      "severity": "<critical | moderate | quick_win>",
      "issue":    "<one sentence: what is wrong and why it hurts>",
      "original": "<the exact weak phrase or sentence from the profile, max 120 chars, or null>",
      "rewrite":  "<improved version of that text>"
    }
  ],

  "headlines": [
    "<option 1 — keyword-rich, under 220 chars>",
    "<option 2 — achievement-focused, under 220 chars>",
    "<option 3 — bold/differentiated, under 220 chars>"
  ],

  "aboutSection": "<full rewritten About section — 3–5 sentences, first-person, keyword-rich, ends with call to action>",

  "skillsToAdd": ["<skill 1>", "<skill 2>", "<skill 3>", "<skill 4>", "<skill 5>"],

  "quickWins": [
    "<specific improvement #1 — name the section>",
    "<specific improvement #2>",
    "<specific improvement #3>",
    "<specific improvement #4>",
    "<specific improvement #5>"
  ]${targetRole ? `,

  "jobMatchScore": <integer 0–100>,
  "jobMatchTips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "atsKeywordsFound": ["<keyword already in profile>"],
  "atsKeywordGaps":   ["<important keyword missing for this role>"]` : ''}
}

Rules:
- weaknesses: 3–6 items, sorted critical → moderate → quick_win
- critical = hurts recruiter visibility or makes a bad first impression
- moderate = noticeable gap that reduces conversions
- quick_win = easy fix with clear upside

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

  // Rate limit: 3/day free
  const today = new Date().toISOString().slice(0, 10);
  const ip    = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  if (!isPro) {
    const rlKey    = `linkedin:rl:${ip}:${today}`;
    const rlResult = await pipeline([['INCR', rlKey], ['EXPIRE', rlKey, 86400]]).catch(() => null);
    const count    = rlResult?.[0]?.result || 1;
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
        max_tokens: 2400,
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
  const raw  = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' }); }

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

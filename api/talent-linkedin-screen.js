import { pipeline } from './_redis.js';

const SCREEN_PROMPT = (profileText, jobTitle, jobDescription) =>
  `You are a senior talent acquisition specialist with 15 years of hiring experience. Evaluate this LinkedIn profile for the "${jobTitle}" role and return ONLY a valid JSON object — no markdown, no extra text, no trailing commas.

{
  "name": "<candidate's full name from profile, or 'Unknown'>",
  "currentTitle": "<their current job title, or 'Unknown'>",
  "currentCompany": "<their current company, or 'Unknown'>",
  "score": <integer 0–100, overall fit score for this specific role>,
  "grade": "<Excellent | Strong | Good | Average | Weak>",
  "experienceLevel": "<0–2 yrs | 3–5 yrs | 6–10 yrs | 10+ yrs | Unknown>",
  "recommendation": "<Strongly Recommend | Interview | Borderline | Pass>",
  "topStrength": "<single most relevant strength for this role — max 12 words>",
  "keyGap": "<single most critical missing requirement — max 12 words>",
  "skillsMatched": ["<matched skill 1>", "<matched skill 2>", "<matched skill 3>", "<matched skill 4>"],
  "notableAchievements": ["<standout achievement 1 from their profile>", "<standout achievement 2>"],
  "summary": "<2 honest sentences written for the hiring manager — be specific about fit>"
}

Scoring guide:
- 85–100: Near-perfect fit, all key requirements met with proven track record
- 70–84: Strong fit, meets most requirements, minor gaps are learnable
- 55–69: Moderate fit, meets some requirements but notable gaps exist
- 40–54: Weak fit, significant gaps in core requirements
- 0–39: Poor fit, fundamentally misaligned with role requirements

Recommendation guide:
- "Strongly Recommend" → score ≥ 80, move straight to hiring manager
- "Interview" → score 60–79, worth a conversation
- "Borderline" → score 45–59, interview only if pipeline is thin
- "Pass" → score < 45, does not meet minimum bar

Job Title: ${jobTitle}
Job Description / Requirements:
${jobDescription.slice(0, 2000)}

LinkedIn Profile:
${profileText.slice(0, 4000)}`;

async function screenOneProfile(profileText, candidateName, jobTitle, jobDescription, apiKey) {
  const attemptOnce = async () => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        temperature: 0,
        messages: [{ role: 'user', content: SCREEN_PROMPT(profileText, jobTitle, jobDescription) }],
      }),
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const d = await r.json();
    const raw = d.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    return JSON.parse(raw);
  };

  try {
    return await attemptOnce();
  } catch {
    await new Promise(res => setTimeout(res, 1200));
    return await attemptOnce();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { candidates, jobTitle, jobDescription } = req.body;

  if (!candidates?.length)
    return res.status(400).json({ error: 'No candidates provided.' });
  if (candidates.length > 15)
    return res.status(400).json({ error: 'Maximum 15 candidates per batch.' });
  if (!jobTitle?.trim())
    return res.status(400).json({ error: 'Job title is required.' });
  if (!jobDescription?.trim() || jobDescription.trim().length < 20)
    return res.status(400).json({ error: 'Job description is required (min 20 characters).' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server is missing API key.' });

  const today = new Date().toISOString().slice(0, 10);
  const ip    = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  // Rate limit: 10 LinkedIn screenings per IP per day (demo tier)
  const rlKey    = `talent:linkedin:${ip}:${today}`;
  const rlResult = await pipeline([
    ['INCRBY', rlKey, String(candidates.length)],
    ['EXPIRE',  rlKey, 86400],
  ]).catch(() => null);
  const usedToday = parseInt(rlResult?.[0]?.result || candidates.length, 10);
  if (usedToday > 10) {
    return res.status(429).json({
      error: 'Daily demo limit reached. Contact us for full enterprise access.',
      rateLimited: true,
    });
  }

  // Validate: each candidate must have profileText
  const valid    = candidates.filter(c => c.profileText && c.profileText.trim().length >= 50);
  const tooShort = candidates.filter(c => !c.profileText || c.profileText.trim().length < 50);

  const errorResults = tooShort.map(c => ({
    id: c.id,
    name: c.name || 'Unknown',
    score: 0,
    grade: 'Error',
    recommendation: 'Pass',
    topStrength: '—',
    keyGap: 'Profile text too short to analyse',
    skillsMatched: [],
    notableAchievements: [],
    summary: 'Could not extract enough information from this profile.',
    error: true,
  }));

  // Screen all valid candidates in parallel
  const settled = await Promise.allSettled(
    valid.map(c => screenOneProfile(c.profileText, c.name, jobTitle, jobDescription, apiKey))
  );

  const screened = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? { id: valid[i].id, ...r.value }
      : {
          id: valid[i].id,
          name: valid[i].name || 'Unknown',
          score: 0,
          grade: 'Error',
          recommendation: 'Pass',
          topStrength: '—',
          keyGap: 'AI analysis failed',
          skillsMatched: [],
          notableAchievements: [],
          summary: 'Analysis failed. Please try again.',
          error: true,
        }
  );

  const allCandidates = [...screened, ...errorResults]
    .sort((a, b) => b.score - a.score)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Analytics
  const validResults = allCandidates.filter(c => !c.error);
  const avgScore = validResults.length
    ? Math.round(validResults.reduce((a, c) => a + c.score, 0) / validResults.length)
    : 0;

  await pipeline([
    ['INCRBY', 'talent:linkedin:total', String(allCandidates.length)],
    ['INCR',   'talent:linkedin:batches'],
    ['LPUSH',  'talent:linkedin:activity', JSON.stringify({ ts: new Date().toISOString(), jobTitle, count: allCandidates.length, avgScore })],
    ['LTRIM',  'talent:linkedin:activity', '0', '49'],
  ]).catch(() => {});

  return res.status(200).json({
    candidates: allCandidates,
    total: allCandidates.length,
    jobTitle,
    avgScore,
  });
}

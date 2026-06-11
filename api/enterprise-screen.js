import { pipeline } from './_redis.js';

const SCREEN_PROMPT = (resumeText, jobTitle, jobDescription) =>
  `You are a senior technical recruiter. Rate this resume for the "${jobTitle}" role. Return ONLY a valid JSON object — no markdown, no extra text, no trailing commas.

{
  "name": "<candidate full name from resume, or 'Unknown'>",
  "score": <integer 0–100, overall fit for this specific role>,
  "grade": "<Excellent | Good | Average | Needs Work>",
  "experienceLevel": "<0–2 yrs | 3–5 yrs | 6–10 yrs | 10+ yrs | Unknown>",
  "topStrength": "<most relevant strength for this role — max 10 words>",
  "keyGap": "<most critical missing requirement — max 10 words>",
  "skillsMatched": ["<matched skill 1>", "<matched skill 2>", "<matched skill 3>"],
  "summary": "<2 honest sentences for the hiring manager — be specific>"
}

Job Title: ${jobTitle}
Job Description:
${jobDescription.slice(0, 2000)}

Resume:
${resumeText.slice(0, 3000)}`;

async function screenOne(text, filename, jobTitle, jobDescription, apiKey) {
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
        max_tokens: 450,
        temperature: 0,
        messages: [{ role: 'user', content: SCREEN_PROMPT(text, jobTitle, jobDescription) }],
      }),
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const d = await r.json();
    const raw = d.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    return { ...parsed, filename };
  };

  try {
    return await attemptOnce();
  } catch {
    // Retry once after a short delay
    await new Promise(res => setTimeout(res, 1200));
    return await attemptOnce();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumes, jobTitle, jobDescription, proToken } = req.body;

  if (!resumes?.length)
    return res.status(400).json({ error: 'No resumes provided.' });
  if (resumes.length > 25)
    return res.status(400).json({ error: 'Maximum 25 resumes per batch.' });
  if (!jobTitle?.trim())
    return res.status(400).json({ error: 'Job title is required.' });
  if (!jobDescription?.trim() || jobDescription.trim().length < 20)
    return res.status(400).json({ error: 'Job description is required (min 20 characters).' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server is missing API key.' });

  // Pro token check — bypass rate limit
  let isPro = false;
  if (proToken && typeof proToken === 'string' && proToken.length >= 4) {
    const proResult = await pipeline([['GET', `pro:sale:${proToken}`]]).catch(() => null);
    isPro = proResult?.[0]?.result === '1';
  }

  // Rate limit: 25 resumes per IP per day on free tier
  const today = new Date().toISOString().slice(0, 10);
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  if (!isPro) {
    const rlKey = `enterprise:rl2:${ip}:${today}`;
    const rlResult = await pipeline([
      ['INCRBY', rlKey, String(resumes.length)],
      ['EXPIRE',  rlKey, 86400],
    ]).catch(() => null);
    const usedToday = rlResult?.[0]?.result || resumes.length;
    if (usedToday > 25) {
      return res.status(429).json({
        error: `Free tier allows 25 candidate screenings per day. Your limit resets at midnight.`,
        rateLimited: true,
        remaining: Math.max(0, 25 - (usedToday - resumes.length)),
      });
    }
  }

  // Validate resume text — skip empty extractions upfront
  const valid   = resumes.filter(r => r.text && r.text.trim().length >= 50);
  const tooShort = resumes.filter(r => !r.text || r.text.trim().length < 50);

  // Build error candidates for extraction failures
  const errorCandidates = tooShort.map(r => ({
    filename: r.filename,
    name: r.filename.replace(/\.[^/.]+$/, ''),
    score: 0, grade: 'Error',
    experienceLevel: 'Unknown',
    topStrength: '—',
    keyGap: 'Could not extract text from file',
    skillsMatched: [],
    summary: 'Text extraction failed. Try re-saving the file as a plain PDF or TXT.',
    error: true,
    errorType: 'extraction',
  }));

  // Screen valid resumes in parallel (with retry inside screenOne)
  const settled = await Promise.allSettled(
    valid.map(({ filename, text }) => screenOne(text, filename, jobTitle, jobDescription, apiKey))
  );

  const screened = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          filename: valid[i].filename,
          name: valid[i].filename.replace(/\.[^/.]+$/, ''),
          score: 0, grade: 'Error',
          experienceLevel: 'Unknown',
          topStrength: '—',
          keyGap: 'AI analysis failed after retry',
          skillsMatched: [],
          summary: 'Could not analyse this resume. Please try again.',
          error: true,
          errorType: 'api',
        }
  );

  const allCandidates = [...screened, ...errorCandidates]
    .sort((a, b) => b.score - a.score)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Analytics
  const validCandidates = allCandidates.filter(c => !c.error);
  const avgScore = validCandidates.length
    ? Math.round(validCandidates.reduce((a, c) => a + c.score, 0) / validCandidates.length)
    : 0;

  await pipeline([
    ['INCRBY', 'enterprise:total',        String(allCandidates.length)],
    ['INCR',   'enterprise:totalBatches'],
    ['INCR',   `enterprise:batches:${today}`],
    ['INCRBY', 'enterprise:scoreSum',     String(avgScore * validCandidates.length)],
    ['INCRBY', 'enterprise:scoreCount',   String(validCandidates.length)],
    ['LPUSH',  'enterprise:activity',     JSON.stringify({ ts: new Date().toISOString(), jobTitle, count: allCandidates.length, avgScore })],
    ['LTRIM',  'enterprise:activity', '0', '49'],
  ]).catch(() => {});

  return res.status(200).json({
    candidates: allCandidates,
    total: allCandidates.length,
    jobTitle,
    isPro,
    extractionErrors: tooShort.length,
  });
}

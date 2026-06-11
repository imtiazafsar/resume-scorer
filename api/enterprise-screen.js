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
    await new Promise(res => setTimeout(res, 1200));
    return await attemptOnce();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumes, jobTitle, jobDescription, enterpriseToken } = req.body;

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

  const today = new Date().toISOString().slice(0, 10);
  const ip    = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  let isEnterprisePaid = false;
  let accessData = null;
  const token = enterpriseToken?.trim()?.toUpperCase() || null;

  // ── Enterprise token validation ──────────────────────────────────────────
  if (token) {
    const accessResult = await pipeline([['GET', `enterprise:access:${token}`]]).catch(() => null);
    accessData = accessResult?.[0]?.result ? JSON.parse(accessResult[0].result) : null;

    if (!accessData) {
      return res.status(401).json({
        error: 'Invalid enterprise token. Please activate your license key.',
        invalidToken: true,
      });
    }

    if (accessData.type === 'batch') {
      const used      = accessData.used || 0;
      const remaining = accessData.quota - used;
      if (resumes.length > remaining) {
        return res.status(429).json({
          error: `Only ${remaining} screening${remaining !== 1 ? 's' : ''} left on your batch. Upload fewer resumes or buy a new batch.`,
          quotaExceeded: true,
          remaining,
        });
      }
    } else if (accessData.type === 'monthly') {
      const month     = new Date().toISOString().slice(0, 7);
      const monthKey  = `enterprise:monthly:${token}:${month}`;
      const mResult   = await pipeline([['GET', monthKey]]).catch(() => null);
      const monthUsed = parseInt(mResult?.[0]?.result || '0', 10);
      const remaining = accessData.monthlyQuota - monthUsed;
      if (resumes.length > remaining) {
        return res.status(429).json({
          error: `Monthly quota reached. ${remaining} screenings left this month. Resets on the 1st.`,
          quotaExceeded: true,
          remaining,
        });
      }
    }
    isEnterprisePaid = true;
  }

  // ── Free-tier rate limits (no enterprise token) ──────────────────────────
  if (!isEnterprisePaid) {
    // Global circuit breaker: 200 free screenings per day total
    const globalKey    = `enterprise:global:${today}`;
    const globalResult = await pipeline([
      ['INCRBY', globalKey, String(resumes.length)],
      ['EXPIRE',  globalKey, 86400],
    ]).catch(() => null);
    const globalUsed = parseInt(globalResult?.[0]?.result || resumes.length, 10);
    if (globalUsed > 200) {
      return res.status(429).json({
        error: 'Service at capacity right now. Please try again in a few hours.',
        rateLimited: true,
      });
    }

    // Per-IP free tier: 5 resumes per day
    const rlKey    = `enterprise:rl3:${ip}:${today}`;
    const rlResult = await pipeline([
      ['INCRBY', rlKey, String(resumes.length)],
      ['EXPIRE',  rlKey, 86400],
    ]).catch(() => null);
    const usedToday = parseInt(rlResult?.[0]?.result || resumes.length, 10);
    if (usedToday > 5) {
      return res.status(429).json({
        error: 'Free tier allows 5 candidate screenings per day. Purchase a plan for bulk screening.',
        rateLimited: true,
        remaining: Math.max(0, 5 - (usedToday - resumes.length)),
        upgradeRequired: true,
      });
    }
  }

  // ── Text extraction validation ───────────────────────────────────────────
  const valid    = resumes.filter(r => r.text && r.text.trim().length >= 50);
  const tooShort = resumes.filter(r => !r.text || r.text.trim().length < 50);

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

  // ── Screen valid resumes in parallel ─────────────────────────────────────
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

  // ── Deduct enterprise quota ───────────────────────────────────────────────
  if (isEnterprisePaid && token && accessData) {
    const screenedCount = valid.length; // deduct based on resumes we actually processed
    if (accessData.type === 'batch') {
      const newUsed = Math.min((accessData.used || 0) + screenedCount, accessData.quota);
      const newData = { ...accessData, used: newUsed };
      await pipeline([['SET', `enterprise:access:${token}`, JSON.stringify(newData)]]).catch(() => {});
    } else if (accessData.type === 'monthly') {
      const month    = new Date().toISOString().slice(0, 7);
      const monthKey = `enterprise:monthly:${token}:${month}`;
      await pipeline([
        ['INCRBY', monthKey, String(screenedCount)],
        ['EXPIRE', monthKey, 86400 * 35],
      ]).catch(() => {});
    }
  }

  // ── Analytics ────────────────────────────────────────────────────────────
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
    ['LPUSH',  'enterprise:activity',     JSON.stringify({ ts: new Date().toISOString(), jobTitle, count: allCandidates.length, avgScore, isPaid: isEnterprisePaid })],
    ['LTRIM',  'enterprise:activity', '0', '49'],
  ]).catch(() => {});

  return res.status(200).json({
    candidates: allCandidates,
    total: allCandidates.length,
    jobTitle,
    isEnterprisePaid,
    extractionErrors: tooShort.length,
  });
}

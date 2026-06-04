import { pipeline } from './_redis.js';

const SCREEN_PROMPT = (resumeText, jobTitle, jobDescription) =>
  `Rate this resume for the "${jobTitle}" role. Return ONLY a valid JSON object — no markdown, no extra text.

{
  "name": "<candidate full name extracted from resume — use 'Unknown' if not found>",
  "score": <integer 0–100, fit for this specific role>,
  "grade": "<Excellent | Good | Average | Needs Work>",
  "topStrength": "<single most relevant strength for this role — max 8 words>",
  "keyGap": "<single most critical missing requirement — max 8 words>",
  "summary": "<one honest sentence verdict for the hiring manager>"
}

Job Title: ${jobTitle}
Job Description:
${jobDescription.slice(0, 1500)}

Resume:
${resumeText.slice(0, 2500)}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumes, jobTitle, jobDescription } = req.body;

  if (!resumes?.length)
    return res.status(400).json({ error: 'No resumes provided.' });
  if (resumes.length > 10)
    return res.status(400).json({ error: 'Maximum 10 resumes per batch on the free tier.' });
  if (!jobTitle?.trim())
    return res.status(400).json({ error: 'Job title is required.' });
  if (!jobDescription?.trim() || jobDescription.trim().length < 20)
    return res.status(400).json({ error: 'Job description is required.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server is missing API key.' });

  // Rate limit: 3 free batches per IP per day
  const today = new Date().toISOString().slice(0, 10);
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rlKey = `enterprise:rl:${ip}:${today}`;
  const rlRes = await pipeline([['INCR', rlKey], ['EXPIRE', rlKey, 86400]]).catch(() => null);
  const batchCount = rlRes?.[0]?.result || 1;
  if (batchCount > 3) {
    return res.status(429).json({
      error: 'Free tier allows 3 screening batches per day. Your limit resets at midnight.',
      rateLimited: true,
    });
  }

  // Process all resumes in parallel using Haiku for speed + cost efficiency
  const settled = await Promise.allSettled(
    resumes.map(async ({ filename, text }) => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 350,
          temperature: 0,
          messages: [{ role: 'user', content: SCREEN_PROMPT(text, jobTitle, jobDescription) }],
        }),
      });
      if (!r.ok) throw new Error(`API ${r.status}`);
      const d = await r.json();
      const raw = d.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
      return { ...JSON.parse(raw), filename };
    })
  );

  const candidates = settled
    .map((r, i) => r.status === 'fulfilled'
      ? r.value
      : {
          filename: resumes[i].filename,
          name: resumes[i].filename.replace(/\.[^/.]+$/, ''),
          score: 0, grade: 'Error',
          topStrength: '—', keyGap: 'Processing failed',
          summary: 'Could not analyse this resume.', error: true,
        })
    .sort((a, b) => b.score - a.score)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Log to analytics
  const validCandidates = candidates.filter(c => !c.error);
  const avgScore = validCandidates.length
    ? Math.round(validCandidates.reduce((a, c) => a + c.score, 0) / validCandidates.length)
    : 0;
  const entryActivity = JSON.stringify({
    ts: new Date().toISOString(),
    jobTitle,
    count: candidates.length,
    avgScore,
  });
  await pipeline([
    ['INCRBY', 'enterprise:total',        String(candidates.length)],
    ['INCR',   'enterprise:totalBatches'],
    ['INCR',   `enterprise:batches:${today}`],
    ['INCRBY', 'enterprise:scoreSum',     String(avgScore * validCandidates.length)],
    ['INCRBY', 'enterprise:scoreCount',   String(validCandidates.length)],
    ['LPUSH',  'enterprise:activity',     entryActivity],
    ['LTRIM',  'enterprise:activity', '0', '49'],
  ]).catch(() => {});

  return res.status(200).json({ candidates, total: candidates.length, jobTitle });
}

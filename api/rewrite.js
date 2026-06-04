import { cmd, pipeline } from './_redis.js';

const PRICE_CENTS = { rewrite: 499, coverletter: 399, bundle: 799, linkedin: 299 };

const RESUME_REWRITE_PROMPT = (resumeText, jobDescription) => {
  const hasJD = jobDescription && jobDescription.trim().length > 20;
  const context = hasJD
    ? `Rewrite the resume so it is perfectly tailored for the job description provided.
- Naturally weave in keywords from the job description
- Rewrite the professional summary to match the role exactly
- Reorganise the skills section to lead with what the job needs most

Job Description:
${jobDescription.slice(0, 3000)}`
    : `Rewrite the resume to be as strong and professional as possible.
- Optimise for ATS systems with industry-standard keywords
- Write a compelling professional summary highlighting key strengths
- Ensure the skills section is clear and comprehensive`;

  return `You are an expert resume writer. ${context}

Rules for ALL rewrites:
- Keep all facts accurate (companies, dates, degrees, real achievements)
- Rewrite every bullet point with strong action verbs and quantified achievements
- Return the complete rewritten resume as clean plain text only
- No markdown, no JSON, no commentary
- Use ALL CAPS for section headers (PROFESSIONAL SUMMARY, EXPERIENCE, SKILLS, EDUCATION)

Original Resume:
${resumeText.slice(0, 5000)}`;
};

const COVER_LETTER_PROMPT = (resumeText, jobDescription) => `You are an expert career coach and writer. Write a compelling, tailored cover letter for this job application.

Job Description:
${jobDescription.slice(0, 3000)}

Candidate Resume:
${resumeText.slice(0, 4000)}

Cover letter guidelines:
- 3 paragraphs: strong opening + 2 achievement paragraphs + confident closing
- Opening: mention the specific role (infer company name from JD if possible) — avoid "I am writing to express my interest"
- Body: pick 2–3 specific achievements from the resume that directly match JD requirements
- Closing: express genuine enthusiasm and include a clear call to action
- Tone: confident, professional, and personable — not robotic or generic
- Do NOT include placeholders like [Your Name], [Date], or [Address]
- Return ONLY the cover letter body — no subject line, no salutation header`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, key } = req.body;
  if (!orderId || !key) return res.status(400).json({ error: 'Missing parameters.' });

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Payment not configured.' });

  // Verify payment
  const orderRes = await fetch(`https://api.lemonsqueezy.com/v1/orders/${orderId}`, {
    headers: { 'Accept': 'application/vnd.api+json', 'Authorization': `Bearer ${apiKey}` },
  });
  if (!orderRes.ok) return res.status(400).json({ error: 'Could not verify payment.' });

  const orderData = await orderRes.json();
  if (orderData?.data?.attributes?.status !== 'paid')
    return res.status(402).json({ error: 'Payment not completed.' });

  // Retrieve stored data
  const raw = await cmd('GET', `rewrite:${key}`);
  if (!raw) return res.status(404).json({ error: 'Session expired. Please start over.' });

  const { resumeText, jobDescription, type = 'rewrite' } = JSON.parse(raw);

  const prompt = type === 'coverletter'
    ? COVER_LETTER_PROMPT(resumeText, jobDescription)
    : RESUME_REWRITE_PROMPT(resumeText, jobDescription);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) return res.status(500).json({ error: 'AI generation failed. Please contact support.' });

  const data    = await response.json();
  const content = data.content.map(b => b.text || '').join('').trim();

  cmd('DEL', `rewrite:${key}`).catch(() => {});

  // Track revenue
  const cents = PRICE_CENTS[type] || 499;
  const revenueEntry = JSON.stringify({ ts: new Date().toISOString(), type, cents });
  pipeline([
    ['INCRBY', 'revenue:total',           String(cents)],
    ['INCR',   `revenue:${type}:count`],
    ['INCRBY', `revenue:${type}:total`,   String(cents)],
    ['LPUSH',  'revenue:activity',        revenueEntry],
    ['LTRIM',  'revenue:activity', '0', '49'],
  ]).catch(() => {});

  return res.status(200).json({ content, type });
}

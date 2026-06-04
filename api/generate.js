import { pipeline } from './_redis.js';

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
- Opening: mention the specific role — avoid "I am writing to express my interest"
- Body: pick 2–3 specific achievements from the resume that directly match JD requirements
- Closing: express genuine enthusiasm and include a clear call to action
- Tone: confident, professional, and personable — not robotic or generic
- Do NOT include placeholders like [Your Name], [Date], or [Address]
- Return ONLY the cover letter body — no subject line, no salutation header`;

const LINKEDIN_PROMPT = (resumeText, jobDescription) => {
  const roleCtx = jobDescription && jobDescription.trim().length > 20
    ? `The candidate is targeting this role:\n${jobDescription.slice(0, 1500)}\n\n`
    : '';
  return `You are a LinkedIn profile expert. Rewrite the candidate's LinkedIn sections to maximise recruiter visibility and search ranking.

${roleCtx}Resume:
${resumeText.slice(0, 4000)}

Return ONLY the following sections as plain text, each with its label in ALL CAPS followed by a colon:

HEADLINE:
(One punchy line, max 220 chars. Lead with value, not job title. Include 2–3 keywords recruiters search for.)

ABOUT:
(3 short paragraphs. Hook → key achievements with numbers → what you're looking for. First-person, no buzzwords. Max 2,000 chars.)

SKILLS:
(Comma-separated list of 15–20 specific, searchable skills relevant to the candidate's experience and target role.)

No markdown, no extra commentary. Return exactly these three sections.`;
};

async function callClaude(apiKey, prompt, maxTokens = 4000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`AI error ${r.status}`);
  const d = await r.json();
  return d.content.map(b => b.text || '').join('').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText, jobDescription, type, saleId } = req.body;

  if (!resumeText || resumeText.trim().length < 30)
    return res.status(400).json({ error: 'Resume text missing.' });
  if (!type || !['rewrite', 'coverletter', 'bundle', 'linkedin'].includes(type))
    return res.status(400).json({ error: 'Invalid product type.' });
  if (!saleId)
    return res.status(400).json({ error: 'Sale ID missing.' });

  // Prevent replay: each saleId can only be used once
  const today = new Date().toISOString().slice(0, 10);
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const useKey = `gumroad:used:${saleId}`;

  const setResult = await pipeline([
    ['SET', useKey, '1', 'NX', 'EX', '86400'],
  ]).catch(() => null);

  if (setResult?.[0]?.result !== 'OK') {
    return res.status(409).json({ error: 'This purchase has already been used. Please contact support if this is an error.' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'AI not configured.' });

  let content, bundleRewrite, bundleCoverLetter;

  try {
    if (type === 'bundle') {
      [bundleRewrite, bundleCoverLetter] = await Promise.all([
        callClaude(anthropicKey, RESUME_REWRITE_PROMPT(resumeText, jobDescription), 4000),
        callClaude(anthropicKey, COVER_LETTER_PROMPT(resumeText, jobDescription), 2000),
      ]);
    } else if (type === 'coverletter') {
      content = await callClaude(anthropicKey, COVER_LETTER_PROMPT(resumeText, jobDescription), 2000);
    } else if (type === 'linkedin') {
      content = await callClaude(anthropicKey, LINKEDIN_PROMPT(resumeText, jobDescription), 2000);
    } else {
      content = await callClaude(anthropicKey, RESUME_REWRITE_PROMPT(resumeText, jobDescription), 4000);
    }
  } catch (e) {
    // Release the saleId lock so user can retry
    pipeline([['DEL', useKey]]).catch(() => {});
    return res.status(500).json({ error: 'AI generation failed. Please try again.' });
  }

  // Track revenue
  const cents = PRICE_CENTS[type] || 499;
  const revenueEntry = JSON.stringify({ ts: new Date().toISOString(), type, cents });
  pipeline([
    ['INCRBY', 'revenue:total',         String(cents)],
    ['INCR',   `revenue:${type}:count`],
    ['INCRBY', `revenue:${type}:total`, String(cents)],
    ['LPUSH',  'revenue:activity',      revenueEntry],
    ['LTRIM',  'revenue:activity', '0', '49'],
  ]).catch(() => {});

  if (type === 'bundle') {
    return res.status(200).json({ type, bundleRewrite, bundleCoverLetter });
  }
  return res.status(200).json({ content, type });
}

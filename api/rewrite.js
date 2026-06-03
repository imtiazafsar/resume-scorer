import { cmd } from './_redis.js';

const REWRITE_PROMPT = (resumeText, jobDescription) => `You are an expert resume writer. Rewrite the resume below so it is perfectly tailored for the job description provided.

Rules:
- Keep all factual information accurate (companies, dates, degrees, real achievements)
- Rewrite bullet points using strong action verbs and metrics where possible
- Naturally weave in keywords from the job description
- Rewrite the professional summary to match the role
- Reorganise the skills section to lead with what the job needs most
- Return the complete rewritten resume as clean plain text — no markdown, no JSON, no extra commentary
- Use ALL CAPS for section headers (PROFESSIONAL SUMMARY, EXPERIENCE, SKILLS, EDUCATION, etc.)

Job Description:
${jobDescription.slice(0, 3000)}

Original Resume:
${resumeText.slice(0, 5000)}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, key } = req.body;
  if (!orderId || !key) return res.status(400).json({ error: 'Missing parameters.' });

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Payment not configured.' });

  // Verify the order is actually paid via Lemon Squeezy API
  const orderRes = await fetch(`https://api.lemonsqueezy.com/v1/orders/${orderId}`, {
    headers: {
      'Accept': 'application/vnd.api+json',
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!orderRes.ok) return res.status(400).json({ error: 'Could not verify payment.' });

  const orderData = await orderRes.json();
  const status    = orderData?.data?.attributes?.status;

  if (status !== 'paid')
    return res.status(402).json({ error: 'Payment not completed.' });

  // Retrieve stored resume data
  const raw = await cmd('GET', `rewrite:${key}`);
  if (!raw) return res.status(404).json({ error: 'Session expired. Please start over.' });

  const { resumeText, jobDescription } = JSON.parse(raw);

  // Call Claude to rewrite
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
      messages: [{ role: 'user', content: REWRITE_PROMPT(resumeText, jobDescription) }],
    }),
  });

  if (!response.ok) return res.status(500).json({ error: 'AI rewrite failed. Please contact support.' });

  const data      = await response.json();
  const rewritten = data.content.map(b => b.text || '').join('').trim();

  // Delete stored data — it's been used
  cmd('DEL', `rewrite:${key}`).catch(() => {});

  return res.status(200).json({ rewritten });
}

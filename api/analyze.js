const SYSTEM_PROMPT = `You are an expert resume reviewer and career coach with 15+ years of hiring experience across tech, finance, and consulting. You give honest, actionable, and specific feedback.`;

const buildPrompt = (resumeText) => `Analyze the resume below and return ONLY a valid JSON object — no markdown fences, no preamble, no extra text.

Required JSON structure:
{
  "score": <integer 0–100 reflecting overall CV quality>,
  "grade": "<one of: Excellent | Good | Average | Needs Work>",
  "summary": "<2–3 sentences: honest overall verdict mentioning the biggest strength and biggest gap>",
  "dimensions": [
    { "name": "Contact & Links",   "score": <0–100> },
    { "name": "Work Experience",   "score": <0–100> },
    { "name": "Skills",            "score": <0–100> },
    { "name": "Education",         "score": <0–100> },
    { "name": "Formatting",        "score": <0–100> },
    { "name": "Keywords & ATS",    "score": <0–100> }
  ],
  "strengths": [
    "<specific strength with evidence from the resume>",
    "<specific strength>",
    "<specific strength>"
  ],
  "recommendations": [
    "<actionable improvement — be specific, not generic>",
    "<actionable improvement>",
    "<actionable improvement>",
    "<actionable improvement>"
  ]
}

Resume text:
${resumeText.slice(0, 6000)}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { resumeText } = req.body;
  if (!resumeText || resumeText.trim().length < 30) {
    return res.status(400).json({ error: 'Resume text too short or missing.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing API key configuration.' });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(resumeText) }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return res.status(response.status).json({ error: err?.error?.message || `API error: ${response.status}` });
  }

  const data = await response.json();
  const raw = data.content.map((b) => b.text || '').join('');
  const cleaned = raw.replace(/```json|```/g, '').trim();

  try {
    return res.status(200).json(JSON.parse(cleaned));
  } catch {
    return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
  }
}

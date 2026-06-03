import { pipeline } from './_redis.js';

const SYSTEM_PROMPT = `You are an expert resume reviewer and career coach with 15+ years of hiring experience across tech, finance, and consulting. You give honest, actionable, and specific feedback.`;

const buildGeneralPrompt = (resumeText) => `Analyze the resume below and return ONLY a valid JSON object — no markdown fences, no preamble, no extra text.

Required JSON structure:
{
  "score": <integer 0–100>,
  "grade": "<Excellent | Good | Average | Needs Work>",
  "summary": "<2–3 sentences: honest overall verdict>",
  "dimensions": [
    { "name": "Contact & Links",  "score": <0–100>, "feedback": "<1–2 specific sentences>" },
    { "name": "Work Experience",  "score": <0–100>, "feedback": "<1–2 specific sentences>" },
    { "name": "Skills",           "score": <0–100>, "feedback": "<1–2 specific sentences>" },
    { "name": "Education",        "score": <0–100>, "feedback": "<1–2 specific sentences>" },
    { "name": "Formatting",       "score": <0–100>, "feedback": "<1–2 specific sentences>" },
    { "name": "Keywords & ATS",   "score": <0–100>, "feedback": "<1–2 specific sentences>" }
  ],
  "strengths": ["<specific strength>", "<specific strength>", "<specific strength>"],
  "recommendations": ["<actionable improvement>", "<actionable improvement>", "<actionable improvement>", "<actionable improvement>"],
  "quickWins": [
    "<single specific action that would most increase the score — name the dimension it helps>",
    "<second most impactful specific action>",
    "<third most impactful specific action>"
  ]
}

Resume:
${resumeText.slice(0, 6000)}`;

const buildJobMatchPrompt = (resumeText, jobDescription) => `Analyze the resume against the job description. Return ONLY a valid JSON object — no markdown fences, no preamble, no extra text.

Required JSON structure:
{
  "score": <integer 0–100, overall resume quality>,
  "grade": "<Excellent | Good | Average | Needs Work>",
  "summary": "<2–3 sentences: overall verdict and fit for this specific role>",
  "jobMatch": <integer 0–100, how well the resume matches the job requirements>,
  "matchGaps": ["<missing requirement>", "<missing requirement>", "<missing requirement>"],
  "keywords": {
    "matched": ["<keyword from JD present in resume>", "<keyword>", "<keyword>", "<keyword>", "<keyword>"],
    "missing": ["<important keyword in JD but absent from resume>", "<keyword>", "<keyword>", "<keyword>", "<keyword>"]
  },
  "dimensions": [
    { "name": "Contact & Links",  "score": <0–100>, "feedback": "<1–2 specific sentences>" },
    { "name": "Work Experience",  "score": <0–100>, "feedback": "<1–2 specific sentences relevant to this job>" },
    { "name": "Skills",           "score": <0–100>, "feedback": "<1–2 specific sentences about skills match>" },
    { "name": "Education",        "score": <0–100>, "feedback": "<1–2 specific sentences>" },
    { "name": "Formatting",       "score": <0–100>, "feedback": "<1–2 specific sentences>" },
    { "name": "Keywords & ATS",   "score": <0–100>, "feedback": "<1–2 specific sentences about keyword alignment>" }
  ],
  "strengths": ["<specific strength relevant to this role>", "<specific strength>", "<specific strength>"],
  "recommendations": ["<actionable improvement for this role>", "<actionable improvement>", "<actionable improvement>", "<actionable improvement>"],
  "quickWins": [
    "<single specific action that would most increase the job match score>",
    "<second most impactful action>",
    "<third most impactful action>"
  ]
}

Job Description:
${jobDescription.slice(0, 3000)}

Resume:
${resumeText.slice(0, 4000)}`;

function gradeKey(grade) {
  return `grades:${(grade || 'average').toLowerCase().replace(/\s+/g, '')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText, jobDescription } = req.body;
  if (!resumeText || resumeText.trim().length < 30)
    return res.status(400).json({ error: 'Resume text too short or missing.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server is missing API key configuration.' });

  const isJobMode = jobDescription && jobDescription.trim().length > 20;
  const prompt = isJobMode
    ? buildJobMatchPrompt(resumeText, jobDescription)
    : buildGeneralPrompt(resumeText);

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
        max_tokens: 1800,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch {
    pipeline([['INCR', 'stats:errors']]).catch(() => {});
    return res.status(500).json({ error: 'Failed to reach AI service.' });
  }

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json().catch(() => ({}));
    pipeline([['INCR', 'stats:errors']]).catch(() => {});
    return res.status(anthropicRes.status).json({ error: err?.error?.message || `API error: ${anthropicRes.status}` });
  }

  const data = await anthropicRes.json();
  const raw = data.content.map((b) => b.text || '').join('');
  const cleaned = raw.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    pipeline([['INCR', 'stats:errors']]).catch(() => {});
    return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const inputTokens  = data.usage?.input_tokens  || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  const activity = JSON.stringify({
    ts: new Date().toISOString(), score: parsed.score, grade: parsed.grade,
    mode: isJobMode ? 'job' : 'general', tokens: inputTokens + outputTokens,
  });

  await pipeline([
    ['INCR', 'stats:total'],
    ['INCR', `stats:today:${today}`],
    ['EXPIRE', `stats:today:${today}`, 172800],
    ['INCR', gradeKey(parsed.grade)],
    ['INCR', isJobMode ? 'modes:job' : 'modes:general'],
    ['INCRBY', 'tokens:input',  String(inputTokens)],
    ['INCRBY', 'tokens:output', String(outputTokens)],
    ['LPUSH', 'scores:list', String(parsed.score)],
    ['LTRIM', 'scores:list', '0', '199'],
    ['LPUSH', 'activity:list', activity],
    ['LTRIM', 'activity:list', '0', '49'],
  ]).catch(() => {});

  return res.status(200).json(parsed);
}

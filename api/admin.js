import { cmd, pipeline } from './_redis.js';

export default async function handler(req, res) {
  // Auth
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_PASSWORD || key !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Unauthorized' });

  const today = new Date().toISOString().slice(0, 10);

  const results = await pipeline([
    ['GET', 'stats:total'],
    ['GET', `stats:today:${today}`],
    ['GET', 'grades:excellent'],
    ['GET', 'grades:good'],
    ['GET', 'grades:average'],
    ['GET', 'grades:needswork'],
    ['GET', 'modes:general'],
    ['GET', 'modes:job'],
    ['GET', 'tokens:input'],
    ['GET', 'tokens:output'],
    ['GET', 'stats:errors'],
    ['LRANGE', 'scores:list', '0', '199'],
    ['LRANGE', 'activity:list', '0', '49'],
  ]);

  const v = results.map(r => r?.result ?? null);
  const [
    total, todayCount,
    gradeExcellent, gradeGood, gradeAverage, gradeNeedsWork,
    modeGeneral, modeJob,
    inputTokens, outputTokens,
    errors,
    scoresList, activityList,
  ] = v;

  const inTok  = Number(inputTokens)  || 0;
  const outTok = Number(outputTokens) || 0;
  // Approximate Claude Sonnet pricing: $3/MTok input, $15/MTok output
  const costUSD = Math.round(((inTok * 3 + outTok * 15) / 1e6) * 100) / 100;

  return res.status(200).json({
    redisConnected: !!(
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
      (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
    ),
    total:   Number(total)      || 0,
    today:   Number(todayCount) || 0,
    grades: {
      excellent: Number(gradeExcellent) || 0,
      good:      Number(gradeGood)      || 0,
      average:   Number(gradeAverage)   || 0,
      needsWork: Number(gradeNeedsWork) || 0,
    },
    modes: {
      general: Number(modeGeneral) || 0,
      job:     Number(modeJob)     || 0,
    },
    tokens:  { input: inTok, output: outTok },
    costUSD,
    errors:  Number(errors) || 0,
    scores:  (scoresList  || []).map(Number),
    activity: (activityList || []).map(s => {
      try { return typeof s === 'string' ? JSON.parse(s) : s; }
      catch { return null; }
    }).filter(Boolean),
  });
}

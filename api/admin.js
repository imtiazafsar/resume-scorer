import { pipeline } from './_redis.js';

export default async function handler(req, res) {
  // Auth
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_PASSWORD || key !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Unauthorized' });

  const today = new Date().toISOString().slice(0, 10);

  // Generate last 7 days
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });

  // Single pipeline for all data
  let results;
  try {
    results = await pipeline([
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
      // Enterprise
      ['GET', 'enterprise:total'],
      ['GET', 'enterprise:totalBatches'],
      ['GET', `enterprise:batches:${today}`],
      ['LRANGE', 'enterprise:activity', '0', '29'],
      ['GET', 'enterprise:scoreSum'],
      ['GET', 'enterprise:scoreCount'],
      // Revenue
      ['GET', 'revenue:total'],
      ['GET', 'revenue:rewrite:count'],
      ['GET', 'revenue:rewrite:total'],
      ['GET', 'revenue:coverletter:count'],
      ['GET', 'revenue:coverletter:total'],
      ['GET', 'revenue:bundle:count'],
      ['GET', 'revenue:bundle:total'],
      ['GET', 'revenue:linkedin:count'],
      ['GET', 'revenue:linkedin:total'],
      ['GET', 'revenue:pro:count'],
      ['GET', 'revenue:pro:total'],
      ['LRANGE', 'revenue:activity', '0', '49'],
      // 7-day trends
      ...days.flatMap(day => [
        ['GET', `stats:today:${day}`],
        ['GET', `enterprise:batches:${day}`],
      ]),
    ]);
  } catch (e) {
    return res.status(500).json({ error: 'Redis pipeline failed', detail: e.message });
  }

  if (!Array.isArray(results)) {
    return res.status(500).json({ error: 'Redis returned non-array', detail: JSON.stringify(results).slice(0, 200) });
  }

  const v = results.map(r => r?.result ?? null);
  const [
    total, todayCount,
    gradeExcellent, gradeGood, gradeAverage, gradeNeedsWork,
    modeGeneral, modeJob,
    inputTokens, outputTokens, errors,
    scoresList, activityList,
    entTotal, entBatches, entToday, entActivity, entScoreSum, entScoreCount,
    revTotal,
    revRewriteCount, revRewriteTotal,
    revCLCount, revCLTotal,
    revBundleCount, revBundleTotal,
    revLinkedInCount, revLinkedInTotal,
    revProCount, revProTotal,
    revActivity,
    ...dailyRaw
  ] = v;

  const inTok  = Number(inputTokens)  || 0;
  const outTok = Number(outputTokens) || 0;
  const costUSD = Math.round(((inTok * 3 + outTok * 15) / 1e6) * 100) / 100;

  const entScoreSumN   = Number(entScoreSum)   || 0;
  const entScoreCountN = Number(entScoreCount) || 0;
  const entAvgScore    = entScoreCountN > 0 ? Math.round(entScoreSumN / entScoreCountN) : null;

  const revTotalCents = Number(revTotal) || 0;
  const totalSales    = (Number(revRewriteCount)  || 0) + (Number(revCLCount)      || 0) +
                        (Number(revBundleCount)    || 0) + (Number(revLinkedInCount)|| 0) +
                        (Number(revProCount)       || 0);

  const daily = days.map((date, i) => ({
    date,
    scans: Number(dailyRaw[i * 2]) || 0,
    enterpriseBatches: Number(dailyRaw[i * 2 + 1]) || 0,
  }));

  const parseList = list =>
    (list || []).map(s => {
      try { return typeof s === 'string' ? JSON.parse(s) : s; }
      catch { return null; }
    }).filter(Boolean);

  return res.status(200).json({
    redisConnected: true,
    total:   Number(total)      || 0,
    today:   Number(todayCount) || 0,
    grades: {
      excellent: Number(gradeExcellent) || 0,
      good:      Number(gradeGood)      || 0,
      average:   Number(gradeAverage)   || 0,
      needsWork: Number(gradeNeedsWork) || 0,
    },
    modes: { general: Number(modeGeneral) || 0, job: Number(modeJob) || 0 },
    tokens: { input: inTok, output: outTok },
    costUSD,
    errors:  Number(errors) || 0,
    scores:  (scoresList  || []).map(Number),
    activity: parseList(activityList),
    daily,
    enterprise: {
      total:    Number(entTotal)   || 0,
      batches:  Number(entBatches) || 0,
      today:    Number(entToday)   || 0,
      avgScore: entAvgScore,
      activity: parseList(entActivity),
    },
    revenue: {
      total:      revTotalCents,
      totalSales,
      rewrite:     { count: Number(revRewriteCount)  || 0, total: Number(revRewriteTotal)  || 0 },
      coverletter: { count: Number(revCLCount)        || 0, total: Number(revCLTotal)        || 0 },
      bundle:      { count: Number(revBundleCount)    || 0, total: Number(revBundleTotal)    || 0 },
      linkedin:    { count: Number(revLinkedInCount)  || 0, total: Number(revLinkedInTotal)  || 0 },
      pro:         { count: Number(revProCount)       || 0, total: Number(revProTotal)       
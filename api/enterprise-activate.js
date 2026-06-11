import { pipeline } from './_redis.js';

// Gumroad product permalinks that grant enterprise access
const PRODUCTS = {
  'enterprise-batch':   { type: 'batch',   quota: 25,   monthlyQuota: null },
  'enterprise-monthly': { type: 'monthly', quota: null, monthlyQuota: 2000 },
};

async function buildQuotaInfo(token, accessData) {
  if (accessData.type === 'batch') {
    return {
      type: 'batch',
      totalQuota: accessData.quota,
      used: accessData.used || 0,
      remaining: Math.max(0, accessData.quota - (accessData.used || 0)),
    };
  }
  // monthly: check this month's usage
  const month = new Date().toISOString().slice(0, 7);
  const monthKey = `enterprise:monthly:${token}:${month}`;
  const monthResult = await pipeline([['GET', monthKey]]).catch(() => null);
  const monthUsed = parseInt(monthResult?.[0]?.result || '0', 10);
  return {
    type: 'monthly',
    monthlyQuota: accessData.monthlyQuota,
    monthUsed,
    remaining: Math.max(0, accessData.monthlyQuota - monthUsed),
    month,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { licenseKey, checkOnly } = req.body;
  if (!licenseKey?.trim()) return res.status(400).json({ error: 'License key required' });

  const token = licenseKey.trim().toUpperCase();
  const redisKey = `enterprise:access:${token}`;

  // Always check Redis first (cached or check-only)
  const existing = await pipeline([['GET', redisKey]]).catch(() => null);
  const existingData = existing?.[0]?.result ? JSON.parse(existing[0].result) : null;

  if (existingData) {
    const quota = await buildQuotaInfo(token, existingData);
    return res.status(200).json({ success: true, ...quota, cached: true });
  }

  // checkOnly = true means "just tell me quota, don't call Gumroad"
  if (checkOnly) {
    return res.status(404).json({ error: 'Token not found. Please activate your license key first.' });
  }

  // Verify with Gumroad license key API
  let verified = null;
  let productConfig = null;

  for (const [permalink, config] of Object.entries(PRODUCTS)) {
    try {
      const r = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          product_permalink: permalink,
          license_key: licenseKey.trim(),
          increment_uses_count: 'false',
        }),
      });
      const data = await r.json();
      if (data.success) {
        verified = data;
        productConfig = config;
        break;
      }
    } catch { /* try next product */ }
  }

  if (!verified) {
    return res.status(400).json({
      error: 'Invalid license key. Check your Gumroad purchase email and try again.',
      invalid: true,
    });
  }

  const accessData = {
    type: productConfig.type,
    quota: productConfig.quota,
    monthlyQuota: productConfig.monthlyQuota,
    used: 0,
    createdAt: new Date().toISOString(),
    email: verified.purchase?.email || '',
    purchaseId: verified.purchase?.id || '',
  };

  await pipeline([
    ['SET',    redisKey, JSON.stringify(accessData)],
    ['EXPIRE', redisKey, 86400 * 400], // ~13 months TTL
  ]).catch(() => {});

  const quota = await buildQuotaInfo(token, accessData);
  return res.status(200).json({ success: true, ...quota });
}

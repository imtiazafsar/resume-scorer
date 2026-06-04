import { pipeline } from './_redis.js';

// Called client-side right after a Gumroad Pro purchase succeeds.
// Registers the Gumroad sale ID in Redis so the analyze endpoint
// can skip the IP-based rate limit for that token.
const PRO_TTL = 33 * 24 * 60 * 60; // 33 days (covers a monthly billing cycle + grace)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { saleId } = req.body;
  if (!saleId || typeof saleId !== 'string' || saleId.length < 4)
    return res.status(400).json({ error: 'Missing or invalid saleId.' });

  // Idempotent: SET NX so a replay doesn't extend the TTL unexpectedly.
  const setResult = await pipeline([
    ['SET', `pro:sale:${saleId}`, '1', 'NX', 'EX', String(PRO_TTL)],
  ]).catch(() => null);

  const isNew = setResult?.[0]?.result === 'OK';

  // Track revenue only on 
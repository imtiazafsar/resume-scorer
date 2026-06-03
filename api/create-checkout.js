import { pipeline } from './_redis.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText, jobDescription } = req.body;
  if (!resumeText || !jobDescription)
    return res.status(400).json({ error: 'Resume and job description are required.' });

  const apiKey   = process.env.LEMONSQUEEZY_API_KEY;
  const storeId  = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID;

  if (!apiKey || !storeId || !variantId)
    return res.status(500).json({ error: 'Payment not configured yet.' });

  const key    = crypto.randomUUID();
  const origin = req.headers.origin || `https://${req.headers.host}`;

  // Store resume + JD in Redis for 1 hour
  await pipeline([
    ['SET', `rewrite:${key}`, JSON.stringify({ resumeText, jobDescription })],
    ['EXPIRE', `rewrite:${key}`, 3600],
  ]).catch(() => {});

  const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            custom: { key },
          },
          product_options: {
            redirect_url: `${origin}/?order_id={order_id}&rewrite_key=${key}`,
            receipt_link_url: `${origin}/`,
          },
        },
        relationships: {
          store:   { data: { type: 'stores',   id: String(storeId)   } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return res.status(500).json({ error: err?.errors?.[0]?.detail || 'Failed to create checkout.' });
  }

  const data = await response.json();
  const url  = data?.data?.attributes?.url;
  if (!url) return res.status(500).json({ error: 'No checkout URL returned.' });

  return res.status(200).json({ url });
}

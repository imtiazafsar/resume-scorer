import { pipeline } from './_redis.js';

const PRICES = {
  rewrite:     { variantEnv: 'LEMONSQUEEZY_VARIANT_ID',    amount: '$2.99', name: 'Resume Optimization' },
  coverletter: { variantEnv: 'LEMONSQUEEZY_CL_VARIANT_ID', amount: '$1.99', name: 'Cover Letter Generation' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText, jobDescription, type = 'rewrite' } = req.body;
  if (!resumeText) return res.status(400).json({ error: 'Resume text is required.' });

  const apiKey   = process.env.LEMONSQUEEZY_API_KEY;
  const storeId  = process.env.LEMONSQUEEZY_STORE_ID;
  const price    = PRICES[type] || PRICES.rewrite;
  const variantId = process.env[price.variantEnv];

  if (!apiKey || !storeId || !variantId)
    return res.status(500).json({ error: 'Payment not configured yet.' });

  const key    = crypto.randomUUID();
  const origin = req.headers.origin || `https://${req.headers.host}`;

  await pipeline([
    ['SET', `rewrite:${key}`, JSON.stringify({ resumeText, jobDescription: jobDescription || '', type })],
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
          checkout_data: { custom: { key, productType: type } },
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

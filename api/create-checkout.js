import Stripe from 'stripe';
import { pipeline } from './_redis.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText, jobDescription } = req.body;
  if (!resumeText || !jobDescription)
    return res.status(400).json({ error: 'Resume and job description are required.' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const key = crypto.randomUUID();
  const origin = req.headers.origin || 'https://resume-scorer-5taf.vercel.app';

  // Store resume + JD in Redis for 1 hour
  await pipeline([
    ['SET', `rewrite:${key}`, JSON.stringify({ resumeText, jobDescription })],
    ['EXPIRE', `rewrite:${key}`, 3600],
  ]).catch(() => {});

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Resume Optimization',
          description: 'Your resume rewritten by AI, tailored to your target job — ready to send.',
        },
        unit_amount: 299, // $2.99
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${origin}/?rewrite_session={CHECKOUT_SESSION_ID}&rewrite_key=${key}`,
    cancel_url: `${origin}/`,
    metadata: { key },
  });

  return res.status(200).json({ url: session.url });
}

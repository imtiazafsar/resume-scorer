const URL  = process.env.UPSTASH_REDIS_REST_URL  || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export async function pipeline(commands) {
  if (!URL || !TOKEN) return commands.map(() => ({ result: null }));
  const res = await fetch(`${URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return res.json();
}

export async function cmd(...args) {
  if (!URL || !TOKEN) return null;
  const res = await fetch(`${URL}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const { result } = await res.json();
  return result;
}

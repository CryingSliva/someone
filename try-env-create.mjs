import fs from 'fs';
const PAT = fs.readFileSync('.supabase_pat', 'utf8').trim();
const H = { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' };
const BASE = 'https://api.supabase.com/v1/projects/abummrfdirxxzeqpxfdc/functions';
const JWK = fs.readFileSync('.vapid_jwk.json', 'utf8').trim();
const CRON = fs.readFileSync('.cron_secret', 'utf8').trim();

const code = `Deno.serve(() => {
  const names = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VAPID_JWK','CRON_SECRET'];
  const out = {};
  for (const n of names) { const v = Deno.env.get(n) || ''; out[n] = v ? 'len=' + v.length : 'MISSING'; }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
});`;

await fetch(BASE + '/push-reminders', { method: 'DELETE', headers: H });
const payload = {
  name: 'push-reminders', slug: 'push-reminders', verify_jwt: false,
  files: [{ name: 'index.ts', content: code }], body: code,
  env_vars: [{ name: 'VAPID_JWK', value: JWK }, { name: 'CRON_SECRET', value: CRON }],
};
const r = await fetch(BASE, { method: 'POST', headers: H, body: JSON.stringify(payload) });
console.log('带 env 部署 →', r.status, (await r.text()).slice(0, 150));
await new Promise(x => setTimeout(x, 9000));
console.log('诊断:', await fetch('https://abummrfdirxxzeqpxfdc.supabase.co/functions/v1/push-reminders').then(x => x.text()));

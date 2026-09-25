import fs from 'fs';
const PAT = fs.readFileSync('.supabase_pat', 'utf8').trim();
const H = { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' };
const URL2 = 'https://api.supabase.com/v1/projects/abummrfdirxxzeqpxfdc/functions/push-reminders';
const JWK = fs.readFileSync('.vapid_jwk.json', 'utf8').trim();
const CRON = fs.readFileSync('.cron_secret', 'utf8').trim();

for (const [label, body] of [
  ['update_env_vars 数组', { update_env_vars: [{ name: 'VAPID_JWK', value: JWK }, { name: 'CRON_SECRET', value: CRON }] }],
  ['env_vars 数组', { env_vars: [{ name: 'VAPID_JWK', value: JWK }, { name: 'CRON_SECRET', value: CRON }] }],
  ['env_vars 对象', { env_vars: { VAPID_JWK: JWK, CRON_SECRET: CRON } }],
]) {
  const r = await fetch(URL2, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  const t = (await r.text()).slice(0, 120);
  console.log(label, '→', r.status, t);
  if (r.ok) break;
}

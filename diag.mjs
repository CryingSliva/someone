import fs from 'fs';
const PAT = fs.readFileSync('.supabase_pat', 'utf8').trim();
const H = { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' };
const BASE = 'https://api.supabase.com/v1/projects/abummrfdirxxzeqpxfdc/functions';
const code = `Deno.serve(() => {
  const names = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','VAPID_JWK','CRON_SECRET'];
  const out = {};
  for (const n of names) { const v = Deno.env.get(n) || ''; out[n] = v ? ('len=' + v.length) : 'MISSING'; }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
});`;
await fetch(BASE + '/push-reminders', { method: 'DELETE', headers: H });
const r = await fetch(BASE, { method: 'POST', headers: H, body: JSON.stringify({
  name: 'push-reminders', slug: 'push-reminders', verify_jwt: false,
  files: [{ name: 'index.ts', content: code }], body: code,
})});
console.log('部署诊断版 →', r.status);
await new Promise(x => setTimeout(x, 9000));
console.log(await fetch('https://abummrfdirxxzeqpxfdc.supabase.co/functions/v1/push-reminders').then(x => x.text()));

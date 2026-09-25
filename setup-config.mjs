import fs from 'fs';
import crypto from 'crypto';
const PAT = fs.readFileSync('.supabase_pat', 'utf8').trim();
const JWK = fs.readFileSync('.vapid_jwk.json', 'utf8').trim();
const TOKEN = crypto.randomBytes(24).toString('base64url');
fs.writeFileSync('.cron_secret', TOKEN);

// 建 app_config 表 + 写入配置（RLS 无策略 = 仅 service role 可读写）
const sql = `
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null
);
alter table public.app_config enable row level security;
insert into public.app_config (key, value) values
  ('VAPID_JWK', '${JWK.replace(/'/g, "''")}'::jsonb),
  ('PUSH_TOKEN', jsonb_build_object('t', '${TOKEN}'))
on conflict (key) do update set value = excluded.value;`;

const res = await fetch('https://api.supabase.com/v1/projects/abummrfdirxxzeqpxfdc/database/query', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('app_config 建表+写入 →', res.status, (await res.text()).slice(0, 150) || 'OK');

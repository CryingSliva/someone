// 部署 Supabase Edge Function（push-reminders）+ 注入环境变量
// 用法：node src/deploy-edge.mjs
// 依赖：.supabase_pat、.vapid_jwk.json；自动生成 CRON_SECRET 并存 .cron_secret
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.join(process.cwd());
const read = (f) => (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8').trim() : '');
const PAT = read('.supabase_pat');
const JWK = read('.vapid_jwk.json');
if (!PAT || !JWK) { console.error('✗ 缺少 .supabase_pat 或 .vapid_jwk.json'); process.exit(1); }
let CRON_SECRET = read('.cron_secret');
if (!CRON_SECRET) {
  CRON_SECRET = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(path.join(ROOT, '.cron_secret'), CRON_SECRET);
}

const H = { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' };
const BASE = 'https://api.supabase.com/v1/projects/abummrfdirxxzeqpxfdc/functions';
const code = fs.readFileSync(path.join(ROOT, 'src/functions/push-reminders-edge.ts'), 'utf8');

// 1) 部署/更新函数（先删再建，保证代码最新）
await fetch(`${BASE}/push-reminders`, { method: 'DELETE', headers: H }).catch(() => {});
const res = await fetch(BASE, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    name: 'push-reminders', slug: 'push-reminders', verify_jwt: false,
    files: [{ name: 'index.ts', content: code }], body: code,
  }),
});
const depBody = await res.text();
if (!res.ok) { console.error('✗ 部署失败', res.status, depBody.slice(0, 200)); process.exit(1); }
console.log('✓ 函数已部署 push-reminders');

// 2) 环境变量（PATCH update_env_vars）
const envRes = await fetch(`${BASE}/push-reminders`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ update_env_vars: { VAPID_JWK: JWK, CRON_SECRET } }),
});
console.log(envRes.ok ? '✓ 环境变量已注入（VAPID_JWK / CRON_SECRET）'
  : `✗ 环境变量失败 ${envRes.status} ${(await envRes.text()).slice(0, 150)}`);

// 3) 等待就绪并自检
await new Promise(r => setTimeout(r, 8000));
const inv = await fetch('https://abummrfdirxxzeqpxfdc.supabase.co/functions/v1/push-reminders?key=' + encodeURIComponent(CRON_SECRET), { method: 'POST', body: '{}' });
console.log('自检调用 →', inv.status, (await inv.text()).slice(0, 100));

import fs from 'fs';
const PAT = fs.readFileSync('.supabase_pat', 'utf8').trim();
const H = { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' };
const FID = 'https://api.supabase.com/v1/projects/abummrfdirxxzeqpxfdc/functions/push-reminders';
const JWK = fs.readFileSync('.vapid_jwk.json', 'utf8').trim();
const CRON = fs.readFileSync('.cron_secret', 'utf8').trim();

// 专用 secrets 端点（数组格式）
const r = await fetch(FID + '/secrets', {
  method: 'POST', headers: H,
  body: JSON.stringify([
    { name: 'VAPID_JWK', value: JWK },
    { name: 'CRON_SECRET', value: CRON },
  ]),
});
console.log('secrets 写入 →', r.status, (await r.text()).slice(0, 150));

// 验证读取
const g = await fetch(FID + '/secrets', { headers: H });
console.log('secrets 读取 →', g.status, (await g.text()).slice(0, 200));

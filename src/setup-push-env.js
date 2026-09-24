// 一次性：把离线推送所需环境变量写入 Netlify 站点
// 用法：node src/setup-push-env.js
// 需要：.netlify_token、.vapid_public、.vapid_private、.supabase_service_key
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = 'https://api.netlify.com/api/v1';

const read = (f) => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8').trim();
};

const token = read('.netlify_token') || read('.netlify_token.txt');
const vapidPublic = read('.vapid_public');
const vapidPrivate = read('.vapid_private');
const serviceKey = read('.supabase_service_key');

if (!token) { console.error('✗ 缺少 .netlify_token'); process.exit(1); }
if (!vapidPrivate) { console.error('✗ 缺少 .vapid_private'); process.exit(1); }
if (!serviceKey) { console.error('✗ 缺少 .supabase_service_key（Supabase → Settings → API → secret key）'); process.exit(1); }

const auth = { Authorization: `Bearer ${token}` };

(async () => {
  const sites = await fetch(`${API}/sites`, { headers: auth }).then((r) => r.json());
  const site = sites.find((s) => s.name === (process.env.NETLIFY_SITE || 'fishtodo')) || sites[0];
  if (!site) { console.error('✗ 未找到站点'); process.exit(1); }
  console.log('站点:', site.name);

  const vars = {
    VAPID_PUBLIC_KEY: vapidPublic,
    VAPID_PRIVATE_KEY: vapidPrivate,
    SUPABASE_SERVICE_KEY: serviceKey,
  };
  for (const [key, value] of Object.entries(vars)) {
    // 新版 env API：按 key 写入并作用于所有上下文
    let res = await fetch(`${API}/sites/${site.id}/env`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, values: [{ value, context: 'all' }] }),
    });
    if (!res.ok && (res.status === 422 || res.status === 409)) {
      // 已存在 → 更新
      res = await fetch(`${API}/sites/${site.id}/env/${key}`, {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'all', values: [{ value, context: 'all' }] }),
      });
    }
    console.log(res.ok ? `✓ ${key} 已写入` : `✗ ${key} 失败 HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  console.log('完成。注意：环境变量对新部署生效，请接着运行 node src/deploy.js');
})().catch((e) => { console.error('异常:', e.message); process.exit(1); });

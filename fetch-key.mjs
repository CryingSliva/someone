import fs from 'fs';
const PAT = fs.readFileSync('.supabase_pat', 'utf8').trim();
const H = { Authorization: 'Bearer ' + PAT };
// 新版 keys 端点（带 reveal 才返回完整值）
for (const url of [
  'https://api.supabase.com/v1/projects/abummrfdirxxzeqpxfdc/api-keys?reveal=true',
  'https://api.supabase.com/v1/projects/abummrfdirxxzeqfdc/api-keys',
  'https://api.supabase.com/v1/projects/abummrfdirxxzeqpxfdc/api-keys/legacy?reveal=true',
]) {
  try {
    const r = await fetch(url, { headers: H });
    if (!r.ok) { console.log(url.split('?')[0].split('/').pop(), '→', r.status); continue; }
    const data = await r.json();
    const list = Array.isArray(data) ? data : (data.keys || []);
    // 找 service/secret 类型的 key
    const svc = list.find(k => (k.name || k.type || '').includes('service') || (k.name || '').includes('secret'));
    if (svc) {
      const val = svc.api_key || svc.value || svc.key || svc.secret;
      if (val) {
        fs.writeFileSync('.supabase_service_key', val.trim());
        console.log('✓ service key 已写入 .supabase_service_key（前缀:', val.trim().slice(0, 10) + '…, 长度', val.trim().length + '）');
        process.exit(0);
      }
    }
    console.log('端点可达但未找到 service key，键名:', list.map(k => k.name || k.type).join(','));
  } catch (e) { console.log('ERR', e.message); }
}
console.log('未取到，需要反馈');

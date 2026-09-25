// Supabase Edge Function：离线推送（每分钟由 pg_cron 调用）
// 扫描到期提醒 → Web Push 推到用户所有设备（纯 WebCrypto 实现 VAPID + RFC8291 加密，零依赖）
// 部署：node src/deploy-edge.mjs（通过 Supabase Management API）

const SB_URL = Deno.env.get('SUPABASE_URL') || 'https://abummrfdirxxzeqpxfdc.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const VAPID_SUB = 'mailto:admin@fishtodo.netlify.app';
// 配置（VAPID 密钥、调用令牌）从数据库 app_config 表读取 —— 见 SETUP.md
let VAPID_JWK = {};
let PUSH_TOKEN = '';

/* ---------- 工具 ---------- */
const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - s.length % 4) % 4), '=')), c => c.charCodeAt(0)),
};
const te = new TextEncoder();
function concat(...arrs) {
  const len = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

/* ---------- VAPID JWT（ES256）---------- */
async function vapidAuthHeader(endpoint) {
  const aud = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUB };
  const unsigned = b64u.enc(te.encode(JSON.stringify(header))) + '.' + b64u.enc(te.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'jwk', VAPID_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned));
  // WebCrypto 签名是 raw r||s，JWT/JWS 需要 DER 编码
  const raw = new Uint8Array(sigBuf);
  const r = raw.slice(0, 32), s = raw.slice(32);
  const derLen = 2 + 33 + 2 + 33; // 简化：r、s 都补到 33 字节（含前导 0）
  const der = new Uint8Array(derLen + 2);
  der[0] = 0x30; der[1] = derLen; der[2] = 0x02; der[3] = 33;
  der[4] = 0; der.set(r, 5);
  der[38] = 0x02; der[39] = 33; der[40] = 0; der.set(s, 41);
  const jwt = unsigned + '.' + b64u.enc(der);
  // 原始公钥（04||x||y）供 k= 参数
  const pub = concat(new Uint8Array([0x04]), b64u.dec(VAPID_JWK.x), b64u.dec(VAPID_JWK.y));
  return `vapid t=${jwt}, k=${b64u.enc(pub)}`;
}

/* ---------- RFC 8291：aes128gcm 载荷加密 ---------- */
async function encryptPayload(sub, message) {
  const plaintext = concat(te.encode(message), new Uint8Array([0x02])); // 末条记录分隔符
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);

  // 本地临时密钥对（可导出拿 d）
  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asJwk = await crypto.subtle.exportKey('jwk', asKeys.privateKey);
  const asPubRaw = concat(new Uint8Array([0x04]), b64u.dec(asJwk.x), b64u.dec(asJwk.y));

  // 对端公钥（订阅的 p256dh 是 04||x||y 的 b64url）→ 转 JWK 导入
  const uaRaw = b64u.dec(sub.keys.p256dh);
  const uaJwk = {
    kty: 'EC', crv: 'P-256',
    x: b64u.enc(uaRaw.slice(1, 33)),
    y: b64u.enc(uaRaw.slice(33, 65)),
  };
  const uaPubKey = await crypto.subtle.importKey('jwk', uaJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  // IKM = ECDH(as_priv, ua_pub)；CEK/NONCE = HKDF(salt=auth_secret, IKM, info)
  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaPubKey }, asKeys.privateKey, 256));
  const authSecret = b64u.dec(sub.keys.auth);
  const hkdfInput = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const cekBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: te.encode('Content-Encoding: aes128gcm\0') }, hkdfInput, 128));
  const nonceBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: te.encode('Content-Encoding: nonce\0') }, hkdfInput, 96));

  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt']);
  const aad = concat(te.encode('aes128gcm'), salt, rs, new Uint8Array([0x00]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBits, additionalData: aad, tagLength: 128 }, cek, plaintext));

  const header = concat(te.encode('aes128gcm'), salt, rs, new Uint8Array([0x00]), asPubRaw);
  return concat(header, ciphertext);
}

/* ---------- 推送一条 ---------- */
async function sendPush(sub, payloadJson) {
  const body = await encryptPayload(sub, payloadJson);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Urgency': 'high',
      'Authorization': await vapidAuthHeader(sub.endpoint),
    },
    body,
  });
  return res.status;
}

/* ---------- 主逻辑 ---------- */
Deno.serve(async (req) => {
  try {
    if (!SERVICE_KEY) return new Response('no service key', { status: 200 });
    // 读取配置
    const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
    const cfg = await fetch(`${SB_URL}/rest/v1/app_config?select=key,value&key=in.(VAPID_JWK,PUSH_TOKEN)`, { headers: H })
      .then((r) => r.json()).catch(() => null);
    if (Array.isArray(cfg)) {
      for (const row of cfg) {
        if (row.key === 'VAPID_JWK') VAPID_JWK = row.value || {};
        if (row.key === 'PUSH_TOKEN') PUSH_TOKEN = (row.value && row.value.t) || '';
      }
    }
    // 调用保护：pg_cron 带 x-cron-token；本机直接带 service key 也可
    const token = req.headers.get('x-cron-token') || new URL(req.url).searchParams.get('key') || '';
    const authOk = token && token === PUSH_TOKEN;
    const bearerOk = (req.headers.get('authorization') || '').includes(SERVICE_KEY);
    if (!authOk && !bearerOk) return new Response('forbidden', { status: 403 });
    if (!VAPID_JWK.d) return new Response('vapid not configured', { status: 200 });
    const now0 = new Date().toISOString();
    const now = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 86400000).toISOString();

    const tasks = await fetch(
      `${SB_URL}/rest/v1/tasks?select=id,user_id,title,remind_at` +
      `&completed=eq.false&deleted_at=is.null&remind_at=lte.${now}&remind_at=gte.${dayAgo}` +
      `&push_sent_at=is.null&limit=50`,
      { headers: H },
    ).then((r) => r.json());
    if (!Array.isArray(tasks) || !tasks.length) {
      return new Response(JSON.stringify({ due: 0 }), { headers: { 'Content-Type': 'application/json' } });
    }

    const userIds = [...new Set(tasks.map((t) => t.user_id))];
    const subs = await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?select=sub,endpoint&user_id=in.(${userIds.join(',')})`,
      { headers: H },
    ).then((r) => r.json());
    const subList = Array.isArray(subs) ? subs : [];

    let sent = 0, failed = 0;
    const deadEndpoints = [];
    for (const t of tasks) {
      const payload = JSON.stringify({ title: '⏰ 待办提醒', body: t.title, tag: 'todo-' + t.id });
      for (const s of subList) {
        try {
          const status = await sendPush(s.sub, payload);
          if (status === 201 || status === 200) sent++;
          else { failed++; if (status === 404 || status === 410) deadEndpoints.push(s.endpoint); }
        } catch (e) { failed++; }
      }
    }
    if (deadEndpoints.length) {
      await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=in.(${deadEndpoints.map(encodeURIComponent).join(',')})`,
        { method: 'DELETE', headers: H }).catch(() => {});
    }
    await fetch(
      `${SB_URL}/rest/v1/tasks?id=in.(${tasks.map((t) => t.id).join(',')})`,
      { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ push_sent_at: now }) },
    );
    return new Response(JSON.stringify({ due: tasks.length, sent, failed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response('error: ' + ((e && e.message) || e), { status: 200 });
  }
});

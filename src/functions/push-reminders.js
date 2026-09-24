// 离线推送定时函数（Netlify Scheduled Function，每分钟运行）
// 扫描已到期的提醒任务 → 通过 Web Push 推送到用户订阅过的所有设备
// 打包：esbuild --bundle --platform=node --format=esm → dist/netlify/functions/
import { schedule } from '@netlify/functions';
import webpush from 'web-push';

const SB_URL = process.env.SUPABASE_URL || 'https://abummrfdirxxzeqpxfdc.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

export default schedule('* * * * *', async () => {
  try {
    if (!SERVICE_KEY || !VAPID_PRIVATE || !VAPID_PUBLIC) {
      return new Response('push not configured (env missing)', { status: 200 });
    }
    webpush.setVapidDetails('mailto:admin@fishtodo.netlify.app', VAPID_PUBLIC, VAPID_PRIVATE);
    const H = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };
    const now = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 86400000).toISOString();

    // 1) 到期未推送的有效任务（提醒时间在过去 24h 内、未完成、未删除、未推送过）
    const tasks = await fetch(
      `${SB_URL}/rest/v1/tasks?select=id,user_id,title,remind_at` +
      `&completed=eq.false&deleted_at=is.null&remind_at=lte.${now}&remind_at=gte.${dayAgo}` +
      `&push_sent_at=is.null&limit=50`,
      { headers: H }
    ).then((r) => r.json());
    if (!Array.isArray(tasks) || !tasks.length) {
      return new Response('{"due":0}', { status: 200 });
    }

    // 2) 涉及用户的全部设备订阅
    const userIds = [...new Set(tasks.map((t) => t.user_id))];
    const subs = await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?select=sub&user_id=in.(${userIds.join(',')})`,
      { headers: H }
    ).then((r) => r.json());
    const subList = Array.isArray(subs) ? subs : [];

    // 3) 逐条推送（推给该用户的每一台设备）
    let sent = 0, failed = 0;
    for (const t of tasks) {
      const payload = JSON.stringify({
        title: '⏰ 待办提醒',
        body: t.title,
        tag: 'todo-' + t.id,
      });
      for (const s of subList) {
        try {
          await webpush.sendNotification(s.sub, payload);
          sent++;
        } catch (e) {
          failed++;
          // 410/404 = 订阅失效，删掉避免反复失败
          if (e && (e.statusCode === 410 || e.statusCode === 404) && s.sub && s.sub.endpoint) {
            await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.sub.endpoint)}`,
              { method: 'DELETE', headers: H }).catch(() => {});
          }
        }
      }
    }

    // 4) 标记已推送（失败也标记，避免死循环重试）
    await fetch(
      `${SB_URL}/rest/v1/tasks?id=in.(${tasks.map((t) => t.id).join(',')})`,
      {
        method: 'PATCH',
        headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ push_sent_at: now }),
      }
    );

    return new Response(JSON.stringify({ due: tasks.length, sent, failed }), { status: 200 });
  } catch (e) {
    return new Response('error: ' + ((e && e.message) || e), { status: 200 });
  }
});

import fs from 'fs';
const PAT = fs.readFileSync('.supabase_pat', 'utf8').trim();
const run = async (label, sql) => {
  const r = await fetch('https://api.supabase.com/v1/projects/abummrfdirxxzeqpxfdc/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  console.log(label, '→', r.status, t.slice(0, 120) || 'OK');
  return r.ok;
};
await run('启用 pg_cron', 'create extension if not exists pg_cron;');
await run('启用 pg_net', 'create extension if not exists pg_net;');
// 清掉旧任务（可能不存在，容错）
await run('清理旧任务', `select cron.unschedule('todo-push');`).catch(() => {});
const ok = await run('注册每分钟调度', `
select cron.schedule('todo-push', '* * * * *', $$
  select net.http_post(
    url := 'https://abummrfdirxxzeqpxfdc.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select value->>'t' from public.app_config where key = 'PUSH_TOKEN')
    ),
    body := '{}'::jsonb
  );
$$);`);
if (ok) {
  const check = await fetch('https://api.supabase.com/v1/projects/abummrfdirxxzeqpxfdc/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select jobname, schedule, active from cron.jobs;' }),
  }).then(r => r.json());
  console.log('调度任务:', JSON.stringify(check));
}

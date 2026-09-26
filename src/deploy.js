// 一键部署 dist/ 到 Netlify（后续发布入口）
// 用法：node src/deploy.js
// 令牌来源（二选一）：
//   1. 项目根目录 .netlify_token 文件，内容为个人访问令牌
//   2. 环境变量 NETLIFY_AUTH_TOKEN
// 令牌获取：https://app.netlify.com/user/applications → New access token
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE_NAME = process.env.NETLIFY_SITE || 'fishtodo';
const API = 'https://api.netlify.com/api/v1';

const token = (() => {
  const f = path.join(ROOT, '.netlify_token');
  const fTxt = f + '.txt'; // 记事本保存时可能自动加 .txt 后缀
  const file = fs.existsSync(f) ? f : fs.existsSync(fTxt) ? fTxt : null;
  return (file ? fs.readFileSync(file, 'utf8') : process.env.NETLIFY_AUTH_TOKEN || '')
    .replace(/^\uFEFF/, '').replace(/["'\s]+/g, '');
})();
if (!token) {
  console.error('✗ 缺少 Netlify 令牌。');
  console.error('  打开 https://app.netlify.com/user/applications → New access token，');
  console.error('  把生成的令牌保存为 D:\\project_code\\todo_list\\.netlify_token 文件后重试。');
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };

(async () => {
  // 1. 找到目标站点
  const sites = await fetch(`${API}/sites`, { headers: auth }).then((r) => r.json());
  if (!Array.isArray(sites)) { console.error('✗ 令牌无效或无法读取站点列表', sites); process.exit(1); }
  const site = sites.find((s) => s.name === SITE_NAME);
  if (!site) { console.error(`✗ 找不到名为「${SITE_NAME}」的 Netlify 站点；请检查 NETLIFY_SITE 配置`); process.exit(1); }
  console.log(`目标站点: ${site.name} → ${site.ssl_url}`);

  // 2. 把 dist/ 打包成 zip（archiver 生成正斜杠路径的标准 zip）
  const zipPath = path.join(ROOT, 'dist.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(DIST, false); // false = dist 内容位于 zip 根目录
    archive.finalize();
  });
  const zipBytes = fs.statSync(zipPath).size;
  console.log(`已打包 dist/ → dist.zip (${(zipBytes / 1024).toFixed(0)}KB)`);

  // 3. 上传 zip 创建部署（multipart 表单）
  const form = new FormData();
  form.append('zip', new Blob([fs.readFileSync(zipPath)]), 'dist.zip');
  const deploy = await fetch(`${API}/sites/${site.id}/deploys`, {
    method: 'POST',
    headers: auth,
    body: form,
  }).then((r) => r.json());
  if (!deploy.id) { console.error('✗ 创建部署失败', deploy); process.exit(1); }
  console.log('已上传，等待发布…');

  // 4. 轮询直到发布完成
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const d = await fetch(`${API}/deploys/${deploy.id}`, { headers: auth }).then((r) => r.json());
    if (d.state === 'ready') {
      console.log(`✓ 发布成功: ${site.ssl_url}`);
      fs.unlinkSync(zipPath);
      return;
    }
    if (d.state === 'error') { console.error('✗ 发布失败', d); process.exit(1); }
  }
  console.error('✗ 发布超时，请到 Netlify 控制台查看');
  process.exit(1);
})().catch((e) => { console.error('✗ 部署异常:', e.message); process.exit(1); });

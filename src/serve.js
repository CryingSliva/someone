// 本地测试服务器：node src/serve.js → http://127.0.0.1:8613
// 服务 dist/ 目录（与线上部署形态一致，Service Worker / manifest 可正常测试）
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(8613, '127.0.0.1', () => console.log('serving dist on http://127.0.0.1:8613'));

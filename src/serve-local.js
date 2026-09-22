// 本地模式测试服务器：node src/serve-local.js → http://127.0.0.1:8614
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist-local');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(8614, '127.0.0.1', () => console.log('local-mode on http://127.0.0.1:8614'));

// 构建脚本：src/ 源文件 → dist/ 部署目录 + 根目录 index.html（双击用）
// 用法：node src/build.js   （改完 src/ 下的文件后运行）
const fs = require('fs');
const path = require('path');

const src = (f) => path.join(__dirname, f);
const dist = path.join(__dirname, '..', 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });

// 1. 拼装 index.html（模板 + 内联 Vue/Naive UI/Supabase + 应用逻辑）
const html = [
  fs.readFileSync(src('part1.html'), 'utf8'),
  '<script>\n' + fs.readFileSync(src('../vendor/vue.global.prod.js'), 'utf8') + '\n</script>',
  '<script>\n' + fs.readFileSync(src('../vendor/naive-ui.min.js'), 'utf8') + '\n</script>',
  '<script>\n' + fs.readFileSync(src('../vendor/supabase.min.js'), 'utf8') + '\n</script>',
  fs.readFileSync(src('part2.html'), 'utf8'),
].join('\n');
fs.writeFileSync(path.join(dist, 'index.html'), html);
fs.writeFileSync(path.join(__dirname, '..', 'index.html'), html); // 双击 file:// 用

// 2. manifest
fs.copyFileSync(src('manifest.webmanifest'), path.join(dist, 'manifest.webmanifest'));

// 3. Service Worker（注入版本号 = 构建时间戳，内容变化时客户端自动换新缓存）
const swVersion = String(Date.now());
const sw = fs.readFileSync(src('sw.js'), 'utf8').replace('__SW_VERSION__', swVersion);
fs.writeFileSync(path.join(dist, 'sw.js'), sw);

// 4. 图标（若 dist/icons 缺失则重新生成）
const needIcons = ['icon-192.png', 'icon-512.png', 'maskable-192.png', 'maskable-512.png', 'apple-touch-icon.png']
  .some((f) => !fs.existsSync(path.join(dist, 'icons', f)));
if (needIcons) {
  require('child_process').execSync('node src/build-icons.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
}

console.log('✓ 构建完成 → dist/（Netlify 拖拽部署用这个文件夹）');
console.log('  SW 版本:', swVersion);

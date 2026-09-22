// 生成 PWA 应用图标：普通版、maskable 适配版、iOS apple-touch-icon
// 用法：node src/build-icons.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'dist', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// 靛蓝渐变 + 白色对勾，与应用主题一致
const check = (sw) =>
  `<path d="M136 256 L228 344 L380 176" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;

const svgRegular = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/>
  </linearGradient></defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  ${check(52)}
</svg>`;

// maskable：背景全出血铺满（安卓会自动裁成圆形等形状），图案处于 80% 安全区内
const svgMaskable = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  ${check(48)}
</svg>`;

(async () => {
  const jobs = [
    ['icon-192.png', svgRegular(192), 192],
    ['icon-512.png', svgRegular(512), 512],
    ['maskable-192.png', svgMaskable(192), 192],
    ['maskable-512.png', svgMaskable(512), 512],
    ['apple-touch-icon.png', svgMaskable(180), 180], // iOS 自己加圆角，这里用全出血版
  ];
  for (const [name, svg] of jobs) {
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, name));
    console.log('✓', name);
  }
})();

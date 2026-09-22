# 待办清单 ✅

一个单文件、可离线、跨设备实时同步的待办清单应用。

## 特性

- **Vue 3 + Naive UI**：简洁未来感界面（深空网格 + 玻璃拟态），深浅色自动跟随系统
- **PWA**：可安装到手机 / 电脑桌面，独立窗口运行，断网可打开
- **云同步**：基于 Supabase，多设备登录同一账号实时同步，行级安全隔离
- **离线容错**：断网时可查看、可编辑，改动暂存本地，联网自动推送
- **功能**：今日视图、子任务清单、到期提醒（浏览器通知）、标签分类、重复任务、14 天完成趋势统计、JSON 导出备份、修改密码

## 快速开始

```bash
# 双击即用
# 构建 dist/ 后用浏览器打开（或直接双击生成的 index.html）
node src/build.js

# 本地预览（与线上形态一致）
node src/serve.js        # → http://127.0.0.1:8613
node src/serve-local.js  # → 本地模式变体 http://127.0.0.1:8614

# 部署到 Netlify（需 .netlify_token，见 SETUP.md）
node src/deploy.js
```

## 目录结构

```
├── src/      构建源文件（模板 / 逻辑 / Service Worker / 构建・部署脚本）
├── vendor/   内联进单文件的 Vue / Naive UI / Supabase 库
├── dist/     构建产物（Netlify 部署目录，git 忽略）
└── SETUP.md  详细指南（Supabase 配置、部署、安装到手机/电脑）
```

配置云同步与部署的完整步骤见 **[SETUP.md](SETUP.md)**。

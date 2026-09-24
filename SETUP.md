# 待办清单 · 部署与配置指南

这是一个**单文件** Vue 3 待办清单应用（`index.html`，约 290KB）。
Vue 和 Supabase 客户端已内联进文件，**没有任何外部依赖**，断网也能打开。

- **现在就能用**：双击 `index.html` 即可在浏览器中使用（本地模式，数据保存在当前浏览器）。
- **想要多设备同步**：完成下面第一步（Supabase，约 10 分钟），再部署到 Netlify（约 1 分钟）。

---

## 第一步：配置 Supabase 云同步（约 10 分钟，免费）

### 1. 注册并创建项目

1. 打开 https://supabase.com ，点击 **Start your project** 注册（可用 GitHub 账号或邮箱）。
2. 登录后点击 **New project**：
   - Name 随意（如 `todo-list`）
   - Database Password：设置一个数据库密码并记好（本应用不会用到它，但项目需要）
   - Region 选择离你最近的（如 Singapore / Tokyo）
3. 等待 1~2 分钟项目初始化完成。

### 2. 建表（复制粘贴即可）

1. 进入项目后，左侧栏点击 **SQL Editor**。
2. 把下面整段 SQL 粘贴进去，点击 **RUN**，显示执行成功即可：

```sql
-- 任务表
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  priority text not null default 'medium',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 行级安全：每个人只能读写自己的任务
alter table public.tasks enable row level security;

create policy "users manage own tasks" on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at 自动更新
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- 开启实时同步（如果提示已存在可忽略）
alter publication supabase_realtime add table public.tasks;
```

### 3.（推荐）关闭邮箱确认，注册即可登录

左侧栏 **Authentication → Sign In / Providers → Email**，把 **Confirm email** 开关关掉。
这样你在应用里注册账号后无需去邮箱点确认链接，直接就能登录。

### 4. 获取密钥并填入应用

> Supabase 在 2025 年改版后取消了原来的「Settings → API」页面，新位置如下。

**方式一（最快）**：项目首页右上角点 **Connect** 按钮，弹窗里直接显示 Project URL 和密钥。

**方式二（设置页）**：左侧栏底部 ⚙️ **Project Settings**：

- **Data API** 页面 → **Project URL**（形如 `https://abcd1234.supabase.co`）
- **API Keys** 页面 → 复制密钥。新旧两种格式都可以用：
  - 新版：**Publishable** 标签下的 `sb_publishable_...`
  - 旧版：页面下方 **Legacy API keys** 里的 **anon** key（`eyJ...` 开头，2026 年底前一直有效）

拿到这两项后，用记事本/VS Code 打开 `index.html`，搜索 `SUPABASE_URL`（在文件**末尾**的「⚙️ 配置区」），填入：

```js
const CONFIG = {
  SUPABASE_URL: 'https://abcd1234.supabase.co',     // ← 换成你的 Project URL
  SUPABASE_ANON_KEY: 'sb_publishable_...',          // ← 换成你的 publishable / anon key
};
```

> 偷懒技巧：如果实在找不到 Project URL，看你浏览器地址栏——
> `https://supabase.com/dashboard/project/<这一段>/...` 中的项目 ID 拼上
> `https://<项目ID>.supabase.co` 就是 Project URL。

4. 保存后重新打开 `index.html`，顶部会显示「☁ 云同步」，首次使用点「没有账号？点此注册」创建账号。

> 这个密钥是面向客户端的公开密钥，安全性由数据库的行级安全策略（RLS）保障——
> 每个登录用户只能访问自己的任务，这是 Supabase 官方推荐的做法。

---

## ⬆️ v5 升级 SQL（启用云端截图存储）

v5 新增截图待办功能，云端模式需要一个图片存储桶。在 Supabase → **SQL Editor** 粘贴运行：

```sql
-- 任务表加截图字段
alter table public.tasks add column if not exists image text;

-- 截图存储桶（公开读、用户只能读写自己文件夹）
insert into storage.buckets (id, name, public)
values ('todo_images', 'todo_images', true)
on conflict (id) do nothing;

drop policy if exists "own images" on storage.objects;
create policy "own images" on storage.objects
  for all to authenticated
  using (bucket_id = 'todo_images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'todo_images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "public read images" on storage.objects;
create policy "public read images" on storage.objects
  for select using (bucket_id = 'todo_images');
```

> 不运行也不影响使用：截图会以内嵌方式兜底存储（任务行较大、加载稍慢）；
> 头像、昵称、统计跳转等功能不依赖此 SQL。

---

## ⬆️ v3 升级 SQL（已启用云同步的老用户必做）

v3 新增了子任务、标签、提醒、重复任务、完成时间统计功能，云端数据库需要加几个字段。
在 Supabase → **SQL Editor** 粘贴运行以下内容即可（已运行过会自动跳过，可重复执行）：

```sql
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists tags jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists remind_at timestamptz;
alter table public.tasks add column if not exists repeat text;
```

> 不运行也不丢数据：应用会照常使用，但新功能的改动无法同步到云端，并会提示「云端数据库需要升级」。

---

## 第二步：部署到 Netlify（约 1 分钟，免费）

**方式一：命令行自动部署（日常推荐）**

项目里已内置 `src/deploy.js` 自动部署脚本。首次使用需要生成一个 Netlify 访问令牌：

1. 打开 https://app.netlify.com/user/applications （登录你的账号）
2. 点 **New access token**，描述随意（如 `todo-deploy`），点 Generate
3. 复制生成的令牌（只显示一次），保存为文件 `D:\project_code\todo_list\.netlify_token`（内容只有令牌本身）
4. 之后发布只需一条命令：`node src/deploy.js`（自动把 dist/ 部署到 fishtodo 站点并等待发布完成）

> 令牌等于账号操作权限，`.netlify_token` 文件不要发给别人、不要提交到代码仓库。

**方式二：浏览器拖拽（备用）**

> 应用已升级为 PWA，部署方式从「拖单个文件」改为「拖文件夹」。

1. 打开 https://app.netlify.com/sites/fishtodo/deploys （登录你的 Netlify 账号）
2. 把项目里的 **`dist` 文件夹**（里面是 index.html、manifest、图标等）拖到页面中部的拖放区
3. 等状态变成 "Published"，访问 https://fishtodo.netlify.app 即可

---

## 第三步：安装到手机 / 电脑（像 App 一样使用）

部署完成后，用下面方式「安装」应用，就能脱离浏览器独立运行、断网也能打开：

| 设备 | 安装方法 |
| --- | --- |
| **Windows / 电脑** | 用 Edge 或 Chrome 打开 https://fishtodo.netlify.app ，点地址栏右侧的「安装 ⊕」图标（或菜单 → 应用 → 安装此网站作为应用）→ 开始菜单出现「待办清单」独立窗口应用 |
| **安卓手机** | 用 Chrome 打开网址 → 右上菜单 →「安装应用」→ 桌面出现图标，全屏独立运行 |
| **iPhone** | 用 Safari 打开网址 → 底部分享按钮 →「添加到主屏幕」→ 桌面出现图标，全屏运行 |

安装后登录同一个账号，手机、电脑、浏览器三端任务实时同步；
断网时应用照常打开（显示本地缓存），联网后自动同步。

> 电脑上双击本地 `index.html` 的用法依然保留（本地模式/云同步均可用）。

---

## UI 说明

应用使用 **Naive UI** 组件库（已内联进 index.html，离线可用），风格为「简洁未来感」：
深空网格背景 + 玻璃拟态卡片 + 青蓝渐变点缀，深浅色自动跟随系统。

---

## 常见问题

| 问题 | 说明 |
| --- | --- |
| 双击打开显示「本地模式」 | 正常。未配置 Supabase 或配置未生效，数据只存在当前浏览器 |
| 顶部显示「离线/待同步」 | 正常。断网时的改动暂存在本地，恢复联网自动推送 |
| 注册后提示去邮箱确认 | 到 Supabase → Authentication → Providers → Email 关闭 Confirm email |
| 换设备后数据不一样 | 确认两台设备都用**同一个账号**登录，且顶部显示「☁ 云同步」 |
| 想重置数据 | 退出登录后清空浏览器该站点的 localStorage，或直接在应用里删除任务 |

## 目录说明

```
todo_list/
├── index.html      ← 本地双击用的完整应用（构建产物）
├── SETUP.md        ← 本指南
├── dist/           ← 部署产物（拖到 Netlify 的就是这个文件夹）
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icons/      （PWA 图标）
├── package.json    （构建依赖 sharp，仅生成图标用）
├── vendor/         ← 内联进 index.html 的 Vue / Naive UI / Supabase 库文件
└── src/            ← 构建源文件
    ├── part1.html       页面模板 + 样式（含 PWA 头部标签 + 个人信息面板）
    ├── part2.html       应用逻辑（Vue + Supabase 同步 + SW 注册 + 个人中心）
    ├── sw.js            Service Worker 源码
    ├── manifest.webmanifest
    ├── build.js         构建脚本（见下方）
    ├── build-icons.js   图标生成脚本
    ├── deploy.js        一键部署到 Netlify（见第二步）
    └── serve.js         本地测试服务器
```

修改应用后重新构建（会同时更新根目录 index.html 和 dist/）：

```bash
node src/build.js
```

本地预览（与线上形态一致）：

```bash
node src/serve.js   # 打开 http://127.0.0.1:8613
```

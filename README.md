# 我们的日志本

极简的多人共享日志本：**Vite + 原生 JavaScript + 原生 CSS + Supabase（匿名登录 + PostgreSQL + Realtime）**，3 人小团队、公网访问、全程免费。

- 首次进入只输入昵称，无需邮箱 / 密码 / 验证码。
- 发布日志（内容 + 标签 + 自动时间 + 昵称），按时间倒序展示。
- 别人发布后，你这边**不用刷新**就能实时看到（Supabase Realtime）。
- 只能删除自己发布的日志。
- 支持按内容关键词搜索、按标签筛选。
- 移动端优先、系统字体、可选深色模式。

---

## 一、项目文件树

```
our-logbook/
├── index.html          # 页面结构
├── main.js             # 前端逻辑（匿名登录、发布、列表、实时、删除、搜索）
├── style.css           # 样式（移动端优先 + 深色模式）
├── package.json        # 依赖与脚本
├── supabase.sql        # 数据库初始化脚本（建表 / 索引 / RLS / Realtime）
├── .env.example        # 环境变量模板
├── .gitignore
└── README.md
```

---

## 二、Supabase 配置（一次性，约 5 分钟）

### 1. 创建 Supabase 项目
1. 打开 https://supabase.com → 用 GitHub 登录（免费）。
2. 点 **New project**。
3. 填项目名（如 `our-logbook`）、设置数据库密码（自己记住，之后连接数据库用）、选一个离你最近的区域（如 Singapore / Southeast Asia）。
4. 点 **Create new project**，等 1～2 分钟初始化完成。

> 免费版够用：3 个用户远远低于免费额度的 5 万月活用户 / 500MB 数据库 / 1GB 存储。

### 2. 开启 Anonymous（匿名）登录
1. 左侧菜单 → **Authentication** → **Sign In / Providers**。
2. 找到 **Email** 卡片（或叫 Email provider）。
3. 打开 **Anonymous sign-ins**（匿名登录）开关，保存。

> 菜单名可能随版本略有变化；如果找不到，就在 Authentication 下的 “Configuration / Providers” 里找 Email 开关。

### 3. 执行数据库 SQL
1. 左侧菜单 → **SQL Editor**。
2. 点 **New query**。
3. 把本仓库的 `supabase.sql` 全文粘贴进去。
4. 点 **Run**。看到 “Success” 即完成建表、索引、RLS、Realtime 配置。

> 如果最后一行 `alter publication supabase_realtime add table public.logs;` 报错，就手动开启：
> **Database → Replication → Publications → supabase_realtime → 勾选 `logs` 表**。

### 4. 获取 SUPABASE_URL 和 SUPABASE_ANON_KEY
1. 左侧菜单 → **Project Settings**（齿轮图标）→ **API**。
2. 复制两个值：
   - `Project URL`（形如 `https://xxxxxxxx.supabase.co`）→ 对应 `VITE_SUPABASE_URL`
   - `anon` / `public` 这一行的 key（很长一串）→ 对应 `VITE_SUPABASE_ANON_KEY`
3. **注意**：用 `anon public` key，**不要**用 `service_role` key（那是有完整权限的密钥，绝不能放前端）。

---

## 三、本地运行

```bash
# 1. 进入项目目录
cd our-logbook

# 2. 安装依赖（需要本机已装 Node.js 18+）
npm install

# 3. 复制环境变量模板并填入你的两个值
cp .env.example .env        # Windows 用：copy .env.example .env
# 编辑 .env，填入 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY

# 4. 启动开发服务器
npm run dev
```

浏览器打开终端提示的地址（默认 http://localhost:5173 ），即可看到页面。

---

## 四、免费部署（推荐 Cloudflare Pages，其次 Vercel / Netlify）

### 准备：先推送到 GitHub
1. 在 https://github.com/new 新建一个**私有**仓库（private 也行，推荐 private）。
2. 本地执行：

```bash
cd our-logbook
git init
git add .
git commit -m "init: 我们的日志本"
git branch -M main
git remote add origin https://github.com/你的用户名/our-logbook.git
git push -u origin main
```

> `.gitignore` 已忽略 `.env`，所以你的密钥**不会**被推到 GitHub，放心。

### 方式 A：Cloudflare Pages（推荐，全球 CDN 快）
1. 打开 https://dash.cloudflare.com → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**。
2. 选 GitHub 账号 → 选 `our-logbook` 仓库 → 点 **Begin setup**。
3. 构建配置：
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`
4. 展开 **Environment variables**，添加两个变量（值填你自己的）：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. 点 **Save and Deploy**。等 1～2 分钟构建完成。
6. 部署成功后，Cloudflare 会给你一个 `https://xxx.pages.dev` 地址，就是公网地址。

### 方式 B：Vercel
1. 打开 https://vercel.com → **Add New → Project** → 导入 `our-logbook` 仓库。
2. 框架会自动识别为 Vite；若没有，手动设置：
   - **Build Command**：`npm run build`
   - **Output Directory**：`dist`
3. 在 **Environment Variables** 里添加 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
4. 点 **Deploy**。完成后得到 `https://xxx.vercel.app`。

### 方式 C：Netlify
1. 打开 https://app.netlify.com → **Add new site → Import an existing project** → 选仓库。
2. **Build command**：`npm run build`，**Publish directory**：`dist`。
3. **Environment variables** 里添加那两个变量。
4. **Deploy**，得到 `https://xxx.netlify.app`。

> 三种任选其一即可，都是免费。建议 Cloudflare Pages（无需绑卡、全球节点、免费额度最宽松）。

---

## 五、验收清单（如何测试）

找 3 台设备 / 3 个浏览器（或无痕窗口）打开部署后的公网地址：

1. **昵称流程**
   - 设备 A 首次打开 → 出现“输入昵称”弹窗 → 输入“小明” → 进入。
   - 刷新页面 → 不再弹窗，自动使用“小明”。
   - 点“修改昵称” → 改成“小美” → 顶部昵称同步变化；发布新日志显示“小美”。

2. **发布日志**
   - 设备 A 输入内容 + 标签 `工作, 生活` → 点“发布” → 输入框清空，日志出现在列表顶部，显示昵称、相对时间、内容、标签。

3. **实时刷新（重点）**
   - 设备 A 保持页面不动；设备 B 发布一条日志。
   - 设备 A **不刷新、不点击任何按钮**，1 秒内列表顶部自动出现这条新日志。
   - 设备 B 删除一条日志，设备 A 端该条日志自动消失。

4. **删除权限（只能删自己的）**
   - 设备 A 看自己发布的日志 → 有“删除”按钮；看设备 B 的日志 → 没有删除按钮。
   - 点自己的“删除” → 弹出确认 → 确认后删除成功，且在所有设备上实时消失。

5. **搜索与筛选**
   - 搜索框输入关键词 → 列表实时只剩匹配内容。
   - 点某条日志上的标签（或下拉选择标签）→ 列表只剩该标签的日志。

6. **多端适配**
   - 用手机和电脑分别打开，布局都能正常使用。

---

## 六、免费服务限制与替代方案

| 服务 | 免费额度 | 3 人场景 | 替代方案 |
| --- | --- | --- | --- |
| Supabase | 5 万月活用户、500MB 数据库、1GB 存储、Realtime 200 并发连接 | 绰绰有余 | Firebase（免费版） |
| Cloudflare Pages | 每月无限静态请求、100GB 带宽（宽松） | 绰绰有余 | Vercel / Netlify 免费版 |
| 域名 | 平台自带子域名 | 可用 | 可另购便宜域名绑定（非必需） |

### 需要注意的几点
1. **Supabase 免费项目空闲暂停**：免费项目若 **7 天无任何访问**，会被自动暂停。重新访问时在 Supabase 控制台点一下 “Restore project” 即可恢复，数据不丢失。
2. **匿名会话的持久性**：匿名登录的会话存在浏览器 localStorage。只要**同一浏览器不清缓存**，就是同一个匿名用户，可以删除自己以前发的日志。若清缓存 / 换浏览器 / 无痕窗口，会变成**新的匿名用户**，旧日志会失去“删除按钮”（因为系统无法再证明那是你）。这是匿名登录的固有特性，对 3 人日常记录影响很小。
3. **如果 Supabase 匿名登录不符合你的需求**，可以用 **Firebase Anonymous Auth + Firestore** 替代：同样无需邮箱，`signInAnonymously()` 返回一个稳定的匿名 UID，Firestore 的 `onSnapshot` 实现实时同步，前端只需把 `@supabase/supabase-js` 换成 `firebase` 并改写数据读写部分。但 Supabase 的“SQL + RLS + Realtime”组合更简单，建议优先 Supabase。

### 关于“别人不能删我的日志”的边界
本方案的权限完全由数据库 RLS 保证（`auth.uid() = user_id`），前端只是“看不到按钮”的体验优化，即使有人绕过前端直接调 API，也无法删除或修改他人的日志。匿名用户之间的隔离是真实有效的。

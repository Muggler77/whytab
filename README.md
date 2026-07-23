# whytab

whytab is a local-first new tab dashboard for shortcuts, widgets, notes, todos, weather, exchange rates, and optional cross-device sync.

It is built as a Chrome / Edge Manifest V3 extension and as a responsive web app for mobile and tablet use. The core idea is simple: user data should work locally first, remain exportable, and only sync to the cloud after the user signs in.

Current release: **0.5.4**. See the [bilingual release notes](docs/releases/0.5.4.md).

## Product and Framework

whytab is both a ready-to-use product and an open-source configurable framework.

- For everyday users: use the official web app at `https://whytab.pages.dev/`, register or sign in with email and password, and sync with the hosted whytab service. No server setup, service URL, API key, or access key is required.
- For developers and teams: fork this repository, change the UI or sync provider, and self-host an independent deployment by providing your own build-time configuration.

## Highlights

- Local-first data: shortcuts, widgets, todos, notes, countdowns, settings, and layout are stored in the browser's IndexedDB.
- Optional cloud sync: users can register or sign in with email and password to sync across devices.
- User data isolation: cloud data is protected by Supabase Auth and Row Level Security.
- Editable home workspace: enable layout editing to reorder shortcuts and widgets without changing their data.
- Full-bleed website icons: real site artwork fills the icon itself without an extra colored container.
- Translucent workspace: neutral, wallpaper-aware materials keep cards readable without imposing random widget colors.
- Purpose-built widgets: all 12 widgets use distinct layouts suited to their content instead of repeating one generic card template.
- Curated wallpaper library: 32 built-in choices, including 20 original desktop/mobile pairs across Japanese, illustrated, cat, and cinematic styles.
- Personal pages: add pages to the left navigation, assign shortcut groups to them, or hide optional built-in pages.
- Cross-platform usage: works on macOS, Windows, iOS, iPadOS, Android, and other modern browsers depending on extension/PWA support.
- Import and backup: supports whytab JSON, browser bookmarks HTML, CSV, and old new-tab page migration input.
- Private by default on each device: the app remains usable offline and does not require sign-in for local use.

## Download and Use

### Use the hosted web app

Open the public web app:

```text
https://whytab.pages.dev/
```

This is the easiest way to try whytab on iPhone, iPad, Android, tablets, and desktop browsers.

- iPhone / iPad: open the link in Safari, tap Share, then choose "Add to Home Screen".
- Android: open the link in Chrome or another modern browser, then choose "Install app" or "Add to Home screen".
- Desktop: open the link in Chrome, Edge, Safari, Firefox, or another modern browser.

The web app does not replace the browser's new tab page, but it provides the same dashboard, widgets, local storage, backup, and optional account sync.

Cloudflare Pages deployment uses the root `wrangler.toml` and publishes `extension/web-dist`. The Chrome/Edge package is built separately in `extension/dist`, so Cloudflare-only files such as `_headers` can never make the browser extension invalid. The shared `pages.dev` hostname is free and can later be replaced by an owned custom domain without changing the Supabase project or synchronized user data.

Automatic Pages deployment requires repository secrets named `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token must be restricted to Cloudflare Pages edit access for the whytab account. A missing secret now fails the deployment job instead of reporting a misleading successful run.

### Install as a Chrome or Edge new tab extension

The extension version replaces the browser's new tab page on desktop Chromium browsers.

For security, this repository does not commit a prebuilt `extension/dist` folder with production sync configuration. To install from GitHub source:

1. Download the repository ZIP from GitHub, or clone the repository.
2. Open a terminal in the project folder.
3. Run:

```bash
npm install
npm run build
```

4. Open `chrome://extensions/` in Chrome, or `edge://extensions/` in Edge.
5. Enable Developer mode.
6. Click "Load unpacked".
7. Select the generated `extension/dist` folder.
8. Open a new tab.

After installation, whytab stores your shortcuts, widgets, notes, todos, settings, and layout locally in the current browser profile.

### Register, sign in, and sync

Sign-in is optional.

- You can use whytab without an account. Your data stays in the current browser profile.
- To sync across devices, open the account/sync panel and register with email and password.
- Registration passwords require at least 10 characters. The login panel can send a password-reset email, and signed-in users can update their password.
- Use the same account on another device to sync shortcuts, widgets, notes, todos, countdowns, settings, and layout.
- If you created data before signing in, whytab keeps it locally and carries it into your account when you sign in.
- Public users only need an email and password. They do not need to prepare a backend, service address, API key, access key, or advanced connection setting.
- Keep a JSON export backup when moving browsers or resetting a device.

## 中文快速使用

在线版地址：

```text
https://whytab.pages.dev/
```

- 手机和平板：打开上面的地址，添加到主屏幕即可使用。
- Mac / Windows 桌面浏览器：可以直接打开在线版，也可以从源码构建后作为 Chrome / Edge 新标签页插件加载。
- 插件安装方式：下载 GitHub 源码，运行 `npm install` 和 `npm run build`，然后在浏览器扩展管理页选择“加载已解压的扩展程序”，加载 `extension/dist`。
- 不登录也可以用：数据默认保存在本机浏览器 IndexedDB。
- 需要多设备同步时：在账号面板注册或登录，同一个账号即可同步数据。
- 未登录时已经整理好的快捷方式、笔记、待办和设置，登录后会自动带入当前账号，不会直接消失。
- 普通用户只需要邮箱和密码，不需要自己准备服务器、服务地址、API Key、访问密钥或任何高级连接配置。

### 0.5.4 账号与同步安全加固

- 登录、退出、自动同步和手动同步增加账号操作代次校验，旧任务不能在账号切换后覆盖当前界面或本机数据。
- 本机上传的快捷图标、文件夹图标、照片、照片文件名和自定义壁纸不会进入云端快照；跨设备合并不会清除当前设备的本机媒体。
- 客户端和数据库同时限制云端快照为 2 MB；图片上传增加格式、原始体积和压缩结果校验。
- 旧细粒度同步表关闭客户端直接访问，快照只允许读取，并通过受限 RPC 原子写入。
- 外部网站图标缓存限制为 200 项，本机存储失败会明确提醒。
- Cloudflare Pages 缺少部署 Secrets 时工作流直接失败，避免把未部署误报为成功。

### 0.5.3 扩展发布修复

- Chrome/Edge 扩展和 Cloudflare Pages 使用独立输出目录。
- 扩展包不再包含 Cloudflare 专用 `_headers` 文件，可正常作为未打包扩展加载。
- 此版本不修改用户数据、账号或同步逻辑。

### 0.5.2 数据安全与交互稳定性

- 同步备份按账号隔离，普通退出只退出当前设备，多设备写入使用服务器版本锁和冲突重试。
- 完整备份覆盖网站、小组件、便签、待办、倒计时、日历、布局、设置和本地媒体；网站导入保持独立入口。
- 私人照片与自定义壁纸仅保存在当前设备，不上传到云端；自定义壁纸增加数量和压缩限制。
- 网站图标采用懒加载、解析结果持久缓存和浏览器缓存，并允许在设置中关闭第三方图标查询。
- 修复设置窗口无法滚到底、版本信息不清晰和桌面导航自动隐藏抖动。
- 网页增加 CSP、HSTS、权限策略、完整离线资源预缓存和 Cloudflare Pages 自动部署流程。

### 0.5.1 Cloudflare Pages 迁移

- 官方网页入口迁移到免费的 `https://whytab.pages.dev/`，不再依赖旧自定义域名。
- Supabase 项目、账号、云端同步表和数据结构保持不变，已同步的数据无需迁移。
- Chrome / Edge 扩展数据保存在扩展自身空间，不受网页域名变化影响。
- 网页未登录数据仍遵循浏览器同源隔离：旧网址下仅存在本地的数据需要先导出 JSON，再在新网址导入。
- 登录回调、验证邮件链接、版本检查、扩展权限和部署配置统一使用新地址。

### 0.5.0 差异化小组件

- 12 个小组件不再套用同一种内容模板，每个组件都按自身用途重新设计信息结构。
- 天气增加实时概况和天气趋势；日历改为日期撕页与月历组合；待办增加环形完成进度和任务工作区。
- 倒计时、专注、世界时钟、年度进度分别采用轨道、计时环、模拟钟面和 52 周点阵表达时间。
- 照片、每日灵感和便签分别使用画框、编辑排版和横线纸语言；计算器与汇率改为更适合操作和扫读的数据面板。
- 紧凑、标准、展开尺寸会按可用宽度自动收敛次要信息，右键设置、拖拽和尺寸切换保持不变。
- 数据结构继续使用版本 1；不修改注册、登录、账号隔离、同步协议或本地存储逻辑。

### 0.4.1 清晰图标与稳定右键菜单

- 快捷图标优先使用维护过的矢量品牌图和 256px 图标源，并拒绝放大低于清晰度要求的小图。
- 图标加载失败、超时或离开可视区域时始终保留清晰文字占位，不再出现空白图标。
- 修复主页、网站、Dock、文件夹和小组件的右键菜单；菜单不会再因窗口短暂失焦或时钟刷新而消失。
- 继续使用数据结构版本 1，不修改注册、登录、账号隔离、同步协议或本地存储逻辑。

### 0.4.0 通透界面、完整图标与原创壁纸

- 网站真实图标直接占满图标区域，取消额外彩色大框；主页和网站页继续共用同一图标尺寸与圆润比例。
- 全部小组件改为中性通透材质，重新梳理标题、字号、留白、数据层级和空状态，不再用互相冲突的随机强调色。
- 网站、文件夹、页面和小组件右键菜单统一提升到最上层，修复菜单消失、被卡片遮挡和尺寸预览难以辨认的问题。
- 新增 20 张 whytab 原创壁纸，覆盖日系、原创动漫、猫咪和酷感四种风格；每张都有独立桌面与手机文件。
- 壁纸资源中心支持风格筛选、懒加载、个人壁纸集和每日轮换，手机不再下载横屏大图。
- 手机内容在底部导航上方独立滚动，导航不遮挡卡片和文字；页面切换自动回到顶部。
- 数据结构仍为版本 1，不修改注册、登录、账号隔离、同步协议或本地存储逻辑。

### 0.3.0 全新界面与交互系统

- 使用单一设计系统重做主页、网站、工具、资源中心、设置、账号同步和全部弹层，移除旧版多层 CSS 覆盖。
- 时间与搜索严格沿页面中心轴排列；桌面导航贴边垂直居中，手机和平板使用底部导航。
- 小组件改为自适应 12 列网格，统一卡片、图标、间距和功能色，并保留拖拽、尺寸调整和右键设置。
- 网站页、快捷图标、文件夹和 Dock 使用同一图标尺寸与圆润比例，右键菜单和空状态重新设计。
- 手机端可见操作区至少 44px，补充键盘跳转、焦点状态、密码显隐、弹窗语义和减少动态效果支持。
- 生产 CSS 体积由旧版约 249 KB 降至约 66 KB，改善手机端加载和样式解析速度。

### 0.2.4 边缘导航垂直居中

- 桌面导航继续固定在屏幕最左或最右边缘，同时改为严格按视口垂直居中。
- 始终显示、自动隐藏、完全隐藏和边缘恢复按钮共用同一条垂直中心线。
- 手机和平板仍使用底部导航，不受桌面居中规则影响。

### 0.2.3 导航定位与右键修复

- 桌面导航固定在屏幕最左或最右边缘，不再跟随居中内容容器向内移动。
- 左右两侧始终保留对称安全边距，切换导航方向、显示方式时，中间工作区不会横向跳动。
- 主页统一接管右键事件，小组件、布局编辑状态和主页空白区域都能稳定打开对应菜单。
- 主页文件夹恢复右键编辑；菜单不再因 Chrome 窗口短暂失焦而立即关闭。

### 0.2.2 导航、拖拽与小组件

- 桌面导航固定在屏幕边缘，不再垂直居中；设置中可以选择左侧或右侧，以及始终显示、自动隐藏或隐藏。
- 小组件改用可靠的鼠标、触屏和键盘排序交互，拖动手柄会显示清晰预览，排序结果即时保存。
- 右键点击小组件即可直接看到紧凑、标准、展开三种比例预览，并实时调整尺寸。
- 主页和网站页共用同一套图标尺寸、圆角和图片留白规则；图标尺寸滑杆会同时作用于两页。
- 重新设计 12 个小组件的色彩、标题、内容层级、加载态和空状态，重点改善天气、倒计时与待办在数据较少时的大块空白。
- 拖拽引擎只在进入布局编辑时加载，减少普通新标签页启动时需要下载和解析的代码。

### 0.2.1 界面与布局

- 首页改为更清晰的工作台排版，统一图标、文字、小组件标题和操作按钮，避免图标与文字重叠。
- 点击首页的“编辑布局”按钮后，可以重新排列常用图标和小组件；触屏设备使用先选中、再选择目标位置的方式，降低误拖动风险。
- 左侧导航支持创建个人页面，每个页面对应一个快捷方式分组，可用于区分工作、学习、生活等场景。
- “网站”和“工具”页面可以隐藏或恢复；“主页”始终保留，避免用户误删主要入口。
- 删除个人页面只会删除导航入口，不会删除对应分组和其中的网站，防止误操作造成数据丢失。
- 12 个小组件采用统一视觉结构，并针对桌面、平板和手机分别调整布局。

## 产品与框架定位

whytab 同时提供两种使用方式：

- 普通用户：直接使用官方在线版 `https://whytab.pages.dev/`，注册或登录账号即可同步，不需要自己部署服务。
- 开发者或团队：可以 fork 这个仓库，把它当作一套可配置的新标签页/PWA 框架，替换界面、同步服务或部署环境，搭建自己的独立版本。

## Supported Platforms

### Desktop

- macOS with Chrome or Edge
- Windows with Chrome or Edge
- Linux with Chromium-based browsers

### Mobile and Tablet

- iPhone and iPad through Safari Web App / Add to Home Screen
- Android through Chrome or other modern browsers as a web app
- Tablet layouts with touch-friendly navigation and safe-area support

The browser extension replaces the new tab page where the browser supports `chrome_url_overrides.newtab`. On mobile systems that do not support that extension API, whytab can still run as a web app.

## Features

### Shortcuts

- Website shortcut grid
- Groups and folders
- Dock-pinned shortcuts
- Add, edit, delete, and reorder shortcuts
- Reorder homepage shortcuts in layout editing mode; touch devices use a deliberate two-step selection to avoid accidental moves
- Automatic favicon matching
- Custom icon URL and built-in fallback icons
- Search/filter shortcuts
- Import from browser bookmarks, CSV, old new-tab page captures, or whytab JSON

### Widgets

- Weather
- Calendar
- Countdown dates
- To Do
- Notes
- Exchange rates
- Daily quote
- Focus timer
- World clock
- Quick memo
- Year progress
- Calculator
- Reorder widgets in layout editing mode with responsive desktop, tablet, and phone layouts
- Mouse, touch, and keyboard widget sorting with a dedicated drag handle and live drag preview

### Pages and Navigation

- Home, Websites, and Tools built-in pages
- User-created navigation pages backed by shortcut groups
- Optional hiding of Websites and Tools while Home remains protected
- Deleting a custom navigation page keeps its shortcut group and websites, preventing accidental data loss

### Appearance

- Dark and light themes
- 32 built-in wallpapers with style filters and mobile-optimized files
- Custom wallpaper upload
- Daily wallpaper rotation
- Live card transparency
- Icon size
- Grid density
- Dock position
- Mobile bottom navigation
- Desktop navigation side and visibility controls
- Phone single-column and tablet two-column widget layouts

### Sync and Backup

- Email/password registration and login
- Automatic sync after sign-in
- Manual merge sync
- Local overwrite cloud
- Cloud overwrite local
- Local rollback point before overwrite operations
- JSON export/import backup

## Data Safety

User data safety is a core design point.

- Without login, data stays in the current browser profile through IndexedDB.
- After login, data is synced to Supabase under the signed-in user's `auth.uid()`.
- Row Level Security policies restrict each user to their own rows.
- The repository does not include Supabase `service_role` keys, database passwords, GitHub tokens, SSH private keys, SMTP/API private keys, or personal exported user data.
- The official hosted app uses build-time frontend sync configuration. The browser-visible Supabase publishable key is not an admin key; user data isolation depends on Supabase Auth and Row Level Security.

More details: [Privacy and Security](docs/privacy-and-security.md).

## Tech Stack

- React 18
- TypeScript
- Vite
- Chrome Extension Manifest V3
- lucide-react
- dnd-kit, loaded only while editing the widget layout
- IndexedDB
- Supabase Auth
- Supabase Postgres
- Supabase Edge Functions
- Open-Meteo weather data
- npm workspaces

## Project Structure

```text
.
├── extension
│   ├── public
│   │   ├── manifest.json        # Chrome / Edge extension manifest
│   │   ├── app.webmanifest      # PWA manifest
│   │   ├── sw.js                # Service worker for web app usage
│   │   ├── icons                # Extension icons
│   │   └── wallpapers           # Built-in wallpapers
│   ├── src
│   │   ├── App.tsx              # Main UI and dialogs
│   │   ├── SortableWidgetGrid.tsx # Lazy-loaded widget sorting
│   │   ├── styles.css           # Global and responsive styles
│   │   ├── db.ts                # IndexedDB persistence
│   │   ├── sync.ts              # Auth and sync helpers
│   │   ├── importers.ts         # Import parsing and icon matching
│   │   ├── weather.ts           # Weather data
│   │   ├── rates.ts             # Exchange-rate data
│   │   ├── defaultState.ts      # Default local state
│   │   ├── projectConfig.ts     # Build-time sync config reader
│   │   └── types.ts             # Core types
│   └── dist                     # Build output
├── supabase
│   ├── migrations               # Database schema and RLS policies
│   └── functions                # Edge Functions
├── tools                        # Migration helpers
└── docs                         # Documentation
```

## Quick Start

Install dependencies:

```bash
npm install
```

Type check:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Load the extension build directory in Chrome or Edge:

```text
extension/dist
```

## Chrome Installation

For public distribution, publish the packaged extension through the Chrome Web Store. Local unpacked installation is intended for development and trusted local testing; Chrome will label it as an unpacked extension by design.

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `extension/dist`.
5. Open a new tab.

For Chrome Web Store submission, upload a zip whose root contains `manifest.json` and the built assets from `extension/dist`.

## Edge Installation

1. Open `edge://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `extension/dist`.

## Mobile and Tablet Web App

The same frontend can be deployed to Cloudflare Pages, GitHub Pages, or any static hosting provider. The public whytab build uses `https://whytab.pages.dev/`; the GitHub Pages URL remains a deployment fallback. On iPhone and iPad, open the deployed URL in Safari and use "Add to Home Screen". On Android, use the browser's install/add-to-home-screen option.

After signing in with the same account, mobile and desktop clients can merge shortcuts, widgets, notes, todos, and settings.

## Cloud Sync

The hosted sync backend uses Supabase:

- Supabase Auth for email/password accounts
- `sync_snapshots` for current full-state sync
- Row Level Security to isolate per-user data
- An Edge Function for cached Bank of China exchange-rate data

Public users do not need to enter service URLs or API keys. The official hosted app at `https://whytab.pages.dev/` already contains the public client configuration required to talk to the whytab sync service. A user only registers or signs in with email and password.

Only developers who fork the repository and self-host their own independent copy need to configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_AUTH_REDIRECT_URL`, then run the migration in `supabase/migrations/0001_init_whytab.sql`. In that mode, this repository works as a configurable framework: the frontend, Auth provider, database project, email domain, and deployment target can be replaced by the self-hosting developer.

For email verification, configure the Supabase Auth Site URL and Redirect URLs to the hosted app URL. A `pages.dev` subdomain cannot be used as a custom email sender domain, so the temporary free deployment uses Supabase's built-in Auth sender until an owned domain is added. The branded confirmation template in `docs/supabase-confirm-signup-email.html` keeps the `{{ .ConfirmationURL }}` variable intact.

## Import and Backup

Supported import formats:

- whytab JSON
- Browser bookmarks HTML
- CSV
- Old new-tab page capture output

Use "Export" after setting up your dashboard to keep an offline JSON backup. Cloud sync is useful for multiple devices, but local export remains the easiest recovery path after browser resets or migrations.

## Common Commands

```bash
npm install
npm run typecheck
npm run build
npm run dev
npm run preview
```

## Public Repository Safety Checklist

Before making this repository public, the following checks are expected:

- No personal shortcut export files are tracked.
- No Supabase `service_role` key is tracked.
- No database password, GitHub token, or SSH private key is tracked.
- No private backend/admin secrets are tracked. Public frontend sync configuration is only for browser login/sync and is protected by RLS.
- RLS policies are present for user-owned tables.
- The app remains usable without login through local IndexedDB.

## Documentation

- [Installation](docs/install.md)
- [Data model](docs/data-model.md)
- [Privacy and Security](docs/privacy-and-security.md)
- [Configuration and operations](docs/whytab-configuration-and-usage.md)

# whytab 安装与使用

## 本地运行

1. 在项目根目录安装依赖：`npm install`
2. 构建插件：`npm run build`
3. 打开 Chrome 或 Edge 的扩展管理页，启用开发者模式。
4. 选择“加载已解压的扩展程序”，加载 `extension/dist`。
5. 新建标签页会打开 whytab。

## 云同步

同步服务通过构建时环境变量配置，源码里不直接保存真实后端配置。

1. 新建 Supabase 项目。
2. 执行 `supabase/migrations/0001_init_whytab.sql`。
3. 部署 `supabase/functions/boc-rates` 云函数。
4. 本地开发时复制 `.env.example` 为 `.env.local`，填写 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
5. GitHub Pages 部署时，在仓库 Secrets 中配置同名变量。
6. 注册或登录账号。登录成功后 whytab 会自动同步：打开页面会拉取云端数据，本机修改会自动上传，并按设置间隔定时检查云端更新。
7. “合并同步”“本机覆盖云端”“云端覆盖本机”按钮仍然保留，适合第一次迁移或你想立刻强制同步时使用。

### 多设备同步流程

1. 第一台设备安装 whytab。
2. 用邮箱和密码注册或登录。
3. 整理快捷导航；whytab 会自动上传。
4. 第二台设备安装同一个插件，登录同一个邮箱账号。
5. 打开新标签页后会自动拉取并合并云端数据。

删除快捷导航、删除 To Do 等操作会同步删除标记，另一台设备不会把旧数据重新带回来。便签如果两台设备同时改了不同内容，会保留一个冲突版本并提示。

未登录时，用户数据只保存在当前浏览器的 IndexedDB 中。

## 导入旧新标签页快捷导航

旧新标签页没有可用导出文件时，可以尝试半自动读取页面：

1. 打开旧新标签页。
2. 打开浏览器开发者工具 Console。
3. 粘贴并运行 `tools/newtab-page-sniffer.js` 的内容。
4. 脚本会把可见链接复制成 JSON。
5. 回到 whytab，点击“导入”，粘贴 JSON 并确认。

如果浏览器阻止读取或旧页面不是普通链接结构，可以导入浏览器书签 HTML、CSV 或 whytab JSON。

## 备份

whytab 默认把数据存在本机 IndexedDB。建议在初次整理好快捷导航后点击“导出”，保留 JSON 备份。开启 Supabase 后，数据会同时存在本机和云端。

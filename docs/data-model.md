# whytab 数据模型

第一版插件前端使用本地 IndexedDB 保存完整 `AppState`，并通过 `sync_snapshots` 表做整包云同步。Supabase 迁移同时创建了细粒度表，方便后续把同步升级成逐条记录合并。

核心集合：

- `shortcuts`：快捷导航，含标题、网址、图标、颜色、分组、Dock 固定和排序。
- `shortcut_groups`：快捷导航分组。
- `widgets`：小组件开关和布局。
- `todos`：待办事项。
- `notes`：随手笔记，预留冲突正文。
- `countdowns`：用户自定义日期倒计时。
- `settings`：主题、壁纸、城市、图标尺寸、Dock 位置等。
- `sync_snapshots`：当前版本使用的整包快照。
- `exchange_rate_cache`：中行汇率云函数缓存。

同步默认按快照更新时间选择新版本。后续可以逐步切换为按集合和记录的 `updatedAt` 合并。

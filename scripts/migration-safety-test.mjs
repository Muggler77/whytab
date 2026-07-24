import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = new URL("..", import.meta.url).pathname;
const tempDir = await mkdtemp(join(tmpdir(), "whytab-migration-test-"));
const migrationsOutput = join(tempDir, "migrations.mjs");
const syncOutput = join(tempDir, "sync.mjs");
const dbOutput = join(tempDir, "db.mjs");

globalThis.window = { crypto: globalThis.crypto };

try {
  await build({
    entryPoints: [join(repoRoot, "extension/src/migrations.ts")],
    outfile: migrationsOutput,
    bundle: true,
    platform: "browser",
    format: "esm",
    define: {
      "import.meta.env": "{}"
    },
    logLevel: "silent"
  });
  await build({
    entryPoints: [join(repoRoot, "extension/src/sync.ts")],
    outfile: syncOutput,
    bundle: true,
    platform: "browser",
    format: "esm",
    define: {
      "import.meta.env": "{}"
    },
    logLevel: "silent"
  });
  await build({
    entryPoints: [join(repoRoot, "extension/src/db.ts")],
    outfile: dbOutput,
    bundle: true,
    platform: "browser",
    format: "esm",
    define: {
      "import.meta.env": "{}"
    },
    logLevel: "silent"
  });

  const { createStateBackup, migrateState, stateSchemaVersion } = await import(pathToFileURL(migrationsOutput).href);
  const { markPulled, mergeRemote, normalizeState, prepareCloudState } = await import(pathToFileURL(syncOutput).href);
  const { accountScopedKey } = await import(pathToFileURL(dbOutput).href);
  const now = new Date("2026-07-15T00:00:00.000Z").toISOString();
  const legacyState = {
    version: 1,
    updatedAt: now,
    shortcuts: [{ id: "s1", title: "OpenAI", url: "https://openai.com", iconColor: "#14B8A6", pinned: true, order: 0, updatedAt: now }],
    shortcutFolders: [{ id: "folder1", name: "工作资料", groupId: "default", order: 0, updatedAt: now }],
    shortcutGroups: [{ id: "default", name: "常用", color: "#14B8A6", order: 0, updatedAt: now }],
    todos: [{ id: "todo1", text: "保留任务", done: false, order: 0, updatedAt: now }],
    notes: [{ id: "note1", title: "保留笔记", body: "重要数据", updatedAt: now }],
    countdowns: [{ id: "countdown1", title: "项目上线", date: "2026-12-31", updatedAt: now }],
    settings: {
      theme: "dark",
      glass: 42,
      iconSize: 64,
      gridDensity: "comfortable",
      dockPosition: "bottom",
      city: "Shanghai",
      widgets: { weather: true },
      widgetOrder: ["notes", "weather", "calendar"],
      widgetSizes: { notes: "wide", weather: "medium" },
      updatedAt: now
    },
    sync: { deviceId: "device-1", autoSync: true, intervalSeconds: 60 }
  };

  const migrated = migrateState(legacyState);
  assert.equal(migrated.migrated, true, "legacy state should be marked as migrated");
  assert.equal(migrated.state.shortcuts[0].title, "OpenAI", "shortcut data must be preserved");
  assert.equal(migrated.state.todos[0].text, "保留任务", "todo data must be preserved");
  assert.equal(migrated.state.notes[0].body, "重要数据", "note data must be preserved");
  assert.equal(migrated.state.shortcutFolders[0].name, "工作资料", "folder data must be preserved");
  assert.equal(migrated.state.countdowns[0].title, "项目上线", "countdown data must be preserved");
  assert.equal(migrated.backup?.state.notes[0].body, "重要数据", "backup must preserve original state");
  assert.equal(stateSchemaVersion(migrated.state), 1, "schema version should remain supported");

  const backup = createStateBackup("测试备份", legacyState, "user-1");
  assert.equal(backup.state.shortcuts[0].url, "https://openai.com", "manual backup must preserve shortcuts");
  assert.equal(backup.ownerId, "user-1", "migration backups must retain their account owner");
  assert.notEqual(accountScopedKey("sync-restore-point", "user-1"), accountScopedKey("sync-restore-point", "user-2"), "restore points must be account scoped");
  assert.notEqual(accountScopedKey("migration-backup", "user-1"), accountScopedKey("migration-backup"), "signed-in and anonymous backups must not share a key");

  const current = migrateState({ ...migrated.state, clientVersion: "0.5.5" });
  assert.equal(current.migrated, false, "current state should not create another migration");

  const invalid = migrateState({ bad: true });
  assert.equal(invalid.state.version, 1, "invalid state should recover to a valid default state");

  const oldDefaultVisual = normalizeState({
    ...legacyState,
    settings: { ...legacyState.settings, iconSize: 64, visualRefreshVersion: 7 }
  });
  assert.equal(oldDefaultVisual.settings.iconSize, 58, "old default icon size should migrate to the new unified default");
  assert.equal(oldDefaultVisual.settings.visualRefreshVersion, 10, "visual refresh version should advance");
  assert.deepEqual(oldDefaultVisual.settings.customNavPages, [], "legacy state should receive an empty custom page list");
  assert.deepEqual(oldDefaultVisual.settings.hiddenNavPages, [], "legacy state should keep all built-in pages visible");
  assert.equal(oldDefaultVisual.settings.navigationDisplay, "always", "legacy state should receive a visible desktop navigation");
  assert.equal(oldDefaultVisual.settings.navigationSide, "left", "legacy state should keep desktop navigation on the left");
  assert.equal(oldDefaultVisual.settings.widgetOrder[0], "notes", "custom widget order must be preserved");
  assert.equal(oldDefaultVisual.settings.widgetSizes.notes, "wide", "custom widget size must be preserved");

  const customIconSize = normalizeState({
    ...legacyState,
    settings: { ...legacyState.settings, iconSize: 72, visualRefreshVersion: 7 }
  });
  assert.equal(customIconSize.settings.iconSize, 72, "custom icon size should be preserved");

  const customNavigation = normalizeState({
    ...legacyState,
    settings: {
      ...legacyState.settings,
      visualRefreshVersion: 9,
      customNavPages: [
        { id: "page-work", name: "工作", groupId: "default", icon: "briefcase", order: 0, updatedAt: now }
      ],
      hiddenNavPages: ["tools"],
      navigationDisplay: "auto",
      navigationSide: "right"
    }
  });
  assert.equal(customNavigation.settings.customNavPages[0].name, "工作", "custom navigation pages must be preserved");
  assert.deepEqual(customNavigation.settings.hiddenNavPages, ["tools"], "hidden built-in pages must be preserved");
  assert.equal(customNavigation.settings.navigationDisplay, "auto", "custom navigation visibility must be preserved");
  assert.equal(customNavigation.settings.navigationSide, "right", "custom navigation side must be preserved");
  assert.equal(customNavigation.shortcuts[0].title, "OpenAI", "navigation migration must not alter shortcuts");
  assert.equal(customNavigation.notes[0].body, "重要数据", "navigation migration must not alter notes");

  const localMediaState = normalizeState({
    ...legacyState,
    shortcuts: [{ ...legacyState.shortcuts[0], iconUrl: "data:image/png;base64,private-shortcut-icon" }],
    shortcutFolders: [{ ...legacyState.shortcutFolders[0], iconUrl: "data:image/png;base64,private-folder-icon" }],
    settings: {
      ...legacyState.settings,
      photoFrameImage: "data:image/webp;base64,private-photo",
      photoFrameTitle: "private-photo-filename",
      wallpaper: "data:image/webp;base64,private-wallpaper",
      wallpaperPreset: "custom-private",
      wallpaperCollection: ["aurora-lake", "custom-private"],
      customWallpapers: [{ id: "custom-private", name: "私人壁纸", dataUrl: "data:image/webp;base64,private-wallpaper", createdAt: now }]
    }
  });
  const cloudState = prepareCloudState(localMediaState);
  assert.equal(cloudState.settings.photoFrameImage, undefined, "private photos must remain local-only");
  assert.equal(cloudState.settings.photoFrameTitle, undefined, "private photo filenames must remain local-only");
  assert.equal(cloudState.shortcuts[0].iconUrl, undefined, "inline shortcut icons must remain local-only");
  assert.equal(cloudState.shortcutFolders[0].iconUrl, undefined, "inline folder icons must remain local-only");
  assert.deepEqual(cloudState.settings.customWallpapers, [], "custom wallpaper payloads must remain local-only");
  assert.equal(cloudState.settings.wallpaper, undefined, "inline wallpaper data must not be uploaded");
  assert.deepEqual(cloudState.settings.wallpaperCollection, ["aurora-lake"], "cloud wallpaper collection must exclude local assets");
  assert.equal(cloudState.settings.supabaseUrl, undefined, "service URLs must not be stored in user snapshots");
  assert.equal(cloudState.settings.supabaseAnonKey, undefined, "public client configuration must not be stored in user snapshots");

  const mergedWithRemote = mergeRemote(localMediaState, normalizeState({
    ...legacyState,
    updatedAt: new Date("2026-07-16T00:00:00.000Z").toISOString(),
    settings: { ...legacyState.settings, updatedAt: new Date("2026-07-16T00:00:00.000Z").toISOString() },
    sync: { ...legacyState.sync, remoteRevision: 7 }
  }));
  assert.equal(mergedWithRemote.settings.photoFrameImage, localMediaState.settings.photoFrameImage, "remote merges must preserve local photos");
  assert.equal(mergedWithRemote.settings.photoFrameTitle, localMediaState.settings.photoFrameTitle, "remote merges must preserve local photo titles");
  assert.equal(mergedWithRemote.settings.customWallpapers?.[0]?.id, "custom-private", "remote merges must preserve local wallpapers");
  assert.equal(mergedWithRemote.shortcuts[0].iconUrl, localMediaState.shortcuts[0].iconUrl, "remote merges must preserve local shortcut icons");
  assert.equal(mergedWithRemote.shortcutFolders[0].iconUrl, localMediaState.shortcutFolders[0].iconUrl, "remote merges must preserve local folder icons");
  assert.equal(mergedWithRemote.sync.remoteRevision, 7, "remote revision must survive merges");

  const pulled = markPulled(localMediaState, { ...mergedWithRemote, sync: { ...mergedWithRemote.sync, remoteRevision: 9 } });
  assert.equal(pulled.sync.remoteRevision, 9, "pull metadata must retain the server revision");

  const deviceA = normalizeState({
    ...legacyState,
    shortcuts: [
      legacyState.shortcuts[0],
      { id: "device-a", title: "设备 A", url: "https://a.example", iconColor: "#14B8A6", pinned: false, order: 1, updatedAt: "2026-07-16T01:00:00.000Z" }
    ],
    updatedAt: "2026-07-16T01:00:00.000Z",
    sync: { ...legacyState.sync, remoteRevision: 10 }
  });
  const deviceB = normalizeState({
    ...legacyState,
    shortcuts: [
      legacyState.shortcuts[0],
      { id: "device-b", title: "设备 B", url: "https://b.example", iconColor: "#14B8A6", pinned: false, order: 2, updatedAt: "2026-07-16T02:00:00.000Z" }
    ],
    updatedAt: "2026-07-16T02:00:00.000Z",
    sync: { ...legacyState.sync, remoteRevision: 11 }
  });
  const concurrentMerge = mergeRemote(deviceA, deviceB);
  assert.deepEqual(
    concurrentMerge.shortcuts.map((shortcut) => shortcut.id).sort(),
    ["device-a", "device-b", "s1"],
    "concurrent writes on different records must merge without dropping either device"
  );
  assert.equal(concurrentMerge.sync.remoteRevision, 11, "concurrent merge must retain the newest server revision");

  const hardeningMigration = await readFile(join(repoRoot, "supabase/migrations/0006_harden_sync_boundaries.sql"), "utf8");
  assert.match(hardeningMigration, /p_name is distinct from 'primary'/, "sync RPC must reject unbounded snapshot names");
  assert.match(hardeningMigration, /current_user_id uuid := auth\.uid\(\)/, "sync RPC must bind writes to the authenticated user");
  assert.match(hardeningMigration, /revision = p_expected_revision/, "sync RPC must use optimistic revision checks");
  assert.match(hardeningMigration, /2097152/, "sync RPC must enforce a payload size limit");
  assert.match(hardeningMigration, /revoke all[\s\S]*public\.shortcut_groups/, "legacy direct access must remain disabled");

  const extensionManifest = JSON.parse(await readFile(join(repoRoot, "extension/public/manifest.json"), "utf8"));
  assert.equal(extensionManifest.permissions.includes("storage"), false, "unused extension storage permission must not be requested");
  assert.equal(extensionManifest.permissions.includes("alarms"), false, "unused extension alarms permission must not be requested");
  const webManifest = JSON.parse(await readFile(join(repoRoot, "extension/public/app.webmanifest"), "utf8"));
  assert.equal(webManifest.icons.some((icon) => icon.sizes === "192x192"), true, "PWA must provide a 192px install icon");
  assert.equal(webManifest.icons.some((icon) => icon.sizes === "512x512"), true, "PWA must provide a 512px install icon");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

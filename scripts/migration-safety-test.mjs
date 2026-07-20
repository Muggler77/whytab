import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = new URL("..", import.meta.url).pathname;
const tempDir = await mkdtemp(join(tmpdir(), "whytab-migration-test-"));
const migrationsOutput = join(tempDir, "migrations.mjs");
const syncOutput = join(tempDir, "sync.mjs");

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

  const { createStateBackup, migrateState, stateSchemaVersion } = await import(pathToFileURL(migrationsOutput).href);
  const { normalizeState } = await import(pathToFileURL(syncOutput).href);
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

  const backup = createStateBackup("测试备份", legacyState);
  assert.equal(backup.state.shortcuts[0].url, "https://openai.com", "manual backup must preserve shortcuts");

  const current = migrateState({ ...migrated.state, clientVersion: "0.4.0" });
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
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from "./projectConfig";
import { defaultWidgetSizes } from "./defaultState";
import type { AppState, Countdown, Note, Settings, Shortcut, ShortcutFolder, ShortcutGroup, Todo, WidgetKey } from "./types";
import { compareVersions } from "./updates";
import { APP_VERSION, DATA_SCHEMA_VERSION, MIN_SUPPORTED_APP_VERSION } from "./version";

export type SyncStatus = {
  user?: User | null;
  message: string;
  syncing: boolean;
  lastSyncedAt?: string;
  autoSync?: boolean;
};

let supabaseModulePromise: Promise<typeof import("@supabase/supabase-js")> | undefined;
const clientPromises = new Map<string, Promise<SupabaseClient>>();

export async function getSupabase(url?: string, anonKey?: string) {
  if (!url || !anonKey) return undefined;
  const key = `${url}::${anonKey}`;
  const existing = clientPromises.get(key);
  if (existing) return existing;
  const pending = (async () => {
    supabaseModulePromise ||= import("@supabase/supabase-js");
    const { createClient } = await supabaseModulePromise;
    return createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
  })();
  clientPromises.set(key, pending);
  return pending;
}

export async function getUser(url?: string, anonKey?: string) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getCachedUser(url?: string, anonKey?: string) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user || null;
}

export async function signIn(url: string, anonKey: string, email: string, password: string) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) throw result.error;
  return result.data.user;
}

export async function signUp(url: string, anonKey: string, email: string, password: string, emailRedirectTo?: string) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  const result = await supabase.auth.signUp({
    email,
    password,
    options: emailRedirectTo ? { emailRedirectTo } : undefined
  });
  if (result.error) throw result.error;
  return result.data as { user: User | null; session: Session | null };
}

export async function signOut(url?: string, anonKey?: string) {
  const supabase = await getSupabase(url, anonKey);
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  }
}

export async function requestPasswordReset(url: string, anonKey: string, email: string, redirectTo?: string) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("同步服务暂未配置，请稍后再试");
  const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
}

export async function updatePassword(url: string, anonKey: string, password: string) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("同步服务暂未配置，请稍后再试");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function deleteAccount(url: string, anonKey: string) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("同步服务暂未配置，请稍后再试");
  const { error } = await supabase.functions.invoke("delete-account", {
    method: "POST"
  });
  if (error) throw error;
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
}

export class SyncConflictError extends Error {
  constructor() {
    super("云端数据刚刚发生变化，正在重新合并");
    this.name = "SyncConflictError";
  }
}

const isLocalImage = (value?: string) => Boolean(value?.startsWith("data:") || value?.startsWith("blob:"));
const MAX_CLOUD_SNAPSHOT_BYTES = 2 * 1024 * 1024;

export function prepareCloudState(state: AppState): AppState {
  const normalized = normalizeState(state);
  const customIds = new Set((normalized.settings.customWallpapers || []).map((item) => item.id));
  const fieldUpdatedAt = { ...(normalized.settings.fieldUpdatedAt || {}) };
  ["photoFrameImage", "photoFrameTitle", "customWallpapers", "supabaseUrl", "supabaseAnonKey"].forEach((key) => {
    delete fieldUpdatedAt[key];
  });
  if (isLocalImage(normalized.settings.wallpaper)) delete fieldUpdatedAt.wallpaper;
  return {
    ...normalized,
    shortcuts: normalized.shortcuts.map((shortcut) => (
      isLocalImage(shortcut.iconUrl) ? { ...shortcut, iconUrl: undefined } : shortcut
    )),
    shortcutFolders: normalized.shortcutFolders.map((folder) => (
      isLocalImage(folder.iconUrl) ? { ...folder, iconUrl: undefined } : folder
    )),
    settings: {
      ...normalized.settings,
      photoFrameImage: undefined,
      photoFrameTitle: undefined,
      customWallpapers: [],
      wallpaper: isLocalImage(normalized.settings.wallpaper) ? undefined : normalized.settings.wallpaper,
      wallpaperPreset: customIds.has(normalized.settings.wallpaperPreset || "") ? "aurora-lake" : normalized.settings.wallpaperPreset,
      wallpaperCollection: (normalized.settings.wallpaperCollection || []).filter((id) => !customIds.has(id)),
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      fieldUpdatedAt
    }
  };
}

export async function pushSnapshot(state: AppState): Promise<number> {
  const supabase = await getSupabase(state.settings.supabaseUrl, state.settings.supabaseAnonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("请先登录");

  const payload = prepareCloudState(state);
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (payloadBytes > MAX_CLOUD_SNAPSHOT_BYTES) {
    throw new Error("同步数据超过 2 MB，请删除部分较大的文字内容后重试");
  }

  const { data, error } = await supabase.rpc("push_sync_snapshot", {
    p_name: "primary",
    p_payload: payload,
    p_expected_revision: state.sync?.remoteRevision || 0
  });
  if (error) throw error;
  const result = (Array.isArray(data) ? data[0] : data) as { applied?: boolean; next_revision?: number } | null;
  if (!result?.applied) throw new SyncConflictError();
  return Number(result.next_revision || 1);
}

export async function pullSnapshot(state: AppState): Promise<AppState | undefined> {
  const supabase = await getSupabase(state.settings.supabaseUrl, state.settings.supabaseAnonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("请先登录");

  const { data, error } = await supabase
    .from("sync_snapshots")
    .select("payload, updated_at, revision")
    .eq("user_id", userData.user.id)
    .eq("name", "primary")
    .maybeSingle();
  if (error) throw error;
  const payload = data?.payload as AppState | undefined;
  if (!payload) return undefined;
  ensureRemoteCompatible(payload);
  return {
    ...payload,
    sync: {
      ...payload.sync,
      remoteRevision: Number(data?.revision || 0),
      lastRemoteUpdatedAt: data?.updated_at || payload.sync?.lastRemoteUpdatedAt
    }
  };
}

type SyncRecord = {
  id: string;
  updatedAt: string;
  deletedAt?: string;
};


const starterShortcutUrls = new Set(["https://www.google.com", "https://www.youtube.com"]);

const stripStarterShortcuts = (shortcuts: Shortcut[]) => {
  return shortcuts.filter((shortcut) => {
    const normalizedUrl = shortcut.url.replace(/\/$/, "");
    const isStarter = starterShortcutUrls.has(normalizedUrl)
      && shortcut.groupId === "default"
      && (shortcut.title === "Google" || shortcut.title === "YouTube");
    return !isStarter;
  });
};

const defaultWidgetOrder: WidgetKey[] = ["weather", "calendar", "todos", "countdowns", "focus", "notes", "rates", "quote", "clock", "memo", "year", "calculator"];

const defaultWidgets: Record<WidgetKey, boolean> = {
  weather: true,
  calendar: true,
  countdowns: true,
  todos: true,
  notes: true,
  rates: true,
  quote: true,
  focus: true,
  clock: false,
  memo: false,
  year: false,
  calculator: false
};

const normalizeWidgetOrder = (order?: WidgetKey[]) => {
  const valid = new Set(defaultWidgetOrder);
  const result = (order || []).filter((key, index, list) => valid.has(key) && list.indexOf(key) === index);
  defaultWidgetOrder.forEach((key) => {
    if (!result.includes(key)) result.push(key);
  });
  return result;
};

const time = (value?: string) => (value ? new Date(value).getTime() || 0 : 0);
const settingsMetadataKeys = new Set(["fieldUpdatedAt", "updatedAt"]);
const nestedRecordSettingKeys = new Set(["widgets", "widgetSizes", "calendarRecords"]);
const settingsKeys = (settings: Settings) => Object.keys(settings).filter((key) => !settingsMetadataKeys.has(key));
const settingRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

const normalizeSettingsFieldUpdatedAt = (settings: Settings, fallback: string) => {
  const current = settings.fieldUpdatedAt || {};
  return {
    ...current,
    ...Object.fromEntries(settingsKeys(settings).map((key) => [key, current[key] || fallback]))
  };
};

export function stampSettingsChanges(current: Settings, next: Settings, updatedAt: string): Settings {
  const keys = new Set([...settingsKeys(current), ...settingsKeys(next)]);
  const fieldUpdatedAt = { ...(current.fieldUpdatedAt || {}), ...(next.fieldUpdatedAt || {}) };
  let changed = false;

  keys.forEach((key) => {
    if (nestedRecordSettingKeys.has(key)) {
      const currentRecord = settingRecord((current as unknown as Record<string, unknown>)[key]);
      const nextRecord = settingRecord((next as unknown as Record<string, unknown>)[key]);
      const childKeys = new Set([...Object.keys(currentRecord), ...Object.keys(nextRecord)]);
      let nestedChanged = false;
      childKeys.forEach((childKey) => {
        if (Object.is(currentRecord[childKey], nextRecord[childKey])) return;
        fieldUpdatedAt[`${key}.${childKey}`] = updatedAt;
        nestedChanged = true;
      });
      if (nestedChanged) {
        changed = true;
      }
      return;
    }
    if (Object.is(current[key as keyof Settings], next[key as keyof Settings])) return;
    fieldUpdatedAt[key] = updatedAt;
    changed = true;
  });

  if (!changed) return { ...next, fieldUpdatedAt };
  return { ...next, fieldUpdatedAt, updatedAt };
}

const mergeSettings = (local: Settings, remote: Settings): Settings => {
  const localFieldUpdatedAt = normalizeSettingsFieldUpdatedAt(local, local.updatedAt || "");
  const remoteFieldUpdatedAt = normalizeSettingsFieldUpdatedAt(remote, remote.updatedAt || "");
  const keys = new Set([...settingsKeys(local), ...settingsKeys(remote)]);
  const merged = { ...local } as Settings;
  const fieldUpdatedAt: Record<string, string> = {};

  keys.forEach((key) => {
    const localClock = localFieldUpdatedAt[key] || "";
    const remoteClock = remoteFieldUpdatedAt[key] || "";
    if (nestedRecordSettingKeys.has(key)) {
      const localRecord = settingRecord((local as unknown as Record<string, unknown>)[key]);
      const remoteRecord = settingRecord((remote as unknown as Record<string, unknown>)[key]);
      const childKeys = new Set([...Object.keys(localRecord), ...Object.keys(remoteRecord)]);
      const mergedRecord: Record<string, unknown> = {};
      childKeys.forEach((childKey) => {
        const path = `${key}.${childKey}`;
        const localChildClock = localFieldUpdatedAt[path] || localClock;
        const remoteChildClock = remoteFieldUpdatedAt[path] || remoteClock;
        const useRemoteChild = time(remoteChildClock) >= time(localChildClock);
        const value = useRemoteChild ? remoteRecord[childKey] : localRecord[childKey];
        if (value !== undefined) mergedRecord[childKey] = value;
        fieldUpdatedAt[path] = useRemoteChild ? remoteChildClock : localChildClock;
      });
      (merged as unknown as Record<string, unknown>)[key] = mergedRecord;
      fieldUpdatedAt[key] = time(remoteClock) >= time(localClock) ? remoteClock : localClock;
      return;
    }
    if (key === "customNavPages") {
      const pages = new Map<string, NonNullable<Settings["customNavPages"]>[number]>();
      [...(local.customNavPages || []), ...(remote.customNavPages || [])].forEach((page) => {
        const current = pages.get(page.id);
        if (!current || time(page.deletedAt || page.updatedAt) >= time(current.deletedAt || current.updatedAt)) {
          pages.set(page.id, page);
        }
      });
      merged.customNavPages = [...pages.values()].sort((left, right) => left.order - right.order);
      fieldUpdatedAt[key] = time(remoteClock) >= time(localClock) ? remoteClock : localClock;
      return;
    }
    const useRemote = time(remoteClock) >= time(localClock);
    (merged as Record<string, unknown>)[key] = useRemote
      ? (remote as unknown as Record<string, unknown>)[key]
      : (local as unknown as Record<string, unknown>)[key];
    fieldUpdatedAt[key] = useRemote ? remoteClock : localClock;
  });

  return {
    ...merged,
    fieldUpdatedAt,
    updatedAt: time(remote.updatedAt) >= time(local.updatedAt) ? remote.updatedAt : local.updatedAt
  };
};

const stripRecordClocks = <T extends SyncRecord>(record: T) => {
  const { updatedAt: _updatedAt, deletedAt: _deletedAt, ...content } = record;
  return content;
};

const recordContentChanged = <T extends SyncRecord>(left: T, right: T) => (
  JSON.stringify(stripRecordClocks(left)) !== JSON.stringify(stripRecordClocks(right))
  || Boolean(left.deletedAt) !== Boolean(right.deletedAt)
);

const stampRecordSet = <T extends SyncRecord>(current: T[], target: T[], updatedAt: string) => {
  const currentById = new Map(current.map((record) => [record.id, record]));
  const targetIds = new Set(target.map((record) => record.id));
  const stamped = target.map((record) => {
    const previous = currentById.get(record.id);
    if (previous && !recordContentChanged(previous, record)) return record;
    return {
      ...record,
      updatedAt,
      deletedAt: record.deletedAt ? updatedAt : undefined
    };
  });

  current.forEach((record) => {
    if (!targetIds.has(record.id)) {
      stamped.push({
        ...record,
        updatedAt,
        deletedAt: updatedAt
      });
    }
  });
  return stamped;
};

export function stampStateSnapshot(current: AppState, target: AppState, updatedAt: string): AppState {
  const settings = stampSettingsChanges(current.settings, target.settings, updatedAt);
  settings.customNavPages = stampRecordSet(
    current.settings.customNavPages || [],
    target.settings.customNavPages || [],
    updatedAt
  );
  settings.fieldUpdatedAt = {
    ...(settings.fieldUpdatedAt || {}),
    customNavPages: updatedAt
  };

  return {
    ...target,
    shortcutGroups: stampRecordSet(current.shortcutGroups, target.shortcutGroups, updatedAt),
    shortcutFolders: stampRecordSet(current.shortcutFolders || [], target.shortcutFolders || [], updatedAt),
    shortcuts: stampRecordSet(current.shortcuts, target.shortcuts, updatedAt),
    todos: stampRecordSet(current.todos, target.todos, updatedAt),
    notes: stampRecordSet(current.notes, target.notes, updatedAt),
    countdowns: stampRecordSet(current.countdowns, target.countdowns, updatedAt),
    settings,
    updatedAt
  };
}

const schemaVersion = (state?: Partial<AppState>) => state?.dataSchemaVersion || state?.version || 1;

function ensureRemoteCompatible(remote: AppState) {
  if (schemaVersion(remote) > DATA_SCHEMA_VERSION) {
    throw new Error("云端数据来自更新版本，请先升级 whytab 再同步");
  }
  if (remote.minimumClientVersion && compareVersions(APP_VERSION, remote.minimumClientVersion) < 0) {
    throw new Error("当前版本过旧，请先升级 whytab 再同步");
  }
}

const mergeRecords = <T extends SyncRecord>(local: T[], remote: T[]) => {
  const map = new Map<string, T>();
  [...local, ...remote].forEach((record) => {
    const current = map.get(record.id);
    if (!current) {
      map.set(record.id, record);
      return;
    }
    const latest = time(record.deletedAt || record.updatedAt) >= time(current.deletedAt || current.updatedAt) ? record : current;
    map.set(record.id, latest);
  });
  return [...map.values()].sort((a, b) => {
    const orderA = "order" in a && typeof a.order === "number" ? a.order : 0;
    const orderB = "order" in b && typeof b.order === "number" ? b.order : 0;
    return orderA - orderB;
  });
};

const mergeNotes = (local: Note[], remote: Note[]) => {
  const map = new Map<string, Note>();
  [...local, ...remote].forEach((note) => {
    const current = map.get(note.id);
    if (!current) {
      map.set(note.id, note);
      return;
    }

    const noteClock = time(note.deletedAt || note.updatedAt);
    const currentClock = time(current.deletedAt || current.updatedAt);
    const latest = noteClock >= currentClock ? note : current;
    const older = latest === note ? current : note;

    if (!latest.deletedAt && !older.deletedAt && latest.body !== older.body && !latest.conflictBody) {
      map.set(latest.id, { ...latest, conflictBody: older.body });
      return;
    }
    map.set(latest.id, latest);
  });
  return [...map.values()].sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
};

const preserveLocalIcons = <T extends { id: string; iconUrl?: string }>(merged: T[], local: T[]) => {
  const localIcons = new Map(
    local
      .filter((record) => isLocalImage(record.iconUrl))
      .map((record) => [record.id, record.iconUrl] as const)
  );
  return merged.map((record) => {
    const iconUrl = localIcons.get(record.id);
    return iconUrl ? { ...record, iconUrl } : record;
  });
};

export function normalizeState(state: AppState): AppState {
  const updatedAt = state.updatedAt || new Date().toISOString();
  const visualVersion = state.settings.visualRefreshVersion || 0;
  const normalizedWidgets = { ...defaultWidgets, ...(state.settings.widgets || {}) };
  const normalizedWidgetSizes = { ...defaultWidgetSizes, ...(state.settings.widgetSizes || {}) };
  if (visualVersion < 6) {
    (["clock", "memo", "year", "calculator"] as WidgetKey[]).forEach((key) => {
      normalizedWidgets[key] = false;
    });
  }
  const settings: Settings = {
    ...state.settings,
    wallpaper: visualVersion < 5 ? undefined : state.settings.wallpaper,
    wallpaperPreset: visualVersion < 5 ? "aurora-lake" : state.settings.wallpaperPreset || "aurora-lake",
    wallpaperRotation: visualVersion < 5 ? false : state.settings.wallpaperRotation ?? false,
    visualRefreshVersion: 10,
    iconSize: visualVersion < 8 && state.settings.iconSize === 64 ? 58 : state.settings.iconSize || 58,
    glass: Math.min(state.settings.glass || 42, 46),
    customWallpapers: state.settings.customWallpapers || [],
    wallpaperCollection: state.settings.wallpaperCollection || ["coastal-glass", "neon-rain", "aurora-lake", "ocean-cliff"],
    quickNote: state.settings.quickNote || "",
    iconPresentation: state.settings.iconPresentation || "original",
    widgets: normalizedWidgets,
    widgetOrder: normalizeWidgetOrder(state.settings.widgetOrder),
    widgetSizes: normalizedWidgetSizes,
    customNavPages: (state.settings.customNavPages || []).filter((page, index, pages) => (
      Boolean(page?.id && page.name?.trim() && page.groupId)
      && pages.findIndex((candidate) => candidate.id === page.id) === index
    )),
    hiddenNavPages: Array.from(new Set((state.settings.hiddenNavPages || []).filter((page) => page === "shortcuts" || page === "tools"))),
    navigationDisplay: state.settings.navigationDisplay === "auto" || state.settings.navigationDisplay === "hidden"
      ? state.settings.navigationDisplay
      : "always",
    navigationSide: state.settings.navigationSide === "right" ? "right" : "left",
    remoteIconLookup: state.settings.remoteIconLookup ?? true,
    timeZone: state.settings.timeZone || "Asia/Shanghai",
    dateTimeColor: state.settings.dateTimeColor || "#ffffff",
    widgetAccentColor: state.settings.widgetAccentColor || "#2dd4bf",
    weatherUseLocation: visualVersion < 7 ? true : state.settings.weatherUseLocation ?? true,
    searchEngine: state.settings.searchEngine || "baidu",
    calendarRecords: state.settings.calendarRecords || {},
    supabaseUrl: state.settings.supabaseUrl || DEFAULT_SUPABASE_URL,
    supabaseAnonKey: state.settings.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY,
    updatedAt: state.settings.updatedAt || updatedAt
  };
  settings.fieldUpdatedAt = normalizeSettingsFieldUpdatedAt(settings, settings.updatedAt || updatedAt);

  return {
    ...state,
    version: 1,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    clientVersion: APP_VERSION,
    minimumClientVersion: MIN_SUPPORTED_APP_VERSION,
    updatedAt,
    shortcuts: stripStarterShortcuts(state.shortcuts || []),
    shortcutFolders: state.shortcutFolders || [],
    shortcutGroups: state.shortcutGroups || [],
    todos: state.todos || [],
    notes: state.notes || [],
    countdowns: state.countdowns || [],
    settings,
    sync: {
      deviceId: state.sync?.deviceId || crypto.randomUUID(),
      autoSync: state.sync?.autoSync ?? true,
      intervalSeconds: Math.max(30, state.sync?.intervalSeconds || 60),
      lastPulledAt: state.sync?.lastPulledAt,
      lastPushedAt: state.sync?.lastPushedAt,
      lastRemoteUpdatedAt: state.sync?.lastRemoteUpdatedAt,
      remoteRevision: Math.max(0, state.sync?.remoteRevision || 0)
    }
  };
}

export function mergeRemote(local: AppState, remote?: AppState): AppState {
  const normalizedLocal = normalizeState(local);
  if (!remote) return normalizedLocal;

  ensureRemoteCompatible(remote);
  const normalizedRemote = normalizeState(remote);
  const settings = mergeSettings(normalizedLocal.settings, normalizedRemote.settings);
  const mergedFolders = preserveLocalIcons(
    mergeRecords<ShortcutFolder>(normalizedLocal.shortcutFolders, normalizedRemote.shortcutFolders),
    normalizedLocal.shortcutFolders
  );
  const mergedShortcuts = preserveLocalIcons(
    mergeRecords<Shortcut>(normalizedLocal.shortcuts, normalizedRemote.shortcuts),
    normalizedLocal.shortcuts
  );
  const merged: AppState = {
    version: 1,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    clientVersion: APP_VERSION,
    minimumClientVersion: MIN_SUPPORTED_APP_VERSION,
    shortcutGroups: mergeRecords<ShortcutGroup>(normalizedLocal.shortcutGroups, normalizedRemote.shortcutGroups),
    shortcutFolders: mergedFolders,
    shortcuts: mergedShortcuts,
    todos: mergeRecords<Todo>(normalizedLocal.todos, normalizedRemote.todos),
    notes: mergeNotes(normalizedLocal.notes, normalizedRemote.notes),
    countdowns: mergeRecords<Countdown>(normalizedLocal.countdowns, normalizedRemote.countdowns),
    settings: {
      ...settings,
      photoFrameImage: normalizedLocal.settings.photoFrameImage,
      photoFrameTitle: normalizedLocal.settings.photoFrameTitle,
      customWallpapers: normalizedLocal.settings.customWallpapers || [],
      wallpaper: isLocalImage(normalizedLocal.settings.wallpaper) ? normalizedLocal.settings.wallpaper : settings.wallpaper,
      wallpaperPreset: (normalizedLocal.settings.customWallpapers || []).some((item) => item.id === normalizedLocal.settings.wallpaperPreset)
        ? normalizedLocal.settings.wallpaperPreset
        : settings.wallpaperPreset,
      wallpaperCollection: Array.from(new Set([
        ...(settings.wallpaperCollection || []),
        ...(normalizedLocal.settings.customWallpapers || []).map((item) => item.id)
      ])),
      supabaseUrl: normalizedLocal.settings.supabaseUrl || normalizedRemote.settings.supabaseUrl,
      supabaseAnonKey: normalizedLocal.settings.supabaseAnonKey || normalizedRemote.settings.supabaseAnonKey
    },
    sync: {
      ...normalizedLocal.sync,
      lastPulledAt: new Date().toISOString(),
      lastRemoteUpdatedAt: normalizedRemote.updatedAt,
      remoteRevision: normalizedRemote.sync?.remoteRevision || normalizedLocal.sync?.remoteRevision || 0
    },
    updatedAt: new Date(Math.max(time(normalizedLocal.updatedAt), time(normalizedRemote.updatedAt))).toISOString()
  };
  return merged;
}

export function markPulled(state: AppState, remote?: AppState): AppState {
  const normalized = normalizeState(state);
  return {
    ...normalized,
    sync: {
      ...normalized.sync,
      lastPulledAt: new Date().toISOString(),
      lastRemoteUpdatedAt: remote?.updatedAt || normalized.sync.lastRemoteUpdatedAt,
      remoteRevision: remote?.sync?.remoteRevision ?? normalized.sync.remoteRevision
    }
  };
}

export function markPushed(state: AppState, remoteRevision = state.sync?.remoteRevision || 0): AppState {
  const normalized = normalizeState(state);
  return {
    ...normalized,
    sync: {
      ...normalized.sync,
      lastPushedAt: new Date().toISOString(),
      lastRemoteUpdatedAt: normalized.updatedAt,
      remoteRevision
    }
  };
}

export async function synchronizeSnapshot(state: AppState, attempts = 3): Promise<AppState> {
  let candidate = state;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remote = await pullSnapshot(candidate);
    candidate = mergeRemote(candidate, remote);
    try {
      const revision = await pushSnapshot(candidate);
      return markPushed(candidate, revision);
    } catch (error) {
      if (!(error instanceof SyncConflictError) || attempt === attempts - 1) throw error;
    }
  }
  throw new Error("同步重试次数已用尽");
}

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from "./projectConfig";
import { defaultWidgetSizes } from "./defaultState";
import type { AppState, Countdown, Note, Shortcut, ShortcutFolder, ShortcutGroup, Todo, WidgetKey } from "./types";

export type SyncStatus = {
  user?: User | null;
  message: string;
  syncing: boolean;
  lastSyncedAt?: string;
  autoSync?: boolean;
};

let client: SupabaseClient | undefined;
let clientKey = "";

export function getSupabase(url?: string, anonKey?: string) {
  if (!url || !anonKey) return undefined;
  const key = `${url}::${anonKey}`;
  if (client && clientKey === key) return client;
  clientKey = key;
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
  return client;
}

export async function getUser(url?: string, anonKey?: string) {
  const supabase = getSupabase(url, anonKey);
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function signIn(url: string, anonKey: string, email: string, password: string) {
  const supabase = getSupabase(url, anonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) throw result.error;
  return result.data.user;
}

export async function signUp(url: string, anonKey: string, email: string, password: string) {
  const supabase = getSupabase(url, anonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  const result = await supabase.auth.signUp({ email, password });
  if (result.error) throw result.error;
  return result.data.user;
}

export async function signOut(url?: string, anonKey?: string) {
  const supabase = getSupabase(url, anonKey);
  if (supabase) await supabase.auth.signOut();
}

export async function pushSnapshot(state: AppState) {
  const supabase = getSupabase(state.settings.supabaseUrl, state.settings.supabaseAnonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("请先登录");

  const { error } = await supabase.from("sync_snapshots").upsert(
    {
      user_id: userData.user.id,
      name: "primary",
      payload: state,
      updated_at: state.updatedAt
    },
    { onConflict: "user_id,name" }
  );
  if (error) throw error;
}

export async function pullSnapshot(state: AppState): Promise<AppState | undefined> {
  const supabase = getSupabase(state.settings.supabaseUrl, state.settings.supabaseAnonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("请先登录");

  const { data, error } = await supabase
    .from("sync_snapshots")
    .select("payload, updated_at")
    .eq("user_id", userData.user.id)
    .eq("name", "primary")
    .maybeSingle();
  if (error) throw error;
  return data?.payload as AppState | undefined;
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

const newer = <T extends { updatedAt?: string }>(left: T, right: T) => {
  return time(left.updatedAt) >= time(right.updatedAt) ? left : right;
};

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
  return {
    ...state,
    version: 1,
    updatedAt,
    shortcuts: stripStarterShortcuts(state.shortcuts || []),
    shortcutFolders: state.shortcutFolders || [],
    shortcutGroups: state.shortcutGroups || [],
    todos: state.todos || [],
    notes: state.notes || [],
    countdowns: state.countdowns || [],
    settings: {
      ...state.settings,
      wallpaper: visualVersion < 5 ? undefined : state.settings.wallpaper,
      wallpaperPreset: visualVersion < 5 ? "aurora-lake" : state.settings.wallpaperPreset || "aurora-lake",
      wallpaperRotation: visualVersion < 5 ? false : state.settings.wallpaperRotation ?? false,
      visualRefreshVersion: 7,
      glass: Math.min(state.settings.glass || 42, 46),
      customWallpapers: state.settings.customWallpapers || [],
      wallpaperCollection: state.settings.wallpaperCollection || ["coastal-glass", "neon-rain", "aurora-lake", "ocean-cliff"],
      quickNote: state.settings.quickNote || "",
      iconPresentation: state.settings.iconPresentation || "original",
      widgets: normalizedWidgets,
      widgetOrder: normalizeWidgetOrder(state.settings.widgetOrder),
      widgetSizes: normalizedWidgetSizes,
      timeZone: state.settings.timeZone || "Asia/Shanghai",
      dateTimeColor: state.settings.dateTimeColor || "#ffffff",
      widgetAccentColor: state.settings.widgetAccentColor || "#2dd4bf",
      weatherUseLocation: visualVersion < 7 ? true : state.settings.weatherUseLocation ?? true,
      searchEngine: state.settings.searchEngine || "baidu",
      calendarRecords: state.settings.calendarRecords || {},
      supabaseUrl: state.settings.supabaseUrl || DEFAULT_SUPABASE_URL,
      supabaseAnonKey: state.settings.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY,
      updatedAt: state.settings.updatedAt || updatedAt
    },
    sync: {
      deviceId: state.sync?.deviceId || crypto.randomUUID(),
      autoSync: state.sync?.autoSync ?? true,
      intervalSeconds: Math.max(30, state.sync?.intervalSeconds || 60),
      lastPulledAt: state.sync?.lastPulledAt,
      lastPushedAt: state.sync?.lastPushedAt,
      lastRemoteUpdatedAt: state.sync?.lastRemoteUpdatedAt
    }
  };
}

export function mergeRemote(local: AppState, remote?: AppState): AppState {
  const normalizedLocal = normalizeState(local);
  if (!remote) return normalizedLocal;

  const normalizedRemote = normalizeState(remote);
  const settings = newer(normalizedLocal.settings, normalizedRemote.settings);
  const merged: AppState = {
    version: 1,
    shortcutGroups: mergeRecords<ShortcutGroup>(normalizedLocal.shortcutGroups, normalizedRemote.shortcutGroups),
    shortcutFolders: mergeRecords<ShortcutFolder>(normalizedLocal.shortcutFolders, normalizedRemote.shortcutFolders),
    shortcuts: mergeRecords<Shortcut>(normalizedLocal.shortcuts, normalizedRemote.shortcuts),
    todos: mergeRecords<Todo>(normalizedLocal.todos, normalizedRemote.todos),
    notes: mergeNotes(normalizedLocal.notes, normalizedRemote.notes),
    countdowns: mergeRecords<Countdown>(normalizedLocal.countdowns, normalizedRemote.countdowns),
    settings: {
      ...settings,
      supabaseUrl: normalizedLocal.settings.supabaseUrl || normalizedRemote.settings.supabaseUrl,
      supabaseAnonKey: normalizedLocal.settings.supabaseAnonKey || normalizedRemote.settings.supabaseAnonKey
    },
    sync: {
      ...normalizedLocal.sync,
      lastPulledAt: new Date().toISOString(),
      lastRemoteUpdatedAt: normalizedRemote.updatedAt
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
      lastRemoteUpdatedAt: remote?.updatedAt || normalized.sync.lastRemoteUpdatedAt
    }
  };
}

export function markPushed(state: AppState): AppState {
  const normalized = normalizeState(state);
  return {
    ...normalized,
    sync: {
      ...normalized.sync,
      lastPushedAt: new Date().toISOString(),
      lastRemoteUpdatedAt: normalized.updatedAt
    }
  };
}

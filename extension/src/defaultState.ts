import type { AppState, WidgetKey, WidgetSize } from "./types";
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from "./projectConfig";

export const nowIso = () => new Date().toISOString();

export const uid = () => {
  if ("crypto" in window && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const defaultWidgetOrder: WidgetKey[] = ["weather", "calendar", "todos", "countdowns", "focus", "notes", "rates", "quote", "clock", "memo", "year", "calculator"];

export const defaultWidgetSizes: Record<WidgetKey, WidgetSize> = {
  weather: "wide",
  calendar: "wide",
  countdowns: "medium",
  todos: "wide",
  notes: "wide",
  rates: "wide",
  quote: "medium",
  focus: "medium",
  clock: "medium",
  memo: "medium",
  year: "medium",
  calculator: "medium"
};

const widgetDefaults: Record<WidgetKey, boolean> = {
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

export const defaultState = (): AppState => {
  const updatedAt = nowIso();
  return {
    version: 1,
    updatedAt,
    shortcutGroups: [
      { id: "default", name: "常用", color: "#14B8A6", order: 0, updatedAt }
    ],
    shortcuts: [],
    shortcutFolders: [],
    todos: [
      { id: uid(), text: "添加常用网站快捷方式", done: false, order: 0, updatedAt }
    ],
    notes: [
      { id: uid(), title: "随手笔记", body: "记录临时想法、链接或待整理的信息。", updatedAt }
    ],
    countdowns: [
      { id: uid(), title: "重要日期", date: updatedAt.slice(0, 10), updatedAt }
    ],
    settings: {
      theme: "dark",
      wallpaperPreset: "aurora-lake",
      wallpaperRotation: false,
      customWallpapers: [],
      wallpaperCollection: ["coastal-glass", "neon-rain", "aurora-lake", "ocean-cliff"],
      quickNote: "",
      visualRefreshVersion: 8,
      dateTimeColor: "#ffffff",
      widgetAccentColor: "#2dd4bf",
      glass: 42,
      iconSize: 58,
      gridDensity: "comfortable",
      dockPosition: "bottom",
      city: "Shanghai",
      weatherUseLocation: true,
      searchEngine: "baidu",
      timeZone: "Asia/Shanghai",
      widgetOrder: defaultWidgetOrder,
      widgetSizes: defaultWidgetSizes,
      calendarRecords: {},
      widgets: widgetDefaults,
      supabaseUrl: DEFAULT_SUPABASE_URL,
      supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
      updatedAt
    },
    sync: {
      deviceId: uid(),
      autoSync: true,
      intervalSeconds: 60
    }
  };
};

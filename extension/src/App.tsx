import {
  BookOpen,
  Bot,
  Brush,
  Calculator,
  Camera,
  Code2,
  CalendarDays,
  Check,
  Clock3,
  Download,
  FileText,
  Database,
  Gamepad2,
  Edit3,
  Folder,
  FolderPlus,
  Globe2,
  GraduationCap,
  HeartPulse,
  GripVertical,
  Import,
  Image as ImageIcon,
  KeyRound,
  Mail,
  Music,
  MessageCircle,
  Plane,
  Layers,
  LogOut,
  Palette,
  Pin,
  EyeOff,
  Plus,
  RefreshCcw,
  Server,
  Save,
  Search,
  Settings,
  Shuffle,
  Sparkles,
  Star,
  Trash2,
  Video,
  TrendingUp,
  Wallet,
  Wrench,
  ShoppingBag,
  Upload,
  TimerReset,
  UserCircle,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { downloadJson, loadState, readKey, saveState, writeKey } from "./db";
import { defaultState, defaultWidgetOrder, defaultWidgetSizes, nowIso, uid } from "./defaultState";
import { colorFor, curatedIconCount, curatedIconFor, fallbackFaviconFor, faviconFor, importedToShortcuts, parseImportText } from "./importers";
import { fetchRates, getCachedRates } from "./rates";
import { DEFAULT_AUTH_REDIRECT_URL } from "./projectConfig";
import { fetchWeather, fetchWeatherByCoordinates, getCachedWeather, getDevicePosition, weatherLabel } from "./weather";
import { checkForUpdate, type UpdateCheckResult } from "./updates";
import { APP_VERSION, DATA_SCHEMA_VERSION, UPDATE_TARGET_URL } from "./version";
import {
  getUser,
  markPulled,
  markPushed,
  mergeRemote,
  normalizeState,
  pullSnapshot,
  pushSnapshot,
  signIn,
  signOut,
  signUp,
  type SyncStatus
} from "./sync";
import type { AppState, Countdown, RatesState, SearchEngine, Shortcut, ShortcutFolder, Todo, WeatherState, WidgetKey, WidgetSize } from "./types";

type Dialog = "shortcut" | "folder" | "import" | "library" | "settings" | "sync" | "timezone" | null;
type ShortcutMenuState = { x: number; y: number; shortcutId: string } | null;
type PageMenuState = { x: number; y: number } | null;
type WidgetMenuState = { x: number; y: number; widgetKey?: WidgetKey } | null;
type HomePage = "widgets" | "shortcuts" | "tools";
type HomeTileRef = `shortcut:${string}` | `folder:${string}`;
type SyncMode = "merge" | "push" | "pull";
type AuthResult = { status: "signed-in" | "verification-sent"; message: string };

const SYNC_RESTORE_KEY = "sync-restore-point";
const PUBLIC_AUTH_REDIRECT_URL = "https://muggler77.github.io/whytab/";
const homePageOrder: HomePage[] = ["widgets", "shortcuts", "tools"];
const WEATHER_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
const RATES_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const isFreshCache = (updatedAt?: string, maxAge = WEATHER_CACHE_MAX_AGE_MS) => {
  if (!updatedAt) return false;
  const time = new Date(updatedAt).getTime();
  return Number.isFinite(time) && Date.now() - time < maxAge;
};

const shouldRefreshExternalData = (target: AppState, cachedWeather?: WeatherState, cachedRates?: RatesState) => {
  const lowQualityLocation = target.settings.weatherUseLocation && cachedWeather?.city === "当前位置";
  const needsWeather = !cachedWeather || lowQualityLocation || !isFreshCache(cachedWeather.updatedAt, WEATHER_CACHE_MAX_AGE_MS);
  const ratesConfigured = Boolean(target.settings.supabaseUrl && target.settings.supabaseAnonKey);
  const needsRates = ratesConfigured && (!cachedRates || !isFreshCache(cachedRates.updatedAt, RATES_CACHE_MAX_AGE_MS));
  return needsWeather || needsRates;
};

const getAuthRedirectUrl = () => {
  if (DEFAULT_AUTH_REDIRECT_URL) return DEFAULT_AUTH_REDIRECT_URL;
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return new URL(".", window.location.href).toString();
  }
  return PUBLIC_AUTH_REDIRECT_URL;
};

const widgetNames: Record<WidgetKey, string> = {
  weather: "天气",
  calendar: "日历",
  countdowns: "倒计时",
  todos: "To Do",
  notes: "照片",
  rates: "汇率",
  quote: "每日灵感",
  focus: "专注",
  clock: "世界时钟",
  memo: "便签",
  year: "年度进度",
  calculator: "计算器"
};

const widgetLibraryMeta: Record<WidgetKey, {
  category: "信息" | "效率" | "生活";
  preview: string;
  Icon: typeof CalendarDays;
}> = {
  weather: { category: "信息", preview: "21° 晴", Icon: Globe2 },
  calendar: { category: "效率", preview: "今日 2 日", Icon: CalendarDays },
  countdowns: { category: "生活", preview: "还有 28 天", Icon: Clock3 },
  todos: { category: "效率", preview: "3 项待办", Icon: Check },
  notes: { category: "生活", preview: "照片", Icon: ImageIcon },
  rates: { category: "信息", preview: "USD 7.18", Icon: Wallet },
  quote: { category: "生活", preview: "每日一句", Icon: Sparkles },
  focus: { category: "效率", preview: "25:00", Icon: TimerReset },
  clock: { category: "信息", preview: "13:42", Icon: Clock3 },
  memo: { category: "效率", preview: "记下一点", Icon: FileText },
  year: { category: "生活", preview: "50.1%", Icon: TrendingUp },
  calculator: { category: "效率", preview: "128", Icon: Calculator }
};

const widgetSizeLabels: Record<WidgetSize, string> = {
  small: "小",
  medium: "中",
  wide: "大"
};

const allWidgetSizes: WidgetSize[] = ["small", "medium", "wide"];
const widgetSizeOptions: Record<WidgetKey, WidgetSize[]> = {
  weather: allWidgetSizes,
  calendar: allWidgetSizes,
  countdowns: allWidgetSizes,
  todos: allWidgetSizes,
  notes: allWidgetSizes,
  rates: allWidgetSizes,
  quote: allWidgetSizes,
  focus: allWidgetSizes,
  clock: allWidgetSizes,
  memo: allWidgetSizes,
  year: allWidgetSizes,
  calculator: allWidgetSizes
};

const ensureUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

const comparableUrl = (url: string) => {
  try {
    const parsed = new URL(ensureUrl(url));
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
};

const isGeneratedFavicon = (url?: string) => Boolean(url && /(?:google\.com\/s2\/favicons|icons\.duckduckgo\.com\/ip3)/i.test(url));
const builtInIconPrefix = "whytab-icon:";
const builtInShortcutIcons = [
  { id: "general", label: "通用", Icon: Globe2, tone: "#38BDF8" },
  { id: "ai", label: "AI", Icon: Bot, tone: "#A78BFA" },
  { id: "tool", label: "工具", Icon: Wrench, tone: "#22C55E" },
  { id: "design", label: "设计", Icon: Brush, tone: "#F472B6" },
  { id: "video", label: "视频", Icon: Video, tone: "#FB7185" },
  { id: "music", label: "音乐", Icon: Music, tone: "#F59E0B" },
  { id: "doc", label: "文档", Icon: FileText, tone: "#60A5FA" },
  { id: "shop", label: "购物", Icon: ShoppingBag, tone: "#F97316" },
  { id: "mail", label: "邮箱", Icon: Mail, tone: "#06B6D4" },
  { id: "server", label: "服务器", Icon: Server, tone: "#64748B" },
  { id: "finance", label: "财务", Icon: Wallet, tone: "#EAB308" },
  { id: "learn", label: "学习", Icon: GraduationCap, tone: "#10B981" },
  { id: "code", label: "开发", Icon: Code2, tone: "#38BDF8" },
  { id: "game", label: "游戏", Icon: Gamepad2, tone: "#A78BFA" },
  { id: "travel", label: "旅行", Icon: Plane, tone: "#22C55E" },
  { id: "photo", label: "摄影", Icon: Camera, tone: "#F472B6" },
  { id: "chat", label: "沟通", Icon: MessageCircle, tone: "#FB7185" },
  { id: "data", label: "数据", Icon: Database, tone: "#60A5FA" },
  { id: "health", label: "健康", Icon: HeartPulse, tone: "#10B981" },
  { id: "news", label: "资讯", Icon: BookOpen, tone: "#F59E0B" },
];

const builtInIconValue = (id: string) => `${builtInIconPrefix}${id}`;
const builtInShortcutIconFor = (iconUrl?: string) => {
  if (!iconUrl?.startsWith(builtInIconPrefix)) return undefined;
  return builtInShortcutIcons.find((icon) => icon.id === iconUrl.slice(builtInIconPrefix.length));
};

const iconCandidatesFor = (url: string, iconUrl?: string, title = "") => {
  const builtInIcon = builtInShortcutIconFor(iconUrl);
  const candidates = [
    iconUrl && !builtInIcon && !isGeneratedFavicon(iconUrl) ? iconUrl : undefined,
    curatedIconFor(url, title),
    fallbackFaviconFor(url),
    faviconFor(url),
    iconUrl && isGeneratedFavicon(iconUrl) ? iconUrl : undefined
  ].filter((item): item is string => Boolean(item));
  return Array.from(new Set(candidates));
};

function BuiltInShortcutIcon({ iconUrl, fallback = "" }: { iconUrl?: string; fallback?: string }) {
  const icon = builtInShortcutIconFor(iconUrl);
  if (!icon) return <>{fallback}</>;
  const Icon = icon.Icon;
  return <span className="built-in-shortcut-glyph" style={{ "--icon-tone": icon.tone } as React.CSSProperties}><Icon size={22} strokeWidth={2.3} /></span>;
}

function ShortcutIconContent({ url, iconUrl, fallback = "" }: { url: string; iconUrl?: string; fallback?: string }) {
  const builtInIcon = builtInShortcutIconFor(iconUrl);
  if (builtInIcon) return <BuiltInShortcutIcon iconUrl={iconUrl} fallback={fallback} />;
  return <ShortcutIconImage url={url} iconUrl={iconUrl} fallback={fallback} />;
}

function ShortcutIconImage({ url, iconUrl, alt = "", fallback = "" }: { url: string; iconUrl?: string; alt?: string; fallback?: string }) {
  const candidates = useMemo(() => iconCandidatesFor(url, iconUrl), [url, iconUrl]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [candidates.join("|")]);
  if (!candidates.length || index >= candidates.length) return <>{fallback}</>;
  return <img src={candidates[index]} alt={alt} onError={() => setIndex((value) => value + 1)} />;
}

function IconChoicePreview({ src, fallback }: { src: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return <span className="icon-choice-fallback">{fallback}</span>;
  return <img src={src} alt="" onError={() => setFailed(true)} />;
}

const searchEngines: Record<SearchEngine, { label: string; url: (query: string) => string }> = {
  baidu: {
    label: "百度",
    url: (query) => `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
  },
  google: {
    label: "Google",
    url: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
  }
};

type CurrencyCode = "CNY" | "USD" | "JPY";

const currencyNames: Record<CurrencyCode, string> = {
  CNY: "人民币",
  USD: "美元",
  JPY: "日元"
};

const dailyQuotes = [
  { text: "先把桌面变成愿意打开的地方，再把事情慢慢放进去。", source: "whytab" },
  { text: "好的工具不抢注意力，只把下一步放到手边。", source: "whytab" },
  { text: "今天只要推进一件真正重要的小事，就已经很赚。", source: "whytab" },
  { text: "主页不是展示柜，是每天第一个工作台。", source: "whytab" },
  { text: "少一点入口焦虑，多一点顺手抵达。", source: "whytab" }
];

const featuredWallpapers = [
  { id: "coastal-glass", name: "冷雾海岸", url: "/wallpapers/photo/coastal-glass.jpg" },
  { id: "neon-rain", name: "雨夜霓虹", url: "/wallpapers/photo/neon-rain.jpg" },
  { id: "aurora-lake", name: "极光山湖", url: "/wallpapers/photo/aurora-lake.jpg" },
  { id: "ocean-cliff", name: "清晨海崖", url: "/wallpapers/photo/ocean-cliff.jpg" },
  { id: "midnight-silk", name: "午夜丝绸", url: "/wallpapers/midnight-silk.svg" },
  { id: "jade-mist", name: "青玉雾光", url: "/wallpapers/jade-mist.svg" },
  { id: "rose-dusk", name: "玫瑰暮色", url: "/wallpapers/rose-dusk.svg" },
  { id: "silver-ridge", name: "银岭微光", url: "/wallpapers/silver-ridge.svg" }
];

const legacyWallpapers = [
  { id: "sonoma-dawn", name: "晨雾", url: "/wallpapers/sonoma-dawn.svg" },
  { id: "aurora-tide", name: "极光", url: "/wallpapers/aurora-tide.svg" },
  { id: "glass-orchid", name: "兰紫", url: "/wallpapers/glass-orchid.svg" },
  { id: "sequoia-night", name: "暮林", url: "/wallpapers/sequoia-night.svg" }
];

const builtInWallpapers = [...featuredWallpapers, ...legacyWallpapers];

const dailyWallpaper = () => {
  const day = Math.floor(Date.now() / 86400000);
  return featuredWallpapers[day % featuredWallpapers.length];
};

const wallpaperById = (id?: string) => {
  return builtInWallpapers.find((wallpaper) => wallpaper.id === id) || builtInWallpapers[0];
};

const weatherToneForCode = (code?: number) => {
  if (code === 0) return "sunny";
  if (code === undefined) return "cloudy";
  if ([1, 2, 3].includes(code)) return "cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "cloudy";
};


const timeZoneLabels: Record<string, string> = {
  "Asia/Shanghai": "北京时间", "Asia/Hong_Kong": "香港时间", "Asia/Taipei": "台北时间",
  "Asia/Tokyo": "东京时间", "Asia/Seoul": "首尔时间", "Asia/Singapore": "新加坡时间",
  "America/Los_Angeles": "洛杉矶时间", "America/New_York": "纽约时间",
  "Europe/London": "伦敦时间", "Europe/Paris": "巴黎时间", "Australia/Sydney": "悉尼时间",
  UTC: "协调世界时"
};
const priorityTimeZones = Object.keys(timeZoneLabels);
const supportedTimeZones = (() => {
  try {
    const values = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf;
    return values ? values("timeZone") : priorityTimeZones;
  } catch { return priorityTimeZones; }
})();
const timeZoneOptions = Array.from(new Set([...priorityTimeZones, ...supportedTimeZones])).map((value) => ({
  value, label: timeZoneLabels[value] || value.replace(/_/g, " ")
}));

const formatterFor = (timeZone: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("zh-CN", {
  timeZone,
  ...options
});

const chinaDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long"
});

const chinaMiniDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "long"
});

const chinaTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const calendarDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
};

const calendarDateLabel = (key: string) => {
  const date = new Date(key + "T00:00:00");
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
};

export default function App() {
  const [state, setState] = useState<AppState>(() => defaultState());
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [activePage, setActivePage] = useState<HomePage>("widgets");
  const [pageMotion, setPageMotion] = useState<"up" | "down" | undefined>();
  const [editingShortcut, setEditingShortcut] = useState<Shortcut | undefined>();
  const [editingFolder, setEditingFolder] = useState<ShortcutFolder | undefined>();
  const [openFolderId, setOpenFolderId] = useState<string | undefined>();
  const [shortcutMenu, setShortcutMenu] = useState<ShortcutMenuState>(null);
  const [pageMenu, setPageMenu] = useState<PageMenuState>(null);
  const [widgetMenu, setWidgetMenu] = useState<WidgetMenuState>(null);
  const [searchText, setSearchText] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [activeLayer, setActiveLayer] = useState("all");
  const [touchArrangeWidgets, setTouchArrangeWidgets] = useState(false);
  const [touchWidgetKey, setTouchWidgetKey] = useState<WidgetKey | undefined>();
  const [dragId, setDragId] = useState<string | undefined>();
  const [weather, setWeather] = useState<WeatherState | undefined>();
  const [rates, setRates] = useState<RatesState | undefined>();
  const [ratesMessage, setRatesMessage] = useState("正在加载汇率...");
  const [ratesRefreshing, setRatesRefreshing] = useState(false);
  const [weatherRefreshing, setWeatherRefreshing] = useState(false);
  const [sync, setSync] = useState<SyncStatus>({ message: "未登录", syncing: false });
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult>({ status: "idle" });
  const [toast, setToast] = useState("");
  const [undoLabel, setUndoLabel] = useState("");
  const [restoreAvailable, setRestoreAvailable] = useState(false);
  const stateRef = useRef(state);
  const syncLockRef = useRef(false);
  const undoSnapshotRef = useRef<AppState | undefined>();
  const lastSyncedUpdatedAtRef = useRef<string | undefined>();
  const wheelPageLockRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    loadState().then(async (loaded) => {
      const normalized = normalizeState(loaded);
      setState(normalized);
      setReady(true);
      const cachedWeather = await getCachedWeather();
      const cachedRates = await getCachedRates();
      setWeather(cachedWeather);
      setRates(cachedRates);
      if (cachedRates) setRatesMessage("已缓存");
      setRestoreAvailable(Boolean(await readKey(SYNC_RESTORE_KEY)));
      if (shouldRefreshExternalData(normalized, cachedWeather, cachedRates)) {
        window.setTimeout(() => void refreshExternalData(normalized), 450);
      }
      const user = await refreshUser(normalized);
      if (user && normalized.sync?.autoSync) window.setTimeout(() => void performAutoSync("打开页面自动同步"), 300);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveState(state);
    if (!state.sync?.autoSync || !state.settings.supabaseUrl || !state.settings.supabaseAnonKey) return;
    if (state.updatedAt === lastSyncedUpdatedAtRef.current) return;
    const timer = window.setTimeout(() => {
      void performAutoSync("本地修改自动同步");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [state, ready]);

  useEffect(() => {
    if (!ready || !state.sync?.autoSync || !state.settings.supabaseUrl || !state.settings.supabaseAnonKey) return;
    const interval = window.setInterval(() => {
      void performAutoSync("定时自动同步");
    }, Math.max(30, state.sync.intervalSeconds) * 1000);
    return () => window.clearInterval(interval);
  }, [ready, state.sync?.autoSync, state.sync?.intervalSeconds, state.settings.supabaseUrl, state.settings.supabaseAnonKey]);

  useEffect(() => {
    if (!pageMotion) return;
    const timer = window.setTimeout(() => setPageMotion(undefined), 560);
    return () => window.clearTimeout(timer);
  }, [pageMotion, activePage]);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      setClock(new Date());
      timer = window.setTimeout(schedule, 1000 - (Date.now() % 1000) + 8);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  const updateState = (updater: (state: AppState) => AppState) => {
    setState((current) => ({ ...updater(current), updatedAt: nowIso() }));
  };

  const rememberUndo = (label: string) => {
    undoSnapshotRef.current = stateRef.current;
    setUndoLabel(label);
  };

  const undoLastChange = () => {
    const snapshot = undoSnapshotRef.current;
    if (!snapshot) return;
    const restored = { ...snapshot, updatedAt: nowIso() };
    undoSnapshotRef.current = undefined;
    setUndoLabel("");
    setState(restored);
    stateRef.current = restored;
    setToast("已撤销");
    window.setTimeout(() => setToast(""), 1800);
  };

  const refreshUser = async (target = state) => {
    const user = await getUser(target.settings.supabaseUrl, target.settings.supabaseAnonKey).catch(() => null);
    setSync((old) => ({ ...old, user, autoSync: target.sync?.autoSync, message: user ? `已登录 ${user.email}` : "未登录" }));
    return user;
  };

  const refreshExternalData = async (target = state, feedback = false) => {
    if (feedback) {
      showToast("正在刷新天气和汇率...");
      setWeatherRefreshing(true);
      setRatesRefreshing(true);
      setRatesMessage("正在刷新...");
    }

    const weatherTask = (async () => {
      const nextWeather = target.settings.weatherUseLocation
        ? await getDevicePosition()
          .then((position) => fetchWeatherByCoordinates(position.latitude, position.longitude, target.settings.city))
          .catch(() => fetchWeather(target.settings.city))
        : await fetchWeather(target.settings.city);
      setWeather(nextWeather);
    })().catch(async () => {
      const cached = await getCachedWeather();
      if (cached) setWeather(cached);
      if (feedback) showToast("天气刷新失败，已使用缓存");
    }).finally(() => {
      if (feedback) setWeatherRefreshing(false);
    });

    const ratesTask = (async () => {
      const nextRates = await fetchRates(target.settings.supabaseUrl, target.settings.supabaseAnonKey);
      setRates(nextRates);
      setRatesMessage("已更新");
    })().catch(async (error) => {
      const cached = await getCachedRates();
      if (cached) {
        setRates(cached);
        if (feedback) setRatesMessage("已使用缓存");
      } else {
        setRatesMessage(error instanceof Error ? error.message : "汇率暂时不可用");
      }
    }).finally(() => {
      if (feedback) setRatesRefreshing(false);
    });

    await Promise.allSettled([weatherTask, ratesTask]);
    if (feedback) showToast("天气和汇率已刷新");
  };

  const runUpdateCheck = useCallback(async (feedback = false) => {
    setUpdateCheck((old) => ({ status: "checking", checkedAt: old.checkedAt }));
    const result = await checkForUpdate();
    setUpdateCheck(result);
    if (feedback) {
      if (result.status === "available") showToast(result.critical ? "发现重要更新，请尽快升级" : "发现新版本");
      if (result.status === "current") showToast("当前已是最新版本");
      if (result.status === "unsupported") showToast("当前版本过旧，请先升级");
      if (result.status === "error") showToast(result.message);
    } else if (result.status === "available" && result.critical) {
      showToast("发现重要更新，请尽快升级");
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void runUpdateCheck(false), 1600);
    return () => window.clearTimeout(timer);
  }, [ready, runUpdateCheck]);

  const groups = useMemo(() => {
    return state.shortcutGroups.filter((group) => !group.deletedAt).sort((a, b) => a.order - b.order);
  }, [state.shortcutGroups]);

  const allShortcuts = useMemo(() => {
    return state.shortcuts.filter((shortcut) => !shortcut.deletedAt).sort((a, b) => a.order - b.order);
  }, [state.shortcuts]);

  const allFolders = useMemo(() => {
    return (state.shortcutFolders || []).filter((folder) => !folder.deletedAt).sort((a, b) => a.order - b.order);
  }, [state.shortcutFolders]);

  useEffect(() => {
    if (activeLayer === "all" || activeLayer === "pinned") return;
    if (!groups.some((group) => group.id === activeLayer)) setActiveLayer("all");
  }, [activeLayer, groups]);

  const visibleFolders = useMemo(() => {
    if (activeLayer === "pinned") return [];
    let sorted = allFolders;
    if (activeLayer !== "all") sorted = sorted.filter((folder) => folder.groupId === activeLayer);
    return sorted;
  }, [activeLayer, allFolders]);

  const shortcuts = useMemo(() => {
    let sorted = allShortcuts;
    if (activeLayer === "pinned") sorted = sorted.filter((shortcut) => shortcut.pinned);
    else if (activeLayer !== "all") sorted = sorted.filter((shortcut) => shortcut.groupId === activeLayer);
    return sorted.filter((shortcut) => !shortcut.folderId);
  }, [activeLayer, allShortcuts]);

  const shortcutTiles = useMemo(() => {
    const folderTiles = visibleFolders.map((folder) => {
      const firstChildOrder = allShortcuts
        .filter((shortcut) => shortcut.folderId === folder.id)
        .reduce((min, shortcut) => Math.min(min, shortcut.order), Number.POSITIVE_INFINITY);
      return {
        kind: "folder" as const,
        folder,
        order: Number.isFinite(firstChildOrder) ? firstChildOrder : folder.order
      };
    });
    const linkTiles = shortcuts.map((shortcut) => ({ kind: "shortcut" as const, shortcut, order: shortcut.order }));
    return [...folderTiles, ...linkTiles].sort((a, b) => a.order - b.order);
  }, [allShortcuts, shortcuts, visibleFolders]);
  const homeShortcutTiles = useMemo(() => {
    const folderTiles = allFolders.map((folder) => {
      const firstChildOrder = allShortcuts
        .filter((shortcut) => shortcut.folderId === folder.id)
        .reduce((min, shortcut) => Math.min(min, shortcut.order), Number.POSITIVE_INFINITY);
      return {
        kind: "folder" as const,
        folder,
        order: Number.isFinite(firstChildOrder) ? firstChildOrder : folder.order
      };
    });
    const linkTiles = allShortcuts
      .filter((shortcut) => !shortcut.folderId)
      .map((shortcut) => ({ kind: "shortcut" as const, shortcut, order: shortcut.order }));
    return [...folderTiles, ...linkTiles].sort((a, b) => a.order - b.order).slice(0, 24);
  }, [allFolders, allShortcuts]);
  const openFolder = allFolders.find((folder) => folder.id === openFolderId);
  const folderShortcuts = useMemo(() => {
    if (!openFolderId) return [];
    return allShortcuts.filter((shortcut) => shortcut.folderId === openFolderId);
  }, [allShortcuts, openFolderId]);

  const pinned = useMemo(() => allShortcuts.filter((shortcut) => shortcut.pinned), [allShortcuts]);
  const activeLayerName = activeLayer === "all"
    ? "全部网站"
    : activeLayer === "pinned"
      ? "Dock 固定"
      : groups.find((group) => group.id === activeLayer)?.name || "快捷导航";
  const today = clock;
  const selectedTimeZone = state.settings.timeZone || "Asia/Shanghai";
  const selectedTimeZoneOption = timeZoneOptions.find((item) => item.value === selectedTimeZone) || timeZoneOptions[0];
  const chinaDateText = formatterFor(selectedTimeZone, { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(clock);
  const chinaMiniDateText = formatterFor(selectedTimeZone, { month: "long", day: "numeric", weekday: "long" }).format(clock);
  const chinaTimeText = formatterFor(selectedTimeZone, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(clock);

  const saveSyncRestorePoint = async (label: string) => {
    await writeKey(SYNC_RESTORE_KEY, { label, savedAt: nowIso(), state: stateRef.current });
    setRestoreAvailable(true);
  };

  const restorePreviousSync = async () => {
    const snapshot = await readKey<{ label: string; savedAt: string; state: AppState }>(SYNC_RESTORE_KEY);
    if (!snapshot?.state) {
      showToast("还没有可回退的同步版本");
      return;
    }
    const restored = { ...snapshot.state, updatedAt: nowIso() };
    setState(restored);
    stateRef.current = restored;
    showToast(`已回到${new Date(snapshot.savedAt).toLocaleString("zh-CN")}的本机版本`);
  };

  const performAutoSync = useCallback(async (reason: string) => {
    const current = stateRef.current;
    if (!current.settings.supabaseUrl || !current.settings.supabaseAnonKey || !current.sync?.autoSync) return;
    if (syncLockRef.current) return;
    syncLockRef.current = true;
    setSync((old) => ({ ...old, syncing: true, message: reason }));
    try {
      const user = await getUser(current.settings.supabaseUrl, current.settings.supabaseAnonKey);
      if (!user) {
        setSync((old) => ({ ...old, user: null, syncing: false, message: "未登录，自动同步暂停" }));
        return;
      }

      const remote = await pullSnapshot(current);
      const merged = mergeRemote(current, remote);
      await pushSnapshot(merged);
      const pushed = markPushed(merged);
      lastSyncedUpdatedAtRef.current = pushed.updatedAt;
      setState(pushed);
      setSync({
        user,
        syncing: false,
        autoSync: pushed.sync?.autoSync,
        message: "已自动同步",
        lastSyncedAt: pushed.sync?.lastPushedAt || nowIso()
      });
    } catch (error) {
      setSync((old) => ({
        ...old,
        syncing: false,
        message: error instanceof Error ? `自动同步失败：${error.message}` : "自动同步失败"
      }));
    } finally {
      syncLockRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!ready || !window.matchMedia("(max-width: 1024px), (hover: none) and (pointer: coarse)").matches) return;
    const resumeSync = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void performAutoSync("设备恢复后同步");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") resumeSync();
    };
    window.addEventListener("online", resumeSync);
    window.addEventListener("focus", resumeSync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", resumeSync);
      window.removeEventListener("focus", resumeSync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [performAutoSync, ready]);

  const saveShortcut = (shortcut: Partial<Shortcut>) => {
    updateState((current) => {
      const title = shortcut.title?.trim() || "未命名";
      const url = ensureUrl(shortcut.url?.trim() || "");
      const updatedAt = nowIso();
      const existing = shortcut.id ? current.shortcuts.find((item) => item.id === shortcut.id) : undefined;
      const next: Shortcut = {
        id: existing?.id || uid(),
        title,
        url,
        iconUrl: shortcut.iconUrl?.trim() || existing?.iconUrl || faviconFor(url),
        iconColor: shortcut.iconColor || existing?.iconColor || colorFor(title),
        groupId: shortcut.groupId || existing?.groupId || current.shortcutGroups[0]?.id,
        folderId: shortcut.folderId === "" ? undefined : shortcut.folderId ?? existing?.folderId,
        pinned: Boolean(shortcut.pinned ?? existing?.pinned),
        order: existing?.order ?? current.shortcuts.length,
        updatedAt
      };
      return {
        ...current,
        shortcuts: existing
          ? current.shortcuts.map((item) => (item.id === next.id ? next : item))
          : [...current.shortcuts, next]
      };
    });
    setDialog(null);
    setEditingShortcut(undefined);
  };

  const deleteShortcut = (id: string) => {
    rememberUndo("删除网站");
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      shortcuts: current.shortcuts.map((item) =>
        item.id === id ? { ...item, pinned: false, deletedAt, updatedAt: deletedAt } : item
      )
    }));
    setShortcutMenu(null);
    showToast("已删除网站");
  };

  const saveFolder = (folder: Partial<ShortcutFolder>) => {
    updateState((current) => {
      const name = folder.name?.trim() || "未命名文件夹";
      const updatedAt = nowIso();
      const existing = folder.id ? current.shortcutFolders?.find((item) => item.id === folder.id) : undefined;
      const next: ShortcutFolder = {
        id: existing?.id || uid(),
        name,
        groupId: folder.groupId || existing?.groupId || current.shortcutGroups[0]?.id,
        iconUrl: folder.iconUrl?.trim() || existing?.iconUrl,
        iconColor: folder.iconColor || existing?.iconColor || colorFor(name),
        order: existing?.order ?? (current.shortcutFolders || []).length,
        updatedAt
      };
      return {
        ...current,
        shortcutFolders: existing
          ? current.shortcutFolders.map((item) => (item.id === next.id ? next : item))
          : [...(current.shortcutFolders || []), next]
      };
    });
    setDialog(null);
    setEditingFolder(undefined);
  };

  const deleteFolder = (id: string) => {
    const folder = allFolders.find((item) => item.id === id);
    if (!folder) return;
    const count = allShortcuts.filter((shortcut) => shortcut.folderId === id).length;
    const confirmed = window.confirm(count ? `删除文件夹“${folder.name}”？其中 ${count} 个网站会移回当前分类。` : `删除文件夹“${folder.name}”？`);
    if (!confirmed) return;
    rememberUndo("删除文件夹");
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      shortcutFolders: (current.shortcutFolders || []).map((item) =>
        item.id === id ? { ...item, deletedAt, updatedAt: deletedAt } : item
      ),
      shortcuts: current.shortcuts.map((shortcut) =>
        shortcut.folderId === id ? { ...shortcut, folderId: undefined, updatedAt: deletedAt } : shortcut
      )
    }));
    setOpenFolderId(undefined);
    setEditingFolder(undefined);
    showToast("已删除文件夹");
  };

  const togglePinned = (id: string) => {
    updateState((current) => ({
      ...current,
      shortcuts: current.shortcuts.map((item) =>
        item.id === id ? { ...item, pinned: !item.pinned, updatedAt: nowIso() } : item
      )
    }));
    setShortcutMenu(null);
  };

  const addGroup = () => {
    const name = window.prompt("分类名称");
    if (!name?.trim()) return;
    const label = name.trim();
    updateState((current) => {
      const existing = current.shortcutGroups.find((group) => !group.deletedAt && group.name.toLowerCase() === label.toLowerCase());
      if (existing) return current;
      const nextGroup = {
        id: uid(),
        name: label,
        color: colorFor(label),
        order: current.shortcutGroups.filter((group) => !group.deletedAt).length,
        updatedAt: nowIso()
      };
      window.setTimeout(() => setActiveLayer(nextGroup.id), 0);
      return { ...current, shortcutGroups: [...current.shortcutGroups, nextGroup] };
    });
  };

  const renameGroup = (id: string) => {
    const group = groups.find((item) => item.id === id);
    if (!group) return;
    const name = window.prompt("新的分类名称", group.name);
    if (!name?.trim()) return;
    const label = name.trim();
    updateState((current) => ({
      ...current,
      shortcutGroups: current.shortcutGroups.map((item) =>
        item.id === id ? { ...item, name: label, color: item.color || colorFor(label), updatedAt: nowIso() } : item
      )
    }));
  };

  const deleteGroup = (id: string) => {
    const liveGroups = groups.filter((group) => group.id !== id);
    if (!liveGroups.length) {
      window.alert("至少保留一个分类");
      return;
    }
    const group = groups.find((item) => item.id === id);
    if (!group) return;
    const count = allShortcuts.filter((shortcut) => shortcut.groupId === id).length;
    const confirmed = window.confirm(count ? `删除“${group.name}”？其中 ${count} 个网站会移动到“${liveGroups[0].name}”。` : `删除“${group.name}”？`);
    if (!confirmed) return;
    rememberUndo("删除分类");
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      shortcutGroups: current.shortcutGroups.map((item) =>
        item.id === id ? { ...item, deletedAt, updatedAt: deletedAt } : item
      ),
      shortcuts: current.shortcuts.map((shortcut) =>
        shortcut.groupId === id ? { ...shortcut, groupId: liveGroups[0].id, updatedAt: deletedAt } : shortcut
      ),
      shortcutFolders: (current.shortcutFolders || []).map((folder) =>
        folder.groupId === id ? { ...folder, groupId: liveGroups[0].id, updatedAt: deletedAt } : folder
      )
    }));
    if (activeLayer === id) setActiveLayer(liveGroups[0].id);
    showToast("已删除分类");
  };

  const moveShortcut = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    rememberUndo("调整网站顺序");
    updateState((current) => {
      const list = [...current.shortcuts].sort((a, b) => a.order - b.order);
      const from = list.findIndex((item) => item.id === dragId);
      const to = list.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return {
        ...current,
        shortcuts: list.map((item, order) => ({ ...item, order, updatedAt: item.id === dragId ? nowIso() : item.updatedAt }))
      };
    });
  };

  const moveHomeTile = (source?: HomeTileRef | string, target?: HomeTileRef | string) => {
    if (!source || !target || source === target) return;
    const parse = (value: string) => {
      const [kind, id] = value.split(":") as ["shortcut" | "folder", string];
      return (kind === "shortcut" || kind === "folder") && id ? { kind, id } : undefined;
    };
    const sourceRef = parse(source);
    const targetRef = parse(target);
    if (!sourceRef || !targetRef) return;
    rememberUndo("调整主页位置");
    updateState((current) => {
      const folders = (current.shortcutFolders || [])
        .filter((folder) => !folder.deletedAt)
        .map((folder) => ({ kind: "folder" as const, id: folder.id, order: folder.order }));
      const shortcuts = current.shortcuts
        .filter((shortcut) => !shortcut.deletedAt && !shortcut.folderId)
        .map((shortcut) => ({ kind: "shortcut" as const, id: shortcut.id, order: shortcut.order }));
      const tiles = [...folders, ...shortcuts].sort((a, b) => a.order - b.order);
      const from = tiles.findIndex((item) => item.kind === sourceRef.kind && item.id === sourceRef.id);
      const to = tiles.findIndex((item) => item.kind === targetRef.kind && item.id === targetRef.id);
      if (from < 0 || to < 0) return current;
      const [moved] = tiles.splice(from, 1);
      tiles.splice(to, 0, moved);
      const orderByKey = new Map(tiles.map((item, order) => [`${item.kind}:${item.id}`, order]));
      const updatedAt = nowIso();
      return {
        ...current,
        shortcutFolders: (current.shortcutFolders || []).map((folder) => {
          const order = orderByKey.get(`folder:${folder.id}`);
          return order === undefined ? folder : { ...folder, order, updatedAt: folder.id === sourceRef.id ? updatedAt : folder.updatedAt };
        }),
        shortcuts: current.shortcuts.map((shortcut) => {
          const order = orderByKey.get(`shortcut:${shortcut.id}`);
          return order === undefined ? shortcut : { ...shortcut, order, updatedAt: shortcut.id === sourceRef.id ? updatedAt : shortcut.updatedAt };
        })
      };
    });
  };

  const exportData = () => {
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const folderById = new Map(allFolders.map((folder) => [folder.id, folder]));
    const rows = allShortcuts.map((shortcut) => {
      const group = shortcut.groupId ? groupById.get(shortcut.groupId) : undefined;
      const folder = shortcut.folderId ? folderById.get(shortcut.folderId) : undefined;
      return {
        title: shortcut.title,
        url: shortcut.url,
        iconUrl: shortcut.iconUrl,
        iconColor: shortcut.iconColor,
        groupName: group?.name,
        folderName: folder?.name,
        folderIconUrl: folder?.iconUrl,
        pinned: shortcut.pinned,
        order: shortcut.order
      };
    });
    downloadJson(`whytab-shortcuts-${new Date().toISOString().slice(0, 10)}.json`, {
      source: "whytab-shortcuts",
      version: 1,
      exportedAt: nowIso(),
      count: rows.length,
      groups: groups.map(({ id, name, color, order }) => ({ id, name, color, order })),
      folders: allFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        groupName: folder.groupId ? groupById.get(folder.groupId)?.name : undefined,
        iconUrl: folder.iconUrl,
        iconColor: folder.iconColor,
        order: folder.order
      })),
      shortcuts: rows
    });
    showToast(`已导出 ${rows.length} 个快捷导航，包含分组和文件夹`);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const currentSearchEngine = state.settings.searchEngine || "baidu";
  const runSearch = () => {
    const text = searchText.trim();
    if (!text) return;
    window.open(searchEngines[currentSearchEngine].url(text), "_blank", "noopener,noreferrer");
  };
  const toggleSearchEngine = () => {
    updateState((current) => {
      const nextEngine: SearchEngine = (current.settings.searchEngine || "baidu") === "baidu" ? "google" : "baidu";
      return {
        ...current,
        settings: {
          ...current.settings,
          searchEngine: nextEngine,
          updatedAt: nowIso()
        }
      };
    });
  };

  const chooseTimeZone = (timeZone: string) => {
    const zone = timeZoneOptions.find((item) => item.value === timeZone) || timeZoneOptions[0];
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        timeZone: zone.value,
        updatedAt: nowIso()
      }
    }));
    setDialog(null);
    showToast(`已切换到${zone.label}`);
  };

  const setWidgetEnabled = (key: WidgetKey, enabled: boolean) => {
    rememberUndo(enabled ? "显示小组件" : "隐藏小组件");
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        widgets: { ...current.settings.widgets, [key]: enabled },
        updatedAt: nowIso()
      }
    }));
  };

  const widgetOrder = useMemo(() => {
    const seen = new Set<WidgetKey>();
    const saved = state.settings.widgetOrder || [];
    const result = [...saved, ...defaultWidgetOrder].filter((key): key is WidgetKey => {
      if (!defaultWidgetOrder.includes(key as WidgetKey) || seen.has(key as WidgetKey)) return false;
      seen.add(key as WidgetKey);
      return true;
    });
    return result;
  }, [state.settings.widgetOrder]);

  const reorderWidget = (source?: WidgetKey, target?: WidgetKey) => {
    if (!source || !target || source === target) return;
    rememberUndo("调整组件顺序");
    updateState((current) => {
      const order = [...(current.settings.widgetOrder || defaultWidgetOrder)];
      defaultWidgetOrder.forEach((key) => { if (!order.includes(key)) order.push(key); });
      const from = order.indexOf(source);
      const to = order.indexOf(target);
      if (from < 0 || to < 0) return current;
      const [item] = order.splice(from, 1);
      order.splice(to, 0, item);
      return {
        ...current,
        settings: {
          ...current.settings,
          widgetOrder: order,
          updatedAt: nowIso()
        }
      };
    });
  };

  const rotateMainWallpaper = () => {
    updateState((current) => {
      const currentId = current.settings.wallpaperPreset || builtInWallpapers[0].id;
      const index = builtInWallpapers.findIndex((wallpaper) => wallpaper.id === currentId);
      const next = builtInWallpapers[(index + 1 + builtInWallpapers.length) % builtInWallpapers.length];
      return {
        ...current,
        settings: {
          ...current.settings,
          wallpaper: undefined,
          wallpaperPreset: next.id,
          wallpaperRotation: false,
          updatedAt: nowIso()
        }
      };
    });
    showToast("已切换壁纸");
  };


  const openWidgetMenu = (event: MouseEvent, widgetKey?: WidgetKey) => {
    event.preventDefault();
    event.stopPropagation();
    setWidgetMenu({ x: event.clientX, y: event.clientY, widgetKey });
  };

  const doSync = async (mode: SyncMode) => {
    const message = mode === "merge" ? "正在合并多端数据..." : mode === "push" ? "正在用本机覆盖云端..." : "正在用云端覆盖本机...";
    setSync((old) => ({ ...old, syncing: true, message }));
    try {
      await saveSyncRestorePoint(mode === "merge" ? "合并同步前" : mode === "push" ? "上传覆盖前" : "拉取覆盖前");
      const current = stateRef.current;
      if (mode === "push") {
        await pushSnapshot(current);
        const pushed = markPushed(current);
        lastSyncedUpdatedAtRef.current = pushed.updatedAt;
        setState(pushed);
        setSync((old) => ({ ...old, syncing: false, message: "已用本机版本覆盖云端", lastSyncedAt: pushed.sync?.lastPushedAt || nowIso() }));
        return;
      }

      const remote = await pullSnapshot(current);
      if (!remote) {
        setSync((old) => ({ ...old, syncing: false, message: "云端暂无数据" }));
        return;
      }

      if (mode === "pull") {
        const normalizedRemote = normalizeState(remote);
        const pulled = markPulled({
          ...normalizedRemote,
          settings: {
            ...normalizedRemote.settings,
            supabaseUrl: current.settings.supabaseUrl,
            supabaseAnonKey: current.settings.supabaseAnonKey
          },
          sync: {
            ...current.sync,
            lastRemoteUpdatedAt: normalizedRemote.updatedAt
          }
        }, normalizedRemote);
        lastSyncedUpdatedAtRef.current = pulled.updatedAt;
        setState(pulled);
        setSync((old) => ({ ...old, syncing: false, message: "已用云端版本覆盖本机", lastSyncedAt: pulled.sync?.lastPulledAt || nowIso() }));
        return;
      }

      const merged = mergeRemote(current, remote);
      await pushSnapshot(merged);
      const pushed = markPushed(merged);
      lastSyncedUpdatedAtRef.current = pushed.updatedAt;
      setState(pushed);
      setSync((old) => ({ ...old, syncing: false, message: "已合并本机与云端，并同步到云端", lastSyncedAt: pushed.sync?.lastPushedAt || nowIso() }));
    } catch (error) {
      setSync((old) => ({ ...old, syncing: false, message: error instanceof Error ? error.message : "同步失败" }));
    }
  };

  const customWallpapers = state.settings.customWallpapers || [];
  const wallpaperUrlForId = (id?: string) => {
    if (!id) return undefined;
    return builtInWallpapers.find((wallpaper) => wallpaper.id === id)?.url
      || customWallpapers.find((wallpaper) => wallpaper.id === id)?.dataUrl;
  };
  const wallpaperCollection = (state.settings.wallpaperCollection || [])
    .map((id) => ({ id, url: wallpaperUrlForId(id) }))
    .filter((item): item is { id: string; url: string } => Boolean(item.url));
  const rotatingWallpaper = wallpaperCollection.length
    ? wallpaperCollection[Math.floor(Date.now() / 86400000) % wallpaperCollection.length].url
    : dailyWallpaper().url;
  const activeWallpaper = state.settings.wallpaper
    || (state.settings.wallpaperRotation ? rotatingWallpaper : wallpaperUrlForId(state.settings.wallpaperPreset) || builtInWallpapers[0].url);
  const backgroundStyle = {
    "--wallpaper-image": `url(${activeWallpaper})`,
    "--date-color": state.settings.dateTimeColor || "#ffffff",
    "--widget-accent": state.settings.widgetAccentColor || "#2dd4bf",
    "--widget-glass": state.settings.glass / 100
  } as React.CSSProperties;
  const widgetSizes = { ...defaultWidgetSizes, ...(state.settings.widgetSizes || {}) };
  const widgetRenderers: Record<WidgetKey, React.ReactNode> = {
    weather: <WeatherWidget widgetKey="weather" size={widgetSizes.weather} weather={weather} city={state.settings.city} useLocation={state.settings.weatherUseLocation ?? false} refreshing={weatherRefreshing} onRefresh={() => refreshExternalData(state, true)} />,
    quote: <QuoteWidget widgetKey="quote" size={widgetSizes.quote} date={today} />,
    calendar: <CalendarWidget widgetKey="calendar" size={widgetSizes.calendar} date={today} state={state} updateState={updateState} />,
    countdowns: <CountdownWidget widgetKey="countdowns" size={widgetSizes.countdowns} state={state} updateState={updateState} />,
    todos: <TodoWidget widgetKey="todos" size={widgetSizes.todos} state={state} updateState={updateState} />,
    focus: <FocusWidget widgetKey="focus" size={widgetSizes.focus} />,
    notes: <PhotoWidget widgetKey="notes" size={widgetSizes.notes} state={state} updateState={updateState} />,
    rates: <RatesWidget widgetKey="rates" size={widgetSizes.rates} rates={rates} message={ratesMessage} refreshing={ratesRefreshing} onRefresh={() => refreshExternalData(state, true)} />,
    clock: <WorldClockWidget widgetKey="clock" size={widgetSizes.clock} date={clock} timeZone={state.settings.timeZone || "Asia/Shanghai"} />,
    memo: <MemoWidget widgetKey="memo" size={widgetSizes.memo} state={state} updateState={updateState} />,
    year: <YearProgressWidget widgetKey="year" size={widgetSizes.year} date={today} />,
    calculator: <CalculatorWidget widgetKey="calculator" size={widgetSizes.calculator} />
  };

  const goToPage = (nextPage: HomePage) => {
    if (nextPage === activePage) return;
    const currentIndex = homePageOrder.indexOf(activePage);
    const nextIndex = homePageOrder.indexOf(nextPage);
    setPageMotion(nextIndex > currentIndex ? "down" : "up");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setActivePage(nextPage);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  };

  const handlePageWheel = (event: React.WheelEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, .dialog, .overlay")) return;
    if (Math.abs(event.deltaY) < 34 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;

    const scrollRoot = document.scrollingElement || document.documentElement;
    const atTop = scrollRoot.scrollTop <= 24;
    const atBottom = scrollRoot.scrollTop + window.innerHeight >= scrollRoot.scrollHeight - 24;
    const direction = event.deltaY > 0 ? 1 : -1;
    if ((direction > 0 && !atBottom) || (direction < 0 && !atTop)) return;

    const nextPage = homePageOrder[homePageOrder.indexOf(activePage) + direction];
    if (!nextPage) return;
    const now = Date.now();
    if (now < wheelPageLockRef.current) return;
    wheelPageLockRef.current = now + 820;
    event.preventDefault();
    goToPage(nextPage);
  };

  const widgetsPanel = (
    <section
      className={`widgets home-widgets ${touchArrangeWidgets ? "touch-arranging" : ""}`}
      aria-label="主页小组件"
      data-touch-source={touchWidgetKey}
      onClickCapture={(event) => {
        if (!touchArrangeWidgets) return;
        const widget = (event.target as HTMLElement).closest(".widget") as HTMLElement | null;
        const key = widget?.dataset.widgetKey as WidgetKey | undefined;
        if (!key) return;
        event.preventDefault();
        event.stopPropagation();
        if (!touchWidgetKey) {
          setTouchWidgetKey(key);
          showToast(`已选中${widgetNames[key]}，请点目标位置`);
          return;
        }
        if (touchWidgetKey !== key) {
          reorderWidget(touchWidgetKey, key);
          showToast("小组件位置已调整");
        }
        setTouchWidgetKey(undefined);
      }}
      onMouseDown={(event) => {
        if (event.button !== 2) return;
        const target = event.target as HTMLElement;
        if (target.closest("input") || target.closest("select") || target.closest("textarea")) return;
        const widget = target.closest(".widget") as HTMLElement | null;
        openWidgetMenu(event, widget?.dataset.widgetKey as WidgetKey | undefined);
      }}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("input") || target.closest("select") || target.closest("textarea")) return;
        const widget = target.closest(".widget") as HTMLElement | null;
        openWidgetMenu(event, widget?.dataset.widgetKey as WidgetKey | undefined);
      }}
      onDragOver={(event) => {
        if ((event.target as HTMLElement).closest(".widget")) event.preventDefault();
      }}
      onDrop={(event) => {
        const target = (event.target as HTMLElement).closest(".widget") as HTMLElement | null;
        if (!target) return;
        event.preventDefault();
        reorderWidget(event.dataTransfer.getData("text/whytab-widget") as WidgetKey, target.dataset.widgetKey as WidgetKey | undefined);
      }}
    >
      {widgetOrder.map((key) => state.settings.widgets[key] ? widgetRenderers[key] : null)}
    </section>
  );

  return (
    <main className={`app ${state.settings.theme}`} style={backgroundStyle} onWheel={handlePageWheel}>
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="mark">w</span>
            <div>
              <h1>whytab</h1>
              <p>{chinaMiniDateText}</p>
            </div>
          </div>
          <div className="actions">
            <button className="account-button" title="账号与云同步" onClick={() => setDialog("sync")}>
              <UserCircle size={17} />
              <span>{sync.user?.email || "未登录"}</span>
            </button>
            <button className="top-action sync" title="同步" onClick={() => setDialog("sync")}><RefreshCcw size={17} /></button>
          </div>
        </header>

        <section className="hero">
          <div className="hero-date">
            <strong>{chinaDateText}</strong>
            <span>{chinaTimeText}</span>
            <button type="button" className="timezone-button" title="选择时区" onClick={() => setDialog("timezone")}>{selectedTimeZoneOption.label}<span>{selectedTimeZoneOption.value}</span></button>
          </div>
          <div className="search hero-search">
            <button type="button" className="engine-toggle" title="点击切换搜索引擎" onClick={toggleSearchEngine}>{searchEngines[currentSearchEngine].label}</button>
            <Search size={20} />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); runSearch(); } }}
              placeholder={`${searchEngines[currentSearchEngine].label}搜索`}
            />
            <button type="button" className="search-submit" title="搜索" onClick={runSearch}>搜索</button>
          </div>
        </section>

        <nav className="page-nav" aria-label="whytab 页面切换">
          <div className="page-nav-main">
            <button className={activePage === "widgets" ? "active" : ""} onClick={() => goToPage("widgets")} title="主页小组件">
              <CalendarDays size={21} />
              <span>主页</span>
            </button>
            <button className={activePage === "shortcuts" ? "active" : ""} onClick={() => goToPage("shortcuts")} title="网站导航">
              <Layers size={21} />
              <span>网站</span>
            </button>
            <button className={activePage === "tools" ? "active" : ""} onClick={() => goToPage("tools")} title="工具箱">
              <BookOpen size={21} />
              <span>工具</span>
            </button>
          </div>
          <div className="page-nav-secondary">
            <button onClick={() => setDialog("settings")} title="设置"><Settings size={18} /></button>
          </div>
        </nav>

        {activePage === "shortcuts" && state.settings.dockPosition === "top" && <Dock shortcuts={pinned} />}

        <section
          className={["workspace", "page-" + activePage, pageMotion ? "page-motion-" + pageMotion : ""].filter(Boolean).join(" ")}
          onMouseDown={(event) => {
            if (activePage !== "widgets" || event.button !== 2) return;
            const target = event.target as HTMLElement;
            if (target.closest("input") || target.closest("select") || target.closest("textarea")) return;
            const widget = target.closest(".widget") as HTMLElement | null;
            openWidgetMenu(event, widget?.dataset.widgetKey as WidgetKey | undefined);
          }}
          onContextMenu={(event) => {
            const target = event.target as HTMLElement;
            if (activePage === "widgets") {
              if (target.closest("input") || target.closest("select") || target.closest("textarea")) return;
              const widget = target.closest(".widget") as HTMLElement | null;
              openWidgetMenu(event, widget?.dataset.widgetKey as WidgetKey | undefined);
              return;
            }
            if (target.closest(".shortcut") || target.closest(".folder-tile") || target.closest("input") || target.closest("button") || target.closest("a")) return;
            event.preventDefault();
            setPageMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          {activePage === "widgets" ? (
            <section className="home-dashboard">
              <div className="home-head">
                <div>
                  <h2>主页</h2>
                  <p>搜索和常用入口</p>
                </div>
                <div className="home-actions">
                  <button
                    className={`text-button mobile-only-action ${touchArrangeWidgets ? "active" : ""}`}
                    onClick={() => {
                      setTouchArrangeWidgets((current) => !current);
                      setTouchWidgetKey(undefined);
                      showToast(touchArrangeWidgets ? "已完成小组件整理" : "点一个组件，再点目标位置");
                    }}
                  >
                    <GripVertical size={16} />
                    {touchArrangeWidgets ? "完成整理" : "整理组件"}
                  </button>
                  <button className="text-button" onClick={() => setDialog("library")}><Palette size={16} /> 资源中心</button>
                  <button className="text-button" onClick={() => void refreshExternalData(state, true)}><RefreshCcw size={16} /> 刷新数据</button>
                </div>
              </div>
              <HomeShortcuts
                tiles={homeShortcutTiles}
                iconSize={state.settings.iconSize}
                onOpenFolder={(folderId) => setOpenFolderId(folderId)}
                onShortcutMenu={(event, shortcut) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setShortcutMenu({ x: event.clientX, y: event.clientY, shortcutId: shortcut.id });
                }}
                onMoveTile={moveHomeTile}
              />
              {widgetsPanel}
            </section>
          ) : activePage === "tools" ? (
            <ToolHub
              shortcutCount={allShortcuts.length}
              folderCount={allFolders.length}
              widgetCount={widgetOrder.filter((key) => state.settings.widgets[key]).length}
              syncLabel={sync.user ? "已登录" : "未登录"}
              onOpenWidgets={() => goToPage("widgets")}
              onOpenShortcuts={() => goToPage("shortcuts")}
              onAddShortcut={() => setDialog("shortcut")}
              onAddFolder={() => setDialog("folder")}
              onSync={() => setDialog("sync")}
              onSettings={() => setDialog("library")}
              onTimezone={() => setDialog("timezone")}
              onRefresh={() => { void refreshExternalData(state, true); }}
              onWallpaper={rotateMainWallpaper}
            />
          ) : (
            <section
              className="shortcut-stage"
              onContextMenu={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest(".shortcut") || target.closest(".folder-tile") || target.closest("input") || target.closest("button") || target.closest("a")) return;
                event.preventDefault();
                setPageMenu({ x: event.clientX, y: event.clientY });
              }}
            >
              <section className="shortcuts-panel" style={{ "--glass": state.settings.glass / 100 } as React.CSSProperties}>
                <div className={"shortcut-grid " + state.settings.gridDensity} style={{ "--icon": state.settings.iconSize + "px" } as React.CSSProperties}>
                  {shortcutTiles.map((item) => {
                    if (item.kind === "folder") {
                      const folder = item.folder;
                      return (
                        <article
                          className="shortcut folder-tile"
                          key={folder.id}
                          onClick={() => setOpenFolderId(folder.id)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setEditingFolder(folder);
                            setDialog("folder");
                          }}
                        >
                          <button className="folder-open" title={"打开 " + folder.name}>
                            <span className={"shortcut-icon folder-icon " + (folder.iconUrl ? "has-image" : "")} style={{ "--folder-color": folder.iconColor } as React.CSSProperties}>
                              {folder.iconUrl ? <img src={folder.iconUrl} alt="" /> : <Folder size={Math.round(state.settings.iconSize * 0.46)} />}
                            </span>
                            <span>{folder.name}</span>
                          </button>
                        </article>
                      );
                    }
                    const shortcut = item.shortcut;
                    return (
                      <article
                        className="shortcut"
                        draggable
                        key={shortcut.id}
                        onDragStart={() => setDragId(shortcut.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => moveShortcut(shortcut.id)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setShortcutMenu({ x: event.clientX, y: event.clientY, shortcutId: shortcut.id });
                        }}
                      >
                        <a href={shortcut.url} title={shortcut.url} target="_blank" rel="noreferrer">
                          <span className="shortcut-icon" style={{ backgroundColor: shortcut.iconColor }}>
                            <ShortcutIconContent url={shortcut.url} iconUrl={shortcut.iconUrl} fallback={shortcut.title.slice(0, 1)} />
                          </span>
                          <span>{shortcut.title}</span>
                        </a>
                        <span className="drag-corner" title="拖拽排序"><GripVertical size={14} /></span>
                      </article>
                    );
                  })}
                  {!shortcuts.length && !visibleFolders.length && (
                    <button className="empty-shortcut" onClick={() => setDialog("shortcut")}><Plus size={22} /> 添加第一个网站</button>
                  )}
                </div>
              </section>
            </section>
          )}
        </section>

        {activePage === "shortcuts" && state.settings.dockPosition === "bottom" && <Dock shortcuts={pinned} />}
      </div>

      {shortcutMenu && (
        <ShortcutContextMenu
          menu={shortcutMenu}
          shortcut={allShortcuts.find((item) => item.id === shortcutMenu.shortcutId)}
          onClose={() => setShortcutMenu(null)}
          onEdit={(shortcut) => { setEditingShortcut(shortcut); setDialog("shortcut"); setShortcutMenu(null); }}
          onPin={togglePinned}
          onDelete={deleteShortcut}
        />
      )}
      {pageMenu && (
        <PageContextMenu
          menu={pageMenu}
          onClose={() => setPageMenu(null)}
          onAddFolder={() => { setDialog("folder"); setPageMenu(null); }}
          onAddShortcut={() => { setDialog("shortcut"); setPageMenu(null); }}
          onAddGroup={() => { addGroup(); setPageMenu(null); }}
          onSettings={() => { setDialog("library"); setPageMenu(null); }}
        />
      )}
      {widgetMenu && (
        <WidgetContextMenu
          menu={widgetMenu}
          onClose={() => setWidgetMenu(null)}
          onOpenLibrary={() => { setDialog("library"); setWidgetMenu(null); }}
          onRefresh={() => { void refreshExternalData(state, true); setWidgetMenu(null); }}
          onRotateWallpaper={() => { rotateMainWallpaper(); setWidgetMenu(null); }}
          onHide={(key) => { setWidgetEnabled(key, false); setWidgetMenu(null); showToast("已隐藏" + widgetNames[key]); }}
        />
      )}
      {dialog === "shortcut" && (
        <ShortcutDialog
          shortcut={editingShortcut}
          groups={state.shortcutGroups.filter((group) => !group.deletedAt)}
          folders={(state.shortcutFolders || []).filter((folder) => !folder.deletedAt)}
          onClose={() => { setDialog(null); setEditingShortcut(undefined); }}
          onSave={saveShortcut}
        />
      )}
      {dialog === "folder" && (
        <FolderDialog
          folder={editingFolder}
          groups={state.shortcutGroups.filter((group) => !group.deletedAt)}
          onClose={() => { setDialog(null); setEditingFolder(undefined); }}
          onSave={saveFolder}
          onDelete={editingFolder ? () => deleteFolder(editingFolder.id) : undefined}
        />
      )}
      {openFolder && (
        <FolderView
          folder={openFolder}
          shortcuts={folderShortcuts}
          onClose={() => setOpenFolderId(undefined)}
          onAdd={() => {
            setEditingShortcut({
              id: "",
              title: "",
              url: "",
              iconColor: openFolder.iconColor,
              groupId: openFolder.groupId,
              folderId: openFolder.id,
              pinned: false,
              order: state.shortcuts.length,
              updatedAt: nowIso()
            });
            setDialog("shortcut");
          }}
          onEditFolder={() => { setEditingFolder(openFolder); setDialog("folder"); }}
          onShortcutMenu={(event, shortcut) => {
            event.preventDefault();
            setShortcutMenu({ x: event.clientX, y: event.clientY, shortcutId: shortcut.id });
          }}
        />
      )}
      {dialog === "import" && (
        <ImportDialog
          existingShortcuts={allShortcuts}
          onClose={() => setDialog(null)}
          onImport={(text, mode) => {
            const rows = parseImportText(text);
            const liveGroups = state.shortcutGroups.filter((group) => !group.deletedAt);
            const liveFolders = (state.shortcutFolders || []).filter((folder) => !folder.deletedAt);
            if (mode === "replace") {
              const converted = importedToShortcuts(rows, [], 0, []);
              const deletedAt = nowIso();
              updateState((current) => ({
                ...current,
                shortcutGroups: [
                  ...current.shortcutGroups.map((group) => ({ ...group, deletedAt, updatedAt: deletedAt })),
                  ...converted.groups
                ],
                shortcutFolders: [
                  ...(current.shortcutFolders || []).map((folder) => ({ ...folder, deletedAt, updatedAt: deletedAt })),
                  ...converted.folders
                ],
                shortcuts: [
                  ...current.shortcuts.map((shortcut) => ({ ...shortcut, pinned: false, deletedAt, updatedAt: deletedAt })),
                  ...converted.shortcuts
                ]
              }));
              setActiveLayer("all");
              showToast(`已按文件顺序重建 ${converted.shortcuts.length} 个快捷导航`);
            } else {
              const converted = importedToShortcuts(rows, liveGroups, allShortcuts.length, liveFolders);
              updateState((current) => ({
                ...current,
                shortcutGroups: converted.groups,
                shortcutFolders: converted.folders,
                shortcuts: [...current.shortcuts, ...converted.shortcuts]
              }));
              showToast(`已追加导入 ${converted.shortcuts.length} 个快捷导航`);
            }
            setDialog(null);
          }}
        />
      )}
      {dialog === "library" && (
        <ResourceCenterDialog
          state={state}
          updateState={updateState}
          shortcuts={allShortcuts}
          onEditShortcut={(shortcut) => {
            setEditingShortcut(shortcut);
            setDialog("shortcut");
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          state={state}
          updateCheck={updateCheck}
          updateState={updateState}
          onImport={() => setDialog("import")}
          onExport={exportData}
          onCheckUpdate={() => runUpdateCheck(true)}
          onClose={() => {
            setDialog(null);
            void refreshExternalData(state, true);
          }}
        />
      )}
      {dialog === "sync" && (
        <SyncDialog
          state={state}
          sync={sync}
          updateState={updateState}
          onClose={() => setDialog(null)}
          onLogin={async (mode, email, password) => {
            const { supabaseUrl, supabaseAnonKey } = state.settings;
            if (!supabaseUrl || !supabaseAnonKey) throw new Error("同步服务暂未配置，请稍后再试");
            if (mode === "login") {
              await signIn(supabaseUrl, supabaseAnonKey, email, password);
              await refreshUser();
              await performAutoSync("登录后自动同步");
              return { status: "signed-in", message: "登录成功，正在同步数据。" };
            }

            const result = await signUp(supabaseUrl, supabaseAnonKey, email, password, getAuthRedirectUrl());
            if (!result.session) {
              await refreshUser();
              const message = "注册申请已提交。请打开邮箱完成验证，验证后再回来登录同步。";
              setSync((old) => ({ ...old, user: null, syncing: false, message: "等待邮箱验证" }));
              return { status: "verification-sent", message };
            }

            await refreshUser();
            await performAutoSync("登录后自动同步");
            return { status: "signed-in", message: "注册成功，已登录并开始同步。" };
          }}
          onSignOut={async () => {
            await signOut(state.settings.supabaseUrl, state.settings.supabaseAnonKey);
            await refreshUser();
          }}
          onSync={doSync}
          restoreAvailable={restoreAvailable}
          onRestore={restorePreviousSync}
        />
      )}
      {dialog === "timezone" && (
        <TimeZoneDialog
          current={selectedTimeZone}
          onClose={() => setDialog(null)}
          onChoose={chooseTimeZone}
        />
      )}
      {toast && (
        <div className="toast">
          <span>{toast}</span>
          {undoSnapshotRef.current && undoLabel && <button type="button" onClick={undoLastChange}>撤销</button>}
        </div>
      )}
    </main>
  );
}

function ToolHub({ shortcutCount, folderCount, widgetCount, syncLabel, onOpenWidgets, onOpenShortcuts, onAddShortcut, onAddFolder, onSync, onSettings, onTimezone, onRefresh, onWallpaper }: {
  shortcutCount: number;
  folderCount: number;
  widgetCount: number;
  syncLabel: string;
  onOpenWidgets: () => void;
  onOpenShortcuts: () => void;
  onAddShortcut: () => void;
  onAddFolder: () => void;
  onSync: () => void;
  onSettings: () => void;
  onTimezone: () => void;
  onRefresh: () => void;
  onWallpaper: () => void;
}) {
  const [translateText, setTranslateText] = useState("");
  const [numberText, setNumberText] = useState("2026");
  const [pxText, setPxText] = useState("16");
  const [baseText, setBaseText] = useState("16");
  const numericValue = Number(numberText);
  const validNumber = Number.isFinite(numericValue);
  const pxValue = Number(pxText);
  const baseValue = Number(baseText);
  const remValue = Number.isFinite(pxValue) && Number.isFinite(baseValue) && baseValue > 0 ? pxValue / baseValue : undefined;
  const openTranslate = () => {
    const query = translateText.trim();
    const url = query
      ? `https://translate.google.com/?sl=auto&tl=zh-CN&text=${encodeURIComponent(query)}&op=translate`
      : "https://translate.google.com/";
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const tools: Array<{ title: string; desc: string; icon: React.ReactNode; action: () => void; primary?: boolean; accent?: string }> = [
    { title: "资源中心", desc: `${widgetCount} 个小组件 · 壁纸/图标`, icon: <Palette size={22} />, action: onSettings, primary: true },
    { title: "网站管理", desc: `${shortcutCount} 个网站 · ${folderCount} 个文件夹`, icon: <Layers size={22} />, action: onOpenShortcuts, primary: true },
    { title: "新建网站", desc: "添加一个常用入口", icon: <Plus size={22} />, action: onAddShortcut },
    { title: "新建文件夹", desc: "整理同类网站", icon: <FolderPlus size={22} />, action: onAddFolder },
    { title: "云同步", desc: syncLabel, icon: <UserCircle size={22} />, action: onSync },
    { title: "刷新数据", desc: "天气与汇率", icon: <RefreshCcw size={22} />, action: onRefresh },
    { title: "时区", desc: "调整时间显示", icon: <Clock3 size={22} />, action: onTimezone },
    { title: "换壁纸", desc: "切换内置背景", icon: <Shuffle size={22} />, action: onWallpaper },
    { title: "回到主页", desc: "查看小组件", icon: <CalendarDays size={22} />, action: onOpenWidgets }
  ];

  return (
    <section className="tool-hub" aria-label="工具箱">
      <div className="tool-hero">
        <div>
          <span>Tools</span>
          <h2>工具箱</h2>
          <p>把 Wetab 里常用的工具入口集中到左侧导航，不再藏在设置和右键菜单里。</p>
        </div>
      </div>
      <div className="tool-utility-grid">
        <section className="tool-utility-panel translate-tool">
          <div className="tool-panel-title"><Search size={18} /><span>翻译</span></div>
          <textarea value={translateText} onChange={(event) => setTranslateText(event.target.value)} placeholder="输入内容后打开翻译" />
          <button type="button" className="primary" onClick={openTranslate}>打开翻译</button>
        </section>
        <section className="tool-utility-panel number-tool">
          <div className="tool-panel-title"><BookOpen size={18} /><span>数字工具</span></div>
          <input inputMode="decimal" value={numberText} onChange={(event) => setNumberText(event.target.value)} />
          <div className="tool-result-grid">
            <div><span>二进制</span><strong>{validNumber ? Math.trunc(numericValue).toString(2) : "--"}</strong></div>
            <div><span>十六进制</span><strong>{validNumber ? Math.trunc(numericValue).toString(16).toUpperCase() : "--"}</strong></div>
          </div>
        </section>
        <section className="tool-utility-panel size-tool">
          <div className="tool-panel-title"><TimerReset size={18} /><span>尺寸换算</span></div>
          <div className="tool-inline-inputs">
            <label><span>px</span><input inputMode="decimal" value={pxText} onChange={(event) => setPxText(event.target.value)} /></label>
            <label><span>base</span><input inputMode="decimal" value={baseText} onChange={(event) => setBaseText(event.target.value)} /></label>
          </div>
          <div className="tool-result-large">{remValue === undefined ? "--" : `${Number(remValue.toFixed(4))}rem`}</div>
        </section>
      </div>
      <div className="tool-action-grid">
        {tools.map((tool) => (
          <button type="button" className={["tool-card", tool.primary ? "primary-tool" : "", tool.accent || ""].filter(Boolean).join(" ")} key={tool.title} onClick={tool.action}>
            <span className="tool-icon">{tool.icon}</span>
            <strong>{tool.title}</strong>
            <span>{tool.desc}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function HomeShortcuts({ tiles, iconSize, onOpenFolder, onShortcutMenu, onMoveTile }: {
  tiles: Array<{ kind: "folder"; folder: ShortcutFolder; order: number } | { kind: "shortcut"; shortcut: Shortcut; order: number }>;
  iconSize: number;
  onOpenFolder: (folderId: string) => void;
  onShortcutMenu: (event: MouseEvent, shortcut: Shortcut) => void;
  onMoveTile: (source?: HomeTileRef | string, target?: HomeTileRef | string) => void;
}) {
  const [draggingKey, setDraggingKey] = useState<HomeTileRef | undefined>();
  const [touchArranging, setTouchArranging] = useState(false);
  const [touchSource, setTouchSource] = useState<HomeTileRef | undefined>();
  const [dropKey, setDropKey] = useState<HomeTileRef | undefined>();
  const tileKey = (item: { kind: "folder"; folder: ShortcutFolder } | { kind: "shortcut"; shortcut: Shortcut }): HomeTileRef => (
    item.kind === "folder" ? `folder:${item.folder.id}` : `shortcut:${item.shortcut.id}`
  );
  const tileClass = (base: string, key: HomeTileRef) => [
    base,
    draggingKey === key ? "is-dragging" : "",
    dropKey === key && draggingKey !== key ? "is-drop-target" : "",
    touchSource === key ? "is-touch-source" : ""
  ].filter(Boolean).join(" ");
  const clearDropMarkers = () => {
    document.querySelectorAll(".home-shortcut.is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
  };
  const clearDragMarkers = () => {
    clearDropMarkers();
    document.querySelectorAll(".home-shortcut.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
  };
  const startDrag = (event: React.DragEvent, key: HomeTileRef) => {
    setDraggingKey(key);
    document.body.classList.add("is-home-dragging");
    event.currentTarget.classList.add("is-dragging");
    event.dataTransfer.setData("text/whytab-home-tile", key);
    event.dataTransfer.effectAllowed = "move";
  };
  const endDrag = () => {
    setDraggingKey(undefined);
    setDropKey(undefined);
    document.body.classList.remove("is-home-dragging");
    clearDragMarkers();
  };
  const overTile = (event: React.DragEvent, key: HomeTileRef) => {
    if (!draggingKey || draggingKey === key) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    clearDropMarkers();
    event.currentTarget.classList.add("is-drop-target");
    setDropKey(key);
  };
  const leaveTile = (event: React.DragEvent, key: HomeTileRef) => {
    if (dropKey === key && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
      event.currentTarget.classList.remove("is-drop-target");
      setDropKey(undefined);
    }
  };
  const dropTile = (event: React.DragEvent, key: HomeTileRef) => {
    event.preventDefault();
    onMoveTile(event.dataTransfer.getData("text/whytab-home-tile"), key);
    endDrag();
  };
  const chooseTouchTarget = (key: HomeTileRef) => {
    if (!touchSource) {
      setTouchSource(key);
      return;
    }
    if (touchSource !== key) onMoveTile(touchSource, key);
    setTouchSource(undefined);
  };
  return (
    <section className={`home-shortcuts ${draggingKey ? "is-arranging" : ""} ${touchArranging ? "touch-arranging" : ""}`} aria-label="主页快捷入口">
      <div className="mobile-shortcut-toolbar">
        <span>{touchSource ? "已选中，点目标位置" : "点选图标调整位置"}</span>
        <button
          type="button"
          className={touchArranging ? "active" : ""}
          onClick={() => {
            setTouchArranging((current) => !current);
            setTouchSource(undefined);
          }}
        >
          {touchArranging ? "完成" : "整理"}
        </button>
      </div>
      <div className="home-shortcuts-row" style={{ "--icon": Math.max(46, Math.min(iconSize, 68)) + "px" } as React.CSSProperties}>
        {tiles.map((item) => {
          const key = tileKey(item);
          return item.kind === "folder" ? (
          <button
            type="button"
            className={tileClass("home-shortcut folder-home", key)}
            key={"folder-" + item.folder.id}
            onClick={() => {
              if (touchArranging) {
                chooseTouchTarget(key);
                return;
              }
              onOpenFolder(item.folder.id);
            }}
            title={item.folder.name}
            draggable
            onDragStart={(event) => startDrag(event, key)}
            onDragEnd={endDrag}
            onDragEnter={(event) => overTile(event, key)}
            onDragOver={(event) => overTile(event, key)}
            onDragLeave={(event) => leaveTile(event, key)}
            onDrop={(event) => dropTile(event, key)}
          >
            <span className={"shortcut-icon folder-icon " + (item.folder.iconUrl ? "has-image" : "")} style={{ "--folder-color": item.folder.iconColor } as React.CSSProperties}>
              {item.folder.iconUrl ? <img src={item.folder.iconUrl} alt="" /> : <Folder size={Math.round(Math.max(46, Math.min(iconSize, 68)) * 0.46)} />}
            </span>
            <span>{item.folder.name}</span>
          </button>
        ) : (
          <a
            className={tileClass("home-shortcut", key)}
            href={item.shortcut.url}
            key={item.shortcut.id}
            title={item.shortcut.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (!touchArranging) return;
              event.preventDefault();
              event.stopPropagation();
              chooseTouchTarget(key);
            }}
            onContextMenu={(event) => onShortcutMenu(event, item.shortcut)}
            draggable
            onDragStart={(event) => startDrag(event, key)}
            onDragEnd={endDrag}
            onDragEnter={(event) => overTile(event, key)}
            onDragOver={(event) => overTile(event, key)}
            onDragLeave={(event) => leaveTile(event, key)}
            onDrop={(event) => dropTile(event, key)}
          >
            <span className="shortcut-icon" style={{ backgroundColor: item.shortcut.iconColor }}>
              <ShortcutIconContent url={item.shortcut.url} iconUrl={item.shortcut.iconUrl} fallback={item.shortcut.title.slice(0, 1)} />
            </span>
            <span>{item.shortcut.title}</span>
          </a>
        )})}
      </div>
    </section>
  );
}

function Dock({ shortcuts }: { shortcuts: Shortcut[] }) {
  if (!shortcuts.length) return null;
  return (
    <nav className="dock" aria-label="固定快捷入口">
      {shortcuts.slice(0, 14).map((shortcut) => (
        <a key={shortcut.id} href={shortcut.url} title={shortcut.title} target="_blank" rel="noreferrer" style={{ backgroundColor: shortcut.iconColor }}>
          <ShortcutIconContent url={shortcut.url} iconUrl={shortcut.iconUrl} fallback={shortcut.title.slice(0, 1)} />
        </a>
      ))}
    </nav>
  );
}

function ShortcutContextMenu({ menu, shortcut, onClose, onEdit, onPin, onDelete }: {
  menu: Exclude<ShortcutMenuState, null>;
  shortcut?: Shortcut;
  onClose: () => void;
  onEdit: (shortcut: Shortcut) => void;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  if (!shortcut) return null;
  const left = Math.min(menu.x, window.innerWidth - 188);
  const top = Math.min(menu.y, window.innerHeight - 188);
  return (
    <div className="shortcut-menu" style={{ left, top }} onClick={(event) => event.stopPropagation()}>
      <a href={shortcut.url} target="_blank" rel="noreferrer">打开新标签页</a>
      <button onClick={() => onPin(shortcut.id)}><Pin size={14} /> {shortcut.pinned ? "从主页移除" : "放到主页"}</button>
      <button onClick={() => onEdit(shortcut)}><Edit3 size={14} /> 编辑图标</button>
      <button className="danger" onClick={() => onDelete(shortcut.id)}><Trash2 size={14} /> 删除</button>
    </div>
  );
}

function PageContextMenu({ menu, onClose, onAddFolder, onAddShortcut, onAddGroup, onSettings }: {
  menu: Exclude<PageMenuState, null>;
  onClose: () => void;
  onAddFolder: () => void;
  onAddShortcut: () => void;
  onAddGroup: () => void;
  onSettings: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);
  const left = Math.min(menu.x, window.innerWidth - 220);
  const top = Math.min(menu.y, window.innerHeight - 260);
  return (
    <div className="shortcut-menu page-menu" style={{ left, top }} onClick={(event) => event.stopPropagation()}>
      <button onClick={onAddShortcut}><Plus size={14} /> 添加网站</button>
      <button onClick={onAddFolder}><FolderPlus size={14} /> 新建文件夹</button>
      <button onClick={onAddGroup}><Layers size={14} /> 新建分类</button>
      <button onClick={onSettings}><Palette size={14} /> 资源中心</button>
    </div>
  );
}

function WidgetContextMenu({ menu, onClose, onOpenLibrary, onRefresh, onRotateWallpaper, onHide }: {
  menu: Exclude<WidgetMenuState, null>;
  onClose: () => void;
  onOpenLibrary: () => void;
  onRefresh: () => void;
  onRotateWallpaper: () => void;
  onHide: (key: WidgetKey) => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);
  const left = Math.min(menu.x, window.innerWidth - 236);
  const top = Math.min(menu.y, window.innerHeight - 250);
  const widgetName = menu.widgetKey ? widgetNames[menu.widgetKey] : "主页";
  return (
    <div className="shortcut-menu page-menu widget-menu" style={{ left, top }} onClick={(event) => event.stopPropagation()}>
      <strong>{widgetName}</strong>
      <button onClick={onOpenLibrary}><Palette size={14} /> 小组件库与外观</button>
      <button onClick={onRefresh}><RefreshCcw size={14} /> 刷新数据</button>
      <button onClick={onRotateWallpaper}><Shuffle size={14} /> 换一张壁纸</button>
      {menu.widgetKey && <button onClick={() => onHide(menu.widgetKey!)}><EyeOff size={14} /> 隐藏这个组件</button>}
    </div>
  );
}

function LayerRail({ activeLayer, groups, shortcuts, onSelect, onAddGroup, onRenameGroup, onDeleteGroup }: {
  activeLayer: string;
  groups: AppState["shortcutGroups"];
  shortcuts: Shortcut[];
  onSelect: (layer: string) => void;
  onAddGroup: () => void;
  onRenameGroup: (id: string) => void;
  onDeleteGroup: (id: string) => void;
}) {
  const countFor = (groupId: string) => shortcuts.filter((shortcut) => shortcut.groupId === groupId).length;
  return (
    <nav className="layer-rail panel" aria-label="快捷导航分层">
      <div className="layer-head">
        <span>分类</span>
        <button title="新增分类" onClick={onAddGroup}><Plus size={14} /></button>
      </div>
      <button className={activeLayer === "all" ? "active" : ""} onClick={() => onSelect("all")}>
        <Layers size={17} />
        <span>全部</span>
        <small>{shortcuts.length}</small>
      </button>
      <button className={activeLayer === "pinned" ? "active" : ""} onClick={() => onSelect("pinned")}>
        <Star size={17} />
        <span>固定</span>
        <small>{shortcuts.filter((shortcut) => shortcut.pinned).length}</small>
      </button>
      {groups.map((group) => (
        <div className={`layer-row ${activeLayer === group.id ? "active" : ""}`} key={group.id}>
          <button className="layer-main" onClick={() => onSelect(group.id)}>
            <span className="group-dot" style={{ backgroundColor: group.color }} />
            <span>{group.name}</span>
            <small>{countFor(group.id)}</small>
          </button>
          <div className="layer-actions">
            <button title="重命名分类" onClick={() => onRenameGroup(group.id)}><Edit3 size={13} /></button>
            <button title="删除分类" onClick={() => onDeleteGroup(group.id)}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
    </nav>
  );
}

function Widget({ title, action, children, tone = "default", size = "medium", widgetKey }: { title: string; action?: React.ReactNode; children: React.ReactNode; tone?: string; size?: WidgetSize; widgetKey?: WidgetKey }) {
  return (
    <section
      className={`widget widget-${tone} widget-size-${size}`}
      data-widget-key={widgetKey}
      draggable={Boolean(widgetKey)}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button") || target.closest("input") || target.closest("select") || target.closest("textarea") || target.closest("a") || target.closest("label")) {
          event.stopPropagation();
        }
      }}
      onDragStart={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button") || target.closest("input") || target.closest("select") || target.closest("textarea") || target.closest("a") || target.closest("label")) {
          event.preventDefault();
          return;
        }
        if (widgetKey) {
          event.dataTransfer.setData("text/whytab-widget", widgetKey);
          event.dataTransfer.effectAllowed = "move";
        }
      }}
    >
      <div className="widget-title">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function WeatherWidget({ widgetKey, size, weather, city, useLocation, refreshing, onRefresh }: { widgetKey: WidgetKey; size: WidgetSize; weather?: WeatherState; city: string; useLocation: boolean; refreshing: boolean; onRefresh: () => Promise<void> }) {
  const source = weather?.sourceUrl || "https://open-meteo.com/";
  const dayLimit = size === "small" ? 0 : size === "medium" ? 4 : 6;
  const days = weather?.forecast?.slice(0, dayLimit) || [];
  const weatherTone = weatherToneForCode(weather?.weatherCode);
  const placeLabel = weather ? weather.city : city;
  const compactPlace = placeLabel
    .replace(/\s*,\s*(China|中国)$/i, "")
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ") || placeLabel;
  return (
    <Widget title="天气" widgetKey={widgetKey} tone={`weather weather-${weatherTone}`} size={size} action={<button title={refreshing ? "正在刷新" : "刷新天气"} disabled={refreshing} onClick={() => void onRefresh()}><RefreshCcw size={14} className={refreshing ? "spin" : undefined} /></button>}>
      <div className="weather-scene" aria-hidden="true">
        <span className="weather-sun" />
        <span className="weather-cloud one" />
        <span className="weather-cloud two" />
        <span className="weather-rain-lines" />
        <span className="weather-snow-dots" />
        <span className="weather-bolt" />
        <span className="weather-fog-lines" />
      </div>
      <a className="weather-card" href={source} target="_blank" rel="noreferrer" title="打开天气数据来源">
        <div className="weather-line">
          <strong>{weather ? `${Math.round(weather.temperature)}°` : "--"}</strong>
          <span>{weather ? weatherLabel(weather.weatherCode) : city}</span>
        </div>
        <p>{weather ? `${useLocation ? "定位" : "城市"} · ${compactPlace} · 风速 ${weather.windSpeed} km/h` : "等待天气数据"}</p>
      </a>
      {days.length > 0 && (
        <div className="forecast-strip" aria-label={`${days.length} 天天气预报`}>
          {days.map((day) => {
            const date = new Date(`${day.date}T00:00:00`);
            const dayTone = weatherToneForCode(day.weatherCode);
            return (
              <a className={`forecast-${dayTone}`} href={source} target="_blank" rel="noreferrer" key={day.date} title={`${day.date} ${weatherLabel(day.weatherCode)}`}>
                <span>{date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span>
                <strong>{Math.round(day.temperatureMax)}°</strong>
                <small>{Math.round(day.temperatureMin)}°</small>
              </a>
            );
          })}
        </div>
      )}
    </Widget>
  );
}

function CalendarWidget({ widgetKey, size, date, state, updateState }: { widgetKey: WidgetKey; size: WidgetSize; date: Date; state: AppState; updateState: (updater: (state: AppState) => AppState) => void }) {
  const [editingDate, setEditingDate] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const records = state.settings.calendarRecords || {};
  const days = useMemo(() => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = first.getDay();
    const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return Array.from({ length: start + count }, (_, index) => {
      if (index < start) return undefined;
      const day = index - start + 1;
      const value = new Date(date.getFullYear(), date.getMonth(), day);
      return { day, key: calendarDateKey(value) };
    });
  }, [date]);

  const openDate = (key: string) => {
    setEditingDate(key);
    setDraft(records[key] || "");
  };
  const saveRecord = () => {
    if (!editingDate) return;
    const text = draft.trim();
    updateState((current) => {
      const nextRecords = { ...(current.settings.calendarRecords || {}) };
      if (text) nextRecords[editingDate] = text;
      else delete nextRecords[editingDate];
      return {
        ...current,
        settings: { ...current.settings, calendarRecords: nextRecords, updatedAt: nowIso() }
      };
    });
    setEditingDate(undefined);
  };
  const clearRecord = () => {
    if (!editingDate) return;
    updateState((current) => {
      const nextRecords = { ...(current.settings.calendarRecords || {}) };
      delete nextRecords[editingDate];
      return {
        ...current,
        settings: { ...current.settings, calendarRecords: nextRecords, updatedAt: nowIso() }
      };
    });
    setDraft("");
    setEditingDate(undefined);
  };

  const todayKey = calendarDateKey(date);
  const weekdayLabel = date.toLocaleDateString("zh-CN", { weekday: "long" });

  if (size === "small") {
    return (
      <Widget title={(date.getMonth() + 1) + " 月"} widgetKey={widgetKey} tone="calendar" size={size} action={<button type="button" title="记录今天" onClick={() => openDate(todayKey)}><CalendarDays size={16} /></button>}>
        <button type="button" className="calendar-mini-card" onClick={() => openDate(todayKey)} title={records[todayKey] || "点击记录今天"}>
          <strong>{date.getDate()}</strong>
          <span>{weekdayLabel}</span>
          {records[todayKey] && <small>{records[todayKey]}</small>}
        </button>
        {editingDate && (
          <DialogShell title={calendarDateLabel(editingDate)} onClose={() => setEditingDate(undefined)} className="widget-popover calendar-popover">
            <div className="calendar-editor">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="记录这一天要做的事" autoFocus />
              <div className="calendar-editor-actions">
                <button type="button" onClick={clearRecord}>清除</button>
                <button type="button" className="primary-mini" onClick={saveRecord}>保存</button>
              </div>
            </div>
          </DialogShell>
        )}
      </Widget>
    );
  }

  return (
    <Widget title={(date.getMonth() + 1) + " 月"} widgetKey={widgetKey} tone="calendar" size={size} action={<button type="button" title="记录今天" onClick={() => openDate(todayKey)}><CalendarDays size={16} /></button>}>
      <div className="calendar-grid calendar-clickable">
        {["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day} className="muted calendar-weekday">{day}</span>)}
        {days.map((item, index) => item ? (
          <button
            type="button"
            key={item.key}
            className={[
              item.day === date.getDate() ? "today" : "",
              records[item.key] ? "has-record" : ""
            ].filter(Boolean).join(" ")}
            onClick={() => openDate(item.key)}
            title={records[item.key] || "点击记录当天事项"}
          >
            <span>{item.day}</span>
          </button>
        ) : <span key={"empty-" + index} className="calendar-empty" />)}
      </div>
      {editingDate && (
        <DialogShell title={calendarDateLabel(editingDate)} onClose={() => setEditingDate(undefined)} className="widget-popover calendar-popover">
          <div className="calendar-editor">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="记录这一天要做的事" autoFocus />
            <div className="calendar-editor-actions">
              <button type="button" onClick={clearRecord}>清除</button>
              <button type="button" className="primary-mini" onClick={saveRecord}>保存</button>
            </div>
          </div>
        </DialogShell>
      )}
    </Widget>
  );
}

function CountdownWidget({ widgetKey, size, state, updateState }: { widgetKey: WidgetKey; size: WidgetSize; state: AppState; updateState: (updater: (state: AppState) => AppState) => void }) {
  const addCountdown = () => {
    const title = window.prompt("倒计时名称");
    const date = window.prompt("日期，例如 2026-12-31");
    if (!title || !date) return;
    const item: Countdown = { id: uid(), title, date, updatedAt: nowIso() };
    updateState((current) => ({ ...current, countdowns: [...current.countdowns, item] }));
  };
  return (
    <Widget title="倒计时" widgetKey={widgetKey} tone="countdown" size={size} action={<button title="添加" onClick={addCountdown}><Plus size={14} /></button>}>
      {state.countdowns.filter((item) => !item.deletedAt).map((item) => {
        const days = Math.ceil((new Date(`${item.date}T00:00:00`).getTime() - Date.now()) / 86400000);
        return (
          <div className="list-row" key={item.id}>
            <span>{item.title}</span>
            <strong>{days >= 0 ? `${days} 天` : `已过 ${Math.abs(days)} 天`}</strong>
            <button
              title="删除倒计时"
              onClick={() => {
                const deletedAt = nowIso();
                updateState((current) => ({
                  ...current,
                  countdowns: current.countdowns.map((countdown) =>
                    countdown.id === item.id ? { ...countdown, deletedAt, updatedAt: deletedAt } : countdown
                  )
                }));
              }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </Widget>
  );
}

function TodoWidget({ widgetKey, size, state, updateState }: { widgetKey: WidgetKey; size: WidgetSize; state: AppState; updateState: (updater: (state: AppState) => AppState) => void }) {
  const [text, setText] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const todos = state.todos.filter((item) => !item.deletedAt).sort((a, b) => a.order - b.order);
  const activeCount = todos.filter((todo) => !todo.done).length;
  const doneCount = todos.length - activeCount;
  const visibleTodos = todos.slice(0, 3);
  const add = () => {
    if (!text.trim()) return;
    const todo: Todo = {
      id: uid(),
      text: text.trim(),
      done: false,
      order: todos.length,
      updatedAt: nowIso()
    };
    updateState((current) => ({ ...current, todos: [...current.todos, todo] }));
    setText("");
  };
  const toggleTodo = (id: string) => updateState((current) => ({
    ...current,
    todos: current.todos.map((item) => item.id === id ? { ...item, done: !item.done, updatedAt: nowIso() } : item)
  }));
  const deleteTodo = (id: string) => {
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      todos: current.todos.map((item) => item.id === id ? { ...item, deletedAt, updatedAt: deletedAt } : item)
    }));
  };
  const clearDone = () => {
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      todos: current.todos.map((item) => item.done && !item.deletedAt ? { ...item, deletedAt, updatedAt: deletedAt } : item)
    }));
  };
  const todoRows = (items: Todo[]) => items.map((todo) => (
    <label className="todo" key={todo.id}>
      <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)} />
      <span>{todo.text}</span>
      <button type="button" title="删除" onClick={(event) => { event.preventDefault(); event.stopPropagation(); deleteTodo(todo.id); }}>
        <X size={13} />
      </button>
    </label>
  ));
  return (
    <Widget
      title="To Do"
      widgetKey={widgetKey}
      tone="todo"
      size={size}
      action={<button type="button" className="todo-count" title="管理任务" onClick={() => setPanelOpen(true)}>{activeCount}/{todos.length}</button>}
    >
      <div className="input-row">
        <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="新增任务" />
        <button type="button" title="添加" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); add(); }}><Plus size={14} /></button>
      </div>
      <div className="todo-preview">
        {visibleTodos.length ? todoRows(visibleTodos) : <button type="button" className="todo-empty" onClick={() => setPanelOpen(true)}>今天还没有任务</button>}
        {todos.length > visibleTodos.length && <button type="button" className="todo-more" onClick={() => setPanelOpen(true)}>还有 {todos.length - visibleTodos.length} 条，点击管理</button>}
      </div>
      {panelOpen && (
        <DialogShell title="To Do" onClose={() => setPanelOpen(false)} className="widget-popover todo-popover">
          <div className="todo-panel">
            <div className="input-row">
              <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="新增任务" autoFocus />
              <button type="button" title="添加" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); add(); }}><Plus size={14} /></button>
            </div>
            <div className="todo-panel-list">
              {todos.length ? todoRows(todos) : <p className="empty-state">还没有任务</p>}
            </div>
            {doneCount > 0 && <button type="button" className="clear-done" onClick={clearDone}>清除已完成</button>}
          </div>
        </DialogShell>
      )}
    </Widget>
  );
}

function PhotoWidget({ widgetKey, size, state, updateState }: { widgetKey: WidgetKey; size: WidgetSize; state: AppState; updateState: (updater: (state: AppState) => AppState) => void }) {
  const image = state.settings.photoFrameImage;
  const title = state.settings.photoFrameTitle || "我的照片";
  const savePhoto = async (file?: File) => {
    if (!file) return;
    const dataUrl = await shrinkImage(file);
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        photoFrameImage: dataUrl,
        photoFrameTitle: file.name.replace(/\.[^.]+$/, "") || "我的照片",
        updatedAt: nowIso()
      }
    }));
  };
  const clearPhoto = () => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        photoFrameImage: undefined,
        photoFrameTitle: undefined,
        updatedAt: nowIso()
      }
    }));
  };
  return (
    <Widget title="照片" widgetKey={widgetKey} tone="photo" size={size} action={image ? <button title="清除照片" onClick={clearPhoto}><X size={14} /></button> : undefined}>
      <div className={`photo-frame ${image ? "has-photo" : ""}`} style={image ? { "--photo-image": `url(${image})` } as React.CSSProperties : undefined}>
        {image ? <img src={image} alt={title} /> : (
          <label className="photo-upload">
            <ImageIcon size={28} />
            <span>上传照片</span>
            <input type="file" accept="image/*" onChange={(event) => void savePhoto(event.target.files?.[0])} />
          </label>
        )}
      </div>
    </Widget>
  );
}

function QuoteWidget({ widgetKey, size, date }: { widgetKey: WidgetKey; size: WidgetSize; date: Date }) {
  const [offset, setOffset] = useState(0);
  const quote = dailyQuotes[(Math.floor(date.getTime() / 86400000) + offset) % dailyQuotes.length];
  const nextQuote = () => setOffset((value) => (value + 1) % dailyQuotes.length);
  return (
    <Widget title="每日灵感" widgetKey={widgetKey} tone="quote" size={size} action={<button type="button" title="换一句" onClick={nextQuote}><Shuffle size={16} /></button>}>
      <button type="button" className="quote-card" onClick={nextQuote} title="点击换一句">
        <strong>{quote.text}</strong>
        <span>{quote.source}</span>
      </button>
    </Widget>
  );
}

function FocusWidget({ widgetKey, size }: { widgetKey: WidgetKey; size: WidgetSize }) {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          return 25 * 60;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  const progress = 1 - seconds / (25 * 60);
  return (
    <Widget title="专注" widgetKey={widgetKey} tone="focus" size={size} action={<Clock3 size={16} />}>
      <div className="focus-widget">
        <button className="focus-ring" style={{ "--progress": String(progress * 360) + "deg" } as React.CSSProperties} onClick={() => setRunning((value) => !value)} title={running ? "暂停" : "开始"}>
          <strong>{minutes}:{rest}</strong>
          <span>{running ? "暂停" : "开始"}</span>
        </button>
        <button className="focus-reset" onClick={() => { setRunning(false); setSeconds(25 * 60); }}><TimerReset size={14} /> 重置</button>
      </div>
    </Widget>
  );
}

function WorldClockWidget({ widgetKey, size, date, timeZone }: { widgetKey: WidgetKey; size: WidgetSize; date: Date; timeZone: string }) {
  const primaryZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  const zones = [
    { city: timeZoneLabels[primaryZone] || primaryZone.replace(/_/g, " "), zone: primaryZone },
    { city: "东京", zone: "Asia/Tokyo" },
    { city: "伦敦", zone: "Europe/London" },
    { city: "纽约", zone: "America/New_York" }
  ].filter((item, index, list) => list.findIndex((zone) => zone.zone === item.zone) === index);
  const timeFor = (zone: string, withSeconds = false) => new Intl.DateTimeFormat("zh-CN", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false
  }).format(date);
  const dayFor = (zone: string) => new Intl.DateTimeFormat("zh-CN", {
    timeZone: zone,
    weekday: "short",
    month: "numeric",
    day: "numeric"
  }).format(date);

  return (
    <Widget title="世界时钟" widgetKey={widgetKey} tone="clock" size={size} action={<Clock3 size={16} />}>
      <div className="world-clock-primary">
        <strong>{timeFor(zones[0].zone, true)}</strong>
        <span>{zones[0].city} · {dayFor(zones[0].zone)}</span>
      </div>
      <div className="world-clock-list">
        {zones.slice(1).map((item) => (
          <div key={item.zone}>
            <span>{item.city}</span>
            <strong>{timeFor(item.zone)}</strong>
          </div>
        ))}
      </div>
    </Widget>
  );
}

function MemoWidget({ widgetKey, size, state, updateState }: {
  widgetKey: WidgetKey;
  size: WidgetSize;
  state: AppState;
  updateState: (updater: (state: AppState) => AppState) => void;
}) {
  return (
    <Widget title="便签" widgetKey={widgetKey} tone="memo" size={size} action={<FileText size={16} />}>
      <textarea
        className="memo-editor"
        value={state.settings.quickNote || ""}
        onChange={(event) => {
          const quickNote = event.target.value;
          updateState((current) => ({
            ...current,
            settings: { ...current.settings, quickNote, updatedAt: nowIso() }
          }));
        }}
        placeholder="写下此刻最重要的事"
      />
    </Widget>
  );
}

function YearProgressWidget({ widgetKey, size, date }: { widgetKey: WidgetKey; size: WidgetSize; date: Date }) {
  const start = new Date(date.getFullYear(), 0, 1).getTime();
  const end = new Date(date.getFullYear() + 1, 0, 1).getTime();
  const progress = Math.min(1, Math.max(0, (date.getTime() - start) / (end - start)));
  const elapsedDays = Math.floor((date.getTime() - start) / 86400000) + 1;
  const totalDays = Math.round((end - start) / 86400000);

  return (
    <Widget title={`${date.getFullYear()} 年`} widgetKey={widgetKey} tone="year" size={size} action={<TrendingUp size={16} />}>
      <div className="year-progress-value">{(progress * 100).toFixed(1)}<span>%</span></div>
      <div className="year-progress-track"><i style={{ width: `${progress * 100}%` }} /></div>
      <div className="year-progress-meta">
        <span>第 {elapsedDays} 天</span>
        <span>剩余 {totalDays - elapsedDays} 天</span>
      </div>
    </Widget>
  );
}

function CalculatorWidget({ widgetKey, size }: { widgetKey: WidgetKey; size: WidgetSize }) {
  const [left, setLeft] = useState("64");
  const [right, setRight] = useState("2");
  const [operator, setOperator] = useState<"+" | "-" | "×" | "÷">("×");
  const a = Number(left);
  const b = Number(right);
  const result = !Number.isFinite(a) || !Number.isFinite(b)
    ? undefined
    : operator === "+" ? a + b
      : operator === "-" ? a - b
        : operator === "×" ? a * b
          : b === 0 ? undefined : a / b;

  return (
    <Widget title="计算器" widgetKey={widgetKey} tone="calculator" size={size} action={<Calculator size={16} />}>
      <div className="calculator-result">{result === undefined ? "--" : Number(result.toFixed(6)).toLocaleString("zh-CN")}</div>
      <div className="calculator-inputs">
        <input inputMode="decimal" value={left} onChange={(event) => setLeft(event.target.value)} aria-label="第一个数字" />
        <select value={operator} onChange={(event) => setOperator(event.target.value as "+" | "-" | "×" | "÷")} aria-label="运算符">
          {["+", "-", "×", "÷"].map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
        <input inputMode="decimal" value={right} onChange={(event) => setRight(event.target.value)} aria-label="第二个数字" />
      </div>
    </Widget>
  );
}

function shrinkImage(file: File, maxSide = 1600, quality = 0.86): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("照片读取失败"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("照片解析失败"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(String(reader.result || ""));
          return;
        }
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function RatesWidget({ widgetKey, size, rates, message, refreshing, onRefresh }: { widgetKey: WidgetKey; size: WidgetSize; rates?: RatesState; message: string; refreshing: boolean; onRefresh: () => Promise<void> }) {
  const [amount, setAmount] = useState("1000");
  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>("CNY");
  const currencies: CurrencyCode[] = ["CNY", "USD", "JPY"];

  const cnyPerUnit = useMemo(() => {
    const result: Record<CurrencyCode, number> = { CNY: 1, USD: 0, JPY: 0 };
    rates?.rows?.forEach((row) => {
      const values = [row.buyingRate, row.sellingRate]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (values.length) result[row.currency] = (values.reduce((sum, value) => sum + value, 0) / values.length) / 100;
    });
    return result;
  }, [rates]);

  const visibleRows = rates?.rows?.slice(0, size === "small" ? 1 : 2) || [];
  const numericAmount = Number(amount);
  const canConvert = Number.isFinite(numericAmount) && numericAmount >= 0 && cnyPerUnit.USD > 0 && cnyPerUnit.JPY > 0;
  const converted = (target: CurrencyCode) => {
    if (!canConvert) return undefined;
    const cny = numericAmount * cnyPerUnit[fromCurrency];
    return cny / cnyPerUnit[target];
  };

  return (
    <Widget title="中行汇率" widgetKey={widgetKey} tone="rates" size={size} action={<button type="button" title="刷新汇率" disabled={refreshing} onClick={() => void onRefresh()}><RefreshCcw size={14} className={refreshing ? "spin" : undefined} /></button>}>
      {visibleRows.length ? visibleRows.map((row) => (
        <div className="rate-row" key={row.currency} title={`${row.name} 买入 ${row.buyingRate || "--"}，卖出 ${row.sellingRate || "--"}`}>
          <strong>{row.currency}</strong>
          <span><em>买</em>{row.buyingRate || "--"}</span>
          <span><em>卖</em>{row.sellingRate || "--"}</span>
        </div>
      )) : <p>{message || "汇率暂时不可用"}</p>}
      {size === "wide" && (
        <div className="converter">
          <div className="converter-input">
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <select value={fromCurrency} onChange={(event) => setFromCurrency(event.target.value as CurrencyCode)}>
              {currencies.map((currency) => <option key={currency} value={currency}>{currencyNames[currency]}</option>)}
            </select>
          </div>
          <div className="conversion-list">
            {currencies.filter((currency) => currency !== fromCurrency).map((currency) => {
              const value = converted(currency);
              return (
                <div key={currency}>
                  <span>{currencyNames[currency]}</span>
                  <strong>{value === undefined ? "--" : value.toLocaleString("zh-CN", { maximumFractionDigits: currency === "JPY" ? 0 : 2 })}</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Widget>
  );
}

function FolderView({ folder, shortcuts, onClose, onAdd, onEditFolder, onShortcutMenu }: {
  folder: ShortcutFolder;
  shortcuts: Shortcut[];
  onClose: () => void;
  onAdd: () => void;
  onEditFolder: () => void;
  onShortcutMenu: (event: MouseEvent, shortcut: Shortcut) => void;
}) {
  return (
    <div className="overlay folder-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="folder-view" onClick={(event) => event.stopPropagation()}>
        <header>
          <div className="folder-title">
            <span className={`folder-badge ${folder.iconUrl ? "has-image" : ""}`} style={{ backgroundColor: folder.iconColor }}>
              {folder.iconUrl ? <img src={folder.iconUrl} alt="" /> : <Folder size={22} />}
            </span>
            <div>
              <h2>{folder.name}</h2>
            </div>
          </div>
          <div className="folder-actions">
            <button title="添加到文件夹" onClick={onAdd}><Plus size={16} /></button>
            <button title="编辑文件夹" onClick={onEditFolder}><Edit3 size={16} /></button>
            <button title="关闭" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        <div className="folder-grid" style={{ "--icon": "58px" } as React.CSSProperties}>
          {shortcuts.map((shortcut) => (
            <article
              className="shortcut"
              key={shortcut.id}
              onContextMenu={(event) => onShortcutMenu(event, shortcut)}
            >
              <a href={shortcut.url} title={shortcut.url} target="_blank" rel="noreferrer">
                <span className="shortcut-icon" style={{ backgroundColor: shortcut.iconColor }}>
                  <ShortcutIconContent url={shortcut.url} iconUrl={shortcut.iconUrl} fallback={shortcut.title.slice(0, 1)} />
                </span>
                <span>{shortcut.title}</span>
              </a>
            </article>
          ))}
          {!shortcuts.length && <button className="empty-shortcut" onClick={onAdd}><Plus size={22} /> 添加网站</button>}
        </div>
      </section>
    </div>
  );
}

function FolderDialog({ folder, groups, onClose, onSave, onDelete }: {
  folder?: ShortcutFolder;
  groups: AppState["shortcutGroups"];
  onClose: () => void;
  onSave: (folder: Partial<ShortcutFolder>) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<Partial<ShortcutFolder>>(folder || { iconColor: "#14B8A6", groupId: groups[0]?.id });
  return (
    <DialogShell title={folder ? "编辑文件夹" : "新建文件夹"} onClose={onClose}>
      <label>文件夹名称<input value={draft.name || ""} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：工作、AI、购物" /></label>
      <label>所在分类<select value={draft.groupId || groups[0]?.id} onChange={(event) => setDraft({ ...draft, groupId: event.target.value })}>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
      <label>图片 URL（可选）<input value={draft.iconUrl || ""} onChange={(event) => setDraft({ ...draft, iconUrl: event.target.value })} placeholder="留空使用文件夹图标" /></label>
      <label className="file-pick">
        <Upload size={16} /> 上传文件夹图片
        <input
          type="file"
          accept="image/*"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const dataUrl = await shrinkImage(file, 384, 0.84);
            setDraft({ ...draft, iconUrl: dataUrl });
          }}
        />
      </label>
      <label>颜色<input type="color" value={draft.iconColor || "#14B8A6"} onChange={(event) => setDraft({ ...draft, iconColor: event.target.value })} /></label>
      <div className="folder-preview">
        <span className={`shortcut-icon folder-icon ${draft.iconUrl ? "has-image" : ""}`} style={{ "--folder-color": draft.iconColor || "#14B8A6", "--icon": "64px" } as React.CSSProperties}>
          {draft.iconUrl ? <img src={draft.iconUrl} alt="" /> : <Folder size={30} />}
        </span>
        <span>{draft.name || "文件夹预览"}</span>
      </div>
      <div className="button-row split-row">
        {onDelete && <button className="danger-button" onClick={onDelete}><Trash2 size={16} /> 删除文件夹</button>}
        <button className="primary" onClick={() => onSave(draft)}><Save size={16} /> 保存</button>
      </div>
    </DialogShell>
  );
}

function ShortcutDialog({ shortcut, groups, folders, onClose, onSave }: {
  shortcut?: Shortcut;
  groups: AppState["shortcutGroups"];
  folders: ShortcutFolder[];
  onClose: () => void;
  onSave: (shortcut: Partial<Shortcut>) => void;
}) {
  const [draft, setDraft] = useState<Partial<Shortcut>>(shortcut || { iconColor: "#14B8A6", groupId: groups[0]?.id });
  const iconTitle = draft.title || shortcut?.title || "";
  const iconUrl = draft.url || shortcut?.url || "";
  const collectedIconChoices = useMemo(() => {
    const rows = [
      { label: "当前", url: draft.iconUrl && !draft.iconUrl.startsWith(builtInIconPrefix) ? draft.iconUrl : undefined },
      { label: "品牌", url: curatedIconFor(iconUrl, iconTitle) },
      { label: "备用", url: fallbackFaviconFor(iconUrl) },
      { label: "自动", url: faviconFor(iconUrl) }
    ].filter((item): item is { label: string; url: string } => Boolean(item.url));
    const seen = new Set<string>();
    return rows.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [draft.iconUrl, iconTitle, iconUrl]);
  return (
    <DialogShell title={shortcut ? "编辑快捷导航" : "新增快捷导航"} onClose={onClose}>
      <label>名称<input value={draft.title || ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>网址<input value={draft.url || ""} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com" /></label>
      <label>图标 URL（可选，默认自动获取）<input value={draft.iconUrl || ""} onChange={(event) => setDraft({ ...draft, iconUrl: event.target.value })} placeholder="留空会自动使用网站图标" /></label>
      <div className="shortcut-icon-toolbar">
        <button type="button" onClick={() => setDraft({ ...draft, iconUrl: draft.url ? faviconFor(draft.url) : "" })}>自动获取图标</button>
        <button type="button" onClick={() => setDraft({ ...draft, iconUrl: "" })}>清空图标</button>
      </div>
      {collectedIconChoices.length > 0 && (
        <section className="collected-icon-picker" aria-label="采集图标">
          <div className="default-icon-picker-head">
            <span>采集图标</span>
            <small>从网站识别到的候选</small>
          </div>
          <div className="collected-icon-grid">
            {collectedIconChoices.map((choice) => (
              <button
                type="button"
                className={draft.iconUrl === choice.url ? "active" : ""}
                key={choice.url}
                onClick={() => setDraft({ ...draft, iconUrl: choice.url })}
                title={choice.url}
              >
                <span><IconChoicePreview src={choice.url} fallback={(draft.title || "网").slice(0, 1)} /></span>
                <em>{choice.label}</em>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="default-icon-picker" aria-label="默认图标">
        <div className="default-icon-picker-head">
          <span>默认图标</span>
          <small>适合采集不到图标的网站</small>
        </div>
        <div className="default-icon-grid">
          {builtInShortcutIcons.map((icon) => {
            const value = builtInIconValue(icon.id);
            const Icon = icon.Icon;
            return (
              <button
                type="button"
                className={draft.iconUrl === value ? "active" : ""}
                key={icon.id}
                onClick={() => setDraft({ ...draft, iconUrl: value })}
                style={{ "--icon-tone": icon.tone } as React.CSSProperties}
                title={icon.label}
              >
                <span><Icon size={20} strokeWidth={2.35} /></span>
                <em>{icon.label}</em>
              </button>
            );
          })}
        </div>
      </section>
      <div className="shortcut-dialog-preview">
        <span className="shortcut-icon" style={{ "--icon": "58px", backgroundColor: draft.iconColor || "#14B8A6" } as React.CSSProperties}>
          <ShortcutIconContent url={draft.url || ""} iconUrl={draft.iconUrl} fallback={(draft.title || "网").slice(0, 1)} />
        </span>
        <span>{draft.title || "预览"}</span>
      </div>
      <label>颜色<input type="color" value={draft.iconColor || "#14B8A6"} onChange={(event) => setDraft({ ...draft, iconColor: event.target.value })} /></label>
      <label>分组<select value={draft.groupId || groups[0]?.id} onChange={(event) => setDraft({ ...draft, groupId: event.target.value })}>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
      <label>文件夹<select value={draft.folderId || ""} onChange={(event) => setDraft({ ...draft, folderId: event.target.value || undefined })}><option value="">不放入文件夹</option>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>
      <label className="check-row"><input type="checkbox" checked={Boolean(draft.pinned)} onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })} /> 固定到 Dock</label>
      <button className="primary" onClick={() => onSave(draft)}><Save size={16} /> 保存</button>
    </DialogShell>
  );
}

function ImportDialog({ existingShortcuts, onClose, onImport }: {
  existingShortcuts: Shortcut[];
  onClose: () => void;
  onImport: (text: string, mode: "append" | "replace") => void;
}) {
  const [text, setText] = useState("");
  const rows = useMemo(() => parseImportText(text), [text]);
  const count = rows.length;
  const folderCount = useMemo(() => new Set(rows.map((row) => row.folderName).filter(Boolean)).size, [rows]);
  const missingCount = useMemo(() => {
    if (!rows.length) return 0;
    const existing = new Set(existingShortcuts.map((shortcut) => comparableUrl(shortcut.url)));
    return rows.filter((row) => !existing.has(comparableUrl(row.url))).length;
  }, [existingShortcuts, rows]);
  return (
    <DialogShell title="导入快捷导航" onClose={onClose}>
      <p className="hint">支持 whytab JSON、浏览器书签 HTML、CSV。CSV 格式：名称,网址,图标URL,分组,文件夹。</p>
      <label className="file-pick">
        <Upload size={16} /> 选择文件
        <input
          type="file"
          accept=".json,.csv,.html,.htm,.txt"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setText(await file.text());
          }}
        />
      </label>
      <textarea className="import-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="也可以直接粘贴导入内容" />
      <div className="import-summary">
        <span>文件内：{count} 个</span>
        <span>当前已有：{existingShortcuts.length} 个</span>
        <span>按网址缺失：{missingCount} 个</span>
        <span>文件夹：{folderCount} 个</span>
      </div>
      <div className="button-row split-row">
        <button disabled={!count} onClick={() => onImport(text, "append")}><Plus size={16} /> 追加导入</button>
        <button className="primary" disabled={!count} onClick={() => onImport(text, "replace")}><Check size={16} /> 按文件重建</button>
      </div>
      <p className="hint">想恢复 Wetab 顺序时，用“按文件重建”。它会保留旧数据墓碑用于同步防回流，并按文件顺序重新生成快捷导航。</p>
    </DialogShell>
  );
}

function ResourceCenterDialog({ state, shortcuts, updateState, onEditShortcut, onClose }: {
  state: AppState;
  shortcuts: Shortcut[];
  updateState: (updater: (state: AppState) => AppState) => void;
  onEditShortcut: (shortcut: Shortcut) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"widgets" | "wallpapers" | "icons">("widgets");
  const [category, setCategory] = useState<"全部" | "信息" | "效率" | "生活">("全部");
  const [query, setQuery] = useState("");
  const settings = state.settings;
  const sizes = { ...defaultWidgetSizes, ...(settings.widgetSizes || {}) };
  const normalizedQuery = query.trim().toLowerCase();
  const visibleWidgets = (Object.keys(widgetNames) as WidgetKey[]).filter((key) => {
    const meta = widgetLibraryMeta[key];
    const matchesCategory = category === "全部" || meta.category === category;
    const matchesQuery = !normalizedQuery || widgetNames[key].toLowerCase().includes(normalizedQuery) || meta.category.includes(query.trim());
    return matchesCategory && matchesQuery;
  });

  const setSetting = <K extends keyof AppState["settings"]>(key: K, value: AppState["settings"][K]) => {
    updateState((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value, updatedAt: nowIso() }
    }));
  };

  const setWidgetEnabled = (key: WidgetKey, enabled: boolean) => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        widgets: { ...current.settings.widgets, [key]: enabled },
        updatedAt: nowIso()
      }
    }));
  };

  const setWidgetSize = (key: WidgetKey, size: WidgetSize) => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        widgetSizes: { ...defaultWidgetSizes, ...(current.settings.widgetSizes || {}), [key]: size },
        updatedAt: nowIso()
      }
    }));
  };

  const chooseWallpaper = (id: string) => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        wallpaper: undefined,
        wallpaperPreset: id,
        wallpaperRotation: false,
        updatedAt: nowIso()
      }
    }));
  };
  const customWallpapers = settings.customWallpapers || [];
  const wallpaperCollection = settings.wallpaperCollection || [];
  const wallpaperItems = [
    ...builtInWallpapers.map((wallpaper) => ({ ...wallpaper, custom: false })),
    ...customWallpapers.map((wallpaper) => ({ id: wallpaper.id, name: wallpaper.name, url: wallpaper.dataUrl, custom: true }))
  ];
  const selectedWallpaperCount = wallpaperItems.filter((wallpaper) => wallpaperCollection.includes(wallpaper.id)).length;

  const toggleWallpaperCollection = (id: string) => {
    const next = wallpaperCollection.includes(id)
      ? wallpaperCollection.filter((item) => item !== id)
      : [...wallpaperCollection, id];
    setSetting("wallpaperCollection", next);
  };

  const addCustomWallpapers = async (files: FileList | null) => {
    if (!files?.length) return;
    const additions = await Promise.all(Array.from(files).slice(0, 12).map(async (file) => ({
      id: `custom-${uid()}`,
      name: file.name.replace(/\.[^.]+$/, "") || "我的壁纸",
      dataUrl: await shrinkImage(file, 1920, 0.88),
      createdAt: nowIso()
    })));
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        customWallpapers: [...(current.settings.customWallpapers || []), ...additions],
        wallpaperCollection: [...(current.settings.wallpaperCollection || []), ...additions.map((item) => item.id)],
        wallpaperPreset: additions[0]?.id || current.settings.wallpaperPreset,
        wallpaper: undefined,
        updatedAt: nowIso()
      }
    }));
  };

  const removeCustomWallpaper = (id: string) => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        customWallpapers: (current.settings.customWallpapers || []).filter((item) => item.id !== id),
        wallpaperCollection: (current.settings.wallpaperCollection || []).filter((item) => item !== id),
        wallpaperPreset: current.settings.wallpaperPreset === id ? builtInWallpapers[0].id : current.settings.wallpaperPreset,
        updatedAt: nowIso()
      }
    }));
  };


  return (
    <DialogShell title="资源中心" onClose={onClose} className="resource-center-overlay">
      <div className="resource-tabs" role="tablist" aria-label="资源分类">
        <button type="button" className={tab === "widgets" ? "active" : ""} onClick={() => setTab("widgets")}><Palette size={16} />小组件</button>
        <button type="button" className={tab === "wallpapers" ? "active" : ""} onClick={() => setTab("wallpapers")}><ImageIcon size={16} />壁纸</button>
        <button type="button" className={tab === "icons" ? "active" : ""} onClick={() => setTab("icons")}><Sparkles size={16} />图标</button>
      </div>

      {tab === "widgets" && (
        <>
          <div className="resource-toolbar">
            <label className="resource-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索小组件" /></label>
            <div className="resource-filters">
              {(["全部", "信息", "效率", "生活"] as const).map((item) => (
                <button type="button" className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>
              ))}
            </div>
          </div>
          <div className="resource-widget-grid">
            {visibleWidgets.map((key) => {
              const meta = widgetLibraryMeta[key];
              const Icon = meta.Icon;
              const enabled = settings.widgets[key];
              return (
                <section className={`resource-widget-card ${enabled ? "enabled" : ""}`} key={key}>
                  <div className="resource-widget-preview">
                    <span><Icon size={19} /></span>
                    <strong>{meta.preview}</strong>
                    <small>{meta.category}</small>
                  </div>
                  <div className="resource-widget-row">
                    <strong>{widgetNames[key]}</strong>
                    <button type="button" className={`resource-toggle ${enabled ? "active" : ""}`} onClick={() => setWidgetEnabled(key, !enabled)} aria-pressed={enabled}>
                      {enabled ? <Check size={15} /> : <Plus size={15} />}
                    </button>
                  </div>
                  <div className="widget-size-control" aria-label={`${widgetNames[key]}尺寸`}>
                    {widgetSizeOptions[key].map((size) => (
                      <button type="button" className={sizes[key] === size ? "active" : ""} key={size} onClick={() => setWidgetSize(key, size)} disabled={!enabled}>
                        {widgetSizeLabels[size]}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {tab === "wallpapers" && (
        <>
          <div className="resource-section-head">
            <div><strong>我的壁纸集</strong><small>已选择 {selectedWallpaperCount} 张</small></div>
            <div className="wallpaper-actions">
              <label className="file-pick compact-upload">
                <Upload size={15} />上传多张
                <input type="file" accept="image/*" multiple onChange={(event) => { void addCustomWallpapers(event.target.files); event.currentTarget.value = ""; }} />
              </label>
              <label className="resource-switch">
                <input
                  type="checkbox"
                  checked={settings.wallpaperRotation ?? false}
                  onChange={(event) => updateState((current) => ({
                    ...current,
                    settings: {
                      ...current.settings,
                      wallpaper: event.target.checked ? undefined : current.settings.wallpaper,
                      wallpaperRotation: event.target.checked,
                      updatedAt: nowIso()
                    }
                  }))}
                />
                每日轮换
              </label>
            </div>
          </div>
          <div className="resource-wallpaper-grid">
            {wallpaperItems.map((wallpaper) => (
              <div className="resource-wallpaper-item" key={wallpaper.id}>
                <button
                  type="button"
                  className={`wallpaper-preview ${!settings.wallpaper && !settings.wallpaperRotation && settings.wallpaperPreset === wallpaper.id ? "active" : ""}`}
                  style={{ backgroundImage: `linear-gradient(180deg, transparent, rgba(3,7,18,.58)), url(${wallpaper.url})` }}
                  onClick={() => chooseWallpaper(wallpaper.id)}
                >
                  <span>{wallpaper.name}</span>
                </button>
                <button
                  type="button"
                  className={`wallpaper-collection-check ${wallpaperCollection.includes(wallpaper.id) ? "active" : ""}`}
                  onClick={() => toggleWallpaperCollection(wallpaper.id)}
                  title={wallpaperCollection.includes(wallpaper.id) ? "从壁纸集移除" : "加入壁纸集"}
                >
                  {wallpaperCollection.includes(wallpaper.id) ? <Check size={14} /> : <Plus size={14} />}
                </button>
                {wallpaper.custom && (
                  <button type="button" className="wallpaper-remove" onClick={() => removeCustomWallpaper(wallpaper.id)} title="删除上传壁纸"><X size={13} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "icons" && (
        <div className="resource-icon-section">
          <div className="resource-section-head">
            <div><strong>图标管理</strong><small>{curatedIconCount} 个品牌匹配 · {builtInShortcutIcons.length} 个默认图标</small></div>
          </div>
          <div className="resource-icon-grid">
            {builtInShortcutIcons.map(({ id, label, Icon, tone }) => (
              <div key={id}>
                <span style={{ color: tone }}><Icon size={23} /></span>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <div className="resource-shortcut-icons">
            <div className="resource-subtitle"><strong>逐个选择</strong><small>{shortcuts.length} 个网站</small></div>
            <div className="resource-shortcut-icon-list">
              {shortcuts.map((shortcut) => (
                <button type="button" key={shortcut.id} onClick={() => onEditShortcut(shortcut)}>
                  <span className="shortcut-icon" style={{ backgroundColor: shortcut.iconColor }}>
                    <ShortcutIconContent url={shortcut.url} iconUrl={shortcut.iconUrl} fallback={shortcut.title.slice(0, 1)} />
                  </span>
                  <span>
                    <strong>{shortcut.title}</strong>
                    <small>选择品牌图标或默认图标</small>
                  </span>
                  <Edit3 size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </DialogShell>
  );
}

function SettingsDialog({ state, updateCheck, updateState, onImport, onExport, onCheckUpdate, onClose }: {
  state: AppState;
  updateCheck: UpdateCheckResult;
  updateState: (updater: (state: AppState) => AppState) => void;
  onImport: () => void;
  onExport: () => void;
  onCheckUpdate: () => void;
  onClose: () => void;
}) {
  const settings = state.settings;
  const setSetting = <K extends keyof AppState["settings"]>(key: K, value: AppState["settings"][K]) => {
    updateState((current) => ({ ...current, settings: { ...current.settings, [key]: value, updatedAt: nowIso() } }));
  };
  const updateMessage = updateCheck.status === "checking"
    ? "正在检查更新..."
    : updateCheck.status === "available"
      ? `发现新版本 ${updateCheck.manifest.latestVersion}`
      : updateCheck.status === "unsupported"
        ? `当前版本低于最低支持版本 ${updateCheck.manifest.minimumSupportedVersion}`
        : updateCheck.status === "current"
          ? "当前已是最新版本"
          : updateCheck.status === "error"
            ? updateCheck.message
            : "可手动检查是否有新版";
  const updateTarget = updateCheck.status === "available" || updateCheck.status === "unsupported"
    ? updateCheck.manifest.updateUrl || updateCheck.manifest.releaseNotesUrl || UPDATE_TARGET_URL
    : UPDATE_TARGET_URL;
  return (
    <DialogShell title="外观设置" onClose={onClose}>
      <label>主题<select value={settings.theme} onChange={(event) => setSetting("theme", event.target.value as "light" | "dark")}><option value="dark">深色</option><option value="light">浅色</option></select></label>
      <label>城市<input value={settings.city} onChange={(event) => setSetting("city", event.target.value)} /></label>
      <label>时间显示<select value={settings.timeZone || "Asia/Shanghai"} onChange={(event) => setSetting("timeZone", event.target.value)}>{timeZoneOptions.map((zone) => <option value={zone.value} key={zone.value}>{zone.label} · {zone.value}</option>)}</select></label>
      <div className="color-settings">
        <label>日期时间颜色<input type="color" value={settings.dateTimeColor || "#ffffff"} onChange={(event) => setSetting("dateTimeColor", event.target.value)} /></label>
        <label>小组件强调色<input type="color" value={settings.widgetAccentColor || "#2dd4bf"} onChange={(event) => setSetting("widgetAccentColor", event.target.value)} /></label>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={settings.weatherUseLocation ?? false} onChange={(event) => setSetting("weatherUseLocation", event.target.checked)} />
        天气跟随设备位置
      </label>
      <label>毛玻璃<input type="range" min="35" max="92" value={settings.glass} onChange={(event) => setSetting("glass", Number(event.target.value))} /></label>
      <label>图标尺寸<input type="range" min="48" max="88" value={settings.iconSize} onChange={(event) => setSetting("iconSize", Number(event.target.value))} /></label>
      <label>网格密度<select value={settings.gridDensity} onChange={(event) => setSetting("gridDensity", event.target.value as "comfortable" | "compact")}><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label>
      <label>Dock 位置<select value={settings.dockPosition} onChange={(event) => setSetting("dockPosition", event.target.value as "top" | "bottom")}><option value="bottom">底部</option><option value="top">顶部</option></select></label>
      <div className="settings-block data-settings">
        <div className="section-title compact-title">
          <div>
            <h3>数据</h3>
            <p>导入、导出和本地备份</p>
          </div>
        </div>
        <div className="button-row split-row">
          <button type="button" onClick={onImport}><Import size={16} /> 导入数据</button>
          <button type="button" onClick={onExport}><Download size={16} /> 导出备份</button>
        </div>
      </div>
      <div className="settings-block version-settings">
        <div className="section-title compact-title">
          <div>
            <h3>版本</h3>
            <p>更新检查和数据兼容</p>
          </div>
        </div>
        <div className="version-row">
          <span>当前版本</span>
          <strong>{APP_VERSION}</strong>
        </div>
        <div className="version-row">
          <span>数据版本</span>
          <strong>{state.dataSchemaVersion || DATA_SCHEMA_VERSION}</strong>
        </div>
        <p className={`version-status ${updateCheck.status}`}>{updateMessage}</p>
        <div className="button-row split-row">
          <button type="button" disabled={updateCheck.status === "checking"} onClick={onCheckUpdate}><RefreshCcw size={16} /> 检查更新</button>
          <button type="button" onClick={() => window.open(updateTarget, "_blank", "noopener,noreferrer")}><Globe2 size={16} /> 发布页面</button>
        </div>
      </div>
      <button className="primary" onClick={onClose}><Palette size={16} /> 完成</button>
    </DialogShell>
  );
}

function TimeZoneDialog({ current, onClose, onChoose }: { current: string; onClose: () => void; onChoose: (timeZone: string) => void }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTimeZones = useMemo(() => timeZoneOptions.filter((zone) => !normalizedQuery || zone.label.toLowerCase().includes(normalizedQuery) || zone.value.toLowerCase().includes(normalizedQuery)), [normalizedQuery]);
  return (
    <DialogShell title="选择时区" onClose={onClose} className="timezone-popover">
      <label className="timezone-search"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索城市或时区，例如 Shanghai" /></label>
      <div className="timezone-result-count">{filteredTimeZones.length} 个标准时区</div>
      <div className="timezone-list">
        {filteredTimeZones.map((zone) => (
          <button
            type="button"
            className={zone.value === current ? "active" : ""}
            key={zone.value}
            onClick={() => onChoose(zone.value)}
          >
            <strong>{zone.label}</strong>
            <span>{zone.value}</span>
          </button>
        ))}
        {!filteredTimeZones.length && <div className="timezone-empty">没有找到匹配的时区</div>}
      </div>
    </DialogShell>
  );
}

function SyncDialog({ state, sync, updateState, onClose, onLogin, onSignOut, onSync, restoreAvailable, onRestore }: {
  state: AppState;
  sync: SyncStatus;
  updateState: (updater: (state: AppState) => AppState) => void;
  onClose: () => void;
  onLogin: (mode: "login" | "signup", email: string, password: string) => Promise<AuthResult>;
  onSignOut: () => Promise<void>;
  onSync: (mode: SyncMode) => Promise<void>;
  restoreAvailable: boolean;
  onRestore: () => Promise<void>;
}) {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submit = async (mode: "login" | "signup") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await onLogin(mode, email, password);
      setNotice(result.message);
      if (result.status === "verification-sent") {
        setAuthMode("login");
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === "signup" ? "注册失败" : "登录失败");
    } finally {
      setBusy(false);
    }
  };
  const handlePasswordKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && email && password && !busy) {
      void submit(authMode);
    }
  };

  return (
    <DialogShell title="账号与云同步" onClose={onClose} className="sync-dialog-overlay">
      <div className="sync-hero">
        <div className="sync-hero-icon"><Database size={24} /></div>
        <div>
          <span>WHY TAB CLOUD</span>
          <h3>{sync.user ? "账号已连接" : authMode === "login" ? "登录 whytab 账号" : "创建 whytab 账号"}</h3>
          <p>{sync.user ? "当前设备可以和云端数据保持一致。" : "登录后可在电脑、手机和 iPad 间同步快捷方式、小组件、笔记和设置。"}</p>
        </div>
      </div>

      <div className="sync-status-grid">
        <div>
          <small>账号</small>
          <strong>{sync.user?.email || "未登录"}</strong>
        </div>
        <div>
          <small>同步状态</small>
          <strong>{sync.message}</strong>
        </div>
        <div>
          <small>最近同步</small>
          <strong>{sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString("zh-CN") : "暂无记录"}</strong>
        </div>
      </div>

      <div className="sync-settings-panel">
        <label className="sync-toggle-row">
          <span>
            <strong>自动同步</strong>
            <small>打开新标签页和数据变化后自动更新云端。</small>
          </span>
          <input
            type="checkbox"
            checked={state.sync?.autoSync ?? true}
            onChange={(event) => updateState((current) => ({
              ...current,
              sync: {
                ...current.sync,
                autoSync: event.target.checked
              }
            }))}
          />
        </label>
        <label className="sync-interval-row">
          <span>
            <strong>同步间隔</strong>
            <small>最低 30 秒</small>
          </span>
          <input
            type="number"
            min="30"
            value={state.sync?.intervalSeconds || 60}
            onChange={(event) => updateState((current) => ({
              ...current,
              sync: {
                ...current.sync,
                intervalSeconds: Math.max(30, Number(event.target.value) || 60)
              }
            }))}
          />
        </label>
      </div>

      {!sync.user && (
        <div className="sync-auth-panel">
          <div className="sync-auth-tabs" role="tablist" aria-label="账号操作">
            <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setError(""); setNotice(""); }}>登录</button>
            <button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setError(""); setNotice(""); }}>注册</button>
          </div>
          <label className="sync-field">
            <span>邮箱</span>
            <div>
              <Mail size={17} />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
            </div>
          </label>
          <label className="sync-field">
            <span>密码</span>
            <div>
              <KeyRound size={17} />
              <input
                type="password"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={handlePasswordKeyDown}
                placeholder={authMode === "login" ? "输入账号密码" : "设置登录密码"}
              />
            </div>
          </label>
          <p className="sync-auth-note">{authMode === "login" ? "使用同一个账号登录其他设备，即可合并同步你的 whytab 数据。" : "注册后会使用当前邮箱作为同步账号，之后可直接在其他设备登录。"}</p>
          {notice && <p className="sync-auth-success">{notice}</p>}
          {error && <p className="warning">{error}</p>}
          <button className="primary sync-submit" disabled={busy || !email || !password} onClick={() => submit(authMode)}>
            {busy ? "处理中" : authMode === "login" ? "登录并同步" : "注册并同步"}
          </button>
        </div>
      )}
      {sync.user && (
        <div className="sync-connected-panel">
          <div className="sync-meta">
            <small>设备 ID：{state.sync?.deviceId || "未生成"}</small>
            {state.sync?.lastPulledAt && <small>上次拉取：{new Date(state.sync.lastPulledAt).toLocaleString("zh-CN")}</small>}
            {state.sync?.lastPushedAt && <small>上次上传：{new Date(state.sync.lastPushedAt).toLocaleString("zh-CN")}</small>}
          </div>
          <div className="sync-choice-panel">
            <button className="primary" disabled={sync.syncing} onClick={() => onSync("merge")}><RefreshCcw size={16} /> 合并同步</button>
            <button disabled={sync.syncing} onClick={() => onSync("push")}><Upload size={16} /> 本机覆盖云端</button>
            <button disabled={sync.syncing} onClick={() => onSync("pull")}><Download size={16} /> 云端覆盖本机</button>
          </div>
          <p className="sync-hint">合并同步会保留两端新增内容；同一项冲突时保留更新时间较新的版本。覆盖操作会先保存本机回退点。</p>
          <div className="button-row">
            <button disabled={!restoreAvailable || sync.syncing} onClick={() => void onRestore()}>回到同步前版本</button>
            <button onClick={onSignOut}><LogOut size={16} /> 退出登录</button>
          </div>
        </div>
      )}
    </DialogShell>
  );
}

function DialogShell({ title, onClose, children, className }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  return createPortal(
    <div className={`overlay ${className || ""}`.trim()} role="dialog" aria-modal="true" onClick={onClose}>
      <section className="dialog" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button title="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="dialog-body">{children}</div>
      </section>
    </div>,
    document.body
  );
}

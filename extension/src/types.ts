export type Id = string;

export type Shortcut = {
  id: Id;
  title: string;
  url: string;
  iconUrl?: string;
  iconColor: string;
  groupId?: Id;
  folderId?: Id;
  pinned: boolean;
  order: number;
  updatedAt: string;
  deletedAt?: string;
};

export type ShortcutFolder = {
  id: Id;
  name: string;
  groupId?: Id;
  iconUrl?: string;
  iconColor: string;
  order: number;
  updatedAt: string;
  deletedAt?: string;
};

export type ShortcutGroup = {
  id: Id;
  name: string;
  color: string;
  order: number;
  updatedAt: string;
  deletedAt?: string;
};

export type Todo = {
  id: Id;
  text: string;
  done: boolean;
  order: number;
  updatedAt: string;
  deletedAt?: string;
};

export type Note = {
  id: Id;
  title: string;
  body: string;
  conflictBody?: string;
  updatedAt: string;
  deletedAt?: string;
};

export type Countdown = {
  id: Id;
  title: string;
  date: string;
  updatedAt: string;
  deletedAt?: string;
};

export type WidgetKey = "weather" | "calendar" | "countdowns" | "todos" | "notes" | "rates" | "quote" | "focus" | "clock" | "memo" | "year" | "calculator";
export type WidgetSize = "small" | "medium" | "wide";

export type CustomNavPageIcon = "star" | "briefcase" | "book" | "code" | "heart" | "plane";

export type CustomNavPage = {
  id: Id;
  name: string;
  groupId: Id;
  icon: CustomNavPageIcon;
  order: number;
  updatedAt: string;
};

export type CustomWallpaper = {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
};

export type SearchEngine = "baidu" | "google";

export type Settings = {
  theme: "light" | "dark";
  wallpaper?: string;
  wallpaperPreset?: string;
  wallpaperRotation?: boolean;
  photoFrameImage?: string;
  customWallpapers?: CustomWallpaper[];
  wallpaperCollection?: string[];
  quickNote?: string;
  iconPresentation?: "original" | "soft" | "minimal";
  photoFrameTitle?: string;
  dateTimeColor?: string;
  widgetAccentColor?: string;
  glass: number;
  iconSize: number;
  gridDensity: "comfortable" | "compact";
  dockPosition: "top" | "bottom";
  city: string;
  weatherUseLocation?: boolean;
  searchEngine?: SearchEngine;
  calendarRecords?: Record<string, string>;
  visualRefreshVersion?: number;
  widgets: Record<WidgetKey, boolean>;
  widgetOrder?: WidgetKey[];
  widgetSizes?: Record<WidgetKey, WidgetSize>;
  customNavPages?: CustomNavPage[];
  hiddenNavPages?: Array<"shortcuts" | "tools">;
  navigationDisplay?: "always" | "auto" | "hidden";
  navigationSide?: "left" | "right";
  remoteIconLookup?: boolean;
  timeZone?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  updatedAt?: string;
};

export type SyncMeta = {
  deviceId: string;
  autoSync: boolean;
  intervalSeconds: number;
  lastPulledAt?: string;
  lastPushedAt?: string;
  lastRemoteUpdatedAt?: string;
  remoteRevision?: number;
};

export type AppState = {
  version: 1;
  dataSchemaVersion?: number;
  clientVersion?: string;
  minimumClientVersion?: string;
  shortcuts: Shortcut[];
  shortcutFolders: ShortcutFolder[];
  shortcutGroups: ShortcutGroup[];
  todos: Todo[];
  notes: Note[];
  countdowns: Countdown[];
  settings: Settings;
  sync: SyncMeta;
  updatedAt: string;
};

export type ImportShortcut = {
  title: string;
  url: string;
  iconUrl?: string;
  groupName?: string;
  folderName?: string;
  folderIconUrl?: string;
  pinned?: boolean;
};

export type WeatherDay = {
  date: string;
  weatherCode: number;
  temperatureMax: number;
  temperatureMin: number;
  precipitationProbability?: number;
};

export type WeatherState = {
  city: string;
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  forecast: WeatherDay[];
  sourceUrl: string;
  latitude?: number;
  longitude?: number;
  updatedAt: string;
};

export type RateRow = {
  currency: "USD" | "JPY";
  name: string;
  cashBuyingRate?: string;
  buyingRate?: string;
  sellingRate?: string;
  cashSellingRate?: string;
  publishAt?: string;
};

export type RatesState = {
  rows: RateRow[];
  updatedAt: string;
  source: string;
};

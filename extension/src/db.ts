import { defaultState } from "./defaultState";
import { MIGRATION_BACKUP_KEY, migrateState } from "./migrations";
import type { AppState } from "./types";

const DB_NAME = "whytab";
const DB_VERSION = 1;
const STORE = "kv";
const STATE_KEY = "app-state";
const ANONYMOUS_STATE_KEY = "app-state:anonymous";
const accountStateKey = (userId?: string) => userId ? `app-state:user:${userId}` : ANONYMOUS_STATE_KEY;
const RATES_KEY = "rates-cache";
const WEATHER_KEY = "weather-cache";

let dbPromise: Promise<IDBDatabase> | undefined;

const openDb = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
};

export async function readKey<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function writeKey<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function migrateStoredState(stored: AppState | undefined, save: (state: AppState) => Promise<void>): Promise<AppState> {
  const migration = migrateState(stored);
  if (migration.backup) await writeKey(MIGRATION_BACKUP_KEY, migration.backup);
  if (stored && migration.migrated) await save(migration.state);
  if (stored?.version === 1) return migration.state;
  const initial = defaultState();
  await save(initial);
  return initial;
}

export async function loadState(): Promise<AppState> {
  const stored = await readKey<AppState>(STATE_KEY);
  return migrateStoredState(stored, saveState);
}

export async function saveState(state: AppState): Promise<void> {
  await writeKey(STATE_KEY, state);
}

export async function loadStateForAccount(userId?: string): Promise<{ state: AppState; existed: boolean }> {
  const key = accountStateKey(userId);
  const stored = await readKey<AppState>(key);
  const state = await migrateStoredState(stored, (next) => saveStateForAccount(next, userId));
  return { state, existed: Boolean(stored) };
}

export async function saveStateForAccount(state: AppState, userId?: string): Promise<void> {
  await writeKey(accountStateKey(userId), state);
}

export async function cacheWeather<T>(value: T): Promise<void> {
  await writeKey(WEATHER_KEY, value);
}

export async function readWeather<T>(): Promise<T | undefined> {
  return readKey<T>(WEATHER_KEY);
}

export async function cacheRates<T>(value: T): Promise<void> {
  await writeKey(RATES_KEY, value);
}

export async function readRates<T>(): Promise<T | undefined> {
  return readKey<T>(RATES_KEY);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

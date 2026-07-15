import { defaultState } from "./defaultState";
import type { AppState } from "./types";
import { APP_VERSION, DATA_SCHEMA_VERSION } from "./version";

export const MIGRATION_BACKUP_KEY = "migration-backup";

export type StateBackup = {
  label: string;
  savedAt: string;
  appVersion: string;
  dataSchemaVersion: number;
  state: AppState;
};

export type MigrationResult = {
  state: AppState;
  migrated: boolean;
  backup?: StateBackup;
};

export function stateSchemaVersion(state?: Partial<AppState>) {
  return state?.dataSchemaVersion || state?.version || 1;
}

export function createStateBackup(label: string, state: AppState): StateBackup {
  return {
    label,
    savedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    dataSchemaVersion: stateSchemaVersion(state),
    state
  };
}

const isAppState = (value: unknown): value is AppState => {
  const state = value as AppState;
  return Boolean(state && state.version === 1 && state.settings && Array.isArray(state.shortcuts));
};

export function migrateState(stored: unknown): MigrationResult {
  if (!isAppState(stored)) {
    return { state: defaultState(), migrated: true };
  }

  const schemaVersion = stateSchemaVersion(stored);
  const migratedState: AppState = {
    ...stored,
    version: 1,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    clientVersion: APP_VERSION,
    minimumClientVersion: stored.minimumClientVersion || "0.1.0"
  };

  const migrated = schemaVersion !== DATA_SCHEMA_VERSION || stored.clientVersion !== APP_VERSION;
  return {
    state: migratedState,
    migrated,
    backup: migrated ? createStateBackup("更新前自动备份", stored) : undefined
  };
}

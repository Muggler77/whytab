import { APP_VERSION, DATA_SCHEMA_VERSION, MIN_SUPPORTED_APP_VERSION, UPDATE_CHECK_URL, UPDATE_TARGET_URL } from "./version";

export type UpdateSeverity = "normal" | "important" | "critical";

export type VersionManifest = {
  latestVersion: string;
  minimumSupportedVersion: string;
  dataSchemaVersion: number;
  severity?: UpdateSeverity;
  releaseNotesUrl?: string;
  updateUrl?: string;
};

export type UpdateCheckResult =
  | { status: "idle"; checkedAt?: string }
  | { status: "checking"; checkedAt?: string }
  | { status: "current"; manifest: VersionManifest; checkedAt: string }
  | { status: "available"; manifest: VersionManifest; checkedAt: string; critical: boolean }
  | { status: "unsupported"; manifest: VersionManifest; checkedAt: string }
  | { status: "error"; message: string; checkedAt: string };

export function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

const normalizeManifest = (value: unknown): VersionManifest => {
  const manifest = value as Partial<VersionManifest>;
  if (!manifest || typeof manifest.latestVersion !== "string" || typeof manifest.minimumSupportedVersion !== "string") {
    throw new Error("版本清单格式不正确");
  }
  return {
    latestVersion: manifest.latestVersion,
    minimumSupportedVersion: manifest.minimumSupportedVersion,
    dataSchemaVersion: typeof manifest.dataSchemaVersion === "number" ? manifest.dataSchemaVersion : DATA_SCHEMA_VERSION,
    severity: manifest.severity || "normal",
    releaseNotesUrl: manifest.releaseNotesUrl,
    updateUrl: manifest.updateUrl || UPDATE_TARGET_URL
  };
};

export async function checkForUpdate(fetcher: typeof fetch = fetch): Promise<UpdateCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetcher(UPDATE_CHECK_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`版本检查失败：${response.status}`);
    const manifest = normalizeManifest(await response.json());
    if (compareVersions(APP_VERSION, manifest.minimumSupportedVersion || MIN_SUPPORTED_APP_VERSION) < 0) {
      return { status: "unsupported", manifest, checkedAt };
    }
    if (compareVersions(APP_VERSION, manifest.latestVersion) < 0) {
      return {
        status: "available",
        manifest,
        checkedAt,
        critical: manifest.severity === "critical" || manifest.dataSchemaVersion > DATA_SCHEMA_VERSION
      };
    }
    return { status: "current", manifest, checkedAt };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "无法检查更新", checkedAt };
  }
}

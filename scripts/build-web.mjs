import { copyFile, cp, rm } from "node:fs/promises";

const repoRoot = new URL("../", import.meta.url);
const extensionRoot = new URL("extension/", repoRoot);
const extensionDist = new URL("dist/", extensionRoot);
const webDist = new URL("web-dist/", extensionRoot);
const cloudflareHeaders = new URL("cloudflare/_headers", repoRoot);

await rm(webDist, { recursive: true, force: true });
await cp(extensionDist, webDist, { recursive: true });
await copyFile(cloudflareHeaders, new URL("_headers", webDist));

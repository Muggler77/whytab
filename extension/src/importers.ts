import type { ImportShortcut, Shortcut, ShortcutFolder, ShortcutGroup } from "./types";
import { nowIso, uid } from "./defaultState";

const cleanUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isLikelyUrl = (value: string) => /^https?:\/\//i.test(value) || /^[\w.-]+\.[a-z]{2,}/i.test(value);

export const faviconHostFor = (url: string) => {
  try {
    return new URL(cleanUrl(url)).hostname;
  } catch {
    return undefined;
  }
};

export const faviconFor = (url: string) => {
  const host = faviconHostFor(url);
  if (!host) return undefined;
  return `https://www.google.com/s2/favicons?domain_url=https://${host}&sz=256`;
};

export const fallbackFaviconFor = (url: string) => {
  const host = faviconHostFor(url);
  return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : undefined;
};

export const siteIconCandidatesFor = (url: string) => {
  const host = faviconHostFor(url);
  if (!host) return [];
  const origin = `https://${host}`;
  return [
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    `${origin}/android-chrome-192x192.png`,
    `${origin}/favicon-192x192.png`,
    `${origin}/favicon.ico`
  ];
};

const simpleIcon = (slug: string) => `https://cdn.simpleicons.org/${slug}`;

const curatedIconRules: Array<{ hosts?: string[]; title?: string[]; iconUrl: string }> = [
  { hosts: ["maps.google.com"], title: ["google maps", "谷歌地图"], iconUrl: simpleIcon("googlemaps") },
  { hosts: ["google.com", "google.com.hk"], title: ["google"], iconUrl: simpleIcon("google") },
  { hosts: ["youtube.com", "youtu.be"], iconUrl: simpleIcon("youtube") },
  { hosts: ["chatgpt.com", "openai.com"], title: ["chatgpt", "openai", "sora"], iconUrl: simpleIcon("openai") },
  { hosts: ["gemini.google.com"], title: ["gemini"], iconUrl: simpleIcon("googlegemini") },
  { hosts: ["deepseek.com", "chat.deepseek.com"], title: ["deepseek"], iconUrl: simpleIcon("deepseek") },
  { hosts: ["xiaohongshu.com"], title: ["小红书"], iconUrl: simpleIcon("xiaohongshu") },
  { hosts: ["notion.so", "notion.site"], title: ["notion"], iconUrl: simpleIcon("notion") },
  { hosts: ["pinterest.com"], title: ["pinterest"], iconUrl: simpleIcon("pinterest") },
  { hosts: ["fiverr.com"], title: ["fiverr"], iconUrl: simpleIcon("fiverr") },
  { hosts: ["bilibili.com"], title: ["bilibili", "哔哩哔哩"], iconUrl: simpleIcon("bilibili") },
  { hosts: ["weibo.com"], title: ["微博"], iconUrl: simpleIcon("sinaweibo") },
  { hosts: ["zhihu.com"], title: ["知乎"], iconUrl: simpleIcon("zhihu") },
  { hosts: ["douban.com"], title: ["豆瓣"], iconUrl: simpleIcon("douban") },
  { hosts: ["baidu.com"], title: ["百度"], iconUrl: simpleIcon("baidu") },
  { hosts: ["jd.com"], title: ["京东"], iconUrl: simpleIcon("jd") },
  { hosts: ["taobao.com", "tmall.com"], title: ["淘宝", "天猫"], iconUrl: simpleIcon("alibabadotcom") },
  { hosts: ["iqiyi.com"], title: ["爱奇艺"], iconUrl: simpleIcon("iqiyi") },
  { hosts: ["qq.com", "mail.qq.com"], title: ["qq", "腾讯"], iconUrl: simpleIcon("tencentqq") },
  { hosts: ["ctrip.com", "trip.com"], title: ["携程"], iconUrl: simpleIcon("tripdotcom") },
  { hosts: ["github.com"], title: ["github"], iconUrl: simpleIcon("github") },
  { hosts: ["supabase.co"], title: ["supabase"], iconUrl: simpleIcon("supabase") },
  { hosts: ["telegram.org", "web.telegram.org"], title: ["telegram"], iconUrl: simpleIcon("telegram") },
  { hosts: ["discord.com"], title: ["discord"], iconUrl: simpleIcon("discord") },
  { hosts: ["x.com", "twitter.com"], title: ["twitter", "x"], iconUrl: simpleIcon("x") },
  { hosts: ["figma.com"], title: ["figma"], iconUrl: simpleIcon("figma") },
  { hosts: ["canva.com"], title: ["canva"], iconUrl: simpleIcon("canva") },
  { hosts: ["facebook.com", "business.facebook.com"], title: ["facebook", "fb"], iconUrl: simpleIcon("facebook") },
  { hosts: ["meta.com"], title: ["meta"], iconUrl: simpleIcon("meta") },
  { hosts: ["gmail.com", "mail.google.com"], title: ["gmail", "谷歌邮箱"], iconUrl: simpleIcon("gmail") },
  { hosts: ["aliyun.com"], title: ["阿里云", "aliyun"], iconUrl: simpleIcon("alibabacloud") },
  { hosts: ["cloud.tencent.com"], title: ["腾讯云"], iconUrl: simpleIcon("tencentcloud") },
  { hosts: ["cloudflare.com"], title: ["cloudflare"], iconUrl: simpleIcon("cloudflare") },
  { hosts: ["vercel.com"], title: ["vercel"], iconUrl: simpleIcon("vercel") },
  { hosts: ["netlify.com"], title: ["netlify"], iconUrl: simpleIcon("netlify") },
  { hosts: ["civitai.com"], title: ["civitai"], iconUrl: simpleIcon("civitai") },
  { hosts: ["grok.com"], title: ["grok"], iconUrl: simpleIcon("x") },
  { hosts: ["coze.cn", "coze.com"], title: ["coze", "扣子"], iconUrl: simpleIcon("bytedance") },
  { hosts: ["feishu.cn", "larksuite.com"], title: ["飞书", "feishu", "lark"], iconUrl: simpleIcon("lark") },
  { hosts: ["instagram.com"], title: ["instagram"], iconUrl: simpleIcon("instagram") },
  { hosts: ["tiktok.com", "douyin.com"], title: ["tiktok", "抖音"], iconUrl: simpleIcon("tiktok") },
  { hosts: ["microsoft.com", "live.com", "office.com"], title: ["microsoft", "office"], iconUrl: simpleIcon("microsoft") },
  { hosts: ["apple.com"], title: ["apple"], iconUrl: simpleIcon("apple") }
];

export const curatedIconCount = curatedIconRules.length;

const hostMatches = (host: string, patterns?: string[]) => {
  if (!patterns?.length) return false;
  return patterns.some((pattern) => host === pattern || host.endsWith(`.${pattern}`));
};

export const curatedIconFor = (url: string, title = "") => {
  const host = faviconHostFor(url)?.replace(/^www\./, "").toLowerCase();
  const normalizedTitle = title.trim().toLowerCase();
  if (!host && !normalizedTitle) return undefined;
  const rule = curatedIconRules.find((item) => {
    const matchedHost = host ? hostMatches(host, item.hosts) : false;
    const matchedTitle = normalizedTitle && item.title?.some((keyword) => normalizedTitle.includes(keyword.toLowerCase()));
    return matchedHost || matchedTitle;
  });
  return rule?.iconUrl;
};

export function parseImportText(input: string): ImportShortcut[] {
  const text = input.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) && Array.isArray(parsed.shortcuts) && (Array.isArray(parsed.shortcutFolders) || Array.isArray(parsed.shortcutGroups))) {
      return normalizeAppStateRows(parsed as Record<string, unknown>);
    }
    const rows = Array.isArray(parsed) ? parsed : parsed.shortcuts || parsed.items || parsed.icons;
    if (Array.isArray(rows)) return normalizeImportRows(rows);
  } catch {
    // Try CSV or bookmarks HTML below.
  }

  if (/<a\s/i.test(text)) return parseBookmarksHtml(text);
  return parseCsv(text);
}

function normalizeImportRows(rows: unknown[], inheritedFolderName?: string): ImportShortcut[] {
  return rows.flatMap((raw) => {
    const row = raw as Record<string, unknown>;
    const children = row.children || row.items || row.icons || row.shortcuts;
    const title = String(row.title || row.name || row.label || "").trim();
    const folderName = String(row.folderName || row.folder || row.parentName || inheritedFolderName || "").trim() || undefined;
    if (Array.isArray(children)) {
      const nextFolder = title || folderName;
      return normalizeImportRows(children as unknown[], nextFolder);
    }
    const url = cleanUrl(String(row.url || row.href || row.link || "").trim());
    if (!title || !url) return [];
    return [{
      title,
      url,
      iconUrl: typeof row.iconUrl === "string" ? row.iconUrl : typeof row.icon === "string" ? row.icon : undefined,
      groupName: typeof row.groupName === "string" ? row.groupName : typeof row.group === "string" ? row.group : undefined,
      folderName,
      folderIconUrl: typeof row.folderIconUrl === "string" ? row.folderIconUrl : typeof row.folderIcon === "string" ? row.folderIcon : undefined,
      pinned: typeof row.pinned === "boolean" ? row.pinned : undefined
    }];
  });
}

function normalizeAppStateRows(parsed: Record<string, unknown>): ImportShortcut[] {
  const groups = new Map<string, string>();
  const folders = new Map<string, string>();
  const folderIcons = new Map<string, string>();
  for (const raw of (parsed.shortcutGroups as Record<string, unknown>[] | undefined) || []) {
    if (raw.deletedAt) continue;
    const id = String(raw.id || "");
    const name = String(raw.name || "").trim();
    if (id && name) groups.set(id, name);
  }
  for (const raw of (parsed.shortcutFolders as Record<string, unknown>[] | undefined) || []) {
    if (raw.deletedAt) continue;
    const id = String(raw.id || "");
    const name = String(raw.name || "").trim();
    if (id && name) folders.set(id, name);
    if (id && typeof raw.iconUrl === "string") folderIcons.set(id, raw.iconUrl);
  }
  return ((parsed.shortcuts as Record<string, unknown>[] | undefined) || [])
    .filter((row) => !row.deletedAt)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((row) => ({
      title: String(row.title || "").trim(),
      url: cleanUrl(String(row.url || "").trim()),
      iconUrl: typeof row.iconUrl === "string" ? row.iconUrl : undefined,
      groupName: typeof row.groupName === "string" ? row.groupName : groups.get(String(row.groupId || "")),
      folderName: typeof row.folderName === "string" ? row.folderName : folders.get(String(row.folderId || "")),
      folderIconUrl: typeof row.folderIconUrl === "string" ? row.folderIconUrl : folderIcons.get(String(row.folderId || "")),
      pinned: typeof row.pinned === "boolean" ? row.pinned : undefined
    }))
    .filter((row) => row.title && row.url);
}

export function parseBookmarksHtml(html: string): ImportShortcut[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("a[href]"))
    .map((anchor) => ({
      title: anchor.textContent?.trim() || new URL((anchor as HTMLAnchorElement).href).hostname,
      url: cleanUrl((anchor as HTMLAnchorElement).getAttribute("href") || ""),
      iconUrl: (anchor as HTMLElement).getAttribute("icon") || undefined
    }))
    .filter((row) => row.title && row.url);
}

export function parseCsv(csv: string): ImportShortcut[] {
  return csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((part) => part.trim().replace(/^"|"$/g, "")))
    .map((parts) => {
      const [first, second, third, fourth] = parts;
      const urlFirst = isLikelyUrl(first);
      return {
        title: urlFirst ? second || first : first,
        url: cleanUrl(urlFirst ? first : second || ""),
        iconUrl: third || undefined,
        groupName: fourth || undefined,
        folderName: parts[4] || undefined,
        folderIconUrl: parts[5] || undefined
      };
    })
    .filter((row) => row.title && row.url);
}

export function importedToShortcuts(
  rows: ImportShortcut[],
  existingGroups: ShortcutGroup[],
  startOrder: number,
  existingFolders: ShortcutFolder[] = []
): { shortcuts: Shortcut[]; groups: ShortcutGroup[]; folders: ShortcutFolder[] } {
  const updatedAt = nowIso();
  const groups = [...existingGroups];
  const folders = [...existingFolders];
  const groupByName = new Map(groups.map((group) => [group.name.toLowerCase(), group]));
  const folderByKey = new Map(folders.map((folder) => [`${folder.groupId || ""}::${folder.name.toLowerCase()}`, folder]));

  const ensureGroup = (name?: string) => {
    const label = name?.trim() || "导入快捷导航";
    const key = label.toLowerCase();
    let group = groupByName.get(key);
    if (!group) {
      group = { id: uid(), name: label, color: "#14B8A6", order: groups.length, updatedAt };
      groups.push(group);
      groupByName.set(key, group);
    }
    return group;
  };

  const ensureFolder = (name: string | undefined, groupId: string | undefined) => {
    const label = name?.trim();
    if (!label) return undefined;
    const key = `${groupId || ""}::${label.toLowerCase()}`;
    let folder = folderByKey.get(key);
    if (!folder) {
      folder = { id: uid(), name: label, groupId, iconUrl: undefined, iconColor: colorFor(label), order: folders.length, updatedAt };
      folders.push(folder);
      folderByKey.set(key, folder);
    }
    return folder;
  };

  const shortcuts = rows.map((row, index) => {
    const group = ensureGroup(row.groupName);
    const folder = ensureFolder(row.folderName, group.id);
    if (folder && row.folderIconUrl && !folder.iconUrl) folder.iconUrl = row.folderIconUrl;
    return {
      id: uid(),
      title: row.title,
      url: row.url,
      iconUrl: row.iconUrl || faviconFor(row.url),
      iconColor: colorFor(row.title),
      groupId: group.id,
      folderId: folder?.id,
      pinned: Boolean(row.pinned),
      order: startOrder + index,
      updatedAt
    };
  });

  return { shortcuts, groups, folders };
}

export function colorFor(seed: string) {
  const colors = ["#14B8A6", "#EF4444", "#F59E0B", "#3B82F6", "#8B5CF6", "#EC4899", "#22C55E", "#64748B"];
  const sum = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

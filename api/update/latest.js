const UPSTREAM_LATEST_JSON = "https://github.com/SoKeiKei/CapKit-download/releases/latest/download/latest.json";
const UPSTREAM_LATEST_JSON_MIRROR = `https://gh.llkk.cc/${UPSTREAM_LATEST_JSON}`;

const FETCH_TIMEOUT_MS = 5000;

function buildSiteOrigin(request) {
  const proto = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers.host;
  return `${proto}://${host}`;
}

function getAssetName(fileUrl) {
  try {
    const parsed = new URL(fileUrl);
    const pathParts = parsed.pathname.split("/");
    return decodeURIComponent(pathParts[pathParts.length - 1] || "");
  } catch {
    return "";
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request, response) {
  const fromMirror = await fetchJson(UPSTREAM_LATEST_JSON_MIRROR);
  const fromGithub = fromMirror ? null : await fetchJson(UPSTREAM_LATEST_JSON);
  const data = fromMirror || fromGithub;

  if (!data || !data.platforms || typeof data.platforms !== "object") {
    return response.status(502).json({ error: "无法获取可用的更新元数据" });
  }

  const siteOrigin = buildSiteOrigin(request);
  const output = {
    ...data,
    platforms: { ...data.platforms }
  };

  for (const [platform, platformInfo] of Object.entries(output.platforms)) {
    if (!platformInfo || typeof platformInfo !== "object") {
      continue;
    }

    const originalUrl = String(platformInfo.url || "");
    const asset = getAssetName(originalUrl);
    if (!asset) {
      continue;
    }

    output.platforms[platform] = {
      ...platformInfo,
      url: `${siteOrigin}/updates/download?asset=${encodeURIComponent(asset)}`
    };
  }

  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return response.status(200).send(JSON.stringify(output));
}

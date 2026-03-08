const REPO_OWNER = "SoKeiKei";
const REPO_NAME = "CapKit-download";
const FETCH_TIMEOUT_MS = 3000;
const ASSET_RE = /^[A-Za-z0-9._-]+$/;

function isValidStatus(status) {
  return status >= 200 && status < 400;
}

async function canAccess(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal
    });
    return isValidStatus(response.status);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request, response) {
  const asset = String(request.query.asset || "").trim();
  if (!asset || !ASSET_RE.test(asset)) {
    return response.status(400).json({ error: "非法的资源名" });
  }

  const githubUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/${asset}`;
  const mirrorUrl = `https://gh.llkk.cc/${githubUrl}`;

  if (await canAccess(mirrorUrl)) {
    response.setHeader("Cache-Control", "no-store");
    return response.redirect(302, mirrorUrl);
  }

  response.setHeader("Cache-Control", "no-store");
  return response.redirect(302, githubUrl);
}

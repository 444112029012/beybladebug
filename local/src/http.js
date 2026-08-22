const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function browserHeaders(extra = {}) {
  const ua = process.env.USER_AGENT || DEFAULT_UA;
  return {
    'User-Agent': ua,
    Accept: 'application/json, text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    ...extra,
  };
}

export function isBlocked(status, body = '') {
  const text = String(body || '');
  if (status === 403 || status === 429 || status === 503) return true;
  return /cf-browser-verification|just a moment|attention required|challenge-platform|validateCaptcha|Robot Check|automated access/i.test(text);
}

export async function fetchResponse(url, options = {}) {
  const { headers = {}, method = 'GET', body, timeoutMs = 25000 } = options;
  const response = await fetch(url, {
    method,
    body,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: browserHeaders(headers),
  });
  const text = await response.text();
  if (isBlocked(response.status, text)) {
    throw new Error(`Blocked HTTP ${response.status} for ${url}`);
  }
  return { status: response.status, text, contentType: response.headers.get('content-type') || '' };
}

export async function fetchJson(url, options = {}) {
  const fetched = await fetchResponse(url, {
    ...options,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.headers || {}),
    },
  });
  if (fetched.status < 200 || fetched.status >= 300) {
    throw new Error(`HTTP ${fetched.status} for ${url}`);
  }
  try {
    return { ...fetched, json: JSON.parse(fetched.text) };
  } catch (error) {
    throw new Error(`Not JSON for ${url}`);
  }
}

export async function fetchAllJson(urls, options = {}) {
  return Promise.all(urls.map((url) => fetchJson(url, options)));
}

export async function fetchText(url, options = {}) {
  const fetched = await fetchResponse(url, options);
  if (fetched.status < 200 || fetched.status >= 300) {
    throw new Error(`HTTP ${fetched.status} for ${url}`);
  }
  return fetched;
}

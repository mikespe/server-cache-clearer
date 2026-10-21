/**
 * Pure cache-buster URL rules shared by the toolbar action and the
 * navigation listener. No Chrome APIs.
 */

const HTTP = new Set(['http:', 'https:']);

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function nextCacheToken(value) {
  if (value == null) return 'clear';
  const match = /^clear(\d*)$/i.exec(value);
  if (!match) return 'clear';
  const digits = match[1];
  if (digits === '') return 'clear2';
  if (!/^[1-9]\d*$/.test(digits)) return 'clear';
  const n = BigInt(digits);
  if (n < 2n) return 'clear';
  return `clear${n + 1n}`;
}

/**
 * @param {string} token
 * @returns {string}
 */
export function badgeText(token) {
  if (token === 'clear') return 'clear';
  const match = /^clear(\d+)$/.exec(token ?? '');
  return match ? `c${match[1]}` : '';
}

/**
 * @param {string} rawUrl
 * @returns {URL | null}
 */
function parseHttp(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return HTTP.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} part
 * @returns {{ name: string, value: string }}
 */
function readPart(part) {
  const eq = part.indexOf('=');
  const rawName = eq === -1 ? part : part.slice(0, eq);
  const rawValue = eq === -1 ? '' : part.slice(eq + 1);
  let name = rawName;
  let value = rawValue;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    name = rawName;
  }
  try {
    value = decodeURIComponent(rawValue);
  } catch {
    value = rawValue;
  }
  return { name, value };
}

/**
 * @param {URL} url
 * @returns {{ parts: string[], index: number, value: string | null }}
 */
function findCacheParam(url) {
  const parts = url.search.length > 1 ? url.search.slice(1).split('&') : [];
  for (let i = 0; i < parts.length; i++) {
    const { name, value } = readPart(parts[i]);
    if (name === 'cache') return { parts, index: i, value };
  }
  return { parts, index: -1, value: null };
}

/**
 * Canonical lowercase token when `cache` is exactly `clear` or `clearN`
 * (N >= 2). Otherwise null. `clear1` is not a buster.
 * @param {string} rawUrl
 * @returns {string | null}
 */
export function cacheToken(rawUrl) {
  const url = parseHttp(rawUrl);
  if (!url) return null;
  const { value } = findCacheParam(url);
  if (value == null) return null;
  const match = /^clear(\d*)$/i.exec(value);
  if (!match) return null;
  if (match[1] === '') return 'clear';
  if (!/^[1-9]\d*$/.test(match[1])) return null;
  const n = BigInt(match[1]);
  if (n < 2n) return null;
  return `clear${n.toString()}`;
}

/**
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function hasCacheBuster(rawUrl) {
  return cacheToken(rawUrl) != null;
}

/**
 * @param {string} rawUrl
 * @param {string | null | undefined} lastAssigned
 * @returns {boolean}
 */
export function isOwnAssignment(rawUrl, lastAssigned) {
  if (typeof lastAssigned !== 'string' || lastAssigned.length === 0) return false;
  if (rawUrl === lastAssigned) return true;
  try {
    return new URL(rawUrl).href === new URL(lastAssigned).href;
  } catch {
    return false;
  }
}

/**
 * Rewrite `cache` on an http(s) URL.
 * Missing or unrecognized values become `clear`. `clear` becomes `clear2`.
 * `clearN` (N >= 2) becomes `clear(N+1)`. Hash and other params stay put.
 * @param {string} rawUrl
 * @returns {string}
 */
export function nextCacheUrl(rawUrl) {
  const url = parseHttp(rawUrl);
  if (!url) return rawUrl;
  const { parts, index, value } = findCacheParam(url);
  const token = nextCacheToken(index === -1 ? null : value);
  if (index === -1) parts.push(`cache=${token}`);
  else parts[index] = `cache=${token}`;
  url.search = `?${parts.join('&')}`;
  return url.href;
}

/**
 * @param {string} rawUrl
 * @returns {{ action: 'redirect' | 'ignore', url: string, assign: string | null, token: string | null }}
 */
export function applyClick(rawUrl) {
  if (typeof rawUrl !== 'string' || !parseHttp(rawUrl)) {
    return { action: 'ignore', url: rawUrl ?? '', assign: null, token: null };
  }
  const next = nextCacheUrl(rawUrl);
  return { action: 'redirect', url: next, assign: next, token: cacheToken(next) };
}

/**
 * Top-frame navigation. Does not append `cache=clear` on a normal URL.
 * If `lastAssigned` is the exact URL this extension just set, the navigation
 * is left unchanged so the redirect cannot chain.
 * @param {string} rawUrl
 * @param {string | null | undefined} lastAssigned
 * @param {number} [frameId]
 * @returns {{ action: 'redirect' | 'passthrough' | 'ignore', url: string, assign: string | null, token: string | null }}
 */
export function applyNavigation(rawUrl, lastAssigned, frameId = 0) {
  if (frameId !== 0 || typeof rawUrl !== 'string' || !parseHttp(rawUrl)) {
    return { action: 'ignore', url: rawUrl ?? '', assign: null, token: null };
  }
  if (isOwnAssignment(rawUrl, lastAssigned)) {
    return {
      action: 'passthrough',
      url: rawUrl,
      assign: lastAssigned ?? null,
      token: cacheToken(rawUrl),
    };
  }
  if (!hasCacheBuster(rawUrl)) {
    return { action: 'passthrough', url: rawUrl, assign: null, token: null };
  }
  const next = nextCacheUrl(rawUrl);
  return { action: 'redirect', url: next, assign: next, token: cacheToken(next) };
}

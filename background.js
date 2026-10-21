import { applyClick, applyNavigation, badgeText } from './src/cache-url.js';

/** @type {Map<number, string>} Exact URL last assigned for a tab, while this worker is alive. */
const pending = new Map();

const httpFilter = { url: [{ schemes: ['http', 'https'] }] };

/**
 * @param {number} tabId
 * @returns {string}
 */
function storageKey(tabId) {
  return `assigned:${tabId}`;
}

/**
 * @param {number} tabId
 * @param {string | null} token
 */
function showBadge(tabId, token) {
  const text = badgeText(token ?? '');
  chrome.action.setBadgeText({ tabId, text });
  if (text) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#0B3B34' });
    if (chrome.action.setBadgeTextColor) {
      chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' });
    }
  }
}

/**
 * @param {number} tabId
 * @returns {Promise<string | null>}
 */
async function readAssigned(tabId) {
  const memory = pending.get(tabId);
  if (memory) return memory;
  const stored = await chrome.storage.session.get(storageKey(tabId));
  const value = stored[storageKey(tabId)];
  if (typeof value === 'string' && value.length > 0) {
    pending.set(tabId, value);
    return value;
  }
  return null;
}

/**
 * Remember the URL, then navigate. Storage is written before tabs.update so a
 * service-worker restart cannot treat our own redirect as a new visit.
 * @param {number} tabId
 * @param {{ url: string, assign: string, token: string | null }} decision
 */
async function redirectTab(tabId, decision) {
  pending.set(tabId, decision.assign);
  showBadge(tabId, decision.token);
  try {
    await chrome.storage.session.set({ [storageKey(tabId)]: decision.assign });
    await chrome.tabs.update(tabId, { url: decision.url });
  } catch {
    pending.delete(tabId);
    await chrome.storage.session.remove(storageKey(tabId)).catch(() => {});
  }
}

/**
 * Drop this tab's one-shot record. If a newer assignment was stored while the
 * delete was in flight, write that URL back so a late remove cannot erase it.
 * @param {number} tabId
 */
async function forgetAssignment(tabId) {
  const expected = pending.get(tabId) ?? null;
  pending.delete(tabId);
  const key = storageKey(tabId);
  try {
    const stored = await chrome.storage.session.get(key);
    if (pending.has(tabId)) return;
    const value = stored[key];
    if (typeof value === 'string' && expected != null && value !== expected) return;
    if (value == null && expected == null) return;
    await chrome.storage.session.remove(key);
    const restored = pending.get(tabId);
    if (restored) await chrome.storage.session.set({ [key]: restored });
  } catch {
    // The in-memory record is already gone, so the next visit in this worker still bumps.
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return;
  const decision = applyClick(tab.url);
  if (decision.action !== 'redirect' || !decision.assign) return;
  void redirectTab(tab.id, { url: decision.url, assign: decision.assign, token: decision.token });
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  void handleNavigation(details);
}, httpFilter);

/**
 * @param {{ tabId: number, url: string, frameId: number }} details
 */
async function handleNavigation(details) {
  const lastAssigned = await readAssigned(details.tabId);
  const decision = applyNavigation(details.url, lastAssigned, details.frameId);
  if (decision.action === 'redirect' && decision.assign) {
    await redirectTab(details.tabId, {
      url: decision.url,
      assign: decision.assign,
      token: decision.token,
    });
    return;
  }
  if (decision.action === 'passthrough') {
    showBadge(details.tabId, decision.token);
    if (!decision.assign) forgetAssignment(details.tabId);
  }
}

/**
 * Drop the one-shot record once the assigned navigation lands or fails, so
 * the next refresh or visit bumps again.
 * @param {{ tabId: number, url: string, frameId: number }} details
 */
function releaseIfLanded(details) {
  if (details.frameId !== 0) return;
  void (async () => {
    const lastAssigned = await readAssigned(details.tabId);
    if (!lastAssigned) return;
    const decision = applyNavigation(details.url, lastAssigned, 0);
    if (decision.action === 'passthrough' && decision.assign) {
      forgetAssignment(details.tabId);
      showBadge(details.tabId, decision.token);
    }
  })();
}

chrome.webNavigation.onCommitted.addListener(releaseIfLanded, httpFilter);
chrome.webNavigation.onCompleted.addListener(releaseIfLanded, httpFilter);
chrome.webNavigation.onErrorOccurred.addListener(releaseIfLanded, httpFilter);

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetAssignment(tabId);
});

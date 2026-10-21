# Cache Clearer

Cache Clearer is a Manifest V3 Chrome extension. Click the toolbar button, or press the suggested shortcut **Alt+Shift+C**, and the current http(s) tab reloads with a `cache` query parameter. That changes the request URL so a server or CDN treats it as a new request.

This is a **server/CDN cache buster via the query string**. It does not clear Chrome's disk cache, cookies, site data, or the HTTP cache. There are no accounts, analytics, or payments.

## Install unpacked

1. Clone this repository, or download and unzip it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Choose the folder that contains `manifest.json` (the repository root).

The suggested shortcut is **Alt+Shift+C**. Chrome only reserves a suggested shortcut when it is free. Confirm or change it at `chrome://extensions/shortcuts`.

## How `cache` changes

The toolbar click (and the shortcut) on a top-level http(s) tab:

- If there is no `cache` parameter, or its value is not exactly `clear` or `clear` plus an integer **2 or greater**, the extension sets `cache=clear`.
- If the value is `clear`, it becomes `clear2`.
- If the value is `clearN` (N ≥ 2), it becomes `clear(N+1)`.

The sequence is `clear` → `clear2` → `clear3` → … → `clear10` → `clear11`. There is no `clear1`. `clear1`, `clear0`, and any other value are rewritten to `clear` on a click.

Values match case-insensitively (`CACHE=CLEAR` counts). The new value is always written in lowercase. The hash and every other query parameter stay as they are. A URL with no query string gets `?cache=…`. A URL that already has a query string gets `&cache=…`, or the existing `cache` parameter is replaced in place. Only the top frame is changed. `chrome://` and other non-http(s) pages are ignored.

A normal URL is **not** rewritten on first visit. After `cache=clear` or `cache=clearN` is present, each later reload, or each navigation that opens such a URL, bumps the number once before the page is shown. The extension records the exact URL it just assigned for that tab and lets that navigation through unchanged, so its own redirect does not chain. The next refresh or visit bumps again.

The toolbar badge shows only the number: `1` for `clear`, `2` for `clear2`, `10` for `clear10`, and so on.

## Permissions

- **webNavigation** — watch top-level loads and reloads. When a page already has `cache=clear` or `cache=clearN`, the extension bumps it as the navigation starts instead of waiting for another click.
- **storage** — remember, in `chrome.storage.session` only, the exact URL just assigned for each tab. That stops the extension's own redirect from bumping again, including if the service worker restarts. Session data stays on this device and is discarded when the browser closes. Nothing is synced or uploaded.
- **Host access for `http://*/*` and `https://*/*`** — read and rewrite ordinary web URLs in the tab you are viewing. Other schemes are ignored.

The extension does not collect browsing history or run remote code.

## Chrome Web Store description draft

**Short description**

Bust server and CDN caches by changing a cache query parameter. Does not clear Chrome's disk cache.

**Detailed description**

Cache Clearer reloads the current tab with a `cache` query parameter so a server or CDN fetches a fresh response. It does not clear Chrome's disk cache, cookies, or site data.

Click the icon or press Alt+Shift+C to set `cache=clear`. Each later refresh bumps it: `clear`, then `clear2`, `clear3`, and so on. The badge shows only that number. No account, no analytics, no payments.

## Development

The URL rules live in `src/cache-url.js` and are covered by Node's built-in test runner:

```sh
npm test
```

## License

[MIT](LICENSE)

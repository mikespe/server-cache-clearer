import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  applyClick,
  applyNavigation,
  badgeText,
  cacheToken,
  nextCacheUrl,
} from '../src/cache-url.js';

/**
 * @param {string} rawUrl
 * @returns {string | null}
 */
function cacheValue(rawUrl) {
  return new URL(rawUrl).searchParams.get('cache');
}

describe('nextCacheUrl', () => {
  test('sequence is clear → clear2 → clear3 → clear10 → clear11, with no clear1', () => {
    let url = 'https://example.com/app';
    const tokens = [];
    for (let i = 0; i < 11; i++) {
      url = nextCacheUrl(url);
      tokens.push(cacheValue(url));
    }
    assert.deepEqual(tokens.slice(0, 3), ['clear', 'clear2', 'clear3']);
    assert.equal(tokens[9], 'clear10');
    assert.equal(tokens[10], 'clear11');
    assert.equal(tokens.includes('clear1'), false);
    assert.equal(nextCacheUrl('https://example.com/app?cache=clear10'), 'https://example.com/app?cache=clear11');
    assert.equal(nextCacheUrl('https://example.com/app?cache=clear'), 'https://example.com/app?cache=clear2');
    assert.equal(nextCacheUrl('https://example.com/app?cache=clear2'), 'https://example.com/app?cache=clear3');
  });

  test('uses ? when there is no query string and & when there is', () => {
    assert.equal(nextCacheUrl('https://example.com/a'), 'https://example.com/a?cache=clear');
    assert.equal(nextCacheUrl('https://example.com/a?x=1'), 'https://example.com/a?x=1&cache=clear');
    assert.equal(nextCacheUrl('http://localhost:8080/a'), 'http://localhost:8080/a?cache=clear');
  });

  test('preserves the hash when appending and when replacing', () => {
    assert.equal(
      nextCacheUrl('https://cdn.example.com/assets/app.js#section'),
      'https://cdn.example.com/assets/app.js?cache=clear#section',
    );
    assert.equal(
      nextCacheUrl('https://cdn.example.com/assets/app.js?v=1#section-2'),
      'https://cdn.example.com/assets/app.js?v=1&cache=clear#section-2',
    );
    assert.equal(
      nextCacheUrl('https://cdn.example.com/assets/app.js?v=1&cache=clear#section-2'),
      'https://cdn.example.com/assets/app.js?v=1&cache=clear2#section-2',
    );
  });

  test('replaces a cache param in the middle and preserves the others', () => {
    assert.equal(
      nextCacheUrl('https://example.com/search?q=cache&cache=clear&lang=en#results'),
      'https://example.com/search?q=cache&cache=clear2&lang=en#results',
    );
    assert.equal(
      nextCacheUrl('https://example.com/a?utm_source=nl&cache=clear3&ref=a%20b&ok=1%2B2'),
      'https://example.com/a?utm_source=nl&cache=clear4&ref=a%20b&ok=1%2B2',
    );
    assert.equal(
      nextCacheUrl('https://example.com/p?a&cache=clear&b=2'),
      'https://example.com/p?a&cache=clear2&b=2',
    );
    assert.equal(
      nextCacheUrl('https://example.com/p?cacheb=1&mycache=clear&x=1'),
      'https://example.com/p?cacheb=1&mycache=clear&x=1&cache=clear',
    );
  });

  test('resets non-clear cache values to clear', () => {
    const cases = ['bust', 'please', '', 'clear1', 'clear0', 'clear01', 'clear2extra', 'CLEAR1', '2'];
    for (const value of cases) {
      const input = `https://example.com/a?keep=1&cache=${encodeURIComponent(value)}&tail=2`;
      assert.equal(
        nextCacheUrl(input),
        'https://example.com/a?keep=1&cache=clear&tail=2',
        value,
      );
    }
    assert.equal(
      nextCacheUrl('https://example.com/a?cache'),
      'https://example.com/a?cache=clear',
    );
  });

  test('matches an existing value case-insensitively and writes lowercase', () => {
    assert.equal(
      nextCacheUrl('https://example.com/a?cache=ClEaR'),
      'https://example.com/a?cache=clear2',
    );
    assert.equal(
      nextCacheUrl('https://example.com/a?x=1&cache=CLEAR10&y=2'),
      'https://example.com/a?x=1&cache=clear11&y=2',
    );
    assert.equal(
      nextCacheUrl('https://example.com/a?cache=clear%32'),
      'https://example.com/a?cache=clear3',
    );
    assert.equal(cacheToken('https://example.com/a?cache=ClEaR'), 'clear');
    assert.equal(cacheToken('https://example.com/a?cache=CLEAR10'), 'clear10');
    assert.equal(cacheToken('https://example.com/a?cache=clear1'), null);
  });
});

describe('navigation guard', () => {
  test('own redirect must not double-bump', () => {
    const start = 'https://example.com/docs?cache=clear#top';
    const first = applyNavigation(start, null);
    assert.equal(first.action, 'redirect');
    assert.equal(first.url, 'https://example.com/docs?cache=clear2#top');
    assert.equal(first.assign, first.url);

    const echo = applyNavigation(first.url, first.assign);
    assert.equal(echo.action, 'passthrough');
    assert.equal(echo.url, first.url);
    assert.notEqual(nextCacheUrl(first.url), first.url);

    const duplicate = applyNavigation(first.url, echo.assign);
    assert.equal(duplicate.action, 'passthrough');
    assert.equal(duplicate.url, first.url);

    const refresh = applyNavigation(first.url, null);
    assert.equal(refresh.action, 'redirect');
    assert.equal(refresh.url, 'https://example.com/docs?cache=clear3#top');

    const refreshEcho = applyNavigation(refresh.url, refresh.assign);
    assert.equal(refreshEcho.action, 'passthrough');
    assert.equal(refreshEcho.url, refresh.url);
  });

  test('a first visit does not auto-append, and a click does', () => {
    const plain = 'https://example.com/docs';
    const visit = applyNavigation(plain, null);
    assert.equal(visit.action, 'passthrough');
    assert.equal(visit.url, plain);

    const click = applyClick(plain);
    assert.equal(click.action, 'redirect');
    assert.equal(click.url, 'https://example.com/docs?cache=clear');
  });

  test('ignores subframes and non-http pages', () => {
    const sub = applyNavigation('https://example.com/?cache=clear', null, 1);
    assert.equal(sub.action, 'ignore');
    assert.equal(sub.url, 'https://example.com/?cache=clear');

    assert.equal(applyClick('chrome://extensions').action, 'ignore');
    assert.equal(nextCacheUrl('chrome://newtab/'), 'chrome://newtab/');
    assert.equal(applyNavigation('about:blank', null).action, 'ignore');
  });

  test('opening a url that already has a buster bumps once', () => {
    const opened = applyNavigation('https://example.com/item?id=4&cache=CLEAR&ref=a', null);
    assert.equal(opened.action, 'redirect');
    assert.equal(opened.url, 'https://example.com/item?id=4&cache=clear2&ref=a');
    const landed = applyNavigation(opened.url, opened.assign);
    assert.equal(landed.action, 'passthrough');
  });
});

describe('badgeText', () => {
  test('shortens clearN and leaves clear as clear', () => {
    assert.equal(badgeText('clear'), 'clear');
    assert.equal(badgeText('clear2'), 'c2');
    assert.equal(badgeText('clear3'), 'c3');
    assert.equal(badgeText('clear10'), 'c10');
    assert.equal(badgeText('clear11'), 'c11');
  });
});

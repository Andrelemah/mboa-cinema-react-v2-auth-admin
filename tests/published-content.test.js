import test from 'node:test';
import assert from 'node:assert/strict';
import { durationLabel, mapPublishedContent, selectHeroFilms, safePlayerUrl } from '../src/utils/publishedContent.js';

test('published content keeps the server destination, access tier and language', () => {
  const film = mapPublishedContent({ id: 'abc', title: 'Une histoire', synopsis: 'Texte', content_type: 'story', tier: 'plus', language_code: 'bas', status: 'published', duration_seconds: 5410, featured: true }, '/poster.webp');
  assert.equal(film.type, 'story');
  assert.equal(film.tier, 'plus');
  assert.equal(film.languageCode, 'bas');
  assert.equal(film.available, true);
  assert.equal(film.demo, false);
  assert.equal(film.descriptionEn, 'Texte');
  assert.equal(film.image, '/poster.webp');
  assert.equal(film.duration, '1 h 30');
});

test('featured selection handles an empty catalogue without demo fallback', () => {
  assert.deepEqual(selectHeroFilms([]), []);
  const items = [{ id: 'a' }, { id: 'b', featured: true }, { id: 'c' }, { id: 'd', featured: true }];
  assert.deepEqual(selectHeroFilms(items).map(item => item.id), ['b', 'd', 'a']);
  assert.deepEqual(items.map(item => item.id), ['a', 'b', 'c', 'd']);
});

test('player accepts only HTTPS Cloudflare player origins without credentials or extra ports', () => {
  assert.equal(safePlayerUrl('https://customer-demo.cloudflarestream.com/token/iframe'), 'https://customer-demo.cloudflarestream.com/token/iframe');
  assert.equal(safePlayerUrl('https://iframe.videodelivery.net/token'), 'https://iframe.videodelivery.net/token');
  for (const value of ['javascript:alert(1)', 'http://iframe.videodelivery.net/token', 'https://iframe.videodelivery.net.evil.test/token', 'https://evil.test/token', 'https://user:password@iframe.videodelivery.net/token', 'https://iframe.videodelivery.net:444/token', null, '']) assert.equal(safePlayerUrl(value), null);
});

test('duration labels do not invent a runtime for incomplete or invalid metadata', () => {
  for (const input of [null, undefined, 0, -2, 'invalid', Infinity]) assert.equal(durationLabel(input), '—');
  assert.equal(durationLabel(20), '1 min');
  assert.equal(durationLabel(3600), '1 h 00');
});

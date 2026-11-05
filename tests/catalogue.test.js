import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue, plans } from '../src/data/catalogue.js';
import { filterCatalogue, searchFilms } from '../src/utils/catalogue.js';

test('search finds accented titles and the Douala spelling alias', () => {
  assert.deepEqual(searchFilms(catalogue, 'YAOUNDE').map(film => film.id), ['yaounde']);
  assert.deepEqual(searchFilms(catalogue, 'Douala').map(film => film.id), ['fleuve']);
  assert.deepEqual(searchFilms(catalogue, 'duala').map(film => film.id), ['fleuve']);
});

test('catalogue filters intersect instead of broadening access to a selection', () => {
  assert.deepEqual(filterCatalogue(catalogue, { genre: 'mobile', language: 'bas' }).map(film => film.id), ['racines']);
  assert.deepEqual(filterCatalogue(catalogue, { genre: 'mobile', language: 'dua' }), []);
  assert.deepEqual(filterCatalogue(catalogue, { language: 'und-bamileke' }), []);
});

test('stories and saved-title filtering preserve catalogue order', () => {
  assert.deepEqual(filterCatalogue(catalogue, { route: 'histoires' }).map(film => film.id), ['racines', 'retour', 'collines']);
  assert.deepEqual(filterCatalogue(catalogue, { route: 'ma-liste', saved: ['taxi', 'fleuve', 'missing'] }).map(film => film.id), ['fleuve', 'taxi']);
});

test('demonstration metadata remains explicit and example plans retain their limits', () => {
  assert.equal(new Set(catalogue.map(film => film.id)).size, catalogue.length);
  assert.ok(catalogue.every(film => film.demo === true && film.available === false));
  assert.equal(plans.find(plan => plan.id === 'mobile').price, 3000);
  assert.equal(plans.find(plan => plan.id === 'plus').simultaneousStreams, 4);
});

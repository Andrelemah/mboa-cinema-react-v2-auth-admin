import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPreferences, removePreferences, writePreference } from '../src/utils/preferences.js';

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('malformed and obsolete browser data cannot break the React startup', () => {
  const storage = memoryStorage({
    'mboa.lang': '"unknown"', 'mboa.saved': '["taxi","taxi","removed-film"]',
    'mboa.names': '[null,42,"  Guest  ",""]', 'mboa.profile': '99',
    'mboa.plan': '"invented-plan"', 'mboa.audio': '"all"', 'mboa.libraryView': '{broken',
  });
  const prefs = loadPreferences(storage);
  assert.equal(prefs.lang, 'fr');
  assert.equal(prefs.audio, 'fr');
  assert.equal(prefs.plan, 'discovery');
  assert.equal(prefs.profile, 0);
  assert.equal(prefs.libraryView, 'binder');
  assert.deepEqual(prefs.saved, ['taxi']);
  assert.deepEqual(prefs.names, ['Vous', 'Invité 1', 'Guest', 'Invité 3']);
});

test('valid preferences from the original prototype survive migration', () => {
  const storage = memoryStorage();
  for (const [key, value] of Object.entries({ lang: 'en', audio: 'bas', saved: ['racines'], plan: 'plus', profile: 2, names: ['A', 'B', 'C', 'D'], libraryView: 'grid' })) writePreference(key, value, storage);
  assert.deepEqual(loadPreferences(storage), { lang: 'en', audio: 'bas', saved: ['racines'], plan: 'plus', profile: 2, names: ['A', 'B', 'C', 'D'], libraryView: 'grid' });
});

test('blocked browser storage still allows default preferences and clearing', () => {
  const denied = { getItem() { throw Error('Storage unavailable'); }, setItem() { throw Error('Storage unavailable'); }, removeItem() { throw Error('Storage unavailable'); } };
  assert.equal(loadPreferences(denied).lang, 'fr');
  assert.doesNotThrow(() => writePreference('lang', 'en', denied));
  assert.doesNotThrow(() => removePreferences(denied));
});

test('reset only removes MBOA preferences', () => {
  const storage = memoryStorage({ 'mboa.saved': '["taxi"]', 'mboa.libraryView': '"grid"', 'another-app.theme': 'dark' });
  removePreferences(storage);
  assert.equal(storage.getItem('mboa.saved'), null);
  assert.equal(storage.getItem('mboa.libraryView'), null);
  assert.equal(storage.getItem('another-app.theme'), 'dark');
});

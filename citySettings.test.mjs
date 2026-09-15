import assert from 'node:assert/strict';
import { readCitySettings } from './src/citySettings.ts';

assert.deepEqual(readCitySettings(''), { citySize: 60, citySeed: 'Alphen aan den Rijn' });
const params = new URLSearchParams({ size: '45', seed: 'Canals & cafés + trees' });
assert.deepEqual(readCitySettings(`?${params}`), { citySize: 45, citySeed: 'Canals & cafés + trees' });
for (const size of ['-1', '0', '9', '101', '20.5', 'Infinity', 'nope']) {
  assert.equal(readCitySettings(`?size=${size}`).citySize, 60);
}
for (const size of [10, 100]) assert.equal(readCitySettings(`?size=${size}`).citySize, size);
assert.equal(readCitySettings('?seed=+++').citySeed, 'Alphen aan den Rijn');
assert.equal(readCitySettings(`?seed=${'a'.repeat(150)}`).citySeed.length, 120);
console.log('City settings checks passed.');

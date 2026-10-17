import assert from 'node:assert/strict';
import test from 'node:test';
import { runGreeting } from './run-greeting.js';

test('writes one line per name, trimmed, and names an empty one', () => {
  /** @type {string[]} */
  const written = [];
  runGreeting(['  Ada ', '   '], {
    write: (text) => {
      written.push(text);
    },
  });
  assert.deepEqual(written, ['Hello, Ada!\n', 'No name given\n']);
});

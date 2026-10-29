import assert from 'node:assert/strict';
import { it } from 'node:test';
import { login } from '../login.js';

it('keeps a trimmed name', () => {
  assert.equal(login('Ada'), 'Ada');
});

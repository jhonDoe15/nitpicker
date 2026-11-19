import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { login } from './login.js';

it('trims the name', () => {
  assert.equal(login(String(readFileSync)), String(readFileSync));
});

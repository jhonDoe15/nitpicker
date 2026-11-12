import { describe, expect, it } from 'vitest';
import { prepareUnit } from '../engine.mjs';
import { javascriptUnits } from '../test-support/javascript.mjs';
import { createVocabulary } from './tokens.mjs';
import { candidatePairs } from './candidates.mjs';

const SHARED = `
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) { target.set(name.toLowerCase(), String(value)); }
  }`;

function prepared(source) {
  const tokensOf = createVocabulary();
  return javascriptUnits(source).map((unit) => prepareUnit(unit, tokensOf));
}

const SOURCE = `
function withShared(headers, target) {
  const started = clock.now();
  audit.open(started, target);${SHARED}
  return audit.close(started, target, headers.length);
}
function sharedOnly(headers, target, options) {
  if (options.strict) { validate(headers, options.schema, options.mode); }
  report(options, target);${SHARED}
}
function similar(first, second) {
  const started = clock.now();
  audit.open(started, second);
  return audit.close(started, second, first.length);
}
function unrelated(value) {
  return value * 2;
}`;

describe('candidate pairs', () => {
  it('pairs functions with similar tokens when no statement subtree is large enough to index', () => {
    const units = prepared(`
function one(a, b) { const x = a.first; const y = b.second; use(x, y); keep(y, 1); return x; }
function two(c, d) { const p = c.first; const q = d.other; use(p, q); keep(q, 2); return p; }
function three(value) { return value * 2; }`);

    expect(candidatePairs(units, () => true)).toEqual([[0, 1]]);
  });

  it('pairs functions through the statement index when their tokens differ', () => {
    const units = prepared(SOURCE);

    expect(candidatePairs(units, () => true)).toEqual([[0, 1]]);
  });

  it('compares only pairs that involve a changed function', () => {
    const units = prepared(SOURCE);

    expect(candidatePairs(units, (index) => index === 1)).toEqual([[0, 1]]);
  });
});

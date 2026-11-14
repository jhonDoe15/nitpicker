import { describe, expect, it } from 'vitest';
import { prepareUnit } from '../engine.mjs';
import { javascriptUnits } from '../test-support/javascript.mjs';
import { holeSummary, proveSource } from '../test-support/prove.mjs';
import { alignTrees } from './align.mjs';

const BODY = `
  const entry = cache.lookup(key, LABEL);
  const stamp = clock.now(key, entry.version);
  if (entry === undefined) { throw new MissingEntry(key, LABEL); }
  audit.record(entry, stamp, LABEL);
  return entry.value;`;

function copies(first, second) {
  return `function first(key) {${first}\n}\nfunction second(key) {${second}\n}`;
}

describe('aligning two trees into a template', () => {
  it('records a consistent rename of bound names without a parameter', () => {
    const finding = proveSource(copies(BODY, BODY.replaceAll('entry', 'found')));

    expect(finding.verdict).toBe('same');
    expect(finding.parameters).toEqual([]);
    expect(finding.renames.map(({ a, b }) => [a.text, b.text])).toEqual([['entry', 'found']]);
  });

  it('passes a differing literal eagerly, as one parameter however often it is used', () => {
    const finding = proveSource(
      copies(BODY.replaceAll('LABEL', "'a'"), BODY.replaceAll('LABEL', "'b'")),
    );

    expect(holeSummary(finding)).toEqual([
      { kind: 'value', deferred: false, values: ["'a'", "'b'"] },
    ]);
  });

  it.each([
    ['a literal against a free name', BODY.replaceAll('LABEL', "'user'"), ["'user'", 'LABEL']],
    ['a differing free name', BODY.replace('cache.lookup', 'store.lookup'), ['cache', 'store']],
    [
      'an expression evaluated conditionally',
      BODY.replace('new MissingEntry(key, LABEL)', 'new MissingEntry(describe(key), LABEL)'),
      ['call', 'key'],
    ],
    [
      'a call that runs once, since earlier statements may change what it sees',
      BODY.replace('cache.lookup(key, LABEL)', 'cache.lookup(key, label())'),
      ['LABEL', 'call'],
    ],
  ])('defers %s', (_, changed, values) => {
    const finding = proveSource(copies(BODY, changed));

    expect([finding.verdict, holeSummary(finding)]).toEqual([
      'parameterizable',
      [{ kind: 'value', deferred: true, values }],
    ]);
  });

  it('defers a differing expression evaluated more than once', () => {
    const loop = `
  let total = 0;
  for (const item of key) { total = total + price(item, rate()); }
  const stamp = clock.now(key, total);
  audit.record(total, stamp, LABEL);
  return total;`;
    const finding = proveSource(copies(loop, loop.replace('rate()', 'tariff.rate')));

    expect(holeSummary(finding)).toEqual([
      { kind: 'value', deferred: true, values: ['call', 'rate'] },
    ]);
  });

  it('turns a differing type into a type parameter', () => {
    const finding = proveSource(copies(BODY, BODY.replace('new MissingEntry', 'new UnknownEntry')));

    expect(holeSummary(finding)).toEqual([
      { kind: 'type', deferred: false, values: ['MissingEntry', 'UnknownEntry'] },
    ]);
  });

  it('records a statement present in only one copy as a gap', () => {
    const [left, right] = javascriptUnits(
      copies(BODY, BODY.replace('audit.record', 'metrics.increment(key);\n  audit.record')),
    ).map((unit) => prepareUnit(unit));
    const { state, template } = alignTrees(left.tree, right.tree);

    expect(state.gaps.map(({ side, node }) => [side, node.kind])).toEqual([['b', 'evaluate']]);
    expect(template.children[2].children.filter(({ kind }) => kind === 'gap')).toHaveLength(1);
  });

  it('declines a target that differs, because a write cannot become a parameter', () => {
    const write = `
  let total = 0; let other = 0;
  total = cache.lookup(key, LABEL);
  audit.record(total, other, key);
  return total + other;`;
    const finding = proveSource(copies(write, write.replace('total = cache', 'other = cache')));

    expect(finding?.verdict).not.toBe('same');
    expect(finding?.verdict).not.toBe('parameterizable');
  });

  it.each([
    [
      'a destructuring target that writes another name',
      `[lastSeen, count] = pair(key, LABEL);`,
      `[lastSent, count] = pair(key, LABEL);`,
    ],
    ['a method called on its receiver', `entries.add(key, LABEL);`, `entries.push(key, LABEL);`],
  ])('declines %s', (_, first, second) => {
    const tail = `
  const stamp = clock.now(key, LABEL);
  audit.record(stamp, key, LABEL);
  audit.close(stamp, key, LABEL);
  return stamp;`;

    expect(proveSource(copies(first + tail, second + tail))).toBeUndefined();
  });
});

describe('alignment state', () => {
  const name = (value, text = value) => ({
    kind: 'name',
    binding: 'bound',
    value,
    text,
    children: [],
  });
  const evaluate = (...names) => ({
    kind: 'block',
    children: [
      {
        kind: 'evaluate',
        children: [
          {
            kind: 'call',
            children: [{ kind: 'name', binding: 'free', value: 'use', children: [] }, ...names],
          },
        ],
      },
    ],
  });

  it('maps bound names one to one', () => {
    const { state } = alignTrees(evaluate(name('a'), name('a')), evaluate(name('x'), name('y')));

    expect(state.holes.map(({ a, b }) => [a.value, b.value])).toEqual([['a', 'y']]);
    expect(state.renames.map(({ a, b }) => [a.value, b.value])).toEqual([['a', 'x']]);
  });

  it('counts each matched node once as shared', () => {
    const { state } = alignTrees(evaluate(name('a')), evaluate(name('b')));

    expect(state.shared).toBe(5);
    expect(state.gaps).toEqual([]);
  });
});

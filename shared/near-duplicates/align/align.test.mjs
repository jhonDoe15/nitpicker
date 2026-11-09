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

  it('turns a differing literal into one value parameter, however often it is used', () => {
    const finding = proveSource(copies(BODY, BODY.replaceAll('LABEL', "'user'")));

    expect(holeSummary(finding)).toEqual([
      { kind: 'value', deferred: false, values: ["'user'", 'LABEL'] },
    ]);
  });

  it('turns a differing free name into a parameter, not a rename', () => {
    const finding = proveSource(copies(BODY, BODY.replace('cache.lookup', 'store.lookup')));

    expect(finding.verdict).toBe('parameterizable');
    expect(holeSummary(finding)).toEqual([
      { kind: 'value', deferred: false, values: ['cache', 'store'] },
    ]);
  });

  it('marks a differing expression as deferred when it is evaluated conditionally', () => {
    const finding = proveSource(
      copies(
        BODY,
        BODY.replace('new MissingEntry(key, LABEL)', 'new MissingEntry(describe(key), LABEL)'),
      ),
    );

    expect(holeSummary(finding)).toEqual([
      { kind: 'value', deferred: true, values: ['call', 'key'] },
    ]);
  });

  it('marks a differing expression as deferred when it is evaluated more than once', () => {
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

  it('keeps a differing call eager when it runs once and reads no local', () => {
    const finding = proveSource(
      copies(BODY, BODY.replace('cache.lookup(key, LABEL)', 'cache.lookup(key, label())')),
    );

    expect(holeSummary(finding)).toEqual([
      { kind: 'value', deferred: false, values: ['LABEL', 'call'] },
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

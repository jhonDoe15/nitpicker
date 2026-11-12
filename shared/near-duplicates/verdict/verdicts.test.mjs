import { describe, expect, it } from 'vitest';
import { alignTrees } from '../align/align.mjs';
import { prepareUnit } from '../engine.mjs';
import { javascriptUnits } from '../test-support/javascript.mjs';
import { proveSource, verdictOf } from '../test-support/prove.mjs';
import { wholeVerdict } from './whole.mjs';

const BODY = `
  const entry = cache.lookup(key, LABEL);
  const stamp = clock.now(key, entry.version);
  if (entry === undefined) { throw new MissingEntry(key, LABEL); }
  audit.record(entry, stamp, LABEL);
  return entry.value;`;

function copies(first, second) {
  return `function first(key) {${first}\n}\nfunction second(key) {${second}\n}`;
}

describe('verdicts for whole functions', () => {
  it('calls copies that differ only in renamed locals the same', () => {
    expect(verdictOf(copies(BODY, BODY.replaceAll('stamp', 'time')))).toBe('same');
  });

  it('calls copies with up to four differing values parameterizable', () => {
    const second = BODY.replace('cache', 'store')
      .replace('clock', 'timer')
      .replace('audit', 'journal')
      .replace('entry.value', 'entry.data');

    expect(verdictOf(copies(BODY, second))).toBe('parameterizable');
  });

  it('declines copies with five differing values', () => {
    const second = BODY.replace('cache', 'store')
      .replace('clock', 'timer')
      .replace('audit', 'journal')
      .replace('entry.value', 'entry.data')
      .replace('entry.version', 'entry.revision');

    expect(verdictOf(copies(BODY, second))).toBeUndefined();
  });

  it('declines copies with a statement in only one of them', () => {
    const second = BODY.replace('audit.record', 'metrics.increment(key);\n  audit.record');

    expect(verdictOf(copies(BODY, second))).toBeUndefined();
  });

  it('declines a hole that holds control flow outside a lambda', () => {
    const first = `
  const entry = cache.lookup(key, LABEL);
  const stamp = clock.now(key, entry.version);
  audit.record(entry, stamp, marker);
  const size = measure(entry, stamp, key);
  journal.write(size, entry.name, stamp, entry.owner);
  metrics.observe(size, entry.kind, LABEL);
  return entry.value;`;
    const source = copies(first, first.replace('marker', 'fallback'));
    const exit = { kind: 'return', children: [{ kind: 'none', children: [] }] };
    const elvis = (node) =>
      node.kind === 'name' && node.value === 'marker'
        ? { kind: 'expression', value: 'elvis', children: [node, exit] }
        : { ...node, children: node.children.map(elvis) };
    const [left, right] = javascriptUnits(source).map((unit) => prepareUnit(unit));
    const exiting = prepareUnit({ ...left.unit, tree: elvis(left.unit.tree) });
    const judge = (one, other) =>
      wholeVerdict([one.tree, other.tree], alignTrees(one.tree, other.tree).state);

    expect(judge(left, right)).toEqual({ verdict: 'parameterizable' });
    expect(judge(exiting, right)).toEqual({ reason: 'control-flow' });
  });

  it('accepts a hole whose return belongs to a lambda inside it', () => {
    const first = `
  const entry = cache.lookup(key, LABEL);
  const stamp = clock.now(key, entry.version);
  run(() => { return audit.record(entry, stamp); }, LABEL);
  const size = measure(entry, stamp, key);
  journal.write(size, entry.name, stamp, entry.owner);
  metrics.observe(size, entry.kind, LABEL);
  return entry.value;`;

    expect(
      verdictOf(
        copies(
          first,
          first.replace('() => { return audit.record(entry, stamp); }', 'audit.cancel'),
        ),
      ),
    ).toBe('parameterizable');
  });

  it('declines functions below the shared node floor', () => {
    expect(
      verdictOf(copies('return cache.lookup(key);', 'return cache.lookup(key);')),
    ).toBeUndefined();
  });

  it('declines copies where the differing parts outweigh the shared ones', () => {
    const first = `
  const entry = cache.lookup(key, LABEL);
  audit.record(entry, normalize(trim(entry.name), LABEL, entry.size + 1, entry.flags), LABEL);
  return entry.value;`;
    const second = first.replace(
      'normalize(trim(entry.name), LABEL, entry.size + 1, entry.flags)',
      '[entry.name, entry.owner, entry.size, entry.flags, entry.version]',
    );

    expect(proveSource(copies(first, second))).toBeUndefined();
  });
});

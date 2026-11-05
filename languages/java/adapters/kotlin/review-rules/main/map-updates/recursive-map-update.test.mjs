import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { routeOf, run } from '../../test-support/facts.mjs';
import { RECURSIVE_MAP_UPDATE_RULE, recursiveMapUpdateFindings } from './recursive-map-update.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures');
const SOURCE = path.join(
  FIXTURES,
  'kotlin-map-update-project/src/main/kotlin/demo/orders/InFlight.kt',
);
const { files } = JSON.parse(
  readFileSync(path.join(FIXTURES, 'kotlin-map-update-facts.json'), 'utf8'),
);
const lines = readFileSync(SOURCE, 'utf8').split('\n');

function lineOf(fragment) {
  return lines.findIndex((text) => text.includes(fragment)) + 1;
}

function located(findings) {
  return findings.map(({ symbol, location }) => `${symbol} ${String(location.line)}`);
}

describe('recursive map updates in Kotlin', () => {
  const findings = run(recursiveMapUpdateFindings, files);

  it('reports a change of the same map inside a compute, merge or concurrent getOrPut function', () => {
    expect(located(findings)).toEqual([
      `nested.inProgress ${String(lineOf('.whenComplete { _, _ -> inProgress.remove(k) }'))}`,
      `direct.counts ${String(lineOf('counts.put("other", 1)'))}`,
      `indexed.counts ${String(lineOf('counts["other"] = 1'))}`,
      `views.counts ${String(lineOf('this.counts.keys.remove("stale")'))}`,
      `minus.counts ${String(lineOf('counts -= "stale"'))}`,
      `getOrPutConcurrent.inProgress ${String(lineOf('{ load(key) }.whenComplete { _, _ -> inProgress.remove(key) }'))}`,
      `reference.inProgress ${String(lineOf('::startAndForget'))}`,
      `helper.inProgress ${String(lineOf('{ startAndForget(it) }'))}`,
      `local.cache ${String(lineOf('cache.remove(k)'))}`,
    ]);
    expect(new Set(findings.map(({ rule }) => rule))).toEqual(new Set([RECURSIVE_MAP_UPDATE_RULE]));
  });

  it.each([
    ['the cleanup attached after computeIfAbsent returns', 'inProgress.remove(key, started)'],
    ['getOrPut on a map that is not concurrent', 'seen.remove("old")'],
    ['a change of another map', 'counts.remove(it) ?: 0'],
    ['reads of the same map', 'counts.getOrDefault("base", 0)'],
    ['a helper that changes a property a local shadows', '{ bump(it) }'],
    ['a change in the key expression', 'counts.remove(key).toString()'],
  ])('spares %s', (_, fragment) => {
    const line = lineOf(fragment);

    expect(line).toBeGreaterThan(0);
    expect(findings.map(({ location }) => location.line)).not.toContain(line);
  });

  it('names the map, the call and the allowed form, with the Java rule id and exception route', () => {
    const [first] = findings;

    expect(first.tool).toBe('pmd');
    expect(first.message).toContain(
      'Change `inProgress` after `inProgress.computeIfAbsent` returns, not inside the function passed to it',
    );
    expect(first.message).toContain(
      '`inProgress.computeIfAbsent(key) { start(it) }.whenComplete { r, _ -> inProgress.remove(key, r) }`',
    );
    expect(first.message).toContain('IllegalStateException (Recursive update)');
    expect(routeOf(first.message)).toBe(
      `If this is intended, add {"rule":"pmd/${RECURSIVE_MAP_UPDATE_RULE}","paths":["src/main/kotlin/demo/orders/InFlight.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
    );
  });

  it('explains that getOrPut stores the value after its function returns', () => {
    const getOrPut = findings.find(({ symbol }) => symbol === 'getOrPutConcurrent.inProgress');

    expect(getOrPut.message).toContain(
      '`getOrPut` stores the value only after the function returns',
    );
  });

  it('leaves test sources alone', () => {
    expect(
      run(
        recursiveMapUpdateFindings,
        files.map((file) => ({ ...file, test: true })),
      ),
    ).toEqual([]);
  });
});

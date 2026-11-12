import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { pitStatuses } from '../../java-e2e/test-support/pit/pit-statuses.mjs';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from '../test-support/kotlin-e2e-project.mjs';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/kotlin-multi-project');
const BRIDGE = 'lib/src/main/java/demo/lib/Bridge.java';
const roots = [];

function snapshot(change = (text) => text) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-pit-history-'));
  roots.push(root);
  const project = path.join(root, 'project');
  cpSync(fixture, project, { recursive: true });
  const bridge = path.join(project, BRIDGE);
  writeFileSync(bridge, change(readFileSync(bridge, 'utf8')));
  return { project, reports: path.join(root, 'reports') };
}

function collect({ project, reports }, policy) {
  const findings = collectJavaFindings(project, {
    gradle,
    policy: { ...kotlinPolicy, ...policy },
    reportDirectory: reports,
  }).filter(({ tool }) => tool === 'pit');
  const xml = readFileSync(path.join(reports, 'module-lib/pit/mutations.xml'), 'utf8');
  return {
    findings: findings.map((finding) => JSON.stringify(finding)).sort(),
    mutants: pitStatuses(xml),
  };
}

describe.skipIf(!kotlinE2eEnabled)('PIT history between Kotlin base and head', () => {
  let base;

  beforeAll(() => {
    base = snapshot();
    collect(base, { snapshot: 'base' });
  }, 180_000);

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reruns only the changed class on head, with the findings of a full run', () => {
    const toHead = (text) => text.replace('return 2;', 'return 3;');
    const recorded = path.join(base.project, 'lib/build/nitpicker-pit-history/test.history');

    expect(existsSync(recorded)).toBe(true);
    const reused = collect(snapshot(toHead), { snapshot: 'head', baselineRoot: base.project });
    const full = collect(snapshot(toHead), { snapshot: 'head' });

    expect(reused.findings).toEqual(full.findings);
    expect(reused.mutants.map(({ key, status }) => [key, status])).toEqual(
      full.mutants.map(({ key, status }) => [key, status]),
    );
    const counter = reused.mutants.filter(({ className }) => className === 'demo.lib.Counter');
    expect(counter.filter(({ status }) => status === 'KILLED').map(({ ran }) => ran)).toEqual(
      counter.filter(({ status }) => status === 'KILLED').map(() => 0),
    );
    expect(counter.some(({ status }) => status === 'KILLED')).toBe(true);
  }, 180_000);
});

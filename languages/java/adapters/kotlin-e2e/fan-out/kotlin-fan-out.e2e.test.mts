import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withKotlinRuleMessage } from './test-support/kotlin-fan-out-views.mts';
import {
  diffOf,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from '../__tests__/kotlin-e2e-project.mts';
import type { DiffResult, KotlinProject } from '../__tests__/kotlin-e2e-project.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import {
  commitFanOutProject,
  FIXTURES,
  recordedFindingsOf,
} from './__tests__/kotlin-fan-out-project.mts';

const FIXTURE = path.join(FIXTURES, 'kotlin-fan-out-project');
const SHOP = 'src/main/kotlin/shop';
const BASE_FILES = new Set([
  'build.gradle.kts',
  'settings.gradle.kts',
  `${SHOP}/Pages.kt`,
  `${SHOP}/Downloads.kt`,
]);
const UNBOUNDED = `${SHOP}/Unbounded.kt`;
const BOUNDED = `${SHOP}/Bounded.kt`;

function recordedFindings(): Finding[] {
  return recordedFindingsOf('kotlin-fan-out-facts.json', FIXTURE);
}

function lines(findings: readonly Finding[], rule: string): string[] {
  return findings
    .filter((finding) => finding.tool === 'kotlin-source' && finding.rule === rule)
    .map(({ path: file, location, identity }) => `${file}:${String(location?.line)} ${identity}`)
    .sort();
}

function lineOf(file: string, fragment: string): number {
  const text = readFileSync(path.join(FIXTURE, file), 'utf8').split('\n');
  return text.findIndex((line) => line.includes(fragment)) + 1;
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin unbounded fan-out end to end', () => {
  let project: KotlinProject;
  let result: DiffResult;

  beforeAll(() => {
    project = commitFanOutProject({
      prefix: 'nitpicker-kotlin-fan-out-',
      fixture: FIXTURE,
      baseFiles: BASE_FILES,
      branch: 'fan-out',
    });
    result = diffOf(project, 'fan-out', { policy: kotlinPolicy });
  });
  afterAll(() => {
    if (typeof project === 'object') {
      removeProject(project);
    }
  });

  it('reports the recorded fixture findings from the facts of the build', () => {
    expect(result.failed).toBe(true);
    expect(lines(result.newEnforceable, 'UnboundedFanOut')).toEqual(
      lines(recordedFindings(), 'UnboundedFanOut'),
    );
  });

  it('leaves a reported call to the fan-out rule and a bounded concurrent call to neither rule', () => {
    const loops = result.newEnforceable.filter(({ rule }) => rule === 'IoCallInLoop');
    const at = (file: string, fragment: string) =>
      loops.some(
        ({ path: found, location }) => found === file && location?.line === lineOf(file, fragment),
      );

    expect(at(UNBOUNDED, 'urls.map { async { client.send')).toBe(false);
    expect(at(BOUNDED, 'permits.withPermit { client.send')).toBe(false);
  });

  it('names the exception route that lifts the rule', () => {
    const messages = (findings: readonly Finding[]) =>
      findings
        .filter(({ rule }) => rule === 'UnboundedFanOut')
        .toSorted((left, right) => (left.location?.line ?? 0) - (right.location?.line ?? 0))
        .map(({ message }) => message);

    expect(messages(result.newEnforceable)).toEqual(
      messages(recordedFindings().map((finding) => withKotlinRuleMessage(finding))),
    );
  });
});

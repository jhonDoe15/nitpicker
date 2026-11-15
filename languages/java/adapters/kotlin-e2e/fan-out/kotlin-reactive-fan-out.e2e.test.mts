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

const FIXTURE = path.join(FIXTURES, 'kotlin-reactive-fan-out-project');
const RULE = 'UnboundedReactiveFanOut';
const BASE_FILES = new Set([
  'build.gradle.kts',
  'settings.gradle.kts',
  'src/main/kotlin/shop/Feeds.kt',
]);

function recordedFindings(): Finding[] {
  return recordedFindingsOf('kotlin-reactive-fan-out-facts.json', FIXTURE);
}

function reported(findings: readonly Finding[]) {
  return findings
    .filter((finding) => finding.tool === 'kotlin-source' && finding.rule === RULE)
    .toSorted((left, right) => (left.location?.line ?? 0) - (right.location?.line ?? 0))
    .map(({ path: file, location, identity, message }) => ({
      at: `${file}:${String(location?.line)}`,
      identity,
      message,
    }));
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin unbounded reactive fan-out end to end', () => {
  let project: KotlinProject;
  let result: DiffResult;

  beforeAll(() => {
    project = commitFanOutProject({
      prefix: 'nitpicker-kotlin-reactive-fan-out-',
      fixture: FIXTURE,
      baseFiles: BASE_FILES,
      branch: 'reactive',
    });
    result = diffOf(project, 'reactive', { policy: kotlinPolicy });
  });
  afterAll(() => {
    if (typeof project === 'object') {
      removeProject(project);
    }
  });

  it('reports the recorded fixture findings, with the exception route, from the facts of the build', () => {
    expect(result.failed).toBe(true);
    expect(reported(result.newEnforceable)).toEqual(
      reported(recordedFindings().map((finding) => withKotlinRuleMessage(finding))),
    );
  });
});

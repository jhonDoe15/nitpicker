import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { collectJavaFindings } from '../test-support/views/kotlin-e2e-views.mts';
import { type Runs, ranOf } from '../../java-e2e/test-support/views/runs.mts';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from '../__tests__/kotlin-e2e-project.mts';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/kotlin-project');
const CHECK_RUNS_JACOCO = `
apply(plugin = "jacoco")
tasks.named("check") {
    dependsOn("jacocoTestReport")
}
`;
const temporary: string[] = [];

function strictBuild(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-strict-build-'));
  temporary.push(root);
  cpSync(fixture, root, { recursive: true });
  appendFileSync(path.join(root, 'build.gradle.kts'), CHECK_RUNS_JACOCO);
  return root;
}

afterAll(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!kotlinE2eEnabled)(
  'Kotlin preset on a build whose check depends on jacocoTestReport',
  () => {
    const runs: Runs<'quick' | 'full', readonly Finding[]> = {};
    beforeAll(() => {
      runs.quick = collectJavaFindings(strictBuild(), {
        gradle,
        policy: { ...kotlinPolicy, quick: true },
      });
    }, 300_000);
    beforeAll(() => {
      runs.full = collectJavaFindings(strictBuild(), {
        gradle,
        policy: { ...kotlinPolicy, mutationOff: true },
      });
    }, 300_000);

    it.each(['quick', 'full'] as const)('completes with no tool error in a %s run', (run) => {
      expect(
        ranOf(runs, run).filter(({ classification }) => classification === 'tool-error'),
      ).toEqual([]);
      expect(ranOf(runs, run).some(({ tool }) => tool === 'detekt')).toBe(true);
    });

    it('measures coverage in the full run', () => {
      expect(ranOf(runs, 'full').some(({ tool }) => tool === 'jacoco')).toBe(true);
    });
  },
);

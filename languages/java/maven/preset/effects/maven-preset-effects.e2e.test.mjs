import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../../adapters/java-diff.mjs';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import {
  effectsSummary,
  JAVA_EFFECTS,
  JAVA_EFFECTS_FIXTURE,
} from '../../../adapters/effects/test-support/effects-projects.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const POM = path.resolve(import.meta.dirname, '../../fixtures/effects');
const roots = [];

function copyOf(...sources) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-effects-'));
  roots.push(root);
  for (const source of sources) {
    cpSync(source, root, { recursive: true });
  }
  return root;
}

function readReport(root, directory) {
  return JSON.parse(readFileSync(path.join(root, directory, 'nitpicker', 'effects.json'), 'utf8'));
}

describe.skipIf(!enabled)('the effects engine on Maven builds', () => {
  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports what Gradle reports, one finding per line next to PMD', () => {
    const gradleProject = copyOf(JAVA_EFFECTS_FIXTURE);
    const mavenProject = copyOf(JAVA_EFFECTS_FIXTURE, POM);
    for (const name of ['build.gradle', 'settings.gradle']) {
      rmSync(path.join(mavenProject, name));
    }
    const result = spawnSync(
      gradle,
      ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerEffects'],
      { cwd: gradleProject, encoding: 'utf8', timeout: 120_000 },
    );
    const findings = collectJavaFindings(mavenProject, { maven, policy: {} });

    expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr }).toEqual({
      status: 0,
      stderr: '',
    });
    expect(readReport(mavenProject, 'target')).toEqual(readReport(gradleProject, 'build'));
    expect(effectsSummary(readReport(mavenProject, 'target'))).toEqual(JAVA_EFFECTS);
    expect(
      findings
        .filter((finding) => finding.tool === 'effects' && finding.rule === 'IoCallInLoop')
        .map((finding) => finding.location.line),
    ).toEqual([26, 32, 36, 40, 46]);
  }, 180_000);
});

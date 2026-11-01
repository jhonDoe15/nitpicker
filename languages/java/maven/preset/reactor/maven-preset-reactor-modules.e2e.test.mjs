import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../../adapters/java-diff.mjs';
import {
  useMavenPresetProject,
  enabled,
  maven,
  fixtures,
  copyOf,
} from '../../__tests__/maven-preset-project.mjs';
import { pathsOutsideProject } from '../../../adapters/java-e2e/test-support/project-paths.mjs';

describe.skipIf(!enabled)('Java preset on Maven reactor modules', () => {
  useMavenPresetProject();
  it('reads every module of a reactor under the module path, with coupling across modules', () => {
    const project = copyOf(path.join(fixtures, 'multi-module'));
    const findings = collectJavaFindings(project, {
      maven,
      policy: { testSeconds: { unitTestSeconds: -1 } },
    });
    expect(pathsOutsideProject(project, findings)).toEqual([]);
    const metrics = (file) =>
      findings
        .filter((finding) => finding.path === file && finding.metric !== undefined)
        .map(({ tool, metric }) => `${tool} ${metric.name} ${String(metric.value)}`)
        .sort();

    expect(
      findings
        .filter((finding) => ['errorprone', 'pmd'].includes(finding.tool))
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
    ).toEqual([
      'errorprone PrivateConstructorForUtilityClass app/src/main/java/demo/app/Main.java',
      'errorprone SystemOut app/src/main/java/demo/app/Main.java',
    ]);
    expect(metrics('core/src/main/java/demo/core/Adder.java')).toEqual([
      'coupling fanIn 1',
      'coupling fanOut 0',
      'coupling instability 0',
      'coupling totalCoupling 1',
      'jacoco line-coverage 100',
    ]);
    expect([...new Set(findings.map((finding) => finding.path))].sort()).toEqual([
      '.',
      'app',
      'app/src/main/java/demo/app/Main.java',
      'checks/src/test/java/demo/checks/AdderIT.java',
      'core',
      'core/src/main/java/demo/core/Adder.java',
      'core/src/test/java/demo/core/AdderTest.java',
    ]);
    expect(
      findings
        .filter((finding) => finding.tool === 'test-runtime')
        .map(({ rule, path: file, identity }) => `${rule} ${file} ${identity}`)
        .sort(),
    ).toEqual([
      'slow-test core/src/test/java/demo/core/AdderTest.java test:demo.core.AdderTest#adds',
      'test-not-run checks/src/test/java/demo/checks/AdderIT.java AdderIT',
    ]);
    expect(
      existsSync(
        path.join(
          project,
          'core/target/nitpicker/test-results/surefire/TEST-demo.core.AdderTest.xml',
        ),
      ),
    ).toBe(true);
  }, 180_000);
});

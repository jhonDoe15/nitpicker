import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../../adapters/java-diff.mjs';
import {
  DATED,
  enabled,
  maven,
  twinProjects,
  useMavenPresetProject,
} from '../../__tests__/maven-preset-project.mjs';

describe.skipIf(!enabled)('Java preset quick run on a Maven build', () => {
  useMavenPresetProject();
  it('runs the static analysis and the ArchUnit rules without the other tests, coverage or mutation', () => {
    const [, project] = twinProjects();
    writeFileSync(path.join(project, 'src/main/java/demo/Dated.java'), DATED);

    const findings = collectJavaFindings(project, { maven, policy: { quick: true } });

    const tools = new Set(findings.map(({ tool }) => tool));
    expect(tools.has('pmd')).toBe(true);
    expect(tools.has('coupling')).toBe(true);
    expect(
      findings
        .filter(({ tool }) => ['archunit', 'pit', 'jacoco', 'crap', 'test-runtime'].includes(tool))
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
    ).toEqual(['archunit no_classes_use_legacy_date src/main/java/demo/Dated.java']);
    expect(
      readdirSync(path.join(project, 'target/surefire-reports')).filter((name) =>
        name.endsWith('.xml'),
      ),
    ).toEqual(['TEST-demo.ArchitectureTest.xml']);
    expect(existsSync(path.join(project, 'target/nitpicker/jacoco.xml'))).toBe(false);
  }, 180_000);
});

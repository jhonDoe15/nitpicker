import { existsSync, writeFileSync } from 'node:fs';
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
  it('compiles and analyzes the sources without running the tests, coverage or mutation', () => {
    const [, project] = twinProjects();
    writeFileSync(path.join(project, 'src/main/java/demo/Dated.java'), DATED);

    const findings = collectJavaFindings(project, { maven, policy: { quick: true } });

    const tools = new Set(findings.map(({ tool }) => tool));
    expect(tools.has('pmd')).toBe(true);
    expect(tools.has('coupling')).toBe(true);
    for (const tool of ['jacoco', 'crap', 'pit', 'archunit']) {
      expect(tools.has(tool)).toBe(false);
    }
    expect(existsSync(path.join(project, 'target/surefire-reports'))).toBe(false);
    expect(existsSync(path.join(project, 'target/nitpicker/jacoco.xml'))).toBe(false);
  }, 180_000);
});

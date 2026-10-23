import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  gradle,
  initializeProject,
  kotlinE2eEnabled,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset quick run end to end', () => {
  let project;
  let tools;
  beforeAll(() => {
    project = initializeProject();
    const findings = collectJavaFindings(project.root, {
      gradle,
      policy: { preset: 'kotlin', quick: true },
    });
    tools = new Set(findings.map(({ tool }) => tool));
  }, 180_000);
  afterAll(() => {
    removeProject(project);
  });
  it('keeps the Kotlin static analysis and skips the tests, coverage and mutation', () => {
    expect(tools.has('detekt')).toBe(true);
    for (const tool of ['jacoco', 'crap', 'pit', 'archunit']) {
      expect(tools.has(tool)).toBe(false);
    }
    expect(existsSync(path.join(project.root, 'build/test-results'))).toBe(false);
    expect(existsSync(path.join(project.root, 'build/jacoco'))).toBe(false);
  });
});

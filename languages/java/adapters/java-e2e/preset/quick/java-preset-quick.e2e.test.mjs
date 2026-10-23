import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../../java-diff.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.resolve(import.meta.dirname, '../../../fixtures/gradle-project');

describe.skipIf(!enabled)('Java preset quick run on a Gradle build', () => {
  let root;
  let tools;
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-quick-e2e-'));
    cpSync(fixture, root, { recursive: true });
    const findings = collectJavaFindings(root, { gradle, policy: { quick: true } });
    tools = new Set(findings.map(({ tool }) => tool));
  }, 300_000);
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  it('compiles and analyzes the sources without running the tests, coverage or mutation', () => {
    expect(tools.has('coupling')).toBe(true);
    for (const tool of ['jacoco', 'crap', 'pit', 'archunit']) {
      expect(tools.has(tool)).toBe(false);
    }
    expect(existsSync(path.join(root, 'build/test-results'))).toBe(false);
    expect(existsSync(path.join(root, 'build/jacoco'))).toBe(false);
  });
});

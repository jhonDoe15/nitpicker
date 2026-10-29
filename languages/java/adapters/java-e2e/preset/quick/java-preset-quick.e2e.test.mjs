import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../../java-diff.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.resolve(import.meta.dirname, '../../../fixtures/gradle-project');
const LEGACY_DATE = `package demo;

public class Stamp {
    public long millis() {
        return new java.util.Date().getTime();
    }
}
`;

describe.skipIf(!enabled)('Java preset quick run on a Gradle build', () => {
  let root;
  let findings;
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-quick-e2e-'));
    cpSync(fixture, root, { recursive: true });
    writeFileSync(path.join(root, 'src/main/java/demo/Stamp.java'), LEGACY_DATE);
    findings = collectJavaFindings(root, { gradle, policy: { quick: true } });
  }, 300_000);
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  it('runs the static analysis and the ArchUnit rules without the tests, coverage or mutation', () => {
    const tools = new Set(findings.map(({ tool }) => tool));

    expect(tools.has('coupling')).toBe(true);
    expect(
      findings
        .filter(({ tool }) => ['archunit', 'pit', 'jacoco', 'crap', 'test-runtime'].includes(tool))
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
    ).toEqual(['archunit no_classes_use_legacy_date src/main/java/demo/Stamp.java']);
    expect(existsSync(path.join(root, 'build/test-results/test'))).toBe(false);
    expect(existsSync(path.join(root, 'build/jacoco'))).toBe(false);
  });
});

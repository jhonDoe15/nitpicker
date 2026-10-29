import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from '../test-support/kotlin-e2e-project.mjs';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/test-frameworks/kotest');

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset quick run end to end', () => {
  let root;
  let findings;
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-quick-e2e-'));
    cpSync(fixture, root, { recursive: true });
    findings = collectJavaFindings(root, { gradle, policy: { ...kotlinPolicy, quick: true } });
  }, 180_000);
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  it('keeps the static analysis and the ArchUnit rules and runs no test, coverage or mutation', () => {
    const tools = new Set(findings.map(({ tool }) => tool));

    expect(tools.has('coupling')).toBe(true);
    expect(
      findings
        .filter(({ tool }) => ['archunit', 'pit', 'jacoco', 'crap', 'test-runtime'].includes(tool))
        .map(({ tool, rule, path: file, identity }) => `${tool} ${rule} ${file} ${identity}`),
    ).toEqual(['archunit servicesOnly src/main/kotlin/demo/Calc.kt demo.Calc']);
    expect(existsSync(path.join(root, 'build/test-results/test'))).toBe(false);
    expect(existsSync(path.join(root, 'build/jacoco'))).toBe(false);
  });
});

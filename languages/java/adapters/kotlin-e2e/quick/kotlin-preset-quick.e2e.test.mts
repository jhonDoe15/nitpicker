import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { collectJavaFindings } from '../test-support/views/kotlin-e2e-views.mts';
import { assigned } from '../test-support/views/assigned.mts';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from '../__tests__/kotlin-e2e-project.mts';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/test-frameworks/kotest');

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset quick run end to end', () => {
  let root: string | undefined;
  let findings: Finding[] | undefined;
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-quick-e2e-'));
    cpSync(fixture, root, { recursive: true });
    findings = collectJavaFindings(root, { gradle, policy: { ...kotlinPolicy, quick: true } });
  }, 180_000);
  afterAll(() => {
    rmSync(assigned(root, 'root'), { recursive: true, force: true });
  });
  it('keeps the static analysis and the ArchUnit rules and runs no test, coverage or mutation', () => {
    const found = assigned(findings, 'findings');
    const projectRoot = assigned(root, 'root');
    const tools = new Set(found.map(({ tool }) => tool));

    expect(tools.has('coupling')).toBe(true);
    expect(tools.has('test-runtime')).toBe(true);
    expect(
      found
        .filter(({ tool }) => ['archunit', 'pit', 'jacoco', 'crap'].includes(tool))
        .map(({ tool, rule, path: file, identity }) => `${tool} ${rule} ${file} ${identity}`),
    ).toEqual(['archunit servicesOnly src/main/kotlin/demo/Calc.kt demo.Calc']);
    expect(existsSync(path.join(projectRoot, 'build/test-results/test'))).toBe(false);
    expect(existsSync(path.join(projectRoot, 'build/jacoco'))).toBe(false);
  });
});

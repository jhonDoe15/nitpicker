import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  diffOf,
  git,
  gradle,
  kotlinE2eEnabled,
  kotlinPolicy,
} from '../__tests__/kotlin-e2e-project.mts';
import { useKotlinCoverageProject } from '../__tests__/kotlin-coverage-project.mts';
import {
  legacyInitChecks,
  generatedBranchChecks,
} from './__tests__/kotlin-coverage-expectations.mts';
import { collectJavaFindings } from '../test-support/views/kotlin-e2e-views.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset coverage and structure end to end', () => {
  const fixture = useKotlinCoverageProject();
  it('does not ask for coverage of branches the Kotlin compiler generated', () => {
    git(fixture.project, 'checkout', '-q', 'generated-branches');
    const reportDirectory = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-'));
    const options = { gradle, policy: kotlinPolicy, reportDirectory };
    const findings = collectJavaFindings(fixture.project.root, options);
    const report = readFileSync(path.join(reportDirectory, 'root/jacoco.xml'), 'utf8');
    rmSync(reportDirectory, { recursive: true, force: true });
    const comparison = generatedBranchChecks(report, findings);

    expect(comparison.actual).toEqual(comparison.expected);
  });
  it('keeps a legacy init block baselined when init blocks are inserted around it, in a class, a companion object and an object expression', () => {
    const result = diffOf(fixture.project, 'init-inserted', { base: 'init-base' });

    const comparison = legacyInitChecks(result);

    expect(comparison.actual).toEqual(comparison.expected);
  });
});

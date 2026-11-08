import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  diffOf,
  git,
  gradle,
  kotlinE2eEnabled,
  kotlinPolicy,
  rulesOf,
} from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinCoverageProject } from '../__tests__/kotlin-coverage-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset coverage and structure end to end', () => {
  const fixture = useKotlinCoverageProject();
  it('does not ask for coverage of branches the Kotlin compiler generated', () => {
    git(fixture.project, 'checkout', '-q', 'generated-branches');
    const reportDirectory = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-'));
    const options = { gradle, policy: kotlinPolicy, reportDirectory };
    const findings = collectJavaFindings(fixture.project.root, options);
    const report = readFileSync(path.join(reportDirectory, 'root/jacoco.xml'), 'utf8');
    rmSync(reportDirectory, { recursive: true, force: true });
    const generatedFile = report.slice(report.indexOf('<sourcefile name="Generated.kt">'));
    const missedLines = [...generatedFile.matchAll(/<line nr="(\d+)"[^>]* mb="([1-9]\d*)"/g)].map(
      ([, line]) => Number(line),
    );

    expect(missedLines).toEqual([33, 34, 35]);
    expect(findings.filter(({ rule }) => rule === 'changed-branch-coverage')).toEqual([]);
  });
  it('keeps a legacy init block baselined when init blocks are inserted around it, in a class, a companion object and an object expression', () => {
    const result = diffOf(fixture.project, 'init-inserted', { base: 'init-base' });

    const legacy = [
      'crap crap-score-limit Box.<anonymous>.<init>',
      'crap crap-score-limit Box.<init>',
      'crap crap-score-limit Box.Companion.<init>',
      'structure function-control-nesting-limit Box.<anonymous>.<init>',
      'structure function-control-nesting-limit Box.<init>',
      'structure function-control-nesting-limit Box.Companion.<init>',
    ];

    expect(rulesOf(result.newEnforceable, 'structure', 'crap')).toEqual([]);
    expect(rulesOf(result.unchangedFindings, 'structure', 'crap')).toEqual(legacy);
  });
});

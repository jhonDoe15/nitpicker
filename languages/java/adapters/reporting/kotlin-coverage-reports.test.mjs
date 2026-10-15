import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJavaFindings } from './java-reports.mjs';
import {
  mutation,
  projectWithKotlinReports,
  removeTemporaryProjects,
} from './test-support/kotlin-report-project.mjs';

afterEach(removeTemporaryProjects);

describe('readJavaFindings with the kotlin preset: coverage and mutation', () => {
  const bad = 'src/main/kotlin/demo/Bad.kt';
  it('reads JaCoCo coverage of Kotlin and Java files and gates the branches of both', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports(), { preset: 'kotlin' });
    const jacoco = findings.filter((finding) => finding.tool === 'jacoco');

    expect(jacoco.map(({ rule, path: file }) => [rule, file])).toEqual([
      ['line-coverage', 'src/main/java/demo/Mixed.kt'],
      ['line-coverage', 'src/main/java/demo/Legacy.java'],
      ['line-coverage', bad],
      ['uncovered-method', bad],
      ['changed-branch-coverage', 'src/main/java/demo/Mixed.kt'],
      ['changed-branch-coverage', bad],
      ['changed-branch-coverage', 'src/main/java/demo/Legacy.java'],
    ]);
  });
  it('ignores the generated outcomes of a Kotlin line that only calls a suspension function', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports(), { preset: 'kotlin' });
    const branchLines = findings
      .filter((finding) => finding.rule === 'changed-branch-coverage' && finding.path === bad)
      .map((finding) => finding.location.line);

    expect(branchLines).toEqual([8]);
  });
  it('finds a Kotlin file whose directory does not match its package', () => {
    const root = projectWithKotlinReports();
    const reports = path.join(root, 'build/nitpicker');
    writeFileSync(
      path.join(root, 'src/main/kotlin/Flat.kt'),
      'package demo.flat\n\nfun pick(x: Int) = if (x > 0) 1 else 2\n',
    );
    writeFileSync(
      path.join(reports, 'jacoco.xml'),
      '<report name="demo"><package name="demo/flat"><sourcefile name="Flat.kt"><line nr="3" mi="1" ci="0" mb="2" cb="0"/></sourcefile></package></report>',
    );
    const flatMutation = mutation({
      status: 'SURVIVED',
      className: 'demo.flat.FlatKt',
      sourceFile: 'Flat.kt',
      line: 3,
    });
    writeFileSync(
      path.join(reports, 'pit/mutations.xml'),
      `<mutations>${flatMutation}</mutations>`,
    );

    const { findings } = readJavaFindings(root, { preset: 'kotlin' });

    expect(
      findings
        .filter((finding) => ['changed-branch-coverage', 'mutant-survived'].includes(finding.rule))
        .map(({ rule, path: file }) => [rule, file]),
    ).toEqual([
      ['mutant-survived', 'src/main/kotlin/Flat.kt'],
      ['changed-branch-coverage', 'src/main/kotlin/Flat.kt'],
    ]);
  });
  it('does not take a Kotlin file of another package for the one JaCoCo names', () => {
    const root = projectWithKotlinReports();
    writeFileSync(
      path.join(root, 'build/nitpicker/jacoco.xml'),
      '<report name="demo"><package name="demo/other"><sourcefile name="Bad.kt"><line nr="8" mi="1" ci="0" mb="2" cb="0"/></sourcefile></package></report>',
    );

    const { findings } = readJavaFindings(root, { preset: 'kotlin' });

    expect(
      findings
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ rule, path: file, classification }) => [rule, file, classification]),
    ).toEqual([['branch-source-not-found', 'demo/other/Bad.kt', 'descriptive']]);
  });
  it('reports mutants of Kotlin classes without failing and keeps Java mutants enforceable', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports(), { preset: 'kotlin' });
    const mutants = findings
      .filter((finding) => finding.rule.startsWith('mutant-'))
      .map(({ rule, path: file, classification }) => [rule, file, classification]);

    expect(mutants).toEqual([
      ['mutant-survived', bad, 'descriptive'],
      ['mutant-nocoverage', bad, 'descriptive'],
      ['mutant-survived', 'src/main/java/demo/Legacy.java', 'enforceable'],
    ]);
  });
  it('leaves Kotlin reports and Kotlin files alone with the java preset', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports());

    expect(findings.filter((finding) => ['detekt', 'ktlint'].includes(finding.tool))).toEqual([]);
    expect(findings.some((finding) => finding.path.startsWith('src/main/kotlin/'))).toBe(false);
  });
});

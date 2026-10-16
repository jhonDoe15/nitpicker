import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { kotlinConfig, useGradleFixtures } from './test-support/java-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';

const { kotlinRepository, run } = useGradleFixtures(nitpickerCli);

describe('nitpicker with "preset": "kotlin"', () => {
  const branchReport = (...lines) =>
    `<report name="demo"><package name="demo"><sourcefile name="K.kt">${lines
      .map(
        ([nr, missed, covered]) =>
          `<line nr="${nr}" mi="0" ci="1" mb="${missed}" cb="${covered}"/>`,
      )
      .join('')}</sourcefile></package></report>`;
  const pitReport = (className, sourceFile) =>
    `<mutations><mutation detected='false' status='SURVIVED'><sourceFile>${sourceFile}</sourceFile><mutatedClass>${className}</mutatedClass><mutatedMethod>fee</mutatedMethod><methodDescription>(I)I</methodDescription><lineNumber>3</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.MathMutator</mutator><description>Replaced integer multiplication with division</description></mutation></mutations>`;
  const mutantsOf = (result) =>
    result.json('new-findings.json').filter(({ rule }) => rule.startsWith('mutant-'));
  const feeSource = 'package demo\n\nfun fee(weight: Int): Int = weight * 2\n';
  const surchargeSource = `${feeSource}\nfun surcharge(weight: Int): Int = if (weight > 10) 5 else 0\n\nval numbers = sequence {\n    yield(1)\n}\n`;
  it('passes when the change adds no finding and keeps the legacy detekt finding baselined', () => {
    const root = kotlinRepository();
    writeFiles(root, {
      'src/main/java/demo/A.java': 'package demo;\n\n\n\npublic final class A {}\n',
    });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['kotlin']);
  });
  it('fails on a new detekt finding and reports it in text and SARIF', () => {
    const root = kotlinRepository();
    writeFiles(root, { 'detekt.txt': 'Legacy magic number\nAdded magic number\n' });
    commit(root, 'add a detekt finding');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'detekt',
        rule: 'detekt.style.MagicNumber',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'fp:nitpicker/subject=Added magic number',
        message: 'Added magic number',
        classification: 'enforceable',
        location: { line: 4 },
      },
    ]);
    expect(
      result
        .json('report.sarif')
        .runs.flatMap((sarifRun) => sarifRun.results.map(({ ruleId }) => ruleId)),
    ).toEqual(['detekt/detekt.style.MagicNumber']);
  });
  it('fails on a newly violated ktlint rule of a project that uses ktlint, naming rule and exception', () => {
    const root = kotlinRepository({ '.editorconfig': 'ktlint_code_style = ktlint_official\n' });
    writeFiles(root, { 'ktlint.txt': 'standard:no-wildcard-imports|Wildcard import\n' });
    commit(root, 'add a wildcard import');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'ktlint',
        rule: 'ktlint.standard:no-wildcard-imports',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'fp:nitpicker/subject=Wildcard import',
        location: { line: 3 },
        message:
          'Wildcard import. Lift this rule with ktlint_standard_no-wildcard-imports = disabled in .editorconfig, which nitpicker reads only when ktlint lists "project" (see the start of the run). Not your formatter: set kotlin.formatter',
        classification: 'enforceable',
      },
    ]);
  });
  it('fails on a newly unformatted file with the configured ktfmt and names kotlin.formatter', () => {
    const root = kotlinRepository({ 'nitpicker.config.json': kotlinConfig('ktfmt') });
    writeFiles(root, { 'kotlin-format.txt': 'src/main/kotlin/demo/K.kt\n' });
    commit(root, 'misformat a file');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'ktfmt',
        rule: 'format',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'format',
        message:
          'File is not formatted with ktfmt. Format it with the "Format with ktfmt" command printed at the start of the run. Not your formatter: set kotlin.formatter',
        classification: 'enforceable',
      },
    ]);
  });
  it('fails on a changed Kotlin branch no test takes and ignores generated ones', () => {
    const root = kotlinRepository({
      'src/main/kotlin/demo/K.kt': feeSource,
      'jacoco.xml': branchReport(),
    });
    writeFiles(root, {
      'src/main/kotlin/demo/K.kt': surchargeSource,
      'jacoco.xml': branchReport([5, 1, 1], [7, 1, 1], [8, 1, 1]),
    });
    commit(root, 'add an untested branch');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'jacoco',
        rule: 'changed-branch-coverage',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'branch-source:2523a9a20c75ac9a',
        message: 'Branch coverage is 50.00%; minimum is 95%',
        classification: 'enforceable',
        location: { line: 5 },
      },
    ]);
  });
  it('keeps an uncovered Kotlin branch baselined while its line is unchanged', () => {
    const root = kotlinRepository({
      'src/main/kotlin/demo/K.kt': surchargeSource,
      'jacoco.xml': branchReport([5, 1, 1]),
    });
    writeFiles(root, { 'src/main/kotlin/demo/K.kt': `// moved\n${surchargeSource}` });
    writeFiles(root, { 'jacoco.xml': branchReport([6, 1, 1]) });
    commit(root, 'insert a line above it');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
  });
  it('reports a surviving Kotlin mutant without failing', () => {
    const root = kotlinRepository({ 'src/main/kotlin/demo/K.kt': feeSource });
    writeFiles(root, { 'mutations.xml': pitReport('demo.KKt', 'K.kt') });
    commit(root, 'a mutant survives');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(mutantsOf(result)).toEqual([
      {
        tool: 'pit',
        rule: 'mutant-survived',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'demo.KKt|fee(I)I|MathMutator|Replaced integer multiplication with division#1',
        message:
          'Survived MathMutator: Replaced integer multiplication with division: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'descriptive',
        symbol: 'demo.KKt#fee(I)I',
        location: { line: 3 },
      },
    ]);
  });
  it('still fails a surviving mutant in a Java class of a Kotlin project', () => {
    const root = kotlinRepository();
    writeFiles(root, { 'mutations.xml': pitReport('demo.A', 'A.java') });
    commit(root, 'a Java mutant survives');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(mutantsOf(result)).toEqual([
      {
        tool: 'pit',
        rule: 'mutant-survived',
        path: 'src/main/java/demo/A.java',
        identity: 'demo.A|fee(I)I|MathMutator|Replaced integer multiplication with division#1',
        message:
          'Survived MathMutator: Replaced integer multiplication with division: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'enforceable',
        symbol: 'demo.A#fee(I)I',
        location: { line: 3 },
      },
    ]);
  });
});

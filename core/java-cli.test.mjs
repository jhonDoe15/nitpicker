import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeJavaSnapshot } from '../languages/java/adapters/java-runner.mjs';
import { createJavaAnalyzer } from '../languages/java/adapters/java-analyzer.mjs';
import { JAVA_TOOLS } from '../languages/java/adapters/gradle-presets.mjs';
import { KOTLIN_EXCEPTION_RULES } from '../languages/java/adapters/kotlin-options.mjs';
import {
  commit,
  fakeGradle,
  git,
  gradleRepository,
  run,
  runCli,
  temporaryRoot,
  useGradleCli,
  write,
} from './diff/fixtures/gradle-cli.mjs';

// The Java and Kotlin presets through the CLI with a fake `gradle`, so they run without Java. The
// real Gradle runs are covered by languages/java/adapters/java-preset.e2e.test.mjs
// (NITPICKER_JAVA_E2E=1) and kotlin-preset.e2e.test.mjs (NITPICKER_KOTLIN_E2E=1).

useGradleCli();

describe('nitpicker with "preset": "java"', () => {
  it('passes when the change adds no finding and keeps the legacy one baselined', () => {
    const root = gradleRepository();
    write(root, { 'src/main/java/demo/A.java': 'package demo;\n\n\n\npublic final class A {}\n' });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['java']);
  });

  it('fails on a new enforceable finding and reports it in text, JSON, SARIF and JUnit', () => {
    const root = gradleRepository();
    write(root, { 'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n' });
    commit(root, 'add violation');

    const result = run(root, [], { subprocess: true });

    expect({
      exitCode: result.exitCode,
      output: result.output.out + result.output.err,
    }).toMatchObject({
      exitCode: 1,
    });
    expect(result.output.out).toContain('A.java');
    expect(result.json('new-findings.json')).toEqual([
      expect.objectContaining({
        tool: 'pmd',
        rule: 'UnusedPrivateField',
        path: 'src/main/java/demo/A.java',
        classification: 'enforceable',
      }),
    ]);
    expect(readFileSync(path.join(result.reports, 'report.sarif'), 'utf8')).toContain(
      'UnusedPrivateField',
    );
    expect(readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8')).toContain(
      'UnusedPrivateField',
    );
  });

  it('honours exclude from nitpicker.config.json', () => {
    const root = gradleRepository();
    write(root, {
      'nitpicker.config.json': '{ "preset": "java", "exclude": ["src/main/java/demo/**"] }\n',
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
    });
    commit(root, 'add violation in an excluded path');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    expect(result.json('new-findings.json')).toEqual([]);
  });

  describe('legacy inventory', () => {
    const site = (name, count) => ({
      file: 'src/main/java/demo/A.java',
      rule: 'UnusedPrivateField',
      source: `fp:nitpicker/subject=Avoid unused field: ${name}`,
      count,
    });
    const inventory = (...sites) => `${JSON.stringify({ sites })}\n`;

    it('baselines a site the inventory allows and still fails an unlisted one', () => {
      const root = gradleRepository({ 'nitpicker.legacy.json': inventory(site('added', 1)) });
      write(root, { 'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n' });
      commit(root, 'add a baselined violation');
      expect(run(root).exitCode).toBe(0);

      write(root, {
        'violations.txt':
          'Avoid unused field: legacy\nAvoid unused field: added\nAvoid unused field: other\n',
      });
      commit(root, 'add an unlisted violation');
      const result = run(root);
      expect({
        exitCode: result.exitCode,
        output: result.output.out + result.output.err,
      }).toMatchObject({
        exitCode: 1,
      });
      expect(result.json('new-findings.json')).toEqual([
        expect.objectContaining({ rule: 'UnusedPrivateField', classification: 'enforceable' }),
      ]);
    });

    it('fails with baseline-expansion when head raises an allowance over base', () => {
      const root = gradleRepository({ 'nitpicker.legacy.json': inventory(site('legacy', 1)) });
      write(root, { 'nitpicker.legacy.json': inventory(site('legacy', 2)) });
      commit(root, 'raise the allowance');

      const result = run(root);

      expect({
        exitCode: result.exitCode,
        output: result.output.out + result.output.err,
      }).toMatchObject({
        exitCode: 1,
      });
      expect(result.json('new-findings.json')).toEqual([
        expect.objectContaining({
          tool: 'java',
          rule: 'baseline-expansion',
          message: 'Legacy allowance increased from 1 to 2 for UnusedPrivateField',
        }),
      ]);
    });

    it('honours a custom inventory path from "legacyInventory"', () => {
      const root = gradleRepository({
        'nitpicker.config.json': '{ "preset": "java", "legacyInventory": "config/legacy.json" }\n',
        'config/legacy.json': inventory(site('added', 1)),
      });
      write(root, { 'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n' });
      commit(root, 'add a baselined violation');

      expect(run(root).exitCode).toBe(0);
    });

    it('treats a new inventory entry on head as an expansion', () => {
      const root = gradleRepository();
      write(root, {
        'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
        'nitpicker.legacy.json': inventory(site('added', 1)),
      });
      commit(root, 'baseline a new violation by editing the inventory');

      const result = run(root);

      expect(result.exitCode).toBe(1);
      expect(result.json('new-findings.json')).toEqual([
        expect.objectContaining({ rule: 'baseline-expansion' }),
      ]);
    });
  });

  it('fails a newly added clone', () => {
    const body = Array.from(
      { length: 12 },
      (_, i) =>
        `    int v${i} = compute(a, b) + ${i} * helper(a);\n    if (v${i} > 10) { total += v${i}; }`,
    ).join('\n');
    const source = (name) =>
      `package demo;\n\npublic final class ${name} {\n  int run(int a, int b) {\n    int total = 0;\n${body}\n    return total;\n  }\n}\n`;
    const root = gradleRepository({ 'src/main/java/demo/First.java': source('First') });
    write(root, { 'src/main/java/demo/Second.java': source('Second') });
    commit(root, 'copy the class');

    const result = run(root);

    expect({
      exitCode: result.exitCode,
      output: result.output.out + result.output.err,
    }).toMatchObject({
      exitCode: 1,
    });
    const clones = result
      .json('new-findings.json')
      .filter((finding) => finding.rule === 'duplicate-clone');
    expect(clones).toEqual([
      expect.objectContaining({
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/main/java/demo/First.java',
        classification: 'enforceable',
      }),
    ]);
  });

  it('reports a Gradle failure on head as a tool error with exit 2 instead of throwing', () => {
    const root = gradleRepository();
    write(root, { GRADLE_FAIL: 'Execution failed for task :compileJava\n' });
    // The change also deletes a file, so the changed-lines reader sees a deleted path.
    git(root, ['rm', '-q', 'violations.txt']);
    commit(root, 'break the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.output.err).toBe('');
    expect(result.json('summary.json').overallStatus).toBe('tool-error');
    expect(result.json('tool-errors.json')).toEqual([
      expect.objectContaining({
        tool: 'java',
        snapshot: 'head',
        rule: 'gradle-failure',
        message: expect.stringContaining('Execution failed for task :compileJava'),
      }),
    ]);
  });

  it('reports a missing gradle binary as a tool error', () => {
    process.env.NITPICKER_GRADLE = path.join(temporaryRoot('nitpicker-java-none-'), 'no-gradle');
    const root = gradleRepository();

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')[0]).toMatchObject({ rule: 'gradle-failure' });
  });

  it('gates a snapshot with --all', () => {
    const root = gradleRepository();
    const reports = path.join(temporaryRoot('nitpicker-java-snapshot-'), 'reports');
    const out = { text: '' };

    const exitCode = runCli({
      arguments_: ['--all', '--output', reports],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: { write: (value) => (out.text += value) },
      stderr: { write: () => undefined },
    });

    expect(exitCode).toBe(1);
    expect(out.text).toContain('A.java');
  });
});

describe('nitpicker with "preset": "kotlin"', () => {
  const kotlinConfig = (formatter) =>
    `${JSON.stringify({ preset: 'kotlin', ...(formatter && { kotlin: { formatter } }) })}\n`;
  const kotlinRepository = (files = {}) =>
    gradleRepository({
      'nitpicker.config.json': kotlinConfig(),
      'detekt.txt': 'Legacy magic number\n',
      ...files,
    });

  it('passes when the change adds no finding and keeps the legacy detekt finding baselined', () => {
    const root = kotlinRepository();
    write(root, { 'src/main/java/demo/A.java': 'package demo;\n\n\n\npublic final class A {}\n' });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['kotlin']);
  });

  it('fails on a new detekt finding and reports it in text and SARIF', () => {
    const root = kotlinRepository();
    write(root, { 'detekt.txt': 'Legacy magic number\nAdded magic number\n' });
    commit(root, 'add a detekt finding');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      expect.objectContaining({
        tool: 'detekt',
        rule: 'detekt.style.MagicNumber',
        path: 'src/main/kotlin/demo/K.kt',
        classification: 'enforceable',
      }),
    ]);
    expect(
      result
        .json('report.sarif')
        .runs.flatMap((sarifRun) => sarifRun.results.map(({ ruleId }) => ruleId)),
    ).toEqual(['detekt/detekt.style.MagicNumber']);
  });

  it('fails on a newly violated ktlint rule of a project that uses ktlint, naming rule and exception', () => {
    const root = kotlinRepository({ '.editorconfig': 'ktlint_code_style = ktlint_official\n' });
    write(root, { 'ktlint.txt': 'standard:no-wildcard-imports|Wildcard import\n' });
    commit(root, 'add a wildcard import');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'ktlint',
        rule: 'ktlint.standard:no-wildcard-imports',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'fp:nitpicker/subject=Wildcard import',
        location: { line: 3 },
        message:
          'Wildcard import. Lift this rule: ktlint_standard_no-wildcard-imports = disabled in .editorconfig. Not your formatter: set kotlin.formatter',
        classification: 'enforceable',
      },
    ]);
  });

  it('fails on a newly unformatted file with the configured ktfmt and names kotlin.formatter', () => {
    const root = kotlinRepository({ 'nitpicker.config.json': kotlinConfig('ktfmt') });
    write(root, { 'kotlin-format.txt': 'src/main/kotlin/demo/K.kt\n' });
    commit(root, 'misformat a file');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'ktfmt',
        rule: 'format',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'format',
        message: 'File is not formatted with ktfmt. Not your formatter: set kotlin.formatter',
        classification: 'enforceable',
      },
    ]);
  });

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

  it('fails on a changed Kotlin branch no test takes and ignores generated ones', () => {
    const root = kotlinRepository({
      'src/main/kotlin/demo/K.kt': feeSource,
      'jacoco.xml': branchReport(),
    });
    write(root, {
      'src/main/kotlin/demo/K.kt': surchargeSource,
      'jacoco.xml': branchReport([5, 1, 1], [7, 1, 1], [8, 1, 1]),
    });
    commit(root, 'add an untested branch');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'jacoco',
        rule: 'changed-branch-coverage',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'branch-source:2523a9a20c75ac9a',
        message:
          'Branch coverage is 50.00%; minimum is 95%. To accept the file, add it to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 5 },
      },
    ]);
  });

  it('names the function of an untested Kotlin branch and accepts it through an exception', () => {
    const metrics = `${JSON.stringify({
      functions: [
        {
          file: 'src/main/kotlin/demo/K.kt',
          name: 'surcharge',
          start: 5,
          end: 5,
          lines: 1,
          statements: 1,
          maxControlNesting: 0,
          parameters: 1,
          complexity: 2,
        },
      ],
      files: [],
    })}\n`;
    const exceptionFor = (functionName) =>
      `${JSON.stringify({
        preset: 'kotlin',
        exceptions: ['changed-branch-coverage', 'crap-coverage-unknown'].map((rule) => ({
          rule,
          paths: ['src/main/kotlin/demo/K.kt'],
          function: functionName,
          reason: 'A reviewed reason.',
        })),
      })}\n`;
    const change = (config) => {
      const root = kotlinRepository({
        'src/main/kotlin/demo/K.kt': feeSource,
        'jacoco.xml': branchReport(),
      });
      write(root, {
        'nitpicker.config.json': config,
        'src/main/kotlin/demo/K.kt': surchargeSource,
        'jacoco.xml': branchReport([5, 1, 1]),
        'kotlin-metrics.json': metrics,
      });
      commit(root, 'add an untested branch');
      return run(root, [], { subprocess: true });
    };

    const rejected = change(kotlinConfig());
    const accepted = change(exceptionFor('surcharge'));
    const other = change(exceptionFor('fee'));

    expect(rejected.exitCode, rejected.output.out + rejected.output.err).toBe(1);
    expect(
      rejected
        .json('new-findings.json')
        .filter(({ rule }) => rule === 'changed-branch-coverage')
        .map(({ symbol, message }) => [symbol, message]),
    ).toEqual([
      [
        'surcharge',
        'Branch coverage is 50.00%; minimum is 95%. If a reviewer agrees this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/kotlin/demo/K.kt"],"function":"surcharge","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
      ],
    ]);
    expect(accepted.exitCode, accepted.output.out + accepted.output.err).toBe(0);
    expect(accepted.json('new-findings.json')).toEqual([]);
    expect(other.exitCode, other.output.out + other.output.err).toBe(1);
  });

  it('keeps an uncovered Kotlin branch baselined while its line is unchanged', () => {
    const root = kotlinRepository({
      'src/main/kotlin/demo/K.kt': surchargeSource,
      'jacoco.xml': branchReport([5, 1, 1]),
    });
    write(root, { 'src/main/kotlin/demo/K.kt': `// moved\n${surchargeSource}` });
    write(root, { 'jacoco.xml': branchReport([6, 1, 1]) });
    commit(root, 'insert a line above it');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
  });

  it('reports a surviving Kotlin mutant without failing', () => {
    const root = kotlinRepository({ 'src/main/kotlin/demo/K.kt': feeSource });
    write(root, { 'mutations.xml': pitReport('demo.KKt', 'K.kt') });
    commit(root, 'a mutant survives');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
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
    write(root, { 'mutations.xml': pitReport('demo.A', 'A.java') });
    commit(root, 'a Java mutant survives');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(mutantsOf(result)).toEqual([
      {
        tool: 'pit',
        rule: 'mutant-survived',
        path: 'src/main/java/demo/A.java',
        identity: 'demo.A|fee(I)I|MathMutator|Replaced integer multiplication with division#1',
        message:
          'Survived MathMutator: Replaced integer multiplication with division: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears. If a reviewer agrees this is intended, add {"rule":"mutant-survived","paths":["src/main/java/demo/A.java"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'demo.A#fee(I)I',
        location: { line: 3 },
      },
    ]);
  });

  describe('exceptions for one-way rules', () => {
    const callRule = 'detekt.style.ForbiddenMethodCall';
    const forbidden =
      'The method `kotlinx.coroutines.runBlocking` has been forbidden: Make the caller `suspend` (`suspend fun main()` for an entry point) and use `coroutineScope { ... }` for concurrent work.';
    const withExceptions = (exceptions) => `${JSON.stringify({ preset: 'kotlin', exceptions })}\n`;
    const exception = {
      rule: callRule,
      paths: ['src/main/kotlin/demo/K.kt'],
      reason: 'The entry point blocks on its coroutine.',
    };
    const added = {
      'detekt.txt': `Legacy magic number\n${callRule} :: ${forbidden}\n`,
    };

    it('fails a new finding of a one-way rule and hands it the allowed form and the exception route', () => {
      const root = kotlinRepository();
      write(root, added);
      commit(root, 'add a forbidden call');

      const result = run(root);

      expect(result.exitCode, result.output.out + result.output.err).toBe(1);
      expect(result.json('new-findings.json')).toEqual([
        {
          tool: 'detekt',
          rule: callRule,
          path: 'src/main/kotlin/demo/K.kt',
          identity: `fp:nitpicker/subject=${forbidden}`,
          location: { line: 4 },
          message: `${forbidden} To allow it on specific paths, add an "exceptions" entry for rule ${callRule} in nitpicker.config.json.`,
          classification: 'enforceable',
        },
      ]);
    });

    it('passes the same change when nitpicker.config.json lists an exception for the path', () => {
      const root = kotlinRepository({ 'nitpicker.config.json': withExceptions([exception]) });
      write(root, added);
      commit(root, 'add a forbidden call');

      const result = run(root, [], { subprocess: true });

      expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    });

    it('does not lift the rule for another path', () => {
      const other = { ...exception, paths: ['src/main/kotlin/other/**'] };
      const root = kotlinRepository({ 'nitpicker.config.json': withExceptions([other]) });
      write(root, added);
      commit(root, 'add a forbidden call');

      const result = run(root, [], { subprocess: true });

      expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    });

    it('rejects an exception for a rule that is not a one-way rule', () => {
      const root = kotlinRepository({
        'nitpicker.config.json': withExceptions([
          { ...exception, rule: 'detekt.style.MagicNumber' },
        ]),
      });

      const result = run(root);

      expect(result.exitCode).toBe(2);
      expect(result.output.err).toBe(
        `nitpicker failed: nitpicker.config.json: "exceptions[0].rule" is "detekt.style.MagicNumber", which is not a rule with exceptions. Rules with exceptions for the kotlin preset: ${KOTLIN_EXCEPTION_RULES.join(', ')}. Tune any other detekt rule in config/detekt/detekt.yml\n`,
      );
    });
  });
  it.each([undefined, 'none'])(
    'runs no format check for a project without a detected formatter (kotlin.formatter %s)',
    (formatter) => {
      const root = kotlinRepository({ 'nitpicker.config.json': kotlinConfig(formatter) });
      write(root, {
        'ktlint.txt': 'standard:no-wildcard-imports|Wildcard import\n',
        'kotlin-format.txt': 'src/main/kotlin/demo/K.kt\n',
      });
      commit(root, 'violate every formatter');

      const result = run(root);

      expect(result.exitCode, result.output.out + result.output.err).toBe(0);
    },
  );

  it('reports a raised legacy allowance under the kotlin analyzer', () => {
    const inventory = (count) =>
      `${JSON.stringify({
        sites: [
          {
            file: 'src/main/kotlin/demo/K.kt',
            rule: 'detekt.style.MagicNumber',
            source: 'fp:nitpicker/subject=Legacy magic number',
            count,
          },
        ],
      })}\n`;
    const root = kotlinRepository({ 'nitpicker.legacy.json': inventory(1) });
    write(root, { 'nitpicker.legacy.json': inventory(2) });
    commit(root, 'raise the allowance');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'kotlin',
        rule: 'baseline-expansion',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'site:fbe5622ec73235ebeafafa81',
        message: 'Legacy allowance increased from 1 to 2 for detekt.style.MagicNumber',
        classification: 'enforceable',
      },
    ]);
  });

  const wideFunction = (name, parameters, start) => ({
    file: 'src/main/kotlin/demo/Wide.kt',
    name,
    start,
    end: start,
    lines: 1,
    statements: 1,
    maxControlNesting: 0,
    parameters,
    complexity: 1,
  });
  const wideSource = (...signatures) =>
    `package demo\n\n${signatures.map((signature) => `fun ${signature} = 0\n`).join('\n')}`;
  const metricsOf = (...functions) => `${JSON.stringify({ functions, files: [] })}\n`;
  const newEnforceable = (result, tool) =>
    result
      .json('new-findings.json')
      .filter((finding) => finding.tool === tool && finding.classification === 'enforceable');
  const FOUR_PARAMETERS = 'sum(a: Int, b: Int, c: Int, d: Int)';
  const legacyWide = () =>
    kotlinRepository({
      'src/main/kotlin/demo/Wide.kt': wideSource(FOUR_PARAMETERS),
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 3)),
    });

  it('keeps a Kotlin function over the parameter limit baselined when it only moves', () => {
    const root = legacyWide();
    write(root, {
      'src/main/kotlin/demo/Wide.kt': `package demo\n\nval answer = 1\n\nfun ${FOUR_PARAMETERS} = 0\n`,
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 5)),
    });
    commit(root, 'move the function');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(0);
  });

  it('fails a Kotlin function that grows past the parameter limit it already exceeded', () => {
    const root = legacyWide();
    write(root, {
      'src/main/kotlin/demo/Wide.kt': wideSource('sum(a: Int, b: Int, c: Int, d: Int, e: Int)'),
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 5, 3)),
    });
    commit(root, 'add a parameter');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(newEnforceable(result, 'structure')).toEqual([
      {
        tool: 'structure',
        rule: 'function-parameters-limit',
        path: 'src/main/kotlin/demo/Wide.kt',
        identity: 'function:sum:occurrence:1:source:88a9edab7be3d0a022e4137e',
        message:
          'sum grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another. If a reviewer agrees this is intended, add {"rule":"function-parameters-limit","paths":["src/main/kotlin/demo/Wide.kt"],"function":"sum","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'sum',
        location: { line: 3 },
        ratchet: {
          key: 'function:sum:occurrence:1:parameters',
          value: 5,
          worseMessage:
            'sum grew from {base} to 5 parameters (limit 3). Group related parameters into one object instead of adding another. If a reviewer agrees this is intended, add {"rule":"function-parameters-limit","paths":["src/main/kotlin/demo/Wide.kt"],"function":"sum","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
          heldMessage:
            'sum: 5 parameters (limit 3), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
  });

  it('fails a new Kotlin function over the parameter limit', () => {
    const root = legacyWide();
    write(root, {
      'src/main/kotlin/demo/Wide.kt': wideSource(
        FOUR_PARAMETERS,
        'product(a: Int, b: Int, c: Int, d: Int)',
      ),
      'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 3), wideFunction('product', 4, 5)),
    });
    commit(root, 'add a function');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(newEnforceable(result, 'structure')).toEqual([
      {
        tool: 'structure',
        rule: 'function-parameters-limit',
        path: 'src/main/kotlin/demo/Wide.kt',
        identity: 'function:product:occurrence:1:source:4028b70dcfd552e455558543',
        message:
          'product has 4 parameters; limit is 3. If a reviewer agrees this is intended, add {"rule":"function-parameters-limit","paths":["src/main/kotlin/demo/Wide.kt"],"function":"product","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'product',
        location: { line: 5 },
        ratchet: {
          key: 'function:product:occurrence:1:parameters',
          value: 4,
          worseMessage:
            'product grew from {base} to 4 parameters (limit 3). Group related parameters into one object instead of adding another. If a reviewer agrees this is intended, add {"rule":"function-parameters-limit","paths":["src/main/kotlin/demo/Wide.kt"],"function":"product","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
          heldMessage:
            'product: 4 parameters (limit 3), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
  });

  it('accepts the new Kotlin function over the parameter limit that an exception names, and no other', () => {
    const exceptionFor = (functionName) =>
      `${JSON.stringify({
        preset: 'kotlin',
        exceptions: ['function-parameters-limit', 'crap-coverage-unknown'].map((rule) => ({
          rule,
          paths: ['src/main/kotlin/demo/Wide.kt'],
          function: functionName,
          reason: 'A reviewed reason.',
        })),
      })}\n`;
    const change = (config) => {
      const root = legacyWide();
      write(root, {
        'nitpicker.config.json': config,
        'src/main/kotlin/demo/Wide.kt': wideSource(
          FOUR_PARAMETERS,
          'product(a: Int, b: Int, c: Int, d: Int)',
        ),
        'kotlin-metrics.json': metricsOf(wideFunction('sum', 4, 3), wideFunction('product', 4, 5)),
      });
      commit(root, 'add a function');
      return run(root, [], { subprocess: true });
    };

    const accepted = change(exceptionFor('product'));
    const other = change(exceptionFor('sum'));

    expect(accepted.exitCode, accepted.output.out + accepted.output.err).toBe(0);
    expect(newEnforceable(accepted, 'structure')).toEqual([]);
    expect(other.exitCode, other.output.out + other.output.err).toBe(1);
    expect(newEnforceable(other, 'structure').map(({ symbol }) => symbol)).toEqual(['product']);
  });

  it('fails a new Kotlin clone found by jscpd', () => {
    const root = kotlinRepository();
    const clone = (name) =>
      `package demo\n\nclass ${name} {\n    fun total(a: Int, b: Int): Int {\n        var total = 0\n${Array.from(
        { length: 10 },
        (_, index) =>
          `        total += (a * ${index + 2}) + (b - ${index})\n        if (total > ${index * 10}) {\n            total -= ${index + 1}\n        }\n`,
      ).join('')}        return total\n    }\n}\n`;
    write(root, {
      'src/main/kotlin/demo/Left.kt': clone('Left'),
      'src/main/kotlin/demo/Right.kt': clone('Right'),
    });
    commit(root, 'copy a class');

    const result = run(root);

    expect(result.exitCode, result.output.out + result.output.err).toBe(1);
    expect(newEnforceable(result, 'duplicates')).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/main/kotlin/demo/Left.kt',
        identity:
          'pair:src/main/kotlin/demo/Left.kt|src/main/kotlin/demo/Right.kt:fragment:36d1c9baac959e2d7350e29b:occurrence:1',
        message:
          'This code repeats src/main/kotlin/demo/Right.kt:3 (46 lines). Keep one copy and call it from both places. If a reviewer agrees this is intended, add {"rule":"duplicate-clone","paths":["src/main/kotlin/demo/Left.kt"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 3 },
      },
    ]);
  });

  const kotlinToolError = (snapshot) => [
    expect.objectContaining({
      tool: 'kotlin',
      snapshot,
      rule: 'gradle-failure',
      message: expect.stringContaining('compileKotlin failed'),
    }),
  ];

  it('reports a Gradle failure on head as a kotlin tool error', () => {
    const root = kotlinRepository();
    write(root, { GRADLE_FAIL: 'compileKotlin failed\n' });
    commit(root, 'break the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')).toEqual(kotlinToolError('head'));
  });

  it('reports a Gradle failure on base as a kotlin tool error', () => {
    const root = kotlinRepository({ GRADLE_FAIL: 'compileKotlin failed\n' });
    git(root, ['rm', '-q', 'GRADLE_FAIL']);
    commit(root, 'fix the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')).toEqual(kotlinToolError('base'));
  });
});

describe('Kotlin analyzer', () => {
  it('is named kotlin, declares the Kotlin tools and starts the runner with the kotlin preset', () => {
    const analyzer = createJavaAnalyzer({ kotlin: true });
    const invocation = analyzer.createInvocation({ projectRoot: '/project', toolRoot: '/tool' });

    expect(analyzer.name).toBe('kotlin');
    expect(analyzer.reportedTools).toEqual([...JAVA_TOOLS, 'detekt', 'ktlint', 'ktfmt']);
    expect(invocation.args.slice(-2)).toEqual(['--preset', 'kotlin']);
    expect(createJavaAnalyzer().name).toBe('java');
    expect(createJavaAnalyzer().reportedTools).not.toContain('detekt');
  });

  it('maps a failing Gradle run to one tool-error finding of the kotlin analyzer', () => {
    const root = temporaryRoot('nitpicker-kotlin-unit-');
    write(root, { GRADLE_FAIL: 'detekt crashed\n' });

    const { findings } = analyzeJavaSnapshot(root, {
      gradle: fakeGradle,
      policy: { preset: 'kotlin' },
    });

    expect(findings).toEqual([
      {
        tool: 'kotlin',
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: `Java preset failed in ${root}: detekt crashed`,
        classification: 'tool-error',
      },
    ]);
  });
});

describe('a root project without Nitpicker reports', () => {
  it.each([
    ['kotlin', 'org.jetbrains.kotlin.jvm'],
    ['java', 'java'],
  ])('is a tool error naming the plugin for the %s preset', (preset, plugin) => {
    const root = temporaryRoot('nitpicker-no-reports-');
    write(root, { NO_REPORTS: '' });

    const { findings } = analyzeJavaSnapshot(root, { gradle: fakeGradle, policy: { preset } });

    expect(findings).toEqual([
      {
        tool: preset,
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: `The ${preset} preset found no Gradle reports in build/nitpicker: the root project must apply the ${plugin} plugin. Reports of submodules are not read`,
        classification: 'tool-error',
      },
    ]);
  });
});

describe('Java analyzer', () => {
  it('records the pinned tool versions and a stable configuration hash', () => {
    const analyzer = createJavaAnalyzer();

    expect(analyzer.version).toMatch(
      /^pmd@[\d.]+;spotbugs@[\d.]+;googleJavaFormat@[\d.]+;jacoco@[\d.]+;checkstyle@[\d.]+;lizard@[\d.]+;pitest@[\d.]+;pitestJunit5@[\d.]+;detekt@[\d.]+;detektKotlin@[\d.]+;ktlint@[\d.]+;ktfmt@[\d.]+;kotlinCompiler@[\d.]+;jscpd@[\d.]+$/,
    );
    expect(createJavaAnalyzer().configurationHash).toBe(analyzer.configurationHash);
  });

  it('maps a failing Gradle run to one tool-error finding', () => {
    const root = temporaryRoot('nitpicker-java-unit-');
    write(root, { GRADLE_FAIL: 'tool crashed\n' });

    const { findings } = analyzeJavaSnapshot(root, { gradle: fakeGradle });

    expect(findings).toEqual([
      {
        tool: 'java',
        rule: 'gradle-failure',
        path: '.',
        identity: 'gradle-failure',
        message: `Java preset failed in ${root}: tool crashed`,
        classification: 'tool-error',
      },
    ]);
  });
});

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { collectJavaFindings } from '../../java-diff.mjs';
import { analyzeJavaSnapshot } from '../../java-runner.mjs';
import { useKotlinCoverageProject } from '../__tests__/kotlin-coverage-project.mjs';
import {
  fromTool,
  git,
  initializeMavenProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinSources,
  mavenDiffRunner,
  onlyTools,
  rulesOf,
} from './test-support/kotlin-maven-project.mjs';

const maven = process.env.NITPICKER_MAVEN;
const mavenDiffOf = mavenDiffRunner(maven);

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: coverage and structure', () => {
  const fixture = useKotlinCoverageProject({ initialize: initializeMavenProject });
  it('fails a changed Kotlin branch that no test takes and only reports its mutants', () => {
    const result = mavenDiffOf(fixture.project, 'one-sided-branch');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual([
      'jacoco changed-branch-coverage Label.kt',
    ]);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ message, location }) => ({ message, location })),
    ).toEqual([
      {
        message: `Branch coverage is 50.00%; minimum is 95%. ${exceptionRoute({ rule: 'changed-branch-coverage', path: `${kotlinSources}/Label.kt`, function: 'Label.larger' })}`,
        location: { line: 4 },
      },
    ]);
    expect(fromTool(result.newEnforceable, 'pit')).toEqual([]);
    expect(
      result.newFindings
        .filter(({ tool, rule }) => tool === 'pit' && rule === 'mutant-survived')
        .map(({ path: file, identity }) => `${file} ${identity}`)
        .sort(),
    ).toEqual([
      'src/main/kotlin/demo/Label.kt Label|larger(II)LString;|ConditionalsBoundaryMutator|changed conditional boundary#1',
    ]);
  });
  it('fails the untested branches of a statement that spans lines and of a file outside its package directory', () => {
    const result = mavenDiffOf(fixture.project, 'multiline-branch');

    expect(result.failed).toBe(true);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`)
        .sort(),
    ).toEqual(['Offset.kt:4', 'Spread.kt:10', 'Spread.kt:7']);
  });
  it('does not ask for coverage of branches the Kotlin compiler generated', () => {
    git(fixture.project, 'checkout', '-q', 'generated-branches');
    const findings = collectJavaFindings(fixture.project.root, { maven, policy: kotlinPolicy });
    const report = readFileSync(
      path.join(fixture.project.root, 'target/nitpicker/jacoco.xml'),
      'utf8',
    );
    const generatedFile = report.slice(report.indexOf('<sourcefile name="Generated.kt">'));
    const missedLines = [...generatedFile.matchAll(/<line nr="(\d+)"[^>]* mb="([1-9]\d*)"/g)].map(
      ([, line]) => Number(line),
    );

    expect(missedLines).toEqual([33, 34, 35]);
    expect(findings.filter(({ rule }) => rule === 'changed-branch-coverage')).toEqual([]);
  });
  it('applies the structure, CRAP, clone and stability rules to one change', () => {
    const result = mavenDiffOf(fixture.project, 'head', { base: 'structure-base' });
    const routeOf = (rule, file, name) =>
      exceptionRoute({ rule, path: `${kotlinSources}/${file}`, function: name });
    const messageOf = (rule, symbol) =>
      onlyTools(result.newEnforceable, 'structure', 'crap').find(
        (finding) => finding.rule === rule && finding.symbol === symbol,
      ).message;

    expect(rulesOf(result.newEnforceable, 'structure', 'crap')).toEqual([
      'crap crap-score-limit Booter.<init>',
      'crap crap-score-limit Booter.label',
      'crap crap-score-limit Left.total',
      'crap crap-score-limit Right.total',
      'crap crap-score-limit classify2',
      'crap crap-score-limit flatten',
      'crap crap-score-limit rank',
      'structure function-control-nesting-limit Booter.<init>',
      'structure function-control-nesting-limit depth',
      'structure function-lines-limit Left.total',
      'structure function-lines-limit Right.total',
      'structure function-parameters-limit combine',
      'structure function-parameters-limit pipeline',
      'structure function-parameters-limit product',
      'structure function-statements-limit Booter.label',
      'structure function-statements-limit Left.total',
      'structure function-statements-limit Right.total',
      'structure function-statements-limit classify2',
      'structure function-statements-limit rank',
    ]);
    expect(messageOf('function-control-nesting-limit', 'depth')).toBe(
      `depth nests control flow 3 deep (limit 2). Return early instead of nesting. ${routeOf('function-control-nesting-limit', 'change/Deep.kt', 'depth')}`,
    );
    expect(messageOf('function-parameters-limit', 'product')).toBe(
      `product grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another. ${routeOf('function-parameters-limit', 'Grown.kt', 'product')}`,
    );
    expect(messageOf('crap-score-limit', 'classify2')).toBe(
      `classify2 CRAP rose from 110 to 132 (limit 9). Put new code in a new function and cover it with tests. ${routeOf('crap-score-limit', 'Complex2.kt', 'classify2')}`,
    );
    expect(rulesOf(result.unchangedFindings, 'structure', 'crap')).toEqual([
      'crap crap-score-limit classify',
      'structure function-parameters-limit sum',
      'structure function-statements-limit classify',
    ]);
    expect(rulesOf(result.newEnforceable, 'duplicates')).toEqual([
      'duplicates duplicate-clone Left.kt',
    ]);
    expect(
      onlyTools(result.newEnforceable, 'coupling')
        .filter(({ rule }) => rule === 'stability-direction')
        .map(({ rule, identity, message }) => ({
          rule,
          identity,
          message,
        })),
    ).toEqual([
      {
        rule: 'stability-direction',
        identity: 'package-edge:stable2->churn2',
        message: `stable2 depends on less stable package churn2. ${exceptionRoute({ rule: 'stability-direction', path: 'stable2' })}`,
      },
    ]);
    const stable = onlyTools(result.newFindings, 'coupling').find(
      ({ identity }) => identity === 'package:stable2:instability',
    );
    expect(stable.metric).toEqual({ name: 'instability', value: 0.3333 });
    expect(
      onlyTools(result.unchangedFindings, 'coupling')
        .filter(({ rule }) => rule === 'stability-direction')
        .map(({ identity }) => identity),
    ).toEqual(['package-edge:stable->churn']);
  });
  it('reports a Kotlin file facade only tests use and spares a file with a main function', () => {
    const result = mavenDiffOf(fixture.project, 'test-only');

    expect(
      onlyTools(result.newEnforceable, 'coupling')
        .filter(({ rule }) => rule === 'test-only-export')
        .map(({ path: file, symbol, location }) => `${file}:${String(location.line)} ${symbol}`),
    ).toEqual(['src/main/kotlin/demo/Shouting.kt:3 demo.ShoutingKt']);
  });
  it('keeps a legacy init block baselined when init blocks are inserted around it, in a class, a companion object and an object expression', () => {
    const result = mavenDiffOf(fixture.project, 'init-inserted', { base: 'init-base' });

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
  it('reports a Maven failure as a tool error instead of throwing', () => {
    git(fixture.project, 'checkout', '-q', 'broken');

    const { findings } = analyzeJavaSnapshot(fixture.project.root, { maven, policy: kotlinPolicy });

    expect(
      findings.map(({ tool, rule, classification, message }) => ({
        tool,
        rule,
        classification,
        namesTheBrokenFile: message.includes('Broken.kt'),
      })),
    ).toEqual([
      {
        tool: 'kotlin',
        rule: 'maven-failure',
        classification: 'tool-error',
        namesTheBrokenFile: true,
      },
    ]);
  });
});

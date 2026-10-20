import { describe, expect, it } from 'vitest';
import { analyzeJavaSnapshot } from '../../java-runner.mjs';
import {
  diffOf,
  git,
  gradle,
  kotlinE2eEnabled,
  kotlinPolicy,
  onlyTools,
  rulesOf,
} from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinCoverageProject } from '../__tests__/kotlin-coverage-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset coverage and structure end to end', () => {
  const fixture = useKotlinCoverageProject();
  it('applies the structure, CRAP, clone and stability rules to one change', () => {
    const result = diffOf(fixture.project, 'head', { base: 'structure-base' });
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
      'depth nests control flow 3 deep (limit 2). Return early instead of nesting.',
    );
    expect(messageOf('function-parameters-limit', 'product')).toBe(
      'product grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
    );
    expect(messageOf('crap-score-limit', 'classify2')).toBe(
      'classify2 CRAP rose from 110 to 132 (limit 9). Put new code in a new function and cover it with tests.',
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
        message: 'stable2 depends on less stable package churn2',
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
    const result = diffOf(fixture.project, 'test-only');

    expect(
      onlyTools(result.newEnforceable, 'coupling')
        .filter(({ rule }) => rule === 'test-only-export')
        .map(({ path: file, symbol, location }) => `${file}:${String(location.line)} ${symbol}`),
    ).toEqual(['src/main/kotlin/demo/Shouting.kt:3 demo.ShoutingKt']);
  });
  it('reports a Gradle failure as a tool error instead of throwing', () => {
    git(fixture.project, 'checkout', '-q', 'broken');

    const { findings } = analyzeJavaSnapshot(fixture.project.root, {
      gradle,
      policy: kotlinPolicy,
    });

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
        rule: 'gradle-failure',
        classification: 'tool-error',
        namesTheBrokenFile: true,
      },
    ]);
  });
});

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { analyzeJavaSnapshot } from '../java-runner.mjs';
import {
  BROKEN,
  GENERATED,
  GENERATED_TEST,
  LABEL,
  LABEL_ONE_SIDED_TEST,
  OFFSET,
  SPREAD,
  SPREAD_TEST,
} from './test-support/kotlin-branch-coverage-data.mjs';
import { BOOTER, BOOTER_TEST, BOX_TEST, boxes } from './test-support/kotlin-initializer-data.mjs';
import {
  COMBINE,
  COMBINE_TEST,
  DEEP,
  DEEP_TEST,
  FLATTEN,
  FLATTEN_TEST,
  GROWN,
  GROWN_TEST,
  GROWN_WIDER,
  GROWN_WIDER_TEST,
  PIPELINE,
  TIERS,
  TIERS_TEST,
  WIDE,
  WIDE_MOVED,
  WIDE_TEST,
  classifier,
  clonedClass,
  stabilityClass,
  stabilityFiles,
} from './test-support/kotlin-structure-data.mjs';
import {
  commitBranch,
  commitFromBranch,
  commitFromStructureBase,
  diffOf,
  fromTool,
  git,
  gradle,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinSources,
  onlyTools,
  removeProject,
  rulesOf,
} from './test-support/kotlin-e2e-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset coverage and structure end to end', () => {
  let project;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'one-sided-branch', {
      [`${kotlinSources}/Label.kt`]: LABEL,
      'src/test/kotlin/demo/LabelTest.kt': LABEL_ONE_SIDED_TEST,
    });
    commitBranch(project, 'multiline-branch', {
      [`${kotlinSources}/Spread.kt`]: SPREAD,
      'src/test/kotlin/demo/SpreadTest.kt': SPREAD_TEST,
      'src/main/kotlin/Offset.kt': OFFSET,
    });
    commitBranch(project, 'generated-branches', {
      [`${kotlinSources}/Generated.kt`]: GENERATED,
      'src/test/kotlin/demo/GeneratedTest.kt': GENERATED_TEST,
    });
    commitBranch(project, 'broken', { [`${kotlinSources}/Broken.kt`]: BROKEN });
    commitBranch(project, 'init-base', {
      [`${kotlinSources}/boxes/Box.kt`]: boxes(false),
      'src/test/kotlin/demo/boxes/BoxTest.kt': BOX_TEST,
    });
    commitFromBranch(project, {
      name: 'init-inserted',
      from: 'init-base',
      files: { [`${kotlinSources}/boxes/Box.kt`]: boxes(true) },
    });
    commitBranch(project, 'structure-base', {
      [`${kotlinSources}/Wide.kt`]: WIDE,
      'src/test/kotlin/demo/WideTest.kt': WIDE_TEST,
      [`${kotlinSources}/Grown.kt`]: GROWN,
      'src/test/kotlin/demo/GrownTest.kt': GROWN_TEST,
      [`${kotlinSources}/Complex.kt`]: classifier('classify', 9),
      [`${kotlinSources}/Complex2.kt`]: classifier('classify2', 9, { step: 7 }),
      ...stabilityFiles(''),
    });
    commitFromStructureBase(project, 'head', {
      [`${kotlinSources}/Wide.kt`]: WIDE_MOVED,
      [`${kotlinSources}/Grown.kt`]: GROWN_WIDER,
      'src/test/kotlin/demo/GrownTest.kt': GROWN_WIDER_TEST,
      [`${kotlinSources}/Complex.kt`]: classifier('classify', 9, { bump: 2 }),
      [`${kotlinSources}/Complex2.kt`]: classifier('classify2', 10, { step: 7 }),
      [`${kotlinSources}/change/Deep.kt`]: DEEP,
      'src/test/kotlin/demo/change/DeepTest.kt': DEEP_TEST,
      [`${kotlinSources}/change/Rank.kt`]: classifier('rank', 9, { step: 13 }),
      [`${kotlinSources}/change/Tiers.kt`]: TIERS,
      'src/test/kotlin/demo/change/TiersTest.kt': TIERS_TEST,
      [`${kotlinSources}/change/Combine.kt`]: COMBINE,
      'src/test/kotlin/demo/change/CombineTest.kt': COMBINE_TEST,
      'src/main/kotlin/Flatten.kt': FLATTEN,
      'src/test/kotlin/FlattenTest.kt': FLATTEN_TEST,
      [`${kotlinSources}/build/Pipeline.kt`]: PIPELINE,
      [`${kotlinSources}/extra/Booter.kt`]: BOOTER,
      'src/test/kotlin/demo/change/BooterTest.kt': BOOTER_TEST,
      [`${kotlinSources}/extra/Left.kt`]: clonedClass('Left'),
      [`${kotlinSources}/extra/Right.kt`]: clonedClass('Right'),
      ...stabilityFiles('2'),
      'src/main/kotlin/stable/Core.kt': `${stabilityClass('stable', 'Core', 'churn.Volatile().value()')}\nval note = 1\n`,
    });
  });
  afterAll(() => {
    removeProject(project);
  });
  it('fails a changed Kotlin branch that no test takes and only reports its mutants', () => {
    const result = diffOf(project, 'one-sided-branch');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual([
      'jacoco changed-branch-coverage Label.kt',
    ]);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ message, location }) => ({ message, location })),
    ).toEqual([{ message: 'Branch coverage is 50.00%; minimum is 95%', location: { line: 4 } }]);
    expect(fromTool(result.newEnforceable, 'pit')).toEqual([]);
    expect(
      result.newFindings.filter(
        ({ tool, rule, path: file }) =>
          tool === 'pit' && rule === 'mutant-survived' && file.endsWith('Label.kt'),
      ),
    ).not.toEqual([]);
  });
  it('fails the untested branches of a statement that spans lines and of a file outside its package directory', () => {
    const result = diffOf(project, 'multiline-branch');

    expect(result.failed).toBe(true);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`)
        .sort(),
    ).toEqual(['Offset.kt:4', 'Spread.kt:10', 'Spread.kt:7']);
  });
  it('does not ask for coverage of branches the Kotlin compiler generated', () => {
    git(project, 'checkout', '-q', 'generated-branches');
    const findings = collectJavaFindings(project.root, { gradle, policy: kotlinPolicy });
    const report = readFileSync(path.join(project.root, 'build/nitpicker/jacoco.xml'), 'utf8');
    const generatedFile = report.slice(report.indexOf('<sourcefile name="Generated.kt">'));
    const missedLines = [...generatedFile.matchAll(/<line nr="(\d+)"[^>]* mb="([1-9]\d*)"/g)].map(
      ([, line]) => Number(line),
    );

    expect(missedLines.length).toBeGreaterThan(0);
    expect(findings.filter(({ rule }) => rule === 'changed-branch-coverage')).toEqual([]);
  });
  it('applies the structure, CRAP, clone and stability rules to one change', () => {
    const result = diffOf(project, 'head', { base: 'structure-base' });
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
      onlyTools(result.newEnforceable, 'coupling').map(({ rule, identity, message }) => ({
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
  it('keeps a legacy init block baselined when init blocks are inserted around it, in a class, a companion object and an object expression', () => {
    const result = diffOf(project, 'init-inserted', { base: 'init-base' });

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
  it('reports a Gradle failure as a tool error instead of throwing', () => {
    git(project, 'checkout', '-q', 'broken');

    const { findings } = analyzeJavaSnapshot(project.root, { gradle, policy: kotlinPolicy });

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

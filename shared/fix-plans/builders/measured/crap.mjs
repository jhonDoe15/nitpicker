import { allowedFormOf, describe, symbolOf, targetOf, without } from '../../plan-parts/finding.mjs';
import { ALL_PRESETS } from '../../plan-parts/presets.mjs';
import { amount, stepsOf } from '../../plan-parts/steps.mjs';
import { testFileContext, testStep } from './tests.mjs';

const SCORE = /CRAP ([\d.]+)/u;
const LIMIT = /below (\d+)/u;
const COVERED = /although tests cover it/u;

function crapPlan(finding, env) {
  const text = env.read(finding.path);
  const target = targetOf(finding, text);
  const score = SCORE.exec(finding.message)?.[1];
  const limit = LIMIT.exec(finding.message)?.[1];
  const unknown = finding.rule === 'crap-coverage-unknown';
  const covered = COVERED.test(finding.message);
  const tests = testFileContext(finding, env);
  const context = without({
    crap: score === undefined ? undefined : Number(score),
    limit: limit === undefined ? undefined : Number(limit),
    coverage: unknown ? 'unknown' : undefined,
    ...tests,
  });
  if (covered) {
    return {
      kind: 'reduce-complexity',
      target,
      context,
      steps: stepsOf(
        `Read ${describe(target)}: ${amount(context.crap, 'CRAP', context.limit)}; tests already cover it.`,
        allowedFormOf(finding, 'Reduce its branches: split a branchy part into its own function.'),
        'Keep the behavior: run its tests after each change.',
      ),
    };
  }
  return {
    kind: 'add-test-for-branch',
    target,
    context,
    steps: stepsOf(
      `Read ${describe(target)}: ${unknown ? 'no test runs it' : amount(context.crap, 'CRAP', context.limit)}.`,
      testStep(tests?.testFile, symbolOf(finding)),
      allowedFormOf(
        finding,
        'Test its uncovered branches, or split a branchy part into its own function.',
      ),
      'Call it from the test and assert its results for each branch.',
    ),
  };
}

export const CRAP_BUILDERS = [
  {
    id: 'crap',
    rules: [
      { tool: 'crap', rule: 'crap-score-limit' },
      { tool: 'crap', rule: 'crap-coverage-unknown' },
    ],
    presets: ALL_PRESETS,
    build: crapPlan,
  },
];

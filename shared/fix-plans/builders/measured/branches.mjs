import { allowedFormOf, describe, symbolOf, targetOf, without } from '../../plan-parts/finding.mjs';
import { ALL_PRESETS } from '../../plan-parts/presets.mjs';
import { stepsOf } from '../../plan-parts/steps.mjs';
import { sourceLine } from '../../plan-parts/source.mjs';
import { testFileContext, testStep } from './tests.mjs';

const NOT_TAKEN = /Not taken: (.+?)\. (?:Test it|Add a test)/su;
const PERCENT = /coverage is ([\d.]+)%/u;
const ADD_TEST = 'Add a test for each outcome it misses.';

function branchPlan(finding, env) {
  const target = targetOf(finding, undefined);
  const arms = NOT_TAKEN.exec(finding.message)?.[1]?.split('; ');
  const percent = PERCENT.exec(finding.message)?.[1];
  const tests = testFileContext(finding, env);
  const line = sourceLine(finding, env);
  return {
    kind: 'add-test-for-branch',
    target,
    context: without({
      uncoveredLine: target.startLine,
      source: line,
      percent: percent === undefined ? undefined : Number(percent),
      notTaken: arms,
      ...tests,
    }),
    steps: stepsOf(
      `Read the branch at ${describe(target)}${percent === undefined ? '' : `, ${percent}% covered`}.`,
      arms === undefined
        ? 'List the outcomes of the condition that no test reaches.'
        : `Write a test that takes each branch that is not taken: ${arms.join('; ')}.`,
      testStep(tests?.testFile, symbolOf(finding)),
      allowedFormOf(finding, ADD_TEST),
      'Assert the result of each outcome, not only that the code ran.',
    ),
  };
}

export const BRANCH_BUILDERS = [
  {
    id: 'cover-changed-branch',
    rules: [{ tool: 'coverage', rule: 'changed-branch-coverage' }],
    presets: ALL_PRESETS,
    build: branchPlan,
  },
];

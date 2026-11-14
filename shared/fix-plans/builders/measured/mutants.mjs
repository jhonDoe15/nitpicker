import { allowedFormOf, describe, symbolOf, targetOf, without } from '../../plan-parts/finding.mjs';
import { ALL_PRESETS } from '../../plan-parts/presets.mjs';
import { stepsOf } from '../../plan-parts/steps.mjs';
import { sourceLine } from '../../plan-parts/source.mjs';
import { testFileContext, testStep } from './tests.mjs';

const REPLACING =
  /^Survived (.+?)(?: at column (\d+))?: replacing (.+) with (.+) fails no test\./su;
const UNKNOWN = /^Survived (.+?)(?: at column (\d+))?: no test fails/su;
const UNREACHED = /^NoCoverage (.+?)(?: at column (\d+))?: no test runs/su;
const TICKS = /^`+ ?| ?`+$/gu;

function unquote(text) {
  return text?.replaceAll(TICKS, '');
}

function parseMutant(message) {
  const replacing = REPLACING.exec(message);
  if (replacing !== null) {
    return {
      mutator: replacing[1],
      column: replacing[2],
      original: unquote(replacing[3]),
      replacement: unquote(replacing[4]),
    };
  }
  const match = UNKNOWN.exec(message) ?? UNREACHED.exec(message);
  return match === null ? {} : { mutator: match[1], column: match[2] };
}

function mutantContext(finding, env) {
  const { mutator, column, original, replacement } = parseMutant(finding.message);
  return without({
    mutator,
    column: column === undefined ? undefined : Number(column),
    original,
    replacement,
    source: sourceLine(finding, env),
    ...testFileContext(finding, env),
  });
}

function killMutant(finding, env) {
  const target = targetOf(finding, undefined);
  const context = mutantContext(finding, env);
  const change =
    context.original === undefined
      ? `the ${context.mutator ?? 'mutation'}`
      : `replacing ${context.original} with ${context.replacement}`;
  return {
    kind: 'kill-mutant',
    target,
    context,
    steps: stepsOf(
      `Read ${describe(target)}: ${change} fails no test.`,
      testStep(context.testFile, symbolOf(finding)),
      'Write an input for which the original and the mutated code give different results.',
      allowedFormOf(finding, 'Assert the exact value instead of only running the code.'),
      'If no input can tell the two apart, simplify the code so this mutant disappears.',
    ),
  };
}

function reachCode(finding, env) {
  const target = targetOf(finding, undefined);
  const context = { ...mutantContext(finding, env), unreached: true };
  return {
    kind: 'add-test-for-branch',
    target,
    context,
    steps: stepsOf(
      `Read ${describe(target)}: no test runs this code.`,
      testStep(context.testFile, symbolOf(finding)),
      allowedFormOf(finding, 'Add a test that reaches it.'),
      'Assert the result, so that the mutants in this code fail the test.',
    ),
  };
}

function mutationRule(rule) {
  return { tool: 'mutation', rule };
}

export const MUTANT_BUILDERS = [
  {
    id: 'kill-surviving-mutant',
    rules: [mutationRule('mutant-survived')],
    presets: ALL_PRESETS,
    build: killMutant,
  },
  {
    id: 'reach-unreached-mutant',
    rules: [mutationRule('mutant-nocoverage')],
    presets: ALL_PRESETS,
    build: reachCode,
  },
];

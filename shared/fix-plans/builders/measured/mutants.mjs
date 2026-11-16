import { allowedFormOf, describe, symbolOf, targetOf, without } from '../../plan-parts/finding.mjs';
import { ALL_PRESETS } from '../../plan-parts/presets.mjs';
import { stepsOf } from '../../plan-parts/steps.mjs';
import { sourceLine } from '../../plan-parts/source.mjs';
import { groupTarget, uniqueOf } from './groups.mjs';
import { testFileContext, testStep } from './tests.mjs';

const REPLACING =
  /^Survived (.+?)(?: at column (\d+))?: replacing (.+) with (.+) fails no test\./su;
const UNKNOWN = /^Survived (.+?)(?: at column (\d+))?: no test fails/su;
const UNREACHED = /^NoCoverage (.+?)(?: at column (\d+))?: no test runs/su;
const TICKS = /^`+ ?| ?`+$/gu;
const EMPTY_STRING = /^`''` \(an empty string\)$/u;

function unquote(text) {
  return EMPTY_STRING.test(text ?? '') ? "''" : text?.replaceAll(TICKS, '');
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

const FRAGMENT = /^Add an assertion that would\.\s*/u;
const DEFAULT_WAY_OUT =
  'If no input can tell the two apart, simplify the code so this mutant disappears.';
const ASSERT_EXACT = 'Assert the exact value instead of only running the code.';

function wayOutOf(finding) {
  const text = finding.allowedForm?.replace(FRAGMENT, '').trim();
  return text === undefined || text === '' ? DEFAULT_WAY_OUT : text;
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
      ASSERT_EXACT,
      wayOutOf(finding),
    ),
  };
}

function compactMutant(finding) {
  const { mutator, column, original, replacement } = parseMutant(finding.message);
  return without({
    line: finding.location?.line,
    column: column === undefined ? undefined : Number(column),
    mutator,
    original,
    replacement,
  });
}

function killMutants(findings, env) {
  const target = groupTarget(findings, env);
  const tests = testFileContext(findings[0], env);
  return {
    kind: 'kill-mutant',
    target,
    context: without({
      source: sourceLine(findings[0], env),
      mutants: findings.map(compactMutant),
      ...tests,
    }),
    steps: stepsOf(
      `Read ${describe(target)}: ${String(findings.length)} mutants survive, listed in context.mutants.`,
      testStep(tests?.testFile, symbolOf(findings[0])),
      'For each mutant, write an input for which the original and the mutated code give different results.',
      ASSERT_EXACT,
      uniqueOf(findings, wayOutOf),
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

function reachCodeInGroup(findings, env) {
  const target = groupTarget(findings, env);
  const tests = testFileContext(findings[0], env);
  return {
    kind: 'add-test-for-branch',
    target,
    context: without({
      source: sourceLine(findings[0], env),
      mutants: findings.map(compactMutant),
      unreached: true,
      ...tests,
    }),
    steps: stepsOf(
      `Read ${describe(target)}: no test runs ${String(findings.length)} mutated places, listed in context.mutants.`,
      testStep(tests?.testFile, symbolOf(findings[0])),
      uniqueOf(findings, (finding) => allowedFormOf(finding, 'Add a test that reaches it.')),
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
    buildGroup: killMutants,
  },
  {
    id: 'reach-unreached-mutant',
    rules: [mutationRule('mutant-nocoverage')],
    presets: ALL_PRESETS,
    build: reachCode,
    buildGroup: reachCodeInGroup,
  },
];

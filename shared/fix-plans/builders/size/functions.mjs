import {
  allowedFormOf,
  limitOf,
  measuredOf,
  symbolOf,
  targetOf,
  describe,
  without,
} from '../../plan-parts/finding.mjs';
import { ALL_PRESETS } from '../../plan-parts/presets.mjs';
import { candidateBlocks, linesOf } from '../../plan-parts/source.mjs';
import { amount, lineRanges, readStep, stepsOf } from '../../plan-parts/steps.mjs';

const SPLIT = 'Split by responsibility and name each part for what it checks or does.';
const EARLY_RETURN = 'Return early for the guard cases instead of nesting, and name a nested part.';
const GROUP = 'Group related parameters into one object and take that object instead.';

function measure(finding, env, metric) {
  const text = env.read(finding.path);
  const target = targetOf(finding, text);
  const value = measuredOf(finding);
  const limit = limitOf(finding.message);
  const blocks = text === undefined ? [] : candidateBlocks(linesOf(text), target);
  return { target, text, blocks, value, limit, metric };
}

function context({ metric, value, limit, blocks }) {
  return without({
    metric,
    value,
    limit,
    over: value !== undefined && limit !== undefined ? value - limit : undefined,
    blocks: blocks.length === 0 ? undefined : blocks,
  });
}

function extractFunction(metric) {
  return (finding, env) => {
    const found = measure(finding, env, metric);
    const { target, blocks } = found;
    return {
      kind: 'extract-function',
      target,
      context: context(found),
      steps: stepsOf(
        readStep(describe(target), amount(found.value, metric, found.limit)),
        blocks.length === 0
          ? 'Find blocks that each do one thing: a check, a conversion, a loop body.'
          : `Move one or more of these blocks into functions of their own: lines ${lineRanges(blocks)}.`,
        allowedFormOf(finding, SPLIT),
        `Call each new function from ${symbolOf(finding) ?? 'the original'} and keep its behavior.`,
      ),
    };
  };
}

function reduceNesting(finding, env) {
  const found = measure(finding, env, 'nesting');
  const { target, blocks } = found;
  return {
    kind: 'reduce-complexity',
    target,
    context: context(found),
    steps: stepsOf(
      readStep(describe(target), amount(found.value, 'levels', found.limit)),
      allowedFormOf(finding, EARLY_RETURN),
      blocks.length === 0
        ? undefined
        : `Move a deeply nested block into its own function: lines ${lineRanges(blocks)}.`,
      'Keep the behavior: run the tests that cover it after each change.',
    ),
  };
}

const SIGNATURE_LINES = 8;

function depthChange(character) {
  return ('([{<'.includes(character) ? 1 : 0) - (')]}>'.includes(character) ? 1 : 0);
}

function topLevelParts(source, from) {
  const masked = source.replaceAll(/=>|->/gu, '__');
  let depth = 0;
  let start = from;
  let end = masked.length;
  const parts = [];
  for (const [index, character] of [...masked].entries()) {
    if (index < from || end < masked.length) {
      continue;
    }
    depth += depthChange(character);
    if (depth < 0) {
      end = index;
    } else if (character === ',' && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, source.slice(start, end)];
}

function signatureParameters(text, target) {
  if (text === undefined) {
    return [];
  }
  const source = linesOf(text)
    .slice(target.startLine - 1, target.startLine - 1 + SIGNATURE_LINES)
    .join(' ');
  return topLevelParts(source, source.indexOf('(') + 1)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function groupParameters(finding, env) {
  const found = measure(finding, env, 'parameters');
  const parameters = signatureParameters(found.text, found.target);
  return {
    kind: 'group-parameters',
    target: found.target,
    context: without({
      ...context({ ...found, blocks: [] }),
      parameters: parameters.length === 0 ? undefined : parameters,
    }),
    steps: stepsOf(
      readStep(describe(found.target), amount(found.value, 'parameters', found.limit)),
      allowedFormOf(finding, GROUP),
      parameters.length === 0
        ? 'Pick the parameters that always travel together.'
        : `Pick the parameters that always travel together among: ${parameters.join(', ')}.`,
      'Name the new type for what the values are, and update every caller.',
    ),
  };
}

function rules(...names) {
  return names.map((rule) => ({ tool: 'structure', rule }));
}

export const FUNCTION_BUILDERS = [
  {
    id: 'extract-function-lines',
    rules: rules('function-lines-limit'),
    presets: ALL_PRESETS,
    build: extractFunction('lines'),
  },
  {
    id: 'extract-function-statements',
    rules: rules('function-statements-limit'),
    presets: ALL_PRESETS,
    build: extractFunction('statements'),
  },
  {
    id: 'reduce-nesting',
    rules: rules('function-control-nesting-limit'),
    presets: ALL_PRESETS,
    build: reduceNesting,
  },
  {
    id: 'group-parameters',
    rules: rules('function-parameters-limit'),
    presets: ALL_PRESETS,
    build: groupParameters,
  },
  {
    id: 'reduce-cognitive-complexity',
    rules: [{ tool: 'eslint', rule: 'nitpicker/cognitive-complexity' }],
    presets: ['typescript', 'javascript'],
    build: reduceNesting,
  },
];

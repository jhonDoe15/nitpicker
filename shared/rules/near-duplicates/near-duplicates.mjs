import { findNearDuplicates } from '../../near-duplicates/engine.mjs';
import { compareText } from '../../near-duplicates/tree/keys.mjs';
import { RULE_IDS } from '../../policy.mjs';
import { listNames } from '../../messages/messages.mjs';
import { reuseFinding } from '../reuse/reuse-finding.mjs';
import { isPlatformVariant } from './platform-variants.mjs';
import { isTypeSpecialized } from './type-families.mjs';
import { shortText } from '../../near-duplicates/unit-parts.mjs';

const CLONE_ANALYZER_MINIMUM = { lines: 5, tokens: 100 };
const SHOWN_TEXT = 40;
const NORMALIZED_LITERALS = new Set(['string', 'number', 'char']);

const FIXES = {
  same: 'Keep one, and call it from both places.',
  parameterizable:
    'Extract one function that takes the differing values as parameters, and call it from both places.',
  'partial-run': 'Extract lines {run} into one function, and call it from both places.',
};

const SAME_DIFFERENCES = {
  names: 'apart from renamed names',
  logic: 'apart from how its logic is written (a solver proved both give the same results)',
  inlined: 'once same-file helper calls are inlined',
};

function unitIdOf({ file, name }) {
  return `${file}#${name}`;
}

function withoutSharedPrefix(value, other) {
  const [own, theirs] = [value, other].map((text) => text.replace(/^[a-z]+:/u, ''));
  const shared = [...own].findIndex((character, index) => character !== theirs[index]);
  const cut = own.slice(0, shared === -1 ? own.length : shared).search(/[^./]*$/u);
  return own.slice(cut);
}

function holeText(node, other) {
  if (node.kind === 'none') {
    return 'nothing';
  }
  if (node.kind === 'literal' || node.kind === 'type') {
    return shortText(node.value, SHOWN_TEXT);
  }
  if (node.kind === 'name' && node.text === other.text) {
    return withoutSharedPrefix(node.value, other.value);
  }
  return node.text === undefined
    ? `the ${node.kind} on line ${String(node.start)}`
    : shortText(node.text, SHOWN_TEXT);
}

function holeList(parameters, side) {
  return listNames(
    parameters.map((parameter) => {
      const [here, there] = side === 0 ? [parameter.a, parameter.b] : [parameter.b, parameter.a];
      return `${holeText(here, there)} / ${holeText(there, here)}`;
    }),
  );
}

function lines({ start, end }) {
  return start === end ? String(start) : `${String(start)}-${String(end)}`;
}

function differenceOf(finding, [here, other]) {
  if (finding.verdict === 'same') {
    return SAME_DIFFERENCES[finding.proof ?? 'names'];
  }
  if (finding.verdict === 'parameterizable') {
    const count = finding.parameters.length;
    return `apart from ${String(count)} ${count === 1 ? 'value' : 'values'} (${holeList(finding.parameters, here.side)})`;
  }
  return `in lines ${lines(finding.run[here.side])} here and ${lines(finding.run[other.side])} there`;
}

function sides(finding, units) {
  const located = finding.units.map((id, side) => ({ ...units.get(id), side }));
  return located.toSorted((left, right) => compareText(unitIdOf(right), unitIdOf(left)));
}

function isNormalizedByCloneAnalyzer(node) {
  return (
    node.children.length === 0 &&
    (node.kind === 'name' || (node.kind === 'literal' && NORMALIZED_LITERALS.has(node.literal)))
  );
}

function hasCloneTokens(finding) {
  return (
    finding.verdict === 'same' ||
    (finding.verdict === 'parameterizable' &&
      finding.parameters.every(
        ({ a, b }) => isNormalizedByCloneAnalyzer(a) && isNormalizedByCloneAnalyzer(b),
      ))
  );
}

function isLeftToCloneAnalyzer(finding, pair) {
  return (
    hasCloneTokens(finding) &&
    !finding.rewritten &&
    pair.every(
      ({ start, end, tokens }) =>
        end - start + 1 >= CLONE_ANALYZER_MINIMUM.lines && tokens >= CLONE_ANALYZER_MINIMUM.tokens,
    )
  );
}

function nearDuplicateFinding(finding, { pair, analyzerName }) {
  const [here, other] = pair;
  const run = finding.run === undefined ? undefined : lines(finding.run[here.side]);
  return reuseFinding(analyzerName, {
    key: 'nearDuplicate',
    path: here.file,
    identity: `near-duplicate:${pair.map(unitIdOf).toSorted(compareText).join('|')}`,
    symbol: here.name,
    line: here.start,
    values: {
      name: here.name,
      other: `${other.name} (${other.file}:${String(other.start)})`,
      difference: differenceOf(finding, pair),
      fix: FIXES[finding.verdict].replace('{run}', run),
    },
  });
}

export function nearDuplicateFindings(units, { analyzerName, isExcepted }) {
  const byId = new Map(units.map((unit) => [unitIdOf(unit), unit]));
  const rule = RULE_IDS.nearDuplicate;
  return findNearDuplicates(units.map((unit) => ({ ...unit, id: unitIdOf(unit) })))
    .map((finding) => ({ finding, pair: sides(finding, byId) }))
    .filter(({ finding, pair }) => !isLeftToCloneAnalyzer(finding, pair))
    .filter(({ finding, pair }) => !isTypeSpecialized(finding, pair))
    .filter(({ pair }) => !isPlatformVariant(pair))
    .filter(({ pair }) => !pair.some(({ file }) => isExcepted(rule, file)))
    .map(({ finding, pair }) => nearDuplicateFinding(finding, { pair, analyzerName }));
}

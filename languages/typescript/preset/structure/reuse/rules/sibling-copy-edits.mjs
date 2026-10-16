import { RULE_IDS } from '../../../../../../shared/policy.mjs';
import { listPaths, reuseFinding } from '../finding.mjs';
import { isNearCopy } from '../syntax/token-similarity.mjs';

const KINDS = new Set(['function', 'class']);
const MINIMUM_TOKENS = 20;
const MINIMUM_SIMILARITY = 0.8;

function copyGroups(facts, isExcepted) {
  const groups = new Map();
  for (const { path: filePath, packageRoot, definitions } of facts) {
    const comparable = isExcepted(RULE_IDS.siblingCopyEdit, filePath)
      ? []
      : definitions.filter(
          ({ kind, tokens }) => KINDS.has(kind) && tokens.length >= MINIMUM_TOKENS,
        );
    for (const definition of comparable) {
      const key = `${packageRoot}\0${definition.kind}\0${definition.name}`;
      const group = groups.get(key) ?? [];
      groups.set(key, [...group, { path: filePath, definition }]);
    }
  }
  return [...groups.values()].filter((copies) => new Set(copies.map(({ path }) => path)).size >= 2);
}

function nearCopiesOf(copy, copies) {
  return copies.filter(
    (other) =>
      other.path !== copy.path &&
      isNearCopy(copy.definition.tokens, other.definition.tokens, MINIMUM_SIMILARITY),
  );
}

function baseDefinitionReader(definitionsAt) {
  const known = new Map();
  return ({ path, definition }) => {
    if (!known.has(path)) known.set(path, definitionsAt(path));
    return known
      .get(path)
      .find(({ kind, name }) => kind === definition.kind && name === definition.name);
  };
}

function isEdited(copy, baseDefinitionOf) {
  const before = baseDefinitionOf(copy);
  return before !== undefined && before.text !== copy.definition.text;
}

function isUntouched(copy, baseDefinitionOf) {
  return baseDefinitionOf(copy)?.text === copy.definition.text;
}

function editFinding({ copy, untouched, analyzerName }) {
  const { name, line } = copy.definition;
  return reuseFinding(analyzerName, {
    key: 'siblingCopyEdit',
    path: copy.path,
    identity: `sibling-copy:${name}`,
    symbol: name,
    line,
    values: { name, others: listPaths(untouched.map(({ path }) => path).toSorted()) },
  });
}

function groupFindings({ copies, baseDefinitionOf, analyzerName }) {
  return copies
    .filter((copy) => isEdited(copy, baseDefinitionOf))
    .map((copy) => ({
      copy,
      untouched: nearCopiesOf(copy, copies).filter((other) => isUntouched(other, baseDefinitionOf)),
    }))
    .filter(({ untouched }) => untouched.length > 0)
    .map(({ copy, untouched }) => editFinding({ copy, untouched, analyzerName }));
}

export function siblingCopyEditFindings(facts, { analyzerName, isExcepted, baselineDefinitions }) {
  if (baselineDefinitions === undefined) return [];
  const baseDefinitionOf = baseDefinitionReader(baselineDefinitions);
  return copyGroups(facts, isExcepted).flatMap((copies) =>
    groupFindings({ copies, baseDefinitionOf, analyzerName }),
  );
}

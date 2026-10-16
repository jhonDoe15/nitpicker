import { RULE_IDS } from '../../policy.mjs';
import { copyGroups } from './copy-groups.mjs';
import { listPaths, reuseFinding } from './reuse-finding.mjs';

const SAME = {
  const: 'the same value',
  function: 'the same code',
  type: 'the same shape',
  interface: 'the same shape',
};
const FIX = {
  exported: 'Keep one definition and import it.',
  private: 'Move it to one module and import it.',
};
const DUPLICATES_ANALYZER_MINIMUM = { lines: 5, tokens: 50 };

function isLargeEnoughForDuplicatesAnalyzer({ lines, size }) {
  return lines >= DUPLICATES_ANALYZER_MINIMUM.lines && size >= DUPLICATES_ANALYZER_MINIMUM.tokens;
}

function isShared({ kind, literal, exported }) {
  return exported && (kind === 'type' || kind === 'interface' || (kind === 'const' && literal));
}

function isComparable(definition) {
  const comparesByText = definition.kind === 'function' || isShared(definition);
  return definition.used && comparesByText && !isLargeEnoughForDuplicatesAnalyzer(definition);
}

function fixFor(exported, otherCopies) {
  const [exportedOther] = otherCopies
    .filter(({ definition }) => definition.exported)
    .map(({ path: other }) => other)
    .toSorted();
  if (exported) return FIX.exported;
  return exportedOther === undefined ? FIX.private : `Import it from ${exportedOther} instead.`;
}

function copyFinding({ copy, copies, analyzerName }) {
  const { name, kind, line, exported } = copy.definition;
  const otherCopies = copies.filter(({ path: other }) => other !== copy.path);
  const others = otherCopies.map(({ path: p }) => p).toSorted();
  return reuseFinding(analyzerName, {
    key: 'duplicateDefinition',
    path: copy.path,
    identity: `duplicate:${name}`,
    symbol: name,
    line,
    values: {
      name,
      same: SAME[kind],
      others: listPaths(others),
      fix: fixFor(exported, otherCopies),
    },
  });
}

export function duplicateDefinitionFindings(facts, { analyzerName, isExcepted }) {
  return copyGroups(facts, {
    rule: RULE_IDS.duplicateDefinition,
    isExcepted,
    isComparable,
    keyOf: ({ kind, name, key }) => `${kind}\0${name}\0${key}`,
  }).flatMap((copies) => copies.map((copy) => copyFinding({ copy, copies, analyzerName })));
}

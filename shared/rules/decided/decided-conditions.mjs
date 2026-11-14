import { decidedConditions } from './decided.mjs';
import { labelParts } from '../../near-duplicates/proof/inline.mjs';
import { predicateTable, withPredicates } from './predicate-reading/predicates.mjs';
import { getterTable, gettersOfFile } from './models/getters.mjs';
import { modelledTree } from './models/annotate.mjs';
import { declaredTypes } from './models/types.mjs';
import { goTypedTree } from './widths/go-typed-tree.mjs';
import { typedTree } from './widths/typed-tree.mjs';
import { RULE_IDS } from '../../policy.mjs';
import { reuseFinding } from '../reuse/reuse-finding.mjs';

const OUTCOMES = {
  true: { consequence: '', fix: 'Remove the check, or fix the condition that was meant.' },
  false: {
    consequence: ', so the code it guards never runs',
    fix: 'Remove it, or fix the condition that was meant.',
  },
  operand: { consequence: '', fix: 'Remove the operand, or fix the condition that was meant.' },
};

function isJvm(file) {
  return file.endsWith('.java') || file.endsWith('.kt');
}

/** The tree of `unit` with helpers inlined, value models annotated and, for JVM and Go, integer widths. */
export function modelledUnit(unit, shared) {
  const getters = shared.getters;
  const scope = {
    types: declaredTypes(unit.tree),
    getters: gettersOfFile(getters, unit.file),
    owner: /^(?<owner>[\w$]+)\./u.exec(unit.name)?.groups.owner,
    python: unit.file.endsWith('.py'),
    kotlin: unit.file.endsWith('.kt'),
    go: unit.file.endsWith('.go'),
    resolver:
      unit.imports === undefined
        ? undefined
        : { imports: unit.imports, classes: shared.classes, kotlin: unit.file.endsWith('.kt') },
  };
  const modelledOnes = modelledTree(
    withPredicates(unit.tree, { table: shared.helpers, unit }),
    scope,
  );
  if (scope.python) {
    return modelledOnes;
  }
  return scope.go ? goTypedTree(modelledOnes, scope) : typedTree(modelledOnes, scope);
}

function topLevelKotlinNames(units) {
  return new Set(
    units
      .filter((unit) => unit.file.endsWith('.kt'))
      .map((unit) => labelParts(unit.name))
      .filter((parts) => parts?.owner === '')
      .map(({ name }) => name),
  );
}

function unitFindings(unit, analyzerName, shared) {
  const seen = new Map();
  const tree = modelledUnit(unit, shared);
  return decidedConditions(tree, {
    looseBooleans: unit.file.endsWith('.py'),
    kotlin: unit.file.endsWith('.kt'),
    references: isJvm(unit.file),
    unbounded: unit.file.endsWith('.py'),
    defined: shared.defined,
  }).map(({ node, verdict, part, reason }) => {
    const condition = node.text ?? `the condition on line ${String(node.start)}`;
    const base = `${unit.file}#${unit.name}:${verdict}:${condition}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return reuseFinding(analyzerName, {
      key: 'decidedCondition',
      path: unit.file,
      identity: `decided-condition:${base}#${String(count)}`,
      symbol: unit.name,
      line: node.start,
      values: { condition, verdict, reason, ...OUTCOMES[part === 'operand' ? part : verdict] },
    });
  });
}

export function sharedTables(units) {
  return {
    getters: getterTable(units),
    helpers: predicateTable(units),
    defined: topLevelKotlinNames(units),
    classes: new Set(units.flatMap((unit) => unit.imports?.classes ?? [])),
  };
}

export function decidedConditionFindings(units, { analyzerName, isExcepted }) {
  const shared = sharedTables(units);
  return units
    .filter((unit) => unit.tree?.kind === 'function')
    .filter((unit) => !isExcepted(RULE_IDS.decidedCondition, unit.file))
    .flatMap((unit) => unitFindings(unit, analyzerName, shared));
}

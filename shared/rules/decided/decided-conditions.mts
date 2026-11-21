import { decidedConditions } from './decided.mts';
import { labelParts } from '../../near-duplicates/proof/inline.mts';
import { predicateTable, withPredicates } from './predicate-reading/predicates.mts';
import { getterTable, gettersOfFile } from './models/getters.mts';
import { modelledTree } from './models/annotate.mts';
import { declaredTypes } from './models/types.mts';
import { goTypedTree } from './widths/go-typed-tree.mts';
import { typedTree } from './widths/typed-tree.mts';
import { RULE_IDS } from '../../policy.mts';
import { reuseFinding } from '../reuse/reuse-finding.mts';
import { settledAhead } from '../../logic/sync/decide-sync.mts';
import { present } from '../../near-duplicates/tree/nodes.mts';
import type { Finding } from '../../values/findings.mts';
import type {
  DecidedUnit,
  FlowNode,
  ModelScope,
  RuleContext,
  SharedTables,
} from './typed/decided-types.mts';

const OUTCOMES: Readonly<Record<string, { consequence: string; fix: string }>> = {
  true: { consequence: '', fix: 'Remove the check, or fix the condition that was meant.' },
  false: {
    consequence: ', so the code it guards never runs',
    fix: 'Remove it, or fix the condition that was meant.',
  },
  value: {
    consequence: '',
    fix: 'Write the constant (`true` or `false`), or fix the test that was meant.',
  },
  operand: { consequence: '', fix: 'Remove the operand, or fix the condition that was meant.' },
};

function isJvm(file: string): boolean {
  return file.endsWith('.java') || file.endsWith('.kt');
}

export function modelledUnit(unit: DecidedUnit, shared: SharedTables): FlowNode {
  const getters = shared.getters;
  const tree = present(unit.tree);
  const scope: ModelScope = {
    types: declaredTypes(tree),
    getters: gettersOfFile(getters, unit.file),
    owner: /^(?<owner>[\w$]+)\./u.exec(unit.name)?.groups?.['owner'],
    python: unit.file.endsWith('.py'),
    kotlin: unit.file.endsWith('.kt'),
    go: unit.file.endsWith('.go'),
    resolver:
      unit.imports === undefined
        ? undefined
        : { imports: unit.imports, classes: shared.classes, kotlin: unit.file.endsWith('.kt') },
  };
  const modelledOnes = modelledTree(withPredicates(tree, { table: shared.helpers, unit }), scope);
  if (scope.python) {
    return modelledOnes;
  }
  return scope.go ? goTypedTree(modelledOnes, scope) : typedTree(modelledOnes, scope);
}

function topLevelKotlinNames(units: readonly DecidedUnit[]): Set<string> {
  return new Set(
    units
      .filter((unit) => unit.file.endsWith('.kt'))
      .map((unit) => labelParts(unit.name))
      .flatMap((parts) => (parts?.owner === '' ? [parts.name] : [])),
  );
}

function unitFindings(unit: DecidedUnit, analyzerName: string, shared: SharedTables): Finding[] {
  const seen = new Map<string, number>();
  const tree = modelledUnit(unit, shared);
  return decidedConditions(tree, {
    looseBooleans: unit.file.endsWith('.py'),
    kotlin: unit.file.endsWith('.kt'),
    references: isJvm(unit.file),
    unbounded: unit.file.endsWith('.py'),
    go: false,
    remainders: false,
    slipsOnly: false,
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
      values: { condition, verdict, reason, ...OUTCOMES[part === 'condition' ? verdict : part] },
    });
  });
}

export function sharedTables(units: readonly DecidedUnit[]): SharedTables {
  return {
    getters: getterTable(units),
    helpers: predicateTable(units),
    defined: topLevelKotlinNames(units),
    classes: new Set(units.flatMap((unit) => unit.imports?.classes ?? [])),
  };
}

export function decidedConditionFindings(
  units: readonly DecidedUnit[],
  { analyzerName, isExcepted }: RuleContext,
): Finding[] {
  const shared = sharedTables(units);
  return units
    .filter((unit) => unit.tree.kind === 'function')
    .filter((unit) => !isExcepted(RULE_IDS.decidedCondition, unit.file))
    .flatMap((unit) => settledAhead(unit, () => unitFindings(unit, analyzerName, shared)));
}

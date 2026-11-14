import { decidingFact, relevantFacts, solveFacts } from '../../logic/sync/solve-facts.mjs';
import { key } from '../../logic/terms.mjs';
import { isIntegerType } from '../../near-duplicates/proof/terms.mjs';
import { nodesOf } from '../../near-duplicates/tree/nodes.mjs';
import { depthFirst } from '../../traversal.mjs';
import { afterEffects, conditionTerm, effectsOf, fact, mutableNames, namesOf } from './facts.mjs';
import { conditionChecks } from './flow.mjs';
import { enumConstants } from './flow/arms/arms.mjs';
import { withValueEquality } from './flow/values/equals.mjs';
import { isIntegerLoop } from './flow/loops.mjs';
import { lambdaStatements } from './flow/nested.mjs';
import { sitesIn } from './flow/sites.mjs';
import { declaredTypes, stableNames } from './flow/stability.mjs';

const CHAINS = new Set(['&&', '||']);
const DECLARING = new Set(['parameter', 'declare', 'foreach']);
const MAX_CHECKS = 200;
const VERDICTS = new Set(['true', 'false']);
const TOGETHER = 'the conditions before it decide it together';

function reasonFor(facts, query, verdict) {
  return decidingFact(facts, query, verdict)?.reason ?? TOGETHER;
}

function chainOperands(chain) {
  return [
    ...depthFirst(chain, (node) =>
      node.kind === 'binary' && node.value === chain.value ? node.children : [],
    ),
  ].filter((node) => node.kind !== 'binary' || node.value !== chain.value);
}

function isChain(node) {
  return node.kind === 'binary' && CHAINS.has(node.value);
}

function armFacts(scan, earlier = []) {
  let facts = [];
  for (const arm of earlier) {
    const reason = `an earlier arm takes \`${arm.text ?? 'its condition'}\` (line ${String(arm.start)})`;
    const known = fact(arm, scan.scope, { holds: false, reason });
    const effects = effectsOf([arm], scan.flow);
    facts = afterEffects(
      [...facts, ...(known === undefined ? [] : [known])],
      effects,
      scan.flow.mutable,
    );
  }
  return facts;
}

function check(scan, node, { facts, part = 'condition' }) {
  const query = conditionTerm(node, scan.scope);
  if (query === undefined || scan.checked.has(node) || scan.checked.size >= MAX_CHECKS) {
    return false;
  }
  const known = relevantFacts(facts, namesOf(node));
  if (known.length === 0) {
    return false;
  }
  scan.checked.add(node);
  const verdict = solveFacts(
    known.map(({ term }) => term),
    query,
  );
  if (!VERDICTS.has(verdict)) {
    return false;
  }
  scan.found.push({ node, verdict, part, reason: reasonFor(known, query, verdict) });
  return true;
}

function operandFact(scan, chain, operand) {
  const reason = `\`${operand.text ?? 'the operand before it'}\` comes first in the same \`${chain.value}\``;
  const known = fact(operand, scan.scope, { holds: chain.value === '&&', reason });
  return known === undefined ? [] : [known];
}

function checkChain(scan, node, facts) {
  if (check(scan, node, { facts }) || !isChain(node)) {
    return;
  }
  let left = [];
  const repeated = new Set();
  for (const operand of chainOperands(node)) {
    const operandKey = key(conditionTerm(operand, scan.scope) ?? { kind: 'none', children: [] });
    if (!repeated.has(operandKey)) {
      check(scan, operand, { facts: [...facts, ...left], part: 'operand' });
    }
    repeated.add(operandKey);
    const effects = effectsOf([operand], scan.flow);
    left = afterEffects([...left, ...operandFact(scan, node, operand)], effects, scan.flow.mutable);
  }
}

function integerNames(tree) {
  const declared = nodesOf(tree).filter(
    (node) => DECLARING.has(node.kind) && node.children[1]?.kind === 'name',
  );
  const other = new Set(
    declared
      .filter((node) => !isIntegerType(node.children[0]) && !isIntegerLoop(node))
      .map((node) => node.children[1].value),
  );
  return new Set(declared.map((node) => node.children[1].value).filter((name) => !other.has(name)));
}

function unitChecks(tree, flow) {
  const root = tree.children.find((child) => child.kind === 'block');
  const checks = conditionChecks(root?.children ?? [], flow);
  for (const lambda of nodesOf(tree).filter((node) => node.kind === 'lambda')) {
    if (!flow.seen.has(lambda)) {
      flow.seen.add(lambda);
      checks.push(...conditionChecks(lambdaStatements(lambda), flow));
    }
  }
  return checks;
}

/**
 * The conditions of one unit tree that the guards before them decide: `{ node, verdict, reason }`
 * with verdict 'true' (a redundant check) or 'false' (dead code), proved by the solver. A name
 * counts as an integer only when every declaration of it in the unit has an integer type.
 * `looseBooleans` (Python, where `True == 1`) leaves `==` against a boolean undecided.
 */
export function decidedConditions(source, { looseBooleans = false } = {}) {
  const types = declaredTypes(source);
  const scope = {
    integers: integerNames(source),
    looseBooleans,
    types,
    enums: enumConstants(source, types),
  };
  const tree = withValueEquality(source, scope);
  const stable = stableNames(tree);
  const mutable = new Set([...mutableNames(tree)].filter((name) => !stable.has(name)));
  const flow = { scope, mutable, effects: new WeakMap(), stable, seen: new WeakSet() };
  const scan = { scope, flow, found: [], checked: new Set() };
  for (const found of unitChecks(tree, flow)) {
    const sites =
      found.condition === undefined
        ? sitesIn(found.expression, flow)
        : [{ node: found.condition, extra: [] }];
    for (const site of sites) {
      const known = [...found.facts, ...armFacts(scan, site.earlier), ...site.extra];
      checkChain(scan, site.node, known);
    }
  }
  return scan.found.toSorted((left, right) => left.node.start - right.node.start);
}

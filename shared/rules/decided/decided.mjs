import { decidingFactWithin, relevantFacts, solveFacts } from '../../logic/sync/solve-facts.mjs';
import { solverBudget } from '../../logic/sync/budget.mjs';
import { hasModels } from '../../logic/models/models.mjs';
import { key } from '../../logic/terms.mjs';
import { isIntegerType } from '../../near-duplicates/proof/terms.mjs';
import { nodesOf } from '../../near-duplicates/tree/nodes.mjs';
import { depthFirst } from '../../traversal.mjs';
import { coercionSites } from './coercions.mjs';
import {
  afterEffects,
  conditionTerm,
  effectsOf,
  fact,
  mutableNames,
  namesOf,
  writtenNames,
} from './facts.mjs';
import { conditionChecks } from './flow.mjs';
import { enumConstants } from './flow/arms/arms.mjs';
import { withValueEquality } from './flow/values/equals.mjs';
import { isIntegerLoop } from './flow/loops.mjs';
import { lambdaStatements } from './flow/nested.mjs';
import { isChain, sitesIn } from './flow/sites.mjs';
import { stableNames } from './flow/stability.mjs';
import { declaredTypes } from './models/types.mjs';
import { shadowedNames } from './predicate-reading/shadowing.mjs';
import { helperNote } from '../../logic/models/helper-note.mjs';
import { probeSlips } from './slips/probe.mjs';

const DECLARING = new Set(['parameter', 'declare', 'foreach']);
const MAX_CHECKS = 200;
const VERDICTS = new Set(['true', 'false']);
const TOGETHER = 'the conditions before it decide it together';

function reasonFor(facts, query, { verdict, solver }) {
  const deciding = decidingFactWithin(solver, { facts, query, verdict });
  const terms = deciding?.term === undefined ? [query] : [query, deciding.term];
  return `${deciding?.reason ?? TOGETHER}${helperNote(terms)}`;
}

function chainOperands(chain) {
  return [
    ...depthFirst(chain, (node) =>
      node.kind === 'binary' && node.value === chain.value ? node.children : [],
    ),
  ].filter((node) => node.kind !== 'binary' || node.value !== chain.value);
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

function provingFacts(known, query, { verdict, solver }) {
  const own = known.filter(({ assertion }) => !assertion);
  if (own.length === known.length) {
    return known;
  }
  const alone = solveFacts(
    own.map(({ term }) => term),
    query,
    solver,
  );
  if (alone === verdict) {
    return own;
  }
  return verdict === 'false' ? undefined : known;
}

function collectSlips(scan, root, facts) {
  if (scan.slipsOnly) {
    scan.slips.push(...probeSlips(scan, root, relevantFacts(facts, namesOf(root))));
  }
}

function decide(scan, node, { facts, part, query }) {
  const seen = part === 'value' ? scan.coerced : scan.checked;
  const isReported = scan.found.some((reported) => reported.node === node);
  if (query === undefined || seen.has(node) || isReported || seen.size >= MAX_CHECKS) {
    return undefined;
  }
  const known = relevantFacts(facts, namesOf(node));
  if (known.length === 0 && !hasModels([query])) {
    return undefined;
  }
  seen.add(node);
  const verdict = solveFacts(
    known.map(({ term }) => term),
    query,
    scan.solver,
  );
  const basis = VERDICTS.has(verdict)
    ? provingFacts(known, query, { verdict, solver: scan.solver })
    : undefined;
  return basis === undefined ? undefined : { verdict, basis, query };
}

function conditionQuery(scan, node) {
  return node.viaHelper ? undefined : conditionTerm(node, scan.scope);
}

function check(scan, node, { facts, part = 'condition', query = conditionQuery(scan, node) }) {
  if (part !== 'value') {
    collectSlips(scan, node, facts);
  }
  const decision = scan.slipsOnly ? undefined : decide(scan, node, { facts, part, query });
  if (decision === undefined) {
    return false;
  }
  const { verdict, basis } = decision;
  scan.found.push({
    node,
    verdict,
    part,
    reason: reasonFor(basis, query, { verdict, solver: scan.solver }),
  });
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

function checkCoercions(scan, root, facts) {
  if (scan.slipsOnly || root === undefined) {
    return;
  }
  for (const site of coercionSites(root, scan.scope)) {
    check(scan, site.node, { facts: [...facts, ...site.facts], part: 'value', query: site.query });
  }
}

export function integerNames(tree) {
  const declared = nodesOf(tree).filter(
    (node) => DECLARING.has(node.kind) && node.children[1]?.kind === 'name',
  );
  const other = new Set(
    declared
      .filter((node) => !(isIntegerType(node.children[0]) || isIntegerLoop(node)))
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

function parametersOf(tree) {
  const nodes = nodesOf(tree);
  const reassigned = new Set(
    nodes.filter(({ kind }) => kind === 'assign' || kind === 'update').flatMap(writtenNames),
  );
  return new Set(
    nodes
      .filter((node) => node.kind === 'parameter' && node.children[1]?.kind === 'name')
      .map((node) => node.children[1].value)
      .filter((name) => !reassigned.has(name)),
  );
}

function scopeOf(source, options) {
  const { looseBooleans = false, unbounded = false, kotlin = false } = options;
  const types = declaredTypes(source);
  return {
    integers: integerNames(source),
    looseBooleans,
    unbounded,
    kotlin,
    references: options.references === true,
    shadowed: new Set([...shadowedNames(source), ...(options.defined ?? [])]),
    go: options.go === true,
    remainders: options.remainders === true,
    types,
    enums: enumConstants(source, types),
  };
}

function flowOf(tree, scope) {
  const stable = stableNames(tree);
  const mutable = new Set([...mutableNames(tree)].filter((name) => !stable.has(name)));
  return { scope, mutable, effects: new WeakMap(), stable, seen: new WeakSet() };
}

/**
 * The conditions of one unit tree that the guards before them decide: `{ node, verdict, reason }`
 * with verdict 'true' (a redundant check) or 'false' (dead code), proved by the solver. A name
 * counts as an integer only when every declaration of it in the unit has an integer type.
 * `looseBooleans` (Python, where `True == 1`) leaves `==` against a boolean undecided.
 */
export function decidedConditions(source, options = {}) {
  const scope = scopeOf(source, options);
  const tree = withValueEquality(source, scope);
  const flow = flowOf(tree, scope);
  const scan = {
    scope,
    flow,
    unitName: options.unitName ?? '',
    found: [],
    slips: [],
    probed: new Set(),
    checked: new Set(),
    coerced: new Set(),
    slipsOnly: options.slipsOnly === true,
    solver: options.solver ?? solverBudget(),
    parameters: parametersOf(tree),
  };
  for (const found of unitChecks(tree, flow)) {
    if (found.expression !== undefined) {
      collectSlips(scan, found.expression, found.facts);
    }
    const sites =
      found.condition === undefined
        ? sitesIn(found.expression, flow)
        : [{ node: found.condition, extra: [] }];
    for (const site of sites) {
      const known = [...found.facts, ...armFacts(scan, site.earlier), ...site.extra];
      checkChain(scan, site.node, known);
    }
    checkCoercions(scan, found.condition ?? found.expression, found.facts);
  }
  const reported = scan.slipsOnly ? scan.slips : scan.found;
  return reported.toSorted((left, right) => left.node.start - right.node.start);
}

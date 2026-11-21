import type { SolverBudget } from '../../logic/typed/solver-types.mts';
import { memo } from './typed/memo.mts';
import { decidingFactWithin, relevantFacts, solveFacts } from '../../logic/sync/solve-facts.mts';
import { solverBudget } from '../../logic/sync/budget.mts';
import { hasModels } from '../../logic/models/models.mts';
import { key } from '../../logic/terms.mts';
import { nodesOf, present } from '../../near-duplicates/tree/nodes.mts';
import { depthFirst } from '../../traversal.mts';
import { coercionSites } from './coercions.mts';
import { afterEffects, conditionTerm, effectsOf, fact, mutableNames, namesOf } from './facts.mts';
import { conditionChecks } from './flow.mts';
import { enumConstants } from './flow/arms/arms.mts';
import { withValueEquality } from './flow/values/equals.mts';
import { lambdaStatements } from './flow/nested.mts';
import { isChain, sitesIn } from './flow/sites.mts';
import { stableNames } from './flow/stability.mts';
import { declaredTypes } from './models/types.mts';
import { shadowedNames } from './predicate-reading/shadowing.mts';
import { helperNote } from '../../logic/models/helper-note.mts';
import { integerNames, parametersOf } from './slips/declared-names.mts';
import { probeSlips } from './slips/probe.mts';
import { appendAll } from '../../lists/lists.mts';
import { numberOr } from '../../values/readers.mts';
import type { Term, Verdict } from '../../logic/typed/term-types.mts';
import type {
  Check,
  DecidedOptions,
  Fact,
  Flow,
  FlowNode,
  FlowScope,
  Found,
  Scan,
  Slip,
} from './typed/decided-types.mts';

type Reported = Found | Slip;
type Decision = {
  readonly verdict: Verdict;
  readonly basis: readonly Fact[];
  readonly query: Term;
};
type CheckOptions = {
  readonly facts: readonly Fact[];
  readonly part?: string;
  readonly query?: Term | undefined;
};
type Proof = { readonly verdict: Verdict; readonly solver: SolverBudget };

const MAX_CHECKS = 200;
const VALUE_PART = 'value';
const NO_TERM: Term = { kind: 'none', value: undefined, children: [], range: undefined };

function isDecided(value: unknown): value is 'true' | 'false' {
  return value === 'true' || value === 'false';
}
const TOGETHER = 'the conditions before it decide it together';

function reasonFor(facts: readonly Fact[], query: Term, { verdict, solver }: Proof): string {
  const deciding = decidingFactWithin(solver, { facts, query, verdict });
  const decidingTerm = deciding !== undefined && 'term' in deciding ? deciding.term : undefined;
  const terms = decidingTerm === undefined ? [query] : [query, decidingTerm];
  return `${deciding?.reason ?? TOGETHER}${helperNote(terms)}`;
}

function chainOperands(chain: FlowNode): FlowNode[] {
  return [
    ...depthFirst(chain, (node: FlowNode) =>
      node.kind === 'binary' && node.value === chain.value ? node.children : [],
    ),
  ].filter((node) => node.kind !== 'binary' || node.value !== chain.value);
}

function armFacts(scan: Scan, earlier: readonly FlowNode[] = []): Fact[] {
  let facts: Fact[] = [];
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

function provingFacts(
  known: readonly Fact[],
  query: Term,
  { verdict, solver }: Proof,
): readonly Fact[] | undefined {
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

function collectSlips(scan: Scan, root: FlowNode, facts: readonly Fact[]): void {
  if (scan.slipsOnly) {
    appendAll(scan.slips, probeSlips(scan, root, relevantFacts(facts, namesOf(root))));
  }
}

function decide(
  scan: Scan,
  node: FlowNode,
  {
    facts,
    part,
    query,
  }: { readonly facts: readonly Fact[]; readonly part: string; readonly query: Term | undefined },
): Decision | undefined {
  const seen = part === VALUE_PART ? scan.coerced : scan.checked;
  const isReported = scan.found.some((reported) => reported.node === node);
  if (query === undefined || seen.has(node) || isReported || seen.size >= MAX_CHECKS) {
    return undefined;
  }
  const known = relevantFacts(facts, namesOf(node));
  if (known.length === 0 && !hasModels([query])) {
    return undefined;
  }
  seen.add(node);
  const verdict: unknown = solveFacts(
    known.map(({ term }: Fact) => term),
    query,
    scan.solver,
  );
  if (!isDecided(verdict)) {
    return undefined;
  }
  const basis = provingFacts(known, query, { verdict, solver: scan.solver });
  return basis === undefined ? undefined : { verdict, basis, query };
}

function conditionQuery(scan: Scan, node: FlowNode): Term | undefined {
  return node.viaHelper ? undefined : conditionTerm(node, scan.scope);
}

function check(
  scan: Scan,
  node: FlowNode,
  { facts, part = 'condition', query = conditionQuery(scan, node) }: CheckOptions,
): boolean {
  if (part !== VALUE_PART) {
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
    reason: reasonFor(basis, decision.query, { verdict, solver: scan.solver }),
  });
  return true;
}

function operandFact(scan: Scan, chain: FlowNode, operand: FlowNode): Fact[] {
  const reason = `\`${operand.text ?? 'the operand before it'}\` comes first in the same \`${String(chain.value)}\``;
  const known = fact(operand, scan.scope, { holds: chain.value === '&&', reason });
  return known === undefined ? [] : [known];
}

function checkChain(scan: Scan, node: FlowNode, facts: readonly Fact[]): void {
  if (check(scan, node, { facts }) || !isChain(node)) {
    return;
  }
  let left: Fact[] = [];
  const repeated = new Set<string>();
  for (const operand of chainOperands(node)) {
    const operandKey = key(conditionTerm(operand, scan.scope) ?? NO_TERM);
    if (!repeated.has(operandKey)) {
      check(scan, operand, { facts: [...facts, ...left], part: 'operand' });
    }
    repeated.add(operandKey);
    const effects = effectsOf([operand], scan.flow);
    left = afterEffects([...left, ...operandFact(scan, node, operand)], effects, scan.flow.mutable);
  }
}

function checkCoercions(scan: Scan, root: FlowNode | undefined, facts: readonly Fact[]): void {
  if (scan.slipsOnly || root === undefined) {
    return;
  }
  for (const site of coercionSites(root, scan.scope)) {
    check(scan, site.node, {
      facts: [...facts, ...site.facts],
      part: VALUE_PART,
      query: site.query,
    });
  }
}

function unitChecks(tree: FlowNode, flow: Flow): Check[] {
  const root = tree.children.find((child) => child.kind === 'block');
  const checks = conditionChecks(root?.children ?? [], flow);
  for (const lambda of nodesOf(tree).filter((node) => node.kind === 'lambda')) {
    if (!flow.seen.has(lambda)) {
      flow.seen.add(lambda);
      appendAll(checks, conditionChecks(lambdaStatements(lambda), flow));
    }
  }
  return checks;
}

function scopeOf(source: FlowNode, options: DecidedOptions): FlowScope {
  const types = declaredTypes(source);
  return {
    integers: integerNames(source),
    looseBooleans: options.looseBooleans,
    unbounded: options.unbounded,
    kotlin: options.kotlin,
    references: options.references,
    shadowed: new Set([...shadowedNames(source), ...(options.defined ?? [])]),
    go: options.go,
    remainders: options.remainders,
    types,
    enums: enumConstants(source, types),
  };
}

function flowOf(tree: FlowNode, scope: FlowScope): Flow {
  const stable = stableNames(tree);
  const mutable = new Set([...mutableNames(tree)].filter((name) => !stable.has(name)));
  return { scope, mutable, effects: memo(), views: memo(), stable, seen: new WeakSet() };
}

export function decidedConditions(
  source: FlowNode,
  options: DecidedOptions & { readonly slipsOnly: true },
): Slip[];
export function decidedConditions(source: FlowNode, options: DecidedOptions): Found[];
export function decidedConditions(source: FlowNode, options: DecidedOptions): Reported[] {
  const scope = scopeOf(source, options);
  const tree = withValueEquality(source, scope);
  const flow = flowOf(tree, scope);
  const scan: Scan = {
    scope,
    flow,
    unitName: options.unitName ?? '',
    found: [],
    slips: [],
    probed: memo(),
    checked: new Set(),
    coerced: new Set(),
    slipsOnly: options.slipsOnly,
    solver: options.solver ?? solverBudget(),
    parameters: parametersOf(tree),
  };
  for (const found of unitChecks(tree, flow)) {
    if (found.expression !== undefined) {
      collectSlips(scan, found.expression, found.facts);
    }
    const sites =
      found.condition === undefined
        ? sitesIn(present(found.expression), flow)
        : [{ node: found.condition, extra: [] }];
    for (const site of sites) {
      const known = [...found.facts, ...armFacts(scan, site.earlier), ...site.extra];
      checkChain(scan, site.node, known);
    }
    checkCoercions(scan, found.condition ?? found.expression, found.facts);
  }
  const reported: Reported[] = scan.slipsOnly ? scan.slips : scan.found;
  return reported.toSorted(
    (left, right) => numberOr(left.node.start, Number.NaN) - numberOr(right.node.start, Number.NaN),
  );
}

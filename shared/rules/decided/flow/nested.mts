import { categoryOf, placed } from '../../../near-duplicates/tree/nodes.mts';
import { armFlow, isSwitchLike } from './arms/arms.mts';
import { declaredNames } from './stability.mts';
import { appendAll } from '../../../lists/lists.mts';
import type { Check, Fact, Flow, FlowChild, FlowNode } from '../typed/decided-types.mts';

type Found = { readonly children: FlowChild[]; readonly checks: Check[] };
type Context = {
  readonly before: readonly Fact[];
  readonly after: readonly Fact[];
  readonly flow: Flow;
};

const OWN_NAMES = new Set(['it']);

export function lambdaStatements(lambda: FlowNode): readonly FlowNode[] {
  const body = lambda.children.find(({ kind }) => kind !== 'parameters');
  if (body === undefined) {
    return [];
  }
  if (body.kind === 'block') {
    return body.children;
  }
  return categoryOf(body) === 'statement'
    ? [body]
    : [{ kind: 'evaluate', children: [body], ...placed(body.start, body.end) }];
}

function carried(facts: readonly Fact[], lambda: FlowNode, flow: Flow): Fact[] {
  const own = declaredNames(lambda);
  return facts.filter(
    (known) =>
      !known.readsMembers &&
      [...known.names].every(
        (name) => flow.stable.has(name) && !own.has(name) && !OWN_NAMES.has(name),
      ),
  );
}

function visit(part: FlowNode, found: Found, context: Context): readonly FlowNode[] {
  const { before, after, flow } = context;
  if (part.kind === 'lambda') {
    flow.seen.add(part);
    found.children.push({ statements: lambdaStatements(part), facts: carried(before, part, flow) });
    return [];
  }
  if (isSwitchLike(part)) {
    const arms = armFlow(part, after, flow);
    appendAll(found.children, arms.children);
    appendAll(found.checks, arms.checks);
    return part.children.slice(0, 1);
  }
  return part.children;
}

export function nestedFlow(
  node: FlowNode,
  { before, after }: { readonly before: readonly Fact[]; readonly after: readonly Fact[] },
  flow: Flow,
): Found {
  const found: Found = { children: [], checks: [] };
  const pending: FlowNode[] = [node];
  for (const part of pending) {
    if (part.kind === 'block' && part !== node) {
      found.children.push({ statements: part.children, facts: after });
    } else {
      appendAll(pending, visit(part, found, { before, after, flow }));
    }
  }
  return found;
}

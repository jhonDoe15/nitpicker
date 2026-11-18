import { categoryOf } from '../../../near-duplicates/tree/nodes.mjs';
import { armFlow, isSwitchLike } from './arms/arms.mjs';
import { declaredNames } from './stability.mjs';
import { appendAll } from '../../../lists/items.mjs';

const OWN_NAMES = new Set(['it']);

export function lambdaStatements(lambda) {
  const body = lambda.children.find(({ kind }) => kind !== 'parameters');
  if (body === undefined) {
    return [];
  }
  if (body.kind === 'block') {
    return body.children;
  }
  return categoryOf(body) === 'statement'
    ? [body]
    : [{ kind: 'evaluate', children: [body], start: body.start, end: body.end }];
}

function carried(facts, lambda, flow) {
  const own = declaredNames(lambda);
  return facts.filter(
    (known) =>
      !known.readsMembers &&
      [...known.names].every(
        (name) => flow.stable.has(name) && !own.has(name) && !OWN_NAMES.has(name),
      ),
  );
}

function visit(part, found, context) {
  const { before, after, flow } = context;
  if (part.kind === 'lambda') {
    flow.seen.add(part);
    found.children.push({ statements: lambdaStatements(part), facts: carried(before, part, flow) });
    return [];
  }
  if (isSwitchLike(part)) {
    const arms = armFlow(part, after, flow);
    found.children.push(...arms.children);
    found.checks.push(...arms.checks);
    return [part.children[0]];
  }
  return part.children;
}

export function nestedFlow(node, { before, after }, flow) {
  const found = { children: [], checks: [] };
  const pending = [node];
  for (const part of pending) {
    if (part.kind === 'block' && part !== node) {
      found.children.push({ statements: part.children, facts: after });
    } else {
      appendAll(pending, visit(part, found, { before, after, flow }));
    }
  }
  return found;
}

import { DESIGN_RULE_IDS } from '../../../project-rules/design-rules.mjs';
import { displayName } from '../design-index.mjs';

const RULE = DESIGN_RULE_IDS.forwardingChain;
const MIN_HOPS = 2;
const MAX_HOPS = 10;

function passesAllInOrder(callable) {
  const { arguments: passed } = callable.forward;
  const params = callable.params ?? [];
  return (
    passed.length === params.length &&
    passed.every((position, index) => position === index) &&
    params.every(({ variadic, optional, pattern }) => !variadic && !optional && !pattern)
  );
}

function sameContract(from, to) {
  const params = from.params ?? [];
  const targetParams = to.params ?? [];
  return (
    params.length === targetParams.length &&
    params.every(({ type }, index) => type !== undefined && type === targetParams[index].type) &&
    from.returns === to.returns &&
    (from.forward.returned || from.returns === undefined)
  );
}

function hopTarget(callable, index) {
  if (callable.forward === undefined || callable.entry === true || !passesAllInOrder(callable)) {
    return undefined;
  }
  const target = index.callable(callable.forward.target);
  const reachable = target !== undefined && (target.exported || !callable.exported);
  return reachable &&
    target.entry !== true &&
    target.file !== callable.file &&
    index.isProduction(target) &&
    sameContract(callable, target)
    ? target
    : undefined;
}

function chainFrom(head, index) {
  const chain = [head];
  const seen = new Set([head.id]);
  for (const current of chain) {
    const next = chain.length > MAX_HOPS ? undefined : hopTarget(current, index);
    if (next !== undefined && !seen.has(next.id)) {
      seen.add(next.id);
      chain.push(next);
    }
  }
  return chain;
}

function chainFinding(chain, { index, finding }) {
  const [head] = chain;
  const last = chain.at(-1);
  const path = chain.map((callable) => `${displayName(callable, index)} (${callable.file})`);
  const modules = new Set(chain.map(({ file }) => file)).size;
  return finding({
    rule: RULE,
    path: head.file,
    identity: chain.map(({ id }) => id).join('>'),
    symbol: displayName(head, index),
    line: head.line,
    message: `${path.join(' -> ')} pass the same parameters in order and return the result unchanged, across ${String(modules)} modules. Call ${displayName(last, index)} directly where ${displayName(head, index)} is used, or let a hop own something (a type change, a policy, a dependency) so it hides more than it forwards.`,
  });
}

export function forwardingChainFindings(index, finding) {
  const hopTargets = new Set(
    index.callables.flatMap((callable) => {
      const target = hopTarget(callable, index);
      return target === undefined ? [] : [target.id];
    }),
  );
  return index.callables
    .filter((callable) => !hopTargets.has(callable.id))
    .map((callable) => chainFrom(callable, index))
    .filter((chain) => chain.length > MIN_HOPS)
    .flatMap((chain) => chainFinding(chain, { index, finding }));
}

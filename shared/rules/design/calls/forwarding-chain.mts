import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mts';
import { displayName } from '../design-index.mts';
import type { Finding } from '../../../values/findings.mts';
import type {
  DesignCallable,
  DesignFinding,
  DesignForward,
  DesignIndex,
} from '../typed/design-types.mts';

const RULE = DESIGN_RULE_IDS.forwardingChain;
const MIN_HOPS = 2;
const MAX_HOPS = 10;
const UNTYPED = new Set(['any', 'unknown', 'Any']);

function isTyped(type: string | undefined): boolean {
  return type !== undefined && !UNTYPED.has(type);
}

function passesAllInOrder(callable: DesignCallable, forward: DesignForward): boolean {
  const { arguments: passed } = forward;
  const params = callable.params ?? [];
  return (
    passed.length === params.length &&
    passed.every((position, index) => position === index) &&
    params.every(({ variadic, optional, pattern }) => !(variadic || optional || pattern))
  );
}

function sameContract(from: DesignCallable, forward: DesignForward, to: DesignCallable): boolean {
  const params = from.params ?? [];
  const targetParams = to.params ?? [];
  return (
    params.length === targetParams.length &&
    params.every(({ type }, index) => isTyped(type) && type === targetParams[index]?.type) &&
    from.returns === to.returns &&
    (from.returns === undefined || isTyped(from.returns)) &&
    (forward.returned || from.returns === undefined)
  );
}

function hopTarget(callable: DesignCallable, index: DesignIndex): DesignCallable | undefined {
  const { forward } = callable;
  if (forward === undefined || callable.entry === true || !passesAllInOrder(callable, forward)) {
    return undefined;
  }
  const target = index.callable(forward.target);
  const reachable = target !== undefined && (target.exported || !callable.exported);
  return reachable &&
    target.entry !== true &&
    target.file !== callable.file &&
    index.isProduction(target) &&
    sameContract(callable, forward, target)
    ? target
    : undefined;
}

function chainFrom(head: DesignCallable, index: DesignIndex): DesignCallable[] {
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

function chainFinding(
  chain: readonly DesignCallable[],
  { index, finding }: { readonly index: DesignIndex; readonly finding: DesignFinding },
): Finding[] {
  const [head] = chain;
  if (head === undefined) {
    return [];
  }
  const last = chain.at(-1) ?? head;
  const path = chain.map((callable) => `${displayName(callable, index)} (${callable.file})`);
  const modules = new Set(chain.map(({ file }) => file)).size;
  return finding({
    rule: RULE,
    path: head.file,
    identity: chain.map(({ id }) => id).join('>'),
    symbol: displayName(head, index),
    line: head.line,
    message: [
      `${path.join(' -> ')} pass the same parameters in order and return the result unchanged,`,
      `across ${String(modules)} modules. Call ${displayName(last, index)} directly`,
      `where ${displayName(head, index)} is used,`,
      'or let a hop own something (a type change, a policy, a dependency) so it hides more than it forwards.',
    ].join(' '),
  });
}

export function forwardingChainFindings(index: DesignIndex, finding: DesignFinding): Finding[] {
  const hopTargets = new Set(
    index.callables.flatMap((callable) => {
      const target = hopTarget(callable, index);
      return target === undefined ? [] : [target.id];
    }),
  );
  return index.callables
    .filter((callable) => !(hopTargets.has(callable.id) || index.isPublished(callable)))
    .map((callable) => chainFrom(callable, index))
    .filter((chain) => chain.length > MIN_HOPS)
    .flatMap((chain) => chainFinding(chain, { index, finding }));
}

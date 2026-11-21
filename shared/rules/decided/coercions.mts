import { literal, logical, term } from '../../logic/terms.mts';
import { conditionTerm, fact, isBooleanConversion } from './facts.mts';
import { appendAll } from '../../lists/lists.mts';
import { isOneOf, present } from '../../near-duplicates/tree/nodes.mts';
import type { Term } from '../../logic/typed/term-types.mts';
import type { Fact, FlowNode, FlowScope } from './typed/decided-types.mts';

type Guard = { readonly test: FlowNode; readonly holds: boolean };
type Guarded = { readonly child: FlowNode; readonly guard?: Guard };
type CoercionSite = { readonly node: FlowNode; readonly query: Term; readonly facts: Fact[] };

const CHAINS = new Set(['&&', '||']);
const REFERENCES = new Set(['name', 'member', 'index']);
const ARMS = 3;

function isReference(node: FlowNode | undefined): boolean {
  return node !== undefined && REFERENCES.has(node.kind);
}

function isTrueLiteral(node: FlowNode | undefined): boolean {
  return node?.kind === 'literal' && node.literal === 'boolean' && node.value === 'true';
}

function isTrueConstantEquals(call: FlowNode): boolean {
  const [callee, subject] = call.children;
  const owner =
    callee?.kind === 'member' && callee.value === 'equals' ? callee.children[0] : undefined;
  const constant =
    owner?.kind === 'member' && owner.value === 'TRUE' ? owner.children[0] : undefined;
  return call.children.length === 2 && constant?.value === 'Boolean' && isReference(subject);
}

function isBooleanCall(call: FlowNode): boolean {
  const [callee, subject] = call.children;
  return (
    call.children.length === 2 &&
    callee !== undefined &&
    isBooleanConversion(callee) &&
    isReference(subject)
  );
}

function isEqualsTrue(node: FlowNode): boolean {
  const [left, right] = node.children;
  return (
    node.kind === 'binary' &&
    node.value === '==' &&
    ((isReference(left) && isTrueLiteral(right)) || (isReference(right) && isTrueLiteral(left)))
  );
}

function coercedTerm(node: FlowNode, scope: FlowScope): Term | undefined {
  if (node.kind === 'call' && isBooleanCall(node)) {
    return conditionTerm(present(node.children[1]), scope);
  }
  if (node.kind === 'call' && isTrueConstantEquals(node)) {
    const subject = conditionTerm(present(node.children[1]), scope);
    return subject === undefined
      ? undefined
      : logical('&&', [term('binary', '!==', [subject, literal('null', undefined)]), subject]);
  }
  return node.kind === 'binary' && isEqualsTrue(node) ? conditionTerm(node, scope) : undefined;
}

function guarded(node: FlowNode): Guarded[] {
  const [first, second, third] = node.children;
  if ((node.kind === 'conditional' || node.kind === 'if') && node.children.length === ARMS) {
    if (present(third).kind === 'block' || present(second).kind === 'block') {
      return [];
    }
    return [
      { child: present(first) },
      { child: present(second), guard: { test: present(first), holds: true } },
      { child: present(third), guard: { test: present(first), holds: false } },
    ];
  }
  if (node.kind === 'binary' && isOneOf(CHAINS, node.value) && node.children.length === 2) {
    return [
      { child: present(first) },
      { child: present(second), guard: { test: present(first), holds: node.value === '&&' } },
    ];
  }
  return node.children
    .filter(({ kind }) => kind !== 'block' && kind !== 'lambda')
    .map((child) => ({ child }));
}

export function coercionSites(root: FlowNode, scope: FlowScope): CoercionSite[] {
  const sites: CoercionSite[] = [];
  const pending: { node: FlowNode; guards: readonly Guard[] }[] = [{ node: root, guards: [] }];
  for (const { node, guards } of pending) {
    const query = coercedTerm(node, scope);
    if (query !== undefined) {
      const facts = guards.flatMap(({ test, holds }) => {
        const reason = `it is only reached when \`${test.text ?? 'the test before it'}\` is ${String(holds)}`;
        const known = fact(test, scope, { holds, reason });
        return known === undefined ? [] : [known];
      });
      sites.push({ node, query, facts });
    }
    appendAll(
      pending,
      guarded(node).map(({ child, guard }) => ({
        node: child,
        guards: guard === undefined ? guards : [...guards, guard],
      })),
    );
  }
  return sites;
}

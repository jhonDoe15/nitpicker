import { literal, logical, term } from '../../logic/terms.mjs';
import { conditionTerm, fact, isBooleanConversion } from './facts.mjs';

const CHAINS = new Set(['&&', '||']);
const REFERENCES = new Set(['name', 'member', 'index']);
const ARMS = 3;

function isReference(node) {
  return REFERENCES.has(node?.kind);
}

function isTrueLiteral(node) {
  return node?.kind === 'literal' && node.literal === 'boolean' && node.value === 'true';
}

function isTrueConstantEquals(call) {
  const [callee, subject] = call.children;
  const owner =
    callee.kind === 'member' && callee.value === 'equals' ? callee.children[0] : undefined;
  const constant =
    owner?.kind === 'member' && owner.value === 'TRUE' ? owner.children[0] : undefined;
  return call.children.length === 2 && constant?.value === 'Boolean' && isReference(subject);
}

function isBooleanCall(call) {
  const [callee, subject] = call.children;
  return call.children.length === 2 && isBooleanConversion(callee) && isReference(subject);
}

function isEqualsTrue(node) {
  const [left, right] = node.children;
  return (
    node.kind === 'binary' &&
    node.value === '==' &&
    ((isReference(left) && isTrueLiteral(right)) || (isReference(right) && isTrueLiteral(left)))
  );
}

function coercedTerm(node, scope) {
  if (node.kind === 'call' && isBooleanCall(node)) {
    return conditionTerm(node.children[1], scope);
  }
  if (node.kind === 'call' && isTrueConstantEquals(node)) {
    const subject = conditionTerm(node.children[1], scope);
    return subject === undefined
      ? undefined
      : logical('&&', [term('binary', '!==', [subject, literal('null')]), subject]);
  }
  return node.kind === 'binary' && isEqualsTrue(node) ? conditionTerm(node, scope) : undefined;
}

function guarded(node) {
  const [first, second, third] = node.children;
  if ((node.kind === 'conditional' || node.kind === 'if') && node.children.length === ARMS) {
    if (third.kind === 'block' || second.kind === 'block') {
      return [];
    }
    return [
      { child: first },
      { child: second, guard: { test: first, holds: true } },
      { child: third, guard: { test: first, holds: false } },
    ];
  }
  if (node.kind === 'binary' && CHAINS.has(node.value) && node.children.length === 2) {
    return [
      { child: first },
      { child: second, guard: { test: first, holds: node.value === '&&' } },
    ];
  }
  return node.children
    .filter(({ kind }) => kind !== 'block' && kind !== 'lambda')
    .map((child) => ({ child }));
}

export function coercionSites(root, scope) {
  const sites = [];
  const pending = [{ node: root, guards: [] }];
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
    pending.push(
      ...guarded(node).map(({ child, guard }) => ({
        node: child,
        guards: guard === undefined ? guards : [...guards, guard],
      })),
    );
  }
  return sites;
}

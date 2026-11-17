import { afterEffects, effectsOf, fact } from '../facts.mjs';
import { isArm } from './arms/arms.mjs';
import { textOf } from './exits.mjs';

const CHAINS = new Set(['&&', '||']);

export function isChain(node) {
  return node.kind === 'binary' && CHAINS.has(node.value);
}

function whenArms(node) {
  const [subject, ...arms] = node.children;
  return node.value === 'when' && subject?.kind === 'none'
    ? arms
        .filter((arm) => arm.value === 'case' && arm.children.length === 2)
        .map((arm) => arm.children[0])
    : [];
}

function branchFacts(node, flow) {
  const [test] = node.children;
  const line = String(test.start);
  return [true, false].map((holds) => {
    const reason = `it is in the ${holds ? 'true' : 'false'} branch of the conditional \`${textOf(test)}\` on line ${line}`;
    const known = fact(test, flow.scope, { holds, reason });
    const surviving = known === undefined ? [] : [known];
    return afterEffects(surviving, effectsOf([test], flow), flow.mutable);
  });
}

function partsBelow(node) {
  const parts = node.children.filter(({ kind }) => kind !== 'block' && kind !== 'lambda');
  return isArm(node) ? parts.slice(0, -1) : parts;
}

/**
 * The conditions below one statement or expression that are checked on their own: the test of a
 * conditional, each `&&`/`||` chain and each arm of a subject-less `when`, with the facts the
 * branch they sit in adds.
 */
export function sitesIn(root, flow) {
  const sites = [];
  const pending = [{ node: root, within: '', extra: [] }];
  for (const { node, within, extra } of pending) {
    if (node.kind === 'conditional' || (node !== root && node.kind === 'if')) {
      sites.push({ node: node.children[0], extra });
    } else if (isChain(node) && within !== node.value) {
      sites.push({ node, extra });
    }
    const arms = whenArms(node);
    sites.push(...arms.map((arm, index) => ({ node: arm, earlier: arms.slice(0, index), extra })));
    const chain = isChain(node) ? node.value : '';
    const branches = node.kind === 'conditional' ? branchFacts(node, flow) : [];
    pending.push(
      ...partsBelow(node).map((child) => ({
        node: child,
        within: chain,
        extra: [...extra, ...(branches[node.children.indexOf(child) - 1] ?? [])],
      })),
    );
  }
  return sites;
}

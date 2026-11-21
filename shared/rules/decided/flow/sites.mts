import { afterEffects, effectsOf, fact } from '../facts.mts';
import { isArm } from './arms/arms.mts';
import { nodeText } from './exits.mts';
import { appendAll } from '../../../lists/lists.mts';
import { isOneOf, present } from '../../../near-duplicates/tree/nodes.mts';
import type { Fact, Flow, FlowNode, Site } from '../typed/decided-types.mts';

type Pending = {
  readonly node: FlowNode;
  readonly within: string;
  readonly extra: readonly Fact[];
};

const CHAINS = new Set(['&&', '||']);

export function isChain(node: FlowNode): boolean {
  return node.kind === 'binary' && isOneOf(CHAINS, node.value);
}

function whenArms(node: FlowNode): FlowNode[] {
  const [subject, ...arms] = node.children;
  return node.value === 'when' && subject?.kind === 'none'
    ? arms
        .filter((arm) => arm.value === 'case' && arm.children.length === 2)
        .map((arm) => present(arm.children[0]))
    : [];
}

function branchFacts(node: FlowNode, flow: Flow): Fact[][] {
  const test = present(node.children[0]);
  const line = String(test.start);
  return [true, false].map((holds) => {
    const reason = `it is in the ${holds ? 'true' : 'false'} branch of the conditional \`${nodeText(test)}\` on line ${line}`;
    const known = fact(test, flow.scope, { holds, reason });
    const surviving = known === undefined ? [] : [known];
    return afterEffects(surviving, effectsOf([test], flow), flow.mutable);
  });
}

function partsBelow(node: FlowNode): FlowNode[] {
  const parts = node.children.filter(({ kind }) => kind !== 'block' && kind !== 'lambda');
  return isArm(node) ? parts.slice(0, -1) : parts;
}

export function sitesIn(root: FlowNode, flow: Flow): Site[] {
  const sites: Site[] = [];
  const pending: Pending[] = [{ node: root, within: '', extra: [] }];
  for (const { node, within, extra } of pending) {
    if (node.kind === 'conditional' || (node !== root && node.kind === 'if')) {
      sites.push({ node: present(node.children[0]), extra });
    } else if (isChain(node) && within !== node.value) {
      sites.push({ node, extra });
    }
    const arms = whenArms(node);
    appendAll(
      sites,
      arms.map((arm, index) => ({ node: arm, earlier: arms.slice(0, index), extra })),
    );
    const chain = isChain(node) ? (node.value ?? '') : '';
    const branches = node.kind === 'conditional' ? branchFacts(node, flow) : [];
    appendAll(
      pending,
      partsBelow(node).map((child) => ({
        node: child,
        within: chain,
        extra: [...extra, ...(branches[node.children.indexOf(child) - 1] ?? [])],
      })),
    );
  }
  return sites;
}

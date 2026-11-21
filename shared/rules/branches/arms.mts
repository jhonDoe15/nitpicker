import { isJump, nodesOf, present } from '../../near-duplicates/tree/nodes.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import { chainOf } from '../../traversal.mts';
import type { Arm, BranchGroup } from './arm-types.mts';

type GroupContext = {
  readonly elseIfs: ReadonlySet<TreeNode | undefined>;
  readonly statements: ReadonlySet<TreeNode>;
};

const SWITCHES = new Set<string | undefined>(['switch', 'when', 'select']);
const NEVER_FALLING = new Set<string | undefined>(['when', 'select']);
const ARM_PARTS = new Set<string | undefined>(['case', 'rule', 'else']);

function elseIfOf(node: TreeNode): TreeNode | undefined {
  const otherwise = node.children[2];
  const only =
    otherwise?.kind === 'block' && otherwise.children.length === 1
      ? otherwise.children[0]
      : undefined;
  return only?.kind === 'if' ? only : undefined;
}

function ifArms(node: TreeNode): Arm[] {
  const chain = chainOf(node, elseIfOf);
  const arms = chain.map(({ children: [condition, then] }) => ({
    condition,
    body: present(then),
    start: present(condition).start,
  }));
  const otherwise = chain.at(-1)?.children[2];
  return otherwise?.kind === 'block'
    ? [...arms, { body: otherwise, start: otherwise.start }]
    : arms;
}

function caseLabels(part: TreeNode): TreeNode[] {
  return part.children.slice(0, -1);
}

function isDefault(part: TreeNode): boolean {
  const labels = caseLabels(part);
  return (
    part.value === 'else' ||
    labels.some((label) => label.kind === 'none') ||
    labels.some((label) => label.kind === 'statement' && label.children.length === 0)
  );
}

function fallsThrough(group: TreeNode, part: TreeNode): boolean {
  if (NEVER_FALLING.has(group.value) || part.value === 'rule') {
    return false;
  }
  return !isJump(part.children.at(-1)?.children.at(-1));
}

function switchArms(node: TreeNode): Arm[] {
  const parts = node.children.slice(1).filter((part) => ARM_PARTS.has(part.value));
  return parts.map((part) => ({
    condition:
      node.value === 'when' && present(node.children[0]).kind === 'none'
        ? part.children[0]
        : undefined,
    conditions: part.value === 'else' ? [] : caseLabels(part),
    body: present(part.children.at(-1)),
    start: part.start,
    isDefault: isDefault(part),
    fallsThrough: fallsThrough(node, part),
  }));
}

function groupOf(node: TreeNode, context: GroupContext): BranchGroup | undefined {
  const placed = { node, isStatement: context.statements.has(node) };
  if (node.kind === 'if' && !context.elseIfs.has(node)) {
    const arms = ifArms(node);
    return { ...placed, kind: 'if', arms, complete: arms.at(-1)?.condition === undefined };
  }
  if (node.kind === 'conditional') {
    const [, then, otherwise] = node.children;
    const arms = [present(then), present(otherwise)].map((body) => ({
      body,
      start: body.start,
    }));
    return { ...placed, kind: 'ternary', arms, complete: true };
  }
  if (SWITCHES.has(node.value) && (node.kind === 'statement' || node.kind === 'expression')) {
    const arms = switchArms(node);
    const subjectless = present(node.children[0]).kind === 'none';
    const complete = arms.some((arm) => arm.isDefault);
    return { ...placed, kind: subjectless ? 'when' : 'switch', arms, complete };
  }
  return undefined;
}

export function branchGroups(tree: TreeNode): BranchGroup[] {
  const nodes = nodesOf(tree);
  const context = {
    elseIfs: new Set(nodes.filter((node) => node.kind === 'if').map(elseIfOf)),
    statements: new Set(
      nodes.filter((node) => node.kind === 'block').flatMap(({ children }) => children),
    ),
  };
  return nodes.map((node) => groupOf(node, context)).filter((group) => group !== undefined);
}

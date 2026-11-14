import { isJump, nodesOf } from '../../near-duplicates/tree/nodes.mjs';
import { chainOf } from '../../traversal.mjs';

const SWITCHES = new Set(['switch', 'when']);
const ARM_PARTS = new Set(['case', 'rule', 'else']);

function elseIfOf(node) {
  const otherwise = node.children[2];
  const only = otherwise?.kind === 'block' && otherwise.children.length === 1;
  return only && otherwise.children[0].kind === 'if' ? otherwise.children[0] : undefined;
}

function ifArms(node) {
  const chain = chainOf(node, elseIfOf);
  const arms = chain.map(({ children: [condition, then] }) => ({
    condition,
    body: then,
    start: condition.start,
  }));
  const otherwise = chain.at(-1).children[2];
  return otherwise?.kind === 'block'
    ? [...arms, { body: otherwise, start: otherwise.start }]
    : arms;
}

function caseLabels(part) {
  return part.children.slice(0, -1);
}

function isDefault(part) {
  const labels = caseLabels(part);
  return (
    part.value === 'else' ||
    labels.some((label) => label.kind === 'none') ||
    labels.some((label) => label.kind === 'statement' && label.children.length === 0)
  );
}

function fallsThrough(group, part) {
  if (group.value === 'when' || part.value === 'rule') {
    return false;
  }
  return !isJump(part.children.at(-1).children.at(-1));
}

function switchArms(node) {
  const parts = node.children.slice(1).filter((part) => ARM_PARTS.has(part.value));
  return parts.map((part) => ({
    condition:
      node.value === 'when' && node.children[0].kind === 'none' ? part.children[0] : undefined,
    conditions: part.value === 'else' ? [] : caseLabels(part),
    body: part.children.at(-1),
    start: part.start,
    isDefault: isDefault(part),
    fallsThrough: fallsThrough(node, part),
  }));
}

function groupOf(node, context) {
  const placed = { node, isStatement: context.statements.has(node) };
  if (node.kind === 'if' && !context.elseIfs.has(node)) {
    const arms = ifArms(node);
    return { ...placed, kind: 'if', arms, complete: arms.at(-1).condition === undefined };
  }
  if (node.kind === 'conditional') {
    const [, then, otherwise] = node.children;
    const arms = [then, otherwise].map((body) => ({ body, start: body.start }));
    return { ...placed, kind: 'ternary', arms, complete: true };
  }
  if (SWITCHES.has(node.value) && (node.kind === 'statement' || node.kind === 'expression')) {
    const arms = switchArms(node);
    const subjectless = node.children[0].kind === 'none';
    const complete = arms.some((arm) => arm.isDefault);
    return { ...placed, kind: subjectless ? 'when' : 'switch', arms, complete };
  }
  return undefined;
}

/**
 * The branching constructs of a unit tree, each with its arms in source order: an `if`/`else if`
 * chain (one group, from the first `if`), a ternary, a `switch` or `when` with a subject (kind
 * `switch`) and a `when` without one (kind `when`, its arms carry their conditions).
 */
export function branchGroups(tree) {
  const nodes = nodesOf(tree);
  const context = {
    elseIfs: new Set(nodes.filter((node) => node.kind === 'if').map(elseIfOf)),
    statements: new Set(
      nodes.filter((node) => node.kind === 'block').flatMap(({ children }) => children),
    ),
  };
  return nodes.map((node) => groupOf(node, context)).filter((group) => group !== undefined);
}

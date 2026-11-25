import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import { literalValue, operandsOf, unwrapped } from '../../typed/syntax-views.mts';
import { bodyNodesOf, containerGetOf, isAssignmentLeft, targetNameOf } from './worklist-nodes.mts';

export type WorklistInfo = {
  readonly loop: TSESTree.WhileStatement;
  readonly nodes: readonly TSESTree.Node[];
  readonly worklist: string;
  readonly nodeVar: string;
  readonly successorVars: ReadonlySet<string>;
  readonly auxSets: ReadonlySet<string>;
  readonly stateContainers: ReadonlySet<string>;
};

const POP_METHODS = new Set(['pop', 'shift', 'dequeue']);
const PUSH_METHODS = new Set(['push', 'unshift', 'add', 'enqueue']);
const LEFT_NONEMPTY_OPS = new Set(['>', '>=', '!==', '!=']);
const RIGHT_NONEMPTY_OPS = new Set(['<', '<=', '!==', '!=']);

function sizePropertyTarget(node: TSESTree.Node): string | undefined {
  const inner = unwrapped(node);
  if (inner.type !== AST_NODE_TYPES.MemberExpression || inner.computed) {
    return undefined;
  }
  const prop = nameOf(inner.property);
  return prop === 'length' || prop === 'size' ? targetNameOf(inner.object) : undefined;
}

function isZeroOrOne(node: TSESTree.Node): boolean {
  const value = literalValue(unwrapped(node));
  return value === 0 || value === 1;
}

function worklistFromOperand(node: TSESTree.Node): string | undefined {
  const direct = sizePropertyTarget(node);
  if (direct !== undefined) {
    return direct;
  }
  const inner = unwrapped(node);
  if (inner.type !== AST_NODE_TYPES.BinaryExpression) {
    return undefined;
  }
  const leftTarget = sizePropertyTarget(inner.left);
  if (
    leftTarget !== undefined &&
    LEFT_NONEMPTY_OPS.has(inner.operator) &&
    isZeroOrOne(inner.right)
  ) {
    return leftTarget;
  }
  const rightTarget = sizePropertyTarget(inner.right);
  return rightTarget !== undefined &&
    RIGHT_NONEMPTY_OPS.has(inner.operator) &&
    isZeroOrOne(inner.left)
    ? rightTarget
    : undefined;
}

function worklistFromTest(test: TSESTree.Expression): string | undefined {
  for (const operand of operandsOf(test, '&&')) {
    const found = worklistFromOperand(operand);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function memberCallReceiver(
  node: TSESTree.Node,
  allowedMethods: readonly string[],
): TSESTree.Expression | undefined {
  const call = unwrapped(node);
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = unwrapped(call.callee);
  const method =
    callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : undefined;
  return method !== undefined && allowedMethods.includes(method) ? callee.object : undefined;
}

function isIteratorNextValue(node: TSESTree.Node, worklist: string): boolean {
  if (
    node.type !== AST_NODE_TYPES.MemberExpression ||
    node.computed ||
    nameOf(node.property) !== 'value'
  ) {
    return false;
  }
  const iterCall = memberCallReceiver(node.object, ['next']);
  const receiver =
    iterCall === undefined ? undefined : memberCallReceiver(iterCall, ['values', 'keys']);
  return receiver !== undefined && targetNameOf(receiver) === worklist;
}

function isPopExpression(node: TSESTree.Node, worklist: string): boolean {
  const inner = unwrapped(node);
  if (isIteratorNextValue(inner, worklist)) {
    return true;
  }
  if (inner.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(inner.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const method = nameOf(callee.property);
  return (
    method !== undefined && POP_METHODS.has(method) && targetNameOf(callee.object) === worklist
  );
}

function isWorklistIterable(node: TSESTree.Node, worklist: string): boolean {
  const inner = unwrapped(node);
  if (targetNameOf(inner) === worklist) {
    return true;
  }
  if (inner.type === AST_NODE_TYPES.ArrayExpression && inner.elements.length === 1) {
    const [first] = inner.elements;
    return (
      first?.type === AST_NODE_TYPES.SpreadElement && targetNameOf(first.argument) === worklist
    );
  }
  return false;
}

function poppedFromDeclarator(
  node: TSESTree.VariableDeclarator,
  worklist: string,
): string | undefined {
  if (node.init === null) {
    return undefined;
  }
  if (node.id.type === AST_NODE_TYPES.Identifier && isPopExpression(node.init, worklist)) {
    return node.id.name;
  }
  if (node.id.type === AST_NODE_TYPES.ArrayPattern && isWorklistIterable(node.init, worklist)) {
    const [first] = node.id.elements;
    return first?.type === AST_NODE_TYPES.Identifier ? first.name : undefined;
  }
  return undefined;
}

function poppedFromNode(node: TSESTree.Node, worklist: string): string | undefined {
  if (node.type === AST_NODE_TYPES.VariableDeclarator) {
    return poppedFromDeclarator(node, worklist);
  }
  return node.type === AST_NODE_TYPES.AssignmentExpression &&
    node.left.type === AST_NODE_TYPES.Identifier &&
    isPopExpression(node.right, worklist)
    ? node.left.name
    : undefined;
}

function poppedVarOf(nodes: readonly TSESTree.Node[], worklist: string): string | undefined {
  for (const node of nodes) {
    const found = poppedFromNode(node, worklist);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function collectPushArgs(
  call: TSESTree.CallExpression,
  nodeVar: string,
  result: Set<string>,
): void {
  for (const arg of call.arguments) {
    const name = nameOf(unwrapped(arg));
    if (name !== undefined && name !== nodeVar) {
      result.add(name);
    }
  }
}

function successorVarsOf(
  nodes: readonly TSESTree.Node[],
  worklist: string,
  nodeVar: string,
): Set<string> {
  const result = new Set<string>();
  for (const node of nodes) {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const callee = unwrapped(node.callee);
    if (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      !callee.computed &&
      PUSH_METHODS.has(nameOf(callee.property) ?? '') &&
      targetNameOf(callee.object) === worklist
    ) {
      collectPushArgs(node, nodeVar, result);
    }
  }
  return result;
}

type AuxContext = Readonly<{
  worklist: string;
  nodeVar: string;
  successorVars: ReadonlySet<string>;
}>;

function recordAuxCall(
  node: TSESTree.CallExpression,
  ctx: AuxContext,
  sets: Readonly<{ deletedNode: Set<string>; touchedSucc: Set<string> }>,
): void {
  if (node.arguments.length < 1) {
    return;
  }
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return;
  }
  const [first] = node.arguments;
  const target = targetNameOf(callee.object);
  const method = nameOf(callee.property);
  const arg = first === undefined ? undefined : nameOf(unwrapped(first));
  if (target === undefined || arg === undefined) {
    return;
  }
  if (method === 'delete' && arg === ctx.nodeVar) {
    sets.deletedNode.add(target);
  }
  if ((method === 'add' || method === 'has') && ctx.successorVars.has(arg)) {
    sets.touchedSucc.add(target);
  }
}

function auxSetsOf(nodes: readonly TSESTree.Node[], ctx: AuxContext): Set<string> {
  const deletedNode = new Set<string>();
  const touchedSucc = new Set<string>();
  for (const node of nodes) {
    if (node.type === AST_NODE_TYPES.CallExpression) {
      recordAuxCall(node, ctx, { deletedNode, touchedSucc });
    }
  }
  const aux = new Set<string>([ctx.worklist]);
  for (const target of deletedNode) {
    if (touchedSucc.has(target)) {
      aux.add(target);
    }
  }
  return aux;
}

function readContainersOf(
  nodes: readonly TSESTree.Node[],
  nodeVar: string,
  auxSets: ReadonlySet<string>,
): Set<string> {
  const containers = new Set<string>();
  for (const node of nodes) {
    if (isAssignmentLeft(node)) {
      continue;
    }
    const access = containerGetOf(node);
    if (access !== undefined && access.key === nodeVar && !auxSets.has(access.container)) {
      containers.add(access.container);
    }
  }
  return containers;
}

export function analyzeWorklistLoop(loop: TSESTree.WhileStatement): WorklistInfo | undefined {
  const worklist = worklistFromTest(loop.test);
  if (worklist === undefined) {
    return undefined;
  }
  const nodes = bodyNodesOf(loop.body);
  const nodeVar = poppedVarOf(nodes, worklist);
  if (nodeVar === undefined) {
    return undefined;
  }
  const successorVars = successorVarsOf(nodes, worklist, nodeVar);
  if (successorVars.size === 0) {
    return undefined;
  }
  const auxSets = auxSetsOf(nodes, { worklist, nodeVar, successorVars });
  const stateContainers = readContainersOf(nodes, nodeVar, auxSets);
  return { loop, nodes, worklist, nodeVar, successorVars, auxSets, stateContainers };
}

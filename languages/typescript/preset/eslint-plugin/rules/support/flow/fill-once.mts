import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { childrenOf } from '../../loops/loop-shapes.mts';
import { ancestorsOf, contains, nameOf, type SourceCode } from '../../typed/node-views.mts';

const SETTERS = new Set(['set', 'add', 'setItem', 'put']);
const READERS = new Set(['has', 'get', 'getItem']);
const FILLS = new Set(['??=', '||=']);

function nodesIn(root: TSESTree.Node, visitorKeys: SourceCode['visitorKeys']): TSESTree.Node[] {
  const pending = [root];
  for (const node of pending) {
    pending.push(...childrenOf(node, visitorKeys));
  }
  return pending;
}

function readKey(node: TSESTree.Node, sourceCode: SourceCode): string | undefined {
  const { parent } = node;
  if (parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === node) {
    const method = nameOf(parent.property);
    const isReader =
      parent.parent.type === AST_NODE_TYPES.CallExpression && parent.parent.callee === parent;
    return isReader && method !== undefined && READERS.has(method)
      ? sourceCode.getText(node)
      : undefined;
  }
  const isChain =
    node.type === AST_NODE_TYPES.MemberExpression || node.type === AST_NODE_TYPES.Identifier;
  const isProperty = parent?.type === AST_NODE_TYPES.MemberExpression && parent.property === node;
  return isChain && !isProperty ? sourceCode.getText(node) : undefined;
}

function readKeys(test: TSESTree.Node, sourceCode: SourceCode): string[] {
  return nodesIn(test, sourceCode.visitorKeys)
    .map((node) => readKey(node, sourceCode))
    .filter((key) => key !== undefined);
}

function writtenKey(node: TSESTree.Node, sourceCode: SourceCode): string | undefined {
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return sourceCode.getText(node.left);
  }
  const callee = node.type === AST_NODE_TYPES.CallExpression ? node.callee : undefined;
  if (callee?.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const method = nameOf(callee.property);
  return method !== undefined && SETTERS.has(method)
    ? sourceCode.getText(callee.object)
    : undefined;
}

function exits(statement: TSESTree.Node): boolean {
  const last = statement.type === AST_NODE_TYPES.BlockStatement ? statement.body.at(-1) : statement;
  return (
    last?.type === AST_NODE_TYPES.ReturnStatement || last?.type === AST_NODE_TYPES.ThrowStatement
  );
}

function isEarlyReturn(
  statement: TSESTree.Node,
  call: TSESTree.Node,
): statement is TSESTree.IfStatement {
  return (
    statement.type === AST_NODE_TYPES.IfStatement &&
    statement.range[1] <= call.range[0] &&
    exits(statement.consequent)
  );
}

function earlyReturns(call: TSESTree.Node, root: TSESTree.Node): TSESTree.IfStatement[] {
  return ancestorsOf(call)
    .filter(
      (ancestor) => ancestor.type === AST_NODE_TYPES.BlockStatement && contains(root, ancestor),
    )
    .flatMap((block) =>
      block.type === AST_NODE_TYPES.BlockStatement
        ? block.body.filter((statement) => isEarlyReturn(statement, call))
        : [],
    );
}

function guards(call: TSESTree.Node, root: TSESTree.Node): TSESTree.IfStatement[] {
  const enclosing = ancestorsOf(call).filter(
    (ancestor): ancestor is TSESTree.IfStatement =>
      ancestor.type === AST_NODE_TYPES.IfStatement &&
      contains(root, ancestor) &&
      !contains(ancestor.test, call),
  );
  return [...enclosing, ...earlyReturns(call, root)];
}

export function isFillOnce(
  call: TSESTree.Node,
  root: TSESTree.Node,
  sourceCode: SourceCode,
): boolean {
  const filled = ancestorsOf(call).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.AssignmentExpression && FILLS.has(ancestor.operator),
  );
  if (filled) {
    return true;
  }
  const written = new Set(
    nodesIn(root, sourceCode.visitorKeys)
      .map((node) => writtenKey(node, sourceCode))
      .filter((key) => key !== undefined),
  );
  return guards(call, root).some((guard) =>
    readKeys(guard.test, sourceCode).some((key) => written.has(key)),
  );
}

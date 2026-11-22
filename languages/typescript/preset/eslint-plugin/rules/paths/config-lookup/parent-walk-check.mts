import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { forEachNode } from '../../analysis/node/wrapper-calls.mts';
import { calleeName } from '../../repeated-work/support/ast-walk.mts';

const PARENT_SEARCHED_CONFIGS = new Set([
  'tsconfig.json',
  'jsconfig.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'babel.config.js',
  'babel.config.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'pyproject.toml',
  '.editorconfig',
]);
const PATH_JOINERS = new Set(['join', 'resolve']);
const WALK_HELPER_NAME = /^(?:findUp|findUpSync|nearest|walkUp|searchUp)/iu;
const LOOP_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ForStatement,
]);

export function joinedConfigName(
  context: SourceContext,
  node: TSESTree.Node | undefined,
): string | undefined {
  const resolved = resolveConstant(context, node);
  if (resolved?.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const name = calleeName(resolved.callee);
  if (name === undefined || !PATH_JOINERS.has(name) || resolved.arguments.length < 2) {
    return undefined;
  }
  const last = resolved.arguments.at(-1);
  if (last === undefined || last.type === AST_NODE_TYPES.SpreadElement) {
    return undefined;
  }
  const filename = stringValue(resolveConstant(context, last));
  return filename !== undefined && PARENT_SEARCHED_CONFIGS.has(filename) ? filename : undefined;
}

function parentOf(node: TSESTree.Node): TSESTree.Node | undefined {
  return node.parent ?? undefined;
}

function isInsideLoop(node: TSESTree.Node): boolean {
  let current = parentOf(node);
  while (current !== undefined) {
    if (LOOP_TYPES.has(current.type)) {
      return true;
    }
    current = parentOf(current);
  }
  return false;
}

function enclosingFunctionName(node: TSESTree.Node): string | undefined {
  let current = parentOf(node);
  while (current !== undefined) {
    if (current.type === AST_NODE_TYPES.FunctionDeclaration && current.id !== null) {
      return current.id.name;
    }
    if (
      current.type === AST_NODE_TYPES.VariableDeclarator &&
      current.id.type === AST_NODE_TYPES.Identifier &&
      (current.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        current.init?.type === AST_NODE_TYPES.FunctionExpression)
    ) {
      return current.id.name;
    }
    current = parentOf(current);
  }
  return undefined;
}

function functionCallsSelf(context: SourceContext, node: TSESTree.Node): boolean {
  const name = enclosingFunctionName(node);
  if (name === undefined) {
    return false;
  }
  let current = parentOf(node);
  while (
    current !== undefined &&
    current.type !== AST_NODE_TYPES.FunctionDeclaration &&
    current.type !== AST_NODE_TYPES.FunctionExpression &&
    current.type !== AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    current = parentOf(current);
  }
  if (current === undefined) {
    return false;
  }
  let recursive = false;
  forEachNode(context, current.body, (candidate) => {
    if (candidate.type === AST_NODE_TYPES.CallExpression && calleeName(candidate.callee) === name) {
      recursive = true;
    }
  });
  return recursive;
}

export function moduleWalksParents(context: SourceContext, root: TSESTree.Node): boolean {
  let found = false;
  forEachNode(context, root, (node) => {
    if (found || node.type !== AST_NODE_TYPES.CallExpression) {
      return;
    }
    const name = calleeName(node.callee);
    if (name !== undefined && WALK_HELPER_NAME.test(name)) {
      found = true;
      return;
    }
    if (name === 'dirname' && (isInsideLoop(node) || functionCallsSelf(context, node))) {
      found = true;
    }
  });
  return found;
}

function isNonNullishExpression(node: TSESTree.Expression | null | undefined): boolean {
  if (node === null || node === undefined) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.Literal) {
    return node.value !== null && node.value !== false;
  }
  return !(node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined');
}

function statementReturnsDefault(statement: TSESTree.Statement | null | undefined): boolean {
  if (statement === null || statement === undefined) {
    return false;
  }
  if (statement.type === AST_NODE_TYPES.ReturnStatement) {
    return isNonNullishExpression(statement.argument);
  }
  if (statement.type === AST_NODE_TYPES.BlockStatement) {
    return statement.body.some(
      (entry) =>
        entry.type === AST_NODE_TYPES.ReturnStatement && isNonNullishExpression(entry.argument),
    );
  }
  return false;
}

function blockHasFallbackReturn(node: TSESTree.IfStatement): boolean {
  if (statementReturnsDefault(node.alternate)) {
    return true;
  }
  const parent = parentOf(node);
  if (parent?.type !== AST_NODE_TYPES.BlockStatement) {
    return false;
  }
  const index = parent.body.indexOf(node);
  return parent.body.slice(index + 1).some((entry) => statementReturnsDefault(entry));
}

function isNegatedTest(test: TSESTree.Expression, call: TSESTree.Node): boolean {
  return (
    test.type === AST_NODE_TYPES.UnaryExpression && test.operator === '!' && test.argument === call
  );
}

function catchReturnsDefault(handler: TSESTree.CatchClause | null): boolean {
  if (handler === null) {
    return false;
  }
  return handler.body.body.some(
    (entry) =>
      (entry.type === AST_NODE_TYPES.ReturnStatement && isNonNullishExpression(entry.argument)) ||
      (entry.type === AST_NODE_TYPES.ExpressionStatement &&
        entry.expression.type === AST_NODE_TYPES.AssignmentExpression &&
        isNonNullishExpression(entry.expression.right)),
  );
}

function hasCatchFallback(node: TSESTree.Node): boolean {
  let current = parentOf(node);
  while (current !== undefined) {
    if (current.type === AST_NODE_TYPES.TryStatement) {
      return catchReturnsDefault(current.handler);
    }
    if (
      current.type === AST_NODE_TYPES.CallExpression &&
      calleeName(current.callee) === 'catch' &&
      current.arguments.length > 0
    ) {
      return true;
    }
    current = parentOf(current);
  }
  return false;
}

function checkParentFallback(
  parent: TSESTree.Node,
  child: TSESTree.Node,
  call: TSESTree.CallExpression,
): boolean {
  if (parent.type === AST_NODE_TYPES.LogicalExpression) {
    return (
      (parent.operator === '??' || parent.operator === '||') &&
      parent.left === child &&
      isNonNullishExpression(parent.right)
    );
  }
  if (parent.type === AST_NODE_TYPES.ConditionalExpression && parent.test === child) {
    return isNegatedTest(parent.test, call)
      ? isNonNullishExpression(parent.consequent)
      : isNonNullishExpression(parent.alternate);
  }
  if (parent.type === AST_NODE_TYPES.IfStatement && parent.test === child) {
    return isNegatedTest(parent.test, call)
      ? statementReturnsDefault(parent.consequent)
      : blockHasFallbackReturn(parent);
  }
  return false;
}

export function fallsBackToDefault(call: TSESTree.CallExpression): boolean {
  if (hasCatchFallback(call)) {
    return true;
  }
  let child: TSESTree.Node = call;
  let parent = parentOf(call);
  for (let steps = 0; steps < 4 && parent !== undefined; steps += 1) {
    if (checkParentFallback(parent, child, call)) {
      return true;
    }
    child = parent;
    parent = parentOf(parent);
  }
  return false;
}

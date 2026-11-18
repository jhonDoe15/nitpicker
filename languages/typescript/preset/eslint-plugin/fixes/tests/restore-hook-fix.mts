import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, type SourceCode } from '../../rules/typed/node-views.mts';
import { inserting, type FixPlan } from '../support/ranges.mts';
import { isDeclared } from '../support/scope.mts';

const RESTORES = new Map([
  ['useFakeTimers', 'useRealTimers'],
  ['stubGlobal', 'unstubAllGlobals'],
  ['stubEnv', 'unstubAllEnvs'],
]);
type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;

function isFunction(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

function rootName(callee: TSESTree.Node): string | undefined {
  const root = chainOf<TSESTree.Node>(callee, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  ).at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}

function isDescribeBody(block: TSESTree.BlockStatement): boolean {
  const owner = block.parent;
  const call = owner.parent;
  return (
    isFunction(owner) &&
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.includes(owner) &&
    rootName(call.callee) === 'describe'
  );
}

function isSuiteLevel(parent: TSESTree.Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.Program ||
    (parent.type === AST_NODE_TYPES.BlockStatement && isDescribeBody(parent))
  );
}

function suiteStatement(call: TSESTree.CallExpression): TSESTree.ExpressionStatement | undefined {
  return chainOf<TSESTree.Node>(call, (node) => node.parent).find(
    (node): node is TSESTree.ExpressionStatement =>
      node.type === AST_NODE_TYPES.ExpressionStatement && isSuiteLevel(node.parent),
  );
}

function hookIsAvailable(sourceCode: SourceCode, call: TSESTree.Node, subject: string): boolean {
  return isDeclared(sourceCode, call, 'afterEach') || !isDeclared(sourceCode, call, subject);
}

export function restoreHookFix(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  method: string,
): FixPlan | undefined {
  const subject =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.object : undefined;
  const anchor = suiteStatement(call);
  const restore = RESTORES.get(method);
  if (
    subject?.type !== AST_NODE_TYPES.Identifier ||
    anchor === undefined ||
    restore === undefined
  ) {
    return undefined;
  }
  if (!hookIsAvailable(sourceCode, call, subject.name)) {
    return undefined;
  }
  const pad = ' '.repeat(anchor.loc.start.column);
  const hook = `afterEach(() => {\n${pad}  ${subject.name}.${restore}();\n${pad}});`;
  return inserting(anchor.range[1], `\n\n${pad}${hook}`);
}

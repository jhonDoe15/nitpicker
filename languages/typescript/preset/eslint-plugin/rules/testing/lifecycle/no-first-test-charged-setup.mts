import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import { findVariable, perTestVisitors } from '../../analysis/test-code-analysis.mts';
import { chainOf } from '../../typed/node-views.mts';

type StoredValue = TSESTree.AwaitExpression | TSESTree.CallExpression;

const { DefinitionType, ScopeType } = TSESLint.Scope;

const CHEAP_CALL_ROOTS = new Set([
  'path',
  'Math',
  'Object',
  'JSON',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'Date',
  'URL',
]);
const MEMO_LOGICAL_OPERATORS = new Set(['??=', '||=']);

function calleeRoot(callee: TSESTree.Node): string | undefined {
  const current = chainOf<TSESTree.Node>(callee, (link) => {
    if (link.type === AST_NODE_TYPES.MemberExpression) {
      return link.object;
    }
    return link.type === AST_NODE_TYPES.CallExpression ? link.callee : undefined;
  }).at(-1);
  return current?.type === AST_NODE_TYPES.Identifier ? current.name : undefined;
}

function storedValue(call: TSESTree.CallExpression): StoredValue {
  return call.parent.type === AST_NODE_TYPES.AwaitExpression ? call.parent : call;
}

function isModuleLevelMutable(context: SourceContext, identifier: TSESTree.Identifier): boolean {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return (
    variable?.scope.type === ScopeType.module &&
    definition?.type === DefinitionType.Variable &&
    definition.parent.kind !== 'const'
  );
}

function isNamed(node: TSESTree.Node | undefined, name: string): boolean {
  return node?.type === AST_NODE_TYPES.Identifier && node.name === name;
}

function isNullish(node: TSESTree.Node | undefined): boolean {
  return (
    (node?.type === AST_NODE_TYPES.Literal && node.value === null && node.raw === 'null') ||
    isNamed(node, 'undefined')
  );
}

function isEmptyCheck(test: TSESTree.Node, name: string): boolean {
  if (test.type === AST_NODE_TYPES.UnaryExpression && test.operator === '!') {
    return isNamed(test.argument, name);
  }
  if (test.type !== AST_NODE_TYPES.BinaryExpression || !['==', '==='].includes(test.operator)) {
    return false;
  }
  return (
    (isNamed(test.left, name) && isNullish(test.right)) ||
    (isNamed(test.right, name) && isNullish(test.left))
  );
}

function isPresentCheck(test: TSESTree.Node, name: string): boolean {
  if (isNamed(test, name)) {
    return true;
  }
  if (test.type !== AST_NODE_TYPES.BinaryExpression || !['!=', '!=='].includes(test.operator)) {
    return false;
  }
  return (
    (isNamed(test.left, name) && isNullish(test.right)) ||
    (isNamed(test.right, name) && isNullish(test.left))
  );
}

function returns(statement: TSESTree.Statement): boolean {
  if (statement.type === AST_NODE_TYPES.ReturnStatement) {
    return true;
  }
  return (
    statement.type === AST_NODE_TYPES.BlockStatement &&
    statement.body.at(-1)?.type === AST_NODE_TYPES.ReturnStatement
  );
}

function isGuardedByEmptyCheck(statement: TSESTree.ExpressionStatement, name: string): boolean {
  const container = statement.parent;
  const branch = container.type === AST_NODE_TYPES.BlockStatement ? container : statement;
  const conditional = branch.parent;
  if (conditional.type === AST_NODE_TYPES.IfStatement && conditional.consequent === branch) {
    return isEmptyCheck(conditional.test, name);
  }
  if (container.type !== AST_NODE_TYPES.BlockStatement) {
    return false;
  }
  const before = container.body.slice(0, container.body.indexOf(statement));
  return before.some(
    (earlier) =>
      earlier.type === AST_NODE_TYPES.IfStatement &&
      earlier.alternate === null &&
      returns(earlier.consequent) &&
      isPresentCheck(earlier.test, name),
  );
}

function memoTarget(value: StoredValue): TSESTree.Identifier | undefined {
  const parent = value.parent;
  if (parent.type === AST_NODE_TYPES.LogicalExpression && parent.right === value) {
    const assignment = parent.parent;
    if (
      assignment.type === AST_NODE_TYPES.AssignmentExpression &&
      assignment.operator === '=' &&
      assignment.left.type === AST_NODE_TYPES.Identifier &&
      ['??', '||'].includes(parent.operator) &&
      isNamed(parent.left, assignment.left.name)
    ) {
      return assignment.left;
    }
    return undefined;
  }
  if (parent.type !== AST_NODE_TYPES.AssignmentExpression || parent.right !== value) {
    return undefined;
  }
  if (parent.left.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  if (MEMO_LOGICAL_OPERATORS.has(parent.operator)) {
    return parent.left;
  }
  const statement = parent.parent;
  if (parent.operator === '=' && statement.type === AST_NODE_TYPES.ExpressionStatement) {
    return isGuardedByEmptyCheck(statement, parent.left.name) ? parent.left : undefined;
  }
  return undefined;
}

export const rule: TSESLint.RuleModule<'chargedSetup'> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      chargedSetup: `"{{name}}" is memoized lazily at module level and filled by a call, so whichever test runs first pays for its setup, reports show that test as slow, and test order starts to matter. Compute it once in beforeAll and let tests read it. An exception fits only when the setup is cheap or the lazy memo is intended.`,
    },
  },
  create(context) {
    return perTestVisitors(context, (node) => {
      if (node.type !== AST_NODE_TYPES.CallExpression) {
        return undefined;
      }
      const root = calleeRoot(node.callee);
      if (root !== undefined && CHEAP_CALL_ROOTS.has(root)) {
        return undefined;
      }
      const target = memoTarget(storedValue(node));
      if (target === undefined || !isModuleLevelMutable(context, target)) {
        return undefined;
      }
      return { messageId: 'chargedSetup', data: { name: target.name } };
    });
  },
};

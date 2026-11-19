import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { descendants } from '../../../rules/loops/loop-shapes.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { hasOnlyTypeFlags } from '../../../rules/support/checked-types.mts';
import { ancestorsOf } from '../../../rules/typed/node-views.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';
import { MUTATING_METHODS } from './invariants.mts';

export type ResultKind = 'row' | 'list';

const DELETE = 'delete';
const LIST_READS = new Set([
  'map',
  'filter',
  'forEach',
  'some',
  'every',
  'find',
  'findIndex',
  'includes',
  'indexOf',
  'slice',
  'join',
  'reduce',
  'flatMap',
  'at',
  'concat',
]);
const ESCAPES = new Set([
  'push',
  'add',
  'set',
  'log',
  'info',
  'warn',
  'error',
  'debug',
  'stringify',
  'String',
  'Boolean',
  'keys',
  'values',
  'entries',
]);
const STORING = new Set(['push', 'add', 'set']);
const PRIMITIVE_FLAGS =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.EnumLike |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Void;
const READ_OPERATORS = new Set(['!', 'typeof', 'void']);

type Chain = {
  readonly top: TSESTree.Node;
  readonly parent: TSESTree.Node;
  readonly names: readonly string[];
};

function propertyName(member: TSESTree.MemberExpression): string {
  return !member.computed && member.property.type === AST_NODE_TYPES.Identifier
    ? member.property.name
    : '[]';
}

function isTransparent(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression
  );
}

function climb(identifier: TSESTree.Identifier): Chain | undefined {
  const names: string[] = [];
  let top: TSESTree.Node = identifier;
  for (const parent of ancestorsOf(identifier)) {
    if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === top) {
      names.push(propertyName(parent));
    } else if (!isTransparent(parent)) {
      return { top, parent, names };
    }
    top = parent;
  }
  return undefined;
}

function lastName(callee: TSESTree.Node): string {
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return propertyName(callee);
  }
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : '';
}

function isWrite({ top, parent }: Chain): boolean {
  return (
    (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.left === top) ||
    parent.type === AST_NODE_TYPES.UpdateExpression ||
    (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === DELETE) ||
    (parent.type === AST_NODE_TYPES.ForOfStatement && parent.left === top) ||
    (parent.type === AST_NODE_TYPES.ForInStatement && parent.left === top)
  );
}

function settled(chain: Chain): Chain {
  let { top, parent } = chain;
  for (const ancestor of ancestorsOf(parent)) {
    if (parent.type !== AST_NODE_TYPES.LogicalExpression) {
      break;
    }
    top = parent;
    parent = ancestor;
  }
  return { ...chain, top, parent };
}

function isSafeFlow(start: Chain): boolean {
  const { top, parent } = settled(start);
  if (parent.type === AST_NODE_TYPES.CallExpression) {
    return parent.callee !== top && ESCAPES.has(lastName(parent.callee));
  }
  if (parent.type === AST_NODE_TYPES.UnaryExpression) {
    return READ_OPERATORS.has(parent.operator);
  }
  if (
    parent.type === AST_NODE_TYPES.IfStatement ||
    parent.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return parent.test === top;
  }
  return (
    parent.type === AST_NODE_TYPES.ReturnStatement ||
    parent.type === AST_NODE_TYPES.TemplateLiteral ||
    parent.type === AST_NODE_TYPES.BinaryExpression ||
    parent.type === AST_NODE_TYPES.SpreadElement
  );
}

function isPrimitive(context: Context, node: TSESTree.Node): boolean {
  return hasOnlyTypeFlags(context, node, PRIMITIVE_FLAGS);
}

function isWritingNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.AssignmentExpression ||
    node.type === AST_NODE_TYPES.UpdateExpression ||
    (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === DELETE) ||
    (node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      MUTATING_METHODS.has(propertyName(node.callee)))
  );
}

function isPlainArgument(context: Context, argument: TSESTree.CallExpressionArgument): boolean {
  if (argument.type === AST_NODE_TYPES.Literal) {
    return true;
  }
  if (
    argument.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    argument.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return false;
  }
  return !descendants(argument, context.sourceCode.visitorKeys, () => false).some(isWritingNode);
}

function isCallRead(names: readonly string[], kind: ResultKind): boolean {
  const method = names.at(-1) ?? '';
  if (names.length === 0) {
    return false;
  }
  if (names.length === 1) {
    return kind === 'list' && LIST_READS.has(method);
  }
  return !MUTATING_METHODS.has(method);
}

function isAllowedUse(
  context: Context,
  identifier: TSESTree.Identifier,
  kind: ResultKind,
): boolean {
  const chain = climb(identifier);
  if (chain === undefined || isWrite(chain)) {
    return false;
  }
  const { top, parent, names } = chain;
  if (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === top) {
    return (
      isCallRead(names, kind) &&
      parent.arguments.every((argument) => isPlainArgument(context, argument))
    );
  }
  return (
    (names.length > 0 && isPrimitive(context, top)) ||
    isSafeFlow(chain) ||
    (names.length > 0 && isCondition(chain))
  );
}

function isCondition({ top, parent }: Chain): boolean {
  return (
    ((parent.type === AST_NODE_TYPES.IfStatement ||
      parent.type === AST_NODE_TYPES.ConditionalExpression) &&
      parent.test === top) ||
    parent.type === AST_NODE_TYPES.LogicalExpression ||
    parent.type === AST_NODE_TYPES.BinaryExpression
  );
}

function isInClosure(
  reference: TSESLint.Scope.Reference,
  variable: TSESLint.Scope.Variable,
): boolean {
  return reference.from.variableScope !== variable.scope.variableScope;
}

export function isReadOnlyResult(
  context: Context,
  declarator: TSESTree.VariableDeclarator,
  kind: ResultKind,
): boolean {
  if (declarator.id.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const [variable] = context.sourceCode.getDeclaredVariables(declarator);
  return (
    variable !== undefined &&
    variable.references
      .filter((reference) => reference.identifier !== declarator.id)
      .every(
        (reference) =>
          reference.identifier.type === AST_NODE_TYPES.Identifier &&
          !isInClosure(reference, variable) &&
          isAllowedUse(context, reference.identifier, kind),
      )
  );
}

function isStored(context: Context, identifier: TSESTree.Identifier): boolean {
  const chain = climb(identifier);
  return (
    chain !== undefined &&
    chain.parent.type === AST_NODE_TYPES.CallExpression &&
    chain.parent.callee !== chain.top &&
    STORING.has(lastName(chain.parent.callee)) &&
    !isPrimitive(context, chain.top)
  );
}

export function isStoredResult(context: Context, declarator: TSESTree.VariableDeclarator): boolean {
  const [variable] = context.sourceCode.getDeclaredVariables(declarator);
  return (variable?.references ?? []).some(
    (reference) =>
      reference.identifier !== declarator.id &&
      reference.identifier.type === AST_NODE_TYPES.Identifier &&
      isStored(context, reference.identifier),
  );
}

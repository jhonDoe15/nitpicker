import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { DYNAMIC } from '../../../../../../../shared/rules/security/sql-text.mjs';
import { findVariable, stringValue } from '../../analysis/constant-resolution.mts';
import { ancestorsOf, chainOf } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import {
  leafValues,
  memberName,
  resolvedValue,
  typeServices,
  unwrapped,
  type Context,
} from '../security-values.mts';
import {
  arrayObligations,
  arrayOf,
  isIndexParameter,
  textOf,
  type Obligation,
} from './sql-arrays.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

export type Piece = {
  readonly text?: string | undefined;
  readonly node?: TSESTree.Node | undefined;
};

const MAX_OBLIGATIONS = 256;
const NUMERIC_FUNCTIONS = new Set(['Number', 'parseInt', 'parseFloat', 'BigInt', 'Boolean']);
const ESCAPE_FUNCTIONS = new Set<string | undefined>([
  'escape',
  'escapeId',
  'escapeLiteral',
  'escapeIdentifier',
]);
const NUMERIC_METHODS = new Set<string | undefined>(['getTime', 'now', 'toFixed']);
const NUMERIC_PROPERTIES = new Set<string | undefined>(['length', 'size', 'byteLength']);
const INERT_UNARY = new Set(['+', '-', '!', 'typeof']);
const TEXT_BUILDERS = new Set<string | undefined>([
  'repeat',
  'slice',
  'substring',
  'padStart',
  'padEnd',
  'trimEnd',
  'trimStart',
]);
const INERT_LITERAL = /^[\w. ]*$/u;
const MEMBERSHIP = new Set<string | undefined>(['has', 'includes']);
const EXITS = new Set<string>([
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.BreakStatement,
]);
const PRIMITIVE_FLAGS =
  ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike;

function literalText(leaf: TSESTree.Node): string | undefined {
  const text = stringValue(leaf);
  if (text !== undefined) {
    return text;
  }
  const isPrimitive =
    leaf.type === AST_NODE_TYPES.Literal &&
    ['number', 'boolean', 'bigint'].includes(typeof leaf.value);
  return isPrimitive ? String(leaf.value) : undefined;
}

function isSetCall(value: TSESTree.Node | undefined): value is TSESTree.NewExpression {
  return (
    value?.type === AST_NODE_TYPES.NewExpression &&
    value.callee.type === AST_NODE_TYPES.Identifier &&
    value.callee.name === 'Set'
  );
}

function resolvedList(
  context: Context,
  node: TSESTree.Node | undefined,
): TSESTree.Node | undefined {
  return unwrapped(resolvedValue(context, node) ?? node);
}

function constantList(
  context: Context,
  node: TSESTree.Node | undefined,
): TSESTree.Node | undefined {
  const chain = chainOf(resolvedList(context, node), (value) =>
    isSetCall(value) ? resolvedList(context, value.arguments[0]) : undefined,
  );
  return chain.at(-1);
}

function isConstantCollection(context: Context, node: TSESTree.Node): boolean {
  const list = constantList(context, node);
  return (
    list?.type === AST_NODE_TYPES.ArrayExpression &&
    list.elements.length > 0 &&
    list.elements.every((element) => element !== null && literalText(element) !== undefined)
  );
}

function checks(context: Context, test: TSESTree.Node, variable: TSESLint.Scope.Variable): boolean {
  const call = unwrapped(test);
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const argument = unwrapped(call.arguments[0]);
  return (
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    MEMBERSHIP.has(memberName(call.callee)) &&
    argument?.type === AST_NODE_TYPES.Identifier &&
    findVariable(context, argument, argument.name) === variable &&
    isConstantCollection(context, call.callee.object)
  );
}

function exits(statement: TSESTree.Node): boolean {
  const last = chainOf(statement, (current) =>
    current.type === AST_NODE_TYPES.BlockStatement ? current.body.at(-1) : undefined,
  ).at(-1);
  return last !== undefined && EXITS.has(last.type);
}

function isStopGuard(
  context: Context,
  statement: TSESTree.Node,
  variable: TSESLint.Scope.Variable,
): boolean {
  if (statement.type !== AST_NODE_TYPES.IfStatement) {
    return false;
  }
  const test = unwrapped(statement.test);
  return (
    test.type === AST_NODE_TYPES.UnaryExpression &&
    test.operator === '!' &&
    exits(statement.consequent) &&
    checks(context, test.argument, variable)
  );
}

type Guarded = {
  readonly parent: TSESTree.Node;
  readonly child: TSESTree.Node;
  readonly variable: TSESLint.Scope.Variable;
};

function guards(context: Context, { parent, child, variable }: Guarded): boolean {
  if (parent.type === AST_NODE_TYPES.IfStatement && parent.consequent === child) {
    return checks(context, parent.test, variable);
  }
  const body: readonly TSESTree.Node[] | undefined =
    'body' in parent && Array.isArray(parent.body) ? parent.body : undefined;
  const earlier = body?.slice(0, body.indexOf(child)) ?? [];
  return earlier.some((statement) => isStopGuard(context, statement, variable));
}

function isGuarded(context: Context, identifier: TSESTree.Identifier): boolean {
  const variable = findVariable(context, identifier, identifier.name);
  if (variable === undefined) {
    return false;
  }
  const chain = [identifier, ...ancestorsOf(identifier)];
  return chain.slice(0, -1).some((child, index) => {
    const parent = chain[index + 1];
    return parent !== undefined && guards(context, { parent, child, variable });
  });
}

function isInertCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return NUMERIC_FUNCTIONS.has(callee.name);
  }
  const name = callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
  const onMath =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Math';
  return onMath || ESCAPE_FUNCTIONS.has(name) || NUMERIC_METHODS.has(name);
}

function callObligations(call: TSESTree.CallExpression): Obligation[] | undefined {
  if (isInertCall(call)) {
    return [];
  }
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const name = memberName(callee);
  if (name === 'join') {
    return [arrayOf(callee.object), ...call.arguments.map((argument) => textOf(argument))];
  }
  return TEXT_BUILDERS.has(name) ? [textOf(callee.object)] : undefined;
}

function shapeObligations(context: Context, leaf: TSESTree.Node): Obligation[] | undefined {
  const target = unwrapped(leaf);
  if (target.type === AST_NODE_TYPES.UnaryExpression) {
    return INERT_UNARY.has(target.operator) ? [] : undefined;
  }
  if (target.type === AST_NODE_TYPES.BinaryExpression) {
    return target.operator === '+' ? [textOf(target.left), textOf(target.right)] : [];
  }
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return NUMERIC_PROPERTIES.has(memberName(target)) ? [] : undefined;
  }
  if (target.type === AST_NODE_TYPES.TemplateLiteral) {
    return target.expressions.map((expression) => textOf(expression));
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    return isIndexParameter(context, target) || isGuarded(context, target) ? [] : undefined;
  }
  return target.type === AST_NODE_TYPES.CallExpression ? callObligations(target) : undefined;
}

function isInertType(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const type = services.getTypeAtLocation(node);
  const members = type.isUnion() ? type.types : [type];
  return members.every(
    (member) =>
      (member.flags & PRIMITIVE_FLAGS) !== 0 ||
      (member.isStringLiteral() && INERT_LITERAL.test(member.value)),
  );
}

function textObligations(context: Context, node: TSESTree.Node): Obligation[] | undefined {
  if (isInertType(context, node)) {
    return [];
  }
  const parts = leafValues(context, node).map((leaf) =>
    literalText(leaf) === undefined ? shapeObligations(context, leaf) : [],
  );
  const known = parts.filter((part) => part !== undefined);
  return known.length < parts.length ? undefined : known.flat();
}

const STEPS = { text: textObligations, array: arrayObligations };

function isInert(context: Context, root: Obligation): boolean {
  const pending = [root];
  const seen = {
    text: new Set<TSESTree.Node | undefined>(),
    array: new Set<TSESTree.Node | undefined>(),
  };
  for (const { kind, node } of pending) {
    const next =
      node === undefined || pending.length > MAX_OBLIGATIONS
        ? undefined
        : STEPS[kind](context, node);
    if (next === undefined) {
      return false;
    }
    seen[kind].add(node);
    appendAll(
      pending,
      next.filter((item) => !seen[item.kind].has(item.node)),
    );
  }
  return true;
}

export function classify(context: Context, node: TSESTree.Node | undefined): Piece {
  const texts = leafValues(context, node).map((leaf) => literalText(leaf));
  if (texts.length > 0 && texts.every((text) => text !== undefined)) {
    return { text: texts[0] };
  }
  return isInert(context, textOf(node)) ? { text: DYNAMIC } : { node };
}

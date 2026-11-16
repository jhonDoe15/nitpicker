import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { nameOf } from '../typed/node-views.mts';
import { pluginRule, reportedNode, withReportFilter, type WrappedDocs } from './report-filter.mts';

type MessageId = 'useConst' | 'noMagic';
type Options = readonly unknown[];

const baseRule = pluginRule<MessageId, Options, WrappedDocs>(tseslint.plugin, 'no-magic-numbers');

const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const FIRST = [0];
const SECOND = [1];
const EITHER = [0, 1];
const STATUS_POSITIONS = new Map([
  ['status', FIRST],
  ['sendStatus', FIRST],
  ['code', FIRST],
  ['writeHead', FIRST],
  ['text', SECOND],
  ['json', SECOND],
  ['body', SECOND],
  ['html', SECOND],
  ['redirect', EITHER],
  ['throw', EITHER],
]);
const STATUS_FUNCTIONS = new Map([
  ['error', FIRST],
  ['fail', FIRST],
]);
const ERROR_NAME = /(?:Error|Exception)$/;
const STATUS_PROPERTIES = new Set(['status', 'statusCode']);
const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);
const DIGITS_METHODS = new Set(['toFixed', 'toPrecision']);
const LOWEST_STATUS = 100;
const HIGHEST_STATUS = 599;

const HINT =
  ' Name it with a module-level constant: `const SECONDS_PER_DAY = 24 * 60 * 60;` (-1, 0, 1, 2, 10, 100 and 1000, an HTTP status code such as `res.status(404)` and the digits of `toFixed(2)` are allowed). An exception fits only when the number is clear where it is.';

function isModuleLevelConstant(declarator: TSESTree.VariableDeclarator): boolean {
  const declaration = declarator.parent;
  const owner = declaration.parent;
  return (
    declaration.kind === 'const' &&
    (owner.type === AST_NODE_TYPES.Program ||
      (owner.type === AST_NODE_TYPES.ExportNamedDeclaration &&
        owner.parent.type === AST_NODE_TYPES.Program))
  );
}

function insideModuleConstant(node: TSESTree.Node): boolean {
  const chain = [node];
  for (const current of chain) {
    if (FUNCTION_TYPES.has(current.type)) {
      return false;
    }
    if (
      current.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
      current.parent.init === current
    ) {
      return isModuleLevelConstant(current.parent);
    }
    if (typeof current.parent?.type === 'string') {
      chain.push(current.parent);
    }
  }
  return false;
}

function memberName(callee: TSESTree.Node): string | undefined {
  return callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : undefined;
}

function calleeName(callee: TSESTree.Node): string | undefined {
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : memberName(callee);
}

function isStatusProperty(expression: TSESTree.Node): boolean {
  const member =
    expression.type === AST_NODE_TYPES.ChainExpression ? expression.expression : expression;
  return (
    member.type === AST_NODE_TYPES.MemberExpression &&
    !member.computed &&
    STATUS_PROPERTIES.has(nameOf(member.property) ?? '')
  );
}

function statusPositions(callee: TSESTree.Node): readonly number[] {
  const name = calleeName(callee);
  if (name === undefined) {
    return [];
  }
  const functionPositions =
    callee.type === AST_NODE_TYPES.Identifier ? STATUS_FUNCTIONS.get(name) : undefined;
  return STATUS_POSITIONS.get(name) ?? functionPositions ?? (ERROR_NAME.test(name) ? EITHER : []);
}

function isStatusCallArgument(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  if (
    parent.type !== AST_NODE_TYPES.CallExpression &&
    parent.type !== AST_NODE_TYPES.NewExpression
  ) {
    return false;
  }
  return statusPositions(parent.callee).includes(
    parent.arguments.findIndex((argument) => argument === node),
  );
}

function isStatusComparison(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  if (parent.type === AST_NODE_TYPES.BinaryExpression && EQUALITY_OPERATORS.has(parent.operator)) {
    return isStatusProperty(parent.left === node ? parent.right : parent.left);
  }
  return (
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.right === node &&
    isStatusProperty(parent.left)
  );
}

function isStatusCode(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Literal) {
    return false;
  }
  const { value } = node;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < LOWEST_STATUS ||
    value > HIGHEST_STATUS
  ) {
    return false;
  }
  return isStatusCallArgument(node, node.parent) || isStatusComparison(node, node.parent);
}

function isDigitsArgument(node: TSESTree.Node): boolean {
  const { parent } = node;
  return (
    parent?.type === AST_NODE_TYPES.CallExpression &&
    DIGITS_METHODS.has(memberName(parent.callee) ?? '')
  );
}

function isAllowedNumber(node: TSESTree.Node): boolean {
  return insideModuleConstant(node) || isStatusCode(node) || isDigitsArgument(node);
}

function keepsReport(descriptor: TSESLint.ReportDescriptor<MessageId>): boolean {
  const node = reportedNode(descriptor);
  return descriptor.messageId !== 'noMagic' || node === undefined || !isAllowedNumber(node);
}

export const rule: TSESLint.RuleModule<MessageId, Options, WrappedDocs> = withReportFilter(
  baseRule,
  keepsReport,
  {
    noMagic: `${baseRule.meta.messages.noMagic}${HINT}`,
  },
);

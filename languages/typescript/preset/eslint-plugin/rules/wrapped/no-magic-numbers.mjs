import tseslint from 'typescript-eslint';
import { withReportFilter } from './report-filter.mjs';

const baseRule = tseslint.plugin.rules['no-magic-numbers'];

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const STATUS_METHODS = new Set([
  'status',
  'sendStatus',
  'json',
  'send',
  'redirect',
  'code',
  'writeHead',
]);
const STATUS_CALLEE = /status|error|exception|text|body|json|send|redirect|end|head|throw/i;
const STATUS_PROPERTIES = new Set(['status', 'statusCode']);
const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);
const DIGITS_METHODS = new Set(['toFixed', 'toPrecision']);
const LOWEST_STATUS = 100;
const HIGHEST_STATUS = 599;

const HINT =
  ' Name it with a module-level constant: `const SECONDS_PER_DAY = 24 * 60 * 60;` (-1, 0, 1, 2, 10, 100 and 1000, an HTTP status code such as `res.status(404)` and the digits of `toFixed(2)` are allowed). If the number is clear where it is, add an exception for this rule in nitpicker.config.json.';

function isModuleLevelConstant(declarator) {
  const declaration = declarator.parent;
  const owner = declaration.parent;
  return (
    declaration.kind === 'const' &&
    (owner.type === 'Program' ||
      (owner.type === 'ExportNamedDeclaration' && owner.parent.type === 'Program'))
  );
}

function insideModuleConstant(node) {
  const chain = [node];
  for (const current of chain) {
    if (FUNCTION_TYPES.has(current.type)) {
      return false;
    }
    if (current.parent?.type === 'VariableDeclarator' && current.parent.init === current) {
      return isModuleLevelConstant(current.parent);
    }
    if (typeof current.parent?.type === 'string') {
      chain.push(current.parent);
    }
  }
  return false;
}

function memberName(callee) {
  return callee.type === 'MemberExpression' ? callee.property.name : undefined;
}

function calleeName(callee) {
  return callee.type === 'Identifier' ? callee.name : memberName(callee);
}

function isStatusProperty(expression) {
  const member = expression.type === 'ChainExpression' ? expression.expression : expression;
  return (
    member.type === 'MemberExpression' &&
    !member.computed &&
    STATUS_PROPERTIES.has(member.property.name)
  );
}

function isStatusCallArgument(node, parent) {
  if (parent.type !== 'CallExpression' && parent.type !== 'NewExpression') {
    return false;
  }
  const name = calleeName(parent.callee);
  return (
    parent.arguments.includes(node) &&
    typeof name === 'string' &&
    (STATUS_METHODS.has(name) || STATUS_CALLEE.test(name))
  );
}

function isStatusComparison(node, parent) {
  if (parent.type === 'BinaryExpression' && EQUALITY_OPERATORS.has(parent.operator)) {
    return isStatusProperty(parent.left === node ? parent.right : parent.left);
  }
  return (
    parent.type === 'AssignmentExpression' && parent.right === node && isStatusProperty(parent.left)
  );
}

function isStatusCode(node) {
  const { value } = node;
  if (!Number.isInteger(value) || value < LOWEST_STATUS || value > HIGHEST_STATUS) {
    return false;
  }
  return isStatusCallArgument(node, node.parent) || isStatusComparison(node, node.parent);
}

function isDigitsArgument(node) {
  const { parent } = node;
  return parent.type === 'CallExpression' && DIGITS_METHODS.has(memberName(parent.callee));
}

function isAllowedNumber(node) {
  return insideModuleConstant(node) || isStatusCode(node) || isDigitsArgument(node);
}

function keepsReport(descriptor) {
  return descriptor.messageId !== 'noMagic' || !isAllowedNumber(descriptor.node);
}

export const rule = withReportFilter(baseRule, keepsReport, {
  noMagic: `${baseRule.meta.messages.noMagic}${HINT}`,
});

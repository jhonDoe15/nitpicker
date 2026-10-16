import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { ancestorsOf, chainOf, variableNamed } from '../analysis/ancestry.mjs';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';
import { importedCalleeName } from '../analysis/subprocess-calls.mjs';

const WRAPPED_EXPRESSIONS = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'ChainExpression',
]);
const EXITS = new Set(['ReturnStatement', 'ThrowStatement', 'ContinueStatement', 'BreakStatement']);
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

export function unwrapped(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (WRAPPED_EXPRESSIONS.has(current.type)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function lastPiece(scope, node) {
  const resolved = resolveConstant(scope.context, node);
  if (resolved?.type === 'BinaryExpression' && resolved.operator === '+') {
    return resolved.right;
  }
  const endsWithExpression =
    resolved?.type === 'TemplateLiteral' && resolved.quasis.at(-1).value.cooked === '';
  return endsWithExpression ? resolved.expressions.at(-1) : undefined;
}

function endsWithSeparator(scope, node) {
  const last = resolveConstant(
    scope.context,
    chainOf(node, (piece) => lastPiece(scope, piece)).at(-1),
  );
  if (last === undefined) {
    return false;
  }
  const text =
    last.type === 'TemplateLiteral' ? last.quasis.at(-1).value.cooked : stringValue(last);
  return importedCalleeName(last, scope.pathModule) === 'sep' || /[\\/]$/.test(text ?? '');
}

function isPathOf(check, node) {
  const expression = unwrapped(node);
  const normalized =
    expression.type === 'CallExpression' &&
    expression.arguments.length === 1 &&
    ['resolve', 'normalize'].includes(importedCalleeName(expression.callee, check.pathModule));
  const target = normalized ? unwrapped(expression.arguments[0]) : expression;
  return target.type === 'Identifier' && variableNamed(check.sourceCode, target) === check.variable;
}

function isRelativeOf(check, node) {
  const call = unwrapped(resolveConstant(check.context, unwrapped(node)));
  return (
    call.type === 'CallExpression' &&
    importedCalleeName(call.callee, check.pathModule) === 'relative' &&
    call.arguments[1] !== undefined &&
    isPathOf(check, call.arguments[1])
  );
}

function directContainment(check, node) {
  const call = unwrapped(node);
  const isStartsWith =
    call.type === 'CallExpression' &&
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    call.callee.property.name === 'startsWith' &&
    call.arguments.length > 0;
  if (!isStartsWith) {
    return undefined;
  }
  const [receiver, prefix] = [call.callee.object, call.arguments[0]];
  if (isPathOf(check, receiver) && endsWithSeparator(check, prefix)) {
    return 'inside';
  }
  const escapes = stringValue(resolveConstant(check.context, prefix)) === '..';
  return escapes && isRelativeOf(check, receiver) ? 'outside' : undefined;
}

const NEGATED = { inside: 'outside', outside: 'inside' };

function containment(check, node) {
  const test = unwrapped(node);
  if (test.type === 'UnaryExpression' && test.operator === '!') {
    return NEGATED[directContainment(check, test.argument)];
  }
  return directContainment(check, test);
}

function logicalOperands(test, operator) {
  function joins(node) {
    return node.type === 'LogicalExpression' && node.operator === operator;
  }
  function children(node) {
    return joins(node) ? [node.left, node.right] : [];
  }
  return [...depthFirst(test, children)].filter((node) => !joins(node));
}

function checksBefore(check, statements, child) {
  const earlier = statements.slice(0, Math.max(statements.indexOf(child), 0));
  return earlier.some((statement) => {
    const last =
      statement.consequent?.type === 'BlockStatement'
        ? statement.consequent.body.at(-1)
        : statement.consequent;
    return (
      statement.type === 'IfStatement' &&
      EXITS.has(last?.type) &&
      logicalOperands(statement.test, '||').some(
        (operand) => containment(check, operand) === 'outside',
      )
    );
  });
}

function guards(check, node, child) {
  if (node.type === 'IfStatement' && node.consequent === child) {
    const operands = logicalOperands(node.test, '&&');
    return operands.some((operand) => containment(check, operand) === 'inside');
  }
  const statements = node.type === 'SwitchCase' ? node.consequent : node.body;
  return Array.isArray(statements) && checksBefore(check, statements, child);
}

export function isContained(scope, sink, argument) {
  const target = unwrapped(argument);
  const variable =
    target.type === 'Identifier' ? variableNamed(scope.sourceCode, target) : undefined;
  if (variable === undefined) {
    return false;
  }
  const path = [sink, ...ancestorsOf(sink)];
  const ownerIndex = path.findIndex((node) => FUNCTION_TYPES.has(node.type));
  const within = ownerIndex === -1 ? path : path.slice(0, ownerIndex + 1);
  const check = { ...scope, variable };
  return within.some((node, index) => index > 0 && guards(check, node, within[index - 1]));
}

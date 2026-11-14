import { ancestorsOf, variableNamed } from '../analysis/ancestry.mjs';
import { returnedExpression } from '../collections/costly-forms/repeated-runs.mjs';
import { patternNames } from '../decided/facts.mjs';
import { syntaxChildren } from '../decided/syntax.mjs';
import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { isBooleanOnly, isPresenceElement, isPresenceType } from './presence-types.mjs';

const REFERENCES = new Set(['Identifier', 'MemberExpression', 'ChainExpression']);
function isReference(node) {
  return REFERENCES.has(node.type);
}

function plainText(node, sourceCode) {
  return sourceCode.getText(node).replaceAll('?.', '.').replaceAll('!', '');
}

function usesValue(branch, test, sourceCode) {
  const text = plainText(test, sourceCode);
  return (
    branch !== null &&
    [...depthFirst(branch, syntaxChildren)].some(
      (node) => isReference(node) && plainText(node, sourceCode) === text,
    )
  );
}

const EXITS = new Set(['ReturnStatement', 'ThrowStatement', 'ContinueStatement', 'BreakStatement']);

function exitsAtEnd(branch) {
  const last = branch.type === 'BlockStatement' ? branch.body.at(-1) : branch;
  return last !== undefined && EXITS.has(last.type);
}

function negatedOperand(test) {
  return test.type === 'UnaryExpression' && test.operator === '!' ? test.argument : undefined;
}

function followingStatements(node) {
  const siblings = node.parent?.body;
  return Array.isArray(siblings) ? siblings.slice(siblings.indexOf(node) + 1) : [];
}

function isConditionLink(node) {
  return (
    node.type === 'LogicalExpression' || (node.type === 'UnaryExpression' && node.operator === '!')
  );
}

function isInCondition(node) {
  let child = node;
  for (const parent of ancestorsOf(node)) {
    if (!isConditionLink(parent)) {
      return parent.test === child;
    }
    child = parent;
  }
  return false;
}

function isEmptyDefault(node) {
  return node.type === 'Literal' && (node.value === '' || node.value === false);
}

function returnedIdentifier(body) {
  if (body === undefined || body === null) {
    return undefined;
  }
  const value =
    body.type === 'UnaryExpression' &&
    body.operator === '!' &&
    body.argument.type === 'UnaryExpression'
      ? body.argument.argument
      : body;
  return value.type === 'Identifier' ? value : undefined;
}

function predicateSubject(node) {
  const isFunction = node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
  if (!isFunction || node.params.length !== 1) {
    return undefined;
  }
  const returned = returnedIdentifier(returnedExpression(node));
  return returned !== undefined && patternNames(node.params[0]).includes(returned.name)
    ? returned
    : undefined;
}

function isParameter(node, sourceCode) {
  if (node.type !== 'Identifier') {
    return false;
  }
  const variable = variableNamed(sourceCode, node);
  return variable?.defs.some(({ type }) => type === 'Parameter') === true;
}

function isFilterCall(node) {
  const { callee } = node;
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.name === 'filter' &&
    node.arguments.length === 1
  );
}

function textOf(env, node) {
  return env.sourceCode.getText(node);
}

function isPresence(env, node) {
  return isReference(node) && isPresenceType(env.services.getTypeAtLocation(node), env.checker);
}

function isPresencePredicate(env, predicate, array) {
  if (predicate.type === 'Identifier') {
    const elements = env.services.getTypeAtLocation(array);
    return predicate.name === 'Boolean' && isPresenceElement(elements, env.checker);
  }
  const subject = predicateSubject(predicate);
  return subject !== undefined && isPresence(env, subject);
}

function reportPresence(env, test) {
  env.context.report({ node: test, messageId: 'presence', data: { value: textOf(env, test) } });
}

function isHandledElsewhere(env, test, branch) {
  const isTakenAsIs = branch !== null && textOf(env, branch) === textOf(env, test);
  return isParameter(test, env.sourceCode) && isTakenAsIs;
}

function checkTest(env, test, branch) {
  const used = usesValue(branch, test, env.sourceCode);
  if (!isHandledElsewhere(env, test, branch) && isPresence(env, test) && used) {
    reportPresence(env, test);
  }
}

function checkGuard(env, node) {
  const operand = negatedOperand(node.test);
  if (operand === undefined || !exitsAtEnd(node.consequent) || !isPresence(env, operand)) {
    return;
  }
  const isUsedAfter = followingStatements(node).some((statement) =>
    usesValue(statement, operand, env.sourceCode),
  );
  if (isUsedAfter) {
    reportPresence(env, operand);
  }
}

function isPlainBooleanOr(env, { left, right }) {
  const { services } = env;
  return (
    isBooleanOnly(services.getTypeAtLocation(left)) &&
    isBooleanOnly(services.getTypeAtLocation(right))
  );
}

function checkAnd(env, node) {
  const { left, right } = node;
  if (isPresence(env, left) && usesValue(right, left, env.sourceCode)) {
    reportPresence(env, left);
  }
}

function checkFallback(env, node) {
  const { left, right } = node;
  const isDefault = !(isEmptyDefault(right) || isInCondition(node));
  const isCandidate = isDefault && !isParameter(left, env.sourceCode) && isPresence(env, left);
  if (isCandidate && !isPlainBooleanOr(env, node)) {
    const data = { value: textOf(env, left), fallback: textOf(env, right) };
    env.context.report({ node, messageId: 'fallback', data });
  }
}

function checkLogical(env, node) {
  if (node.operator === '||') {
    checkFallback(env, node);
  } else if (node.operator === '&&') {
    checkAnd(env, node);
  }
}

function checkFilter(env, node) {
  if (isFilterCall(node) && isPresencePredicate(env, node.arguments[0], node.callee.object)) {
    const data = { predicate: textOf(env, node.arguments[0]) };
    env.context.report({ node, messageId: 'filter', data });
  }
}

export function presenceHandlers(context, services) {
  const env = {
    context,
    services,
    sourceCode: context.sourceCode,
    checker: services.program.getTypeChecker(),
  };
  return {
    ConditionalExpression(node) {
      checkTest(env, node.test, node.consequent);
    },
    IfStatement(node) {
      checkTest(env, node.test, node.consequent);
      checkGuard(env, node);
    },
    LogicalExpression(node) {
      checkLogical(env, node);
    },
    CallExpression(node) {
      checkFilter(env, node);
    },
  };
}

import { callsIn } from '../../syntax/kotlin-calls.mjs';
import {
  assignedName,
  assignmentsIn,
  operatorOf,
} from '../../syntax/expressions/kotlin-chains.mjs';
import {
  contextAt,
  enclosingFunction,
  outermostClass,
} from '../../syntax/expressions/kotlin-scope.mjs';
import { plainText, templateEntries } from '../../syntax/expressions/kotlin-strings.mjs';
import { receiverMatches } from '../../syntax/kotlin-receivers.mjs';
import { descendants, identifierOf, kids, textOf } from '../../syntax/kotlin-tree.mjs';
import { JDBC_CLIENT, JDBC_TARGETS } from '../../names/spring-clients.mjs';
import { ENTITY_MANAGER } from '../../names/spring-types.mjs';
import { defineRule, hitOn, symbolAtNode } from '../rule-support.mjs';

const QUERY_METHODS = new Set(['createQuery', 'createNativeQuery']);
const JDBC_METHODS = new Set([
  'query',
  'queryForList',
  'queryForObject',
  'queryForMap',
  'queryForRowSet',
  'queryForStream',
  'update',
  'execute',
  'batchUpdate',
]);
const BUILDERS = new Set(['format', 'formatted', 'plus', 'concat', 'replace']);
const LITERALS = new Set([
  'INTEGER_CONSTANT',
  'FLOAT_CONSTANT',
  'CHARACTER_CONSTANT',
  'BOOLEAN_CONSTANT',
]);
const UPPER_CASE = /^[A-Z][A-Z0-9_]*$/;

function unwrap(node) {
  let current = node;
  while (current?.t === 'PARENTHESIZED') {
    current = kids(current)[0];
  }
  return current;
}

function partsOf(source, node) {
  const parts = [];
  const pending = [node];
  while (pending.length > 0) {
    const expression = unwrap(pending.pop());
    if (expression?.t === 'BINARY_EXPRESSION' && operatorOf(source, expression) === '+') {
      pending.push(
        ...kids(expression)
          .filter((child) => child.t !== 'OPERATION_REFERENCE')
          .reverse(),
      );
    } else {
      parts.push(expression);
    }
  }
  return parts;
}

function nameOf(source, node) {
  const last = node.t === 'REFERENCE_EXPRESSION' ? node : kids(node).at(-1);
  return last?.t === 'REFERENCE_EXPRESSION' ? textOf(source, last) : undefined;
}

function scopeNode(env) {
  return (
    enclosingFunction(env.file, env.ancestors)?.node ??
    outermostClass(env.ancestors) ??
    env.file.tree
  );
}

function localValues(env, name) {
  const scope = scopeNode(env);
  const declared = descendants(scope, (node) => node.t === 'PROPERTY')
    .filter((node) => identifierOf(env.file.source, node) === name)
    .map((node) => kids(node)[kids(node).findIndex((child) => child.t === 'EQ') + 1])
    .filter((value) => value !== undefined);
  const assigned = assignmentsIn(env.file.source, descendants(scope))
    .filter(({ left }) => assignedName(env.file.source, left).member === name)
    .map(({ right }) => right);
  return { declared, assigned };
}

function isTypeReference(source, node) {
  const name = node.t === 'REFERENCE_EXPRESSION' ? textOf(source, node) : '';
  return /^[A-Z]/.test(name) && !UPPER_CASE.test(name);
}

function fixedLocalParts(env, node) {
  if (node.t !== 'REFERENCE_EXPRESSION') {
    return undefined;
  }
  const { source } = env.file;
  const { declared, assigned } = localValues(env, textOf(source, node));
  return declared.length > 0 && assigned.length === 0
    ? declared.flatMap((value) => partsOf(source, value))
    : undefined;
}

function constantParts(env, expression) {
  const { source } = env.file;
  if (expression === undefined) {
    return undefined;
  }
  if (LITERALS.has(expression.t)) {
    return [];
  }
  if (expression.t === 'STRING_TEMPLATE') {
    return templateEntries(source, expression)
      .filter((entry) => entry.dynamic && entry.text !== "${'$'}")
      .map((entry) => entry.expression);
  }
  if (expression.t === 'REFERENCE_EXPRESSION' || expression.t === 'DOT_QUALIFIED_EXPRESSION') {
    return UPPER_CASE.test(nameOf(source, expression) ?? '')
      ? []
      : fixedLocalParts(env, expression);
  }
  if (expression.t === 'IF') {
    return kids(expression, 'THEN')
      .concat(kids(expression, 'ELSE'))
      .every((branch) => plainText(source, kids(branch)[0]) !== undefined)
      ? []
      : undefined;
  }
  return undefined;
}

function isConstant(env, node) {
  const pending = [node];
  const seen = new Set();
  for (const current of pending) {
    const expression = unwrap(current);
    if (!seen.has(expression)) {
      seen.add(expression);
      const parts = constantParts(env, expression);
      if (parts === undefined) {
        return false;
      }
      pending.push(...parts);
    }
  }
  return true;
}

function isDynamic(env, expression) {
  return partsOf(env.file.source, expression).some((part) => !isConstant(env, part));
}

function isBuiltCall(env, expression) {
  const calls = callsIn(env.file.source, expression);
  const top = calls.find(
    (call) => call.node === expression || call.ancestors.at(-1) === expression,
  );
  if (top === undefined || !BUILDERS.has(top.name)) {
    return top?.name === 'buildString';
  }
  const operands = [top.receiver, ...top.arguments.map((argument) => kids(argument)[0])];
  return operands
    .filter((operand) => operand !== undefined && !isTypeReference(env.file.source, operand))
    .some((operand) => isDynamic(env, operand));
}

function isBuilt(env, expression) {
  const node = unwrap(expression);
  if (node?.t === 'BINARY_EXPRESSION') {
    return operatorOf(env.file.source, node) === '+' && isDynamic(env, node);
  }
  if (node?.t === 'STRING_TEMPLATE') {
    return !isConstant(env, node);
  }
  return node !== undefined && isBuiltCall(env, node);
}

function isBuiltVariable(env, node) {
  if (node.t !== 'REFERENCE_EXPRESSION') {
    return false;
  }
  const { declared, assigned } = localValues(env, textOf(env.file.source, node));
  return [...declared, ...assigned].some((value) => isBuilt(env, value));
}

function isQueryCall(file, call) {
  const context = contextAt(file, call.ancestors);
  return (
    (QUERY_METHODS.has(call.name) && receiverMatches(context, call, ENTITY_MANAGER)) ||
    (JDBC_METHODS.has(call.name) && receiverMatches(context, call, JDBC_TARGETS)) ||
    (call.name === 'sql' && receiverMatches(context, call, JDBC_CLIENT))
  );
}

const queryConcatenation = defineRule(
  'SpringQueryConcatenation',
  'Write the query as constant text (a raw string) and pass values as bind parameters; for a list of values use NamedParameterJdbcTemplate or JdbcClient with in (:ids). Joining or formatting values into SQL or JPQL allows injection.',
  (file) =>
    callsIn(file.source, file.tree)
      .filter((call) => !call.reference && call.arguments.length > 0 && isQueryCall(file, call))
      .flatMap((call) => {
        const env = { file, ancestors: call.ancestors };
        const argument = kids(call.arguments[0])[0];
        return argument !== undefined && (isBuilt(env, argument) || isBuiltVariable(env, argument))
          ? [hitOn(argument, `${symbolAtNode(file, call.ancestors)}@${call.name}`)]
          : [];
      }),
);

export const QUERY_CONCATENATION_RULES = [queryConcatenation];

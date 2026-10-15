import { ancestorsOf, variableNamed } from './ancestry.mjs';

const EXIT_STATEMENTS = new Set([
  'ReturnStatement',
  'ThrowStatement',
  'ContinueStatement',
  'BreakStatement',
]);

function isInstanceofOf(expression, name) {
  return (
    expression.type === 'BinaryExpression' &&
    expression.operator === 'instanceof' &&
    expression.left.type === 'Identifier' &&
    expression.left.name === name
  );
}

function constantInitializer(sourceCode, identifier) {
  const definition = variableNamed(sourceCode, identifier)?.defs.at(0);
  return definition?.type === 'Variable' && definition.parent.kind === 'const'
    ? (definition.node.init ?? undefined)
    : undefined;
}

function isInstanceofTest(guard, expression) {
  if (isInstanceofOf(expression, guard.name)) {
    return true;
  }
  const initializer =
    expression.type === 'Identifier'
      ? constantInitializer(guard.sourceCode, expression)
      : undefined;
  return initializer !== undefined && isInstanceofOf(initializer, guard.name);
}

function operandsOf(expression, operator) {
  const pending = [expression];
  for (const current of pending) {
    if (current.type === 'LogicalExpression' && current.operator === operator) {
      pending.push(current.left, current.right);
    }
  }
  return pending;
}

function provesInstance(guard, expression) {
  return operandsOf(expression, '&&').some((operand) => isInstanceofTest(guard, operand));
}

function provesNotInstance(guard, expression) {
  return operandsOf(expression, '||').some(
    (operand) =>
      operand.type === 'UnaryExpression' &&
      operand.operator === '!' &&
      provesInstance(guard, operand.argument),
  );
}

function exits(statement) {
  if (statement.type === 'BlockStatement') {
    const last = statement.body.at(-1);
    return last !== undefined && exits(last);
  }
  return EXIT_STATEMENTS.has(statement.type);
}

function isEarlierExitGuard(guard, statement) {
  return (
    statement.type === 'IfStatement' &&
    statement.alternate === null &&
    provesNotInstance(guard, statement.test) &&
    exits(statement.consequent)
  );
}

function isTrueSwitchCase(guard, parent, child) {
  return (
    parent.consequent.includes(child) &&
    parent.test !== null &&
    parent.parent.discriminant.type === 'Literal' &&
    parent.parent.discriminant.value === true &&
    provesInstance(guard, parent.test)
  );
}

function guardsBranch(guard, parent, child) {
  if (parent.consequent === child) {
    return provesInstance(guard, parent.test);
  }
  return parent.alternate === child && provesNotInstance(guard, parent.test);
}

function guardsChild(guard, parent, child) {
  if (parent.type === 'LogicalExpression' && parent.right === child) {
    return parent.operator === '&&'
      ? provesInstance(guard, parent.left)
      : parent.operator === '||' && provesNotInstance(guard, parent.left);
  }
  if (parent.type === 'IfStatement' || parent.type === 'ConditionalExpression') {
    return guardsBranch(guard, parent, child);
  }
  if (parent.type === 'SwitchCase') {
    return isTrueSwitchCase(guard, parent, child);
  }
  const statements = Array.isArray(parent.body) ? parent.body : [];
  return statements
    .slice(0, statements.indexOf(child))
    .some((statement) => isEarlierExitGuard(guard, statement));
}

export function isNarrowedByInstanceof(sourceCode, node, name) {
  const guard = { sourceCode, name };
  return [node, ...ancestorsOf(node)].some(
    (current) =>
      typeof current.parent?.type === 'string' && guardsChild(guard, current.parent, current),
  );
}

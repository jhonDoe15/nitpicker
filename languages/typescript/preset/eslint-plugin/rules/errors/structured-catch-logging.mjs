import { readHeadPolicy } from '../../../head-policy.mjs';
import { appliesPinoErrorShape } from '../../../libraries/project-libraries.mjs';

const LOG_METHODS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

function isLoggerCall(node) {
  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    LOG_METHODS.has(node.callee.property.name)
  );
}

function rangeContains(outer, inner) {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

function referencesCaughtValue(node, variables) {
  return variables.some((variable) =>
    variable.references.some((reference) => rangeContains(node, reference.identifier)),
  );
}

function errorProperty(objectExpression) {
  if (objectExpression?.type !== 'ObjectExpression') {
    return undefined;
  }
  return objectExpression.properties.find(
    (property) =>
      property.type === 'Property' &&
      !property.computed &&
      ((property.key.type === 'Identifier' && property.key.name === 'err') ||
        (property.key.type === 'Literal' && property.key.value === 'err')),
  );
}

function hasMessageArgument(node) {
  const lastArgument = node.arguments.at(-1);
  return (
    (lastArgument?.type === 'Literal' && typeof lastArgument.value === 'string') ||
    lastArgument?.type === 'TemplateLiteral'
  );
}

function followInitializers(fields, initializers, visited) {
  let current = fields;
  const pending = [fields];
  for (const node of pending) {
    current = node;
    if (node?.type !== 'Identifier' || visited.has(node.name)) return node;
    visited.add(node.name);
    pending.push(initializers.get(node.name));
  }
  return current;
}

function loggingVisitors(context) {
  const sourceCode = context.sourceCode;
  const catchStack = [];

  return {
    CatchClause(node) {
      catchStack.push({
        node,
        variables: sourceCode.getDeclaredVariables(node),
        initializers: new Map(),
      });
    },
    VariableDeclarator(node) {
      const currentCatch = catchStack.at(-1);
      if (currentCatch && node.id.type === 'Identifier' && node.init) {
        currentCatch.initializers.set(node.id.name, node.init);
      }
      if (currentCatch && node.init && referencesCaughtValue(node.init, currentCatch.variables)) {
        currentCatch.variables.push(...sourceCode.getDeclaredVariables(node));
      }
    },
    CallExpression(node) {
      const currentCatch = catchStack.at(-1);
      if (
        currentCatch === undefined ||
        !isLoggerCall(node) ||
        !referencesCaughtValue(node, currentCatch.variables)
      ) {
        return;
      }

      const fields = followInitializers(node.arguments[0], currentCatch.initializers, new Set());
      const property = errorProperty(fields);
      const hasCaughtErrorProperty =
        property?.type === 'Property' &&
        property.value.type !== 'MemberExpression' &&
        referencesCaughtValue(property.value, currentCatch.variables);
      if (!hasCaughtErrorProperty || node.arguments.length !== 2 || !hasMessageArgument(node)) {
        context.report({ node, messageId: 'caughtErrorShape' });
      }
    },
    'CatchClause:exit'() {
      catchStack.pop();
    },
  };
}

export function structuredCatchLoggingRule(active) {
  return {
    meta: {
      type: 'problem',
      docs: {
        description: 'Preserve caught errors under Pino structured error serialization',
      },
      schema: [],
      messages: {
        caughtErrorShape:
          'Log a caught value as logger.<level>({ err: error, ...context }, message).',
      },
    },
    create: (context) => (active ? loggingVisitors(context) : {}),
  };
}

export const rule = structuredCatchLoggingRule(appliesPinoErrorShape(readHeadPolicy().libraries));

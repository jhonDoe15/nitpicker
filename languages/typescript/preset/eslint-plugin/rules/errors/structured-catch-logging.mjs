import { readHeadPolicy } from '../../../head-policy.mjs';
import { librariesForFile } from '../../../libraries/file-libraries.mjs';
import { loggerShapes } from '../../../libraries/project-libraries.mjs';

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

const TYPE_WRAPPER = /^TS(?:As|NonNull|Satisfies)Expression$/;

function unwrap(node) {
  const chain = [node];
  for (const current of chain) {
    if (current?.expression !== undefined && TYPE_WRAPPER.test(current.type)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function isCaughtValue(node, caught) {
  const inner = unwrap(node);
  return (
    inner?.type === 'Identifier' &&
    caught.some((variable) =>
      variable.references.some((reference) => reference.identifier === inner),
    )
  );
}

function hasCaughtValueArgument(node, caught) {
  return node.arguments.some(
    (argument) =>
      isCaughtValue(argument, caught) ||
      (argument.type === 'ObjectExpression' &&
        argument.properties.some(
          (property) => property.type === 'Property' && isCaughtValue(property.value, caught),
        )),
  );
}

function hasErrorField(node, current) {
  const fields = followInitializers(node.arguments[0], current.initializers, new Set());
  const property = errorProperty(fields);
  const hasCaughtErrorProperty =
    property?.type === 'Property' &&
    property.value.type !== 'MemberExpression' &&
    referencesCaughtValue(property.value, current.variables);
  return hasCaughtErrorProperty && node.arguments.length === 2 && hasMessageArgument(node);
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

function loggingVisitors(context, shapes) {
  const sourceCode = context.sourceCode;
  const catchStack = [];
  const messageId = messageIdFor(shapes);

  return {
    CatchClause(node) {
      const variables = sourceCode.getDeclaredVariables(node);
      catchStack.push({ node, variables, caught: [...variables], initializers: new Map() });
    },
    VariableDeclarator(node) {
      const currentCatch = catchStack.at(-1);
      if (currentCatch && node.id.type === 'Identifier' && node.init) {
        currentCatch.initializers.set(node.id.name, node.init);
      }
      if (currentCatch && node.init && referencesCaughtValue(node.init, currentCatch.variables)) {
        currentCatch.variables.push(...sourceCode.getDeclaredVariables(node));
      }
      if (currentCatch && isCaughtValue(node.init, currentCatch.caught)) {
        currentCatch.caught.push(...sourceCode.getDeclaredVariables(node));
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
      const accepted = shapes.some((shape) =>
        shape === 'err-field'
          ? hasErrorField(node, currentCatch)
          : hasCaughtValueArgument(node, currentCatch.caught),
      );
      if (!accepted) {
        context.report({ node, messageId });
      }
    },
    'CatchClause:exit'() {
      catchStack.pop();
    },
  };
}

function messageIdFor(shapes) {
  if (shapes.length > 1) {
    return 'caughtEitherShape';
  }
  return shapes[0] === 'err-field' ? 'caughtErrorShape' : 'caughtValueShape';
}

const EXCEPTION =
  'If this is legitimate, add an exception for nitpicker/structured-catch-logging in nitpicker.config.json.';

export function structuredCatchLoggingRule(rootLibraries) {
  return {
    meta: {
      type: 'problem',
      docs: {
        description: 'Keep a caught error on the logger call in the shape the project logger reads',
      },
      schema: [],
      messages: {
        caughtErrorShape:
          'Log a caught value as logger.<level>({ err: error, ...context }, message).',
        caughtValueShape: `Pass the caught value itself to the logger, for example logger.error('message', error), not its message or a template string. ${EXCEPTION}`,
        caughtEitherShape: `Log a caught value as logger.<level>({ err: error, ...context }, message), or pass the caught value itself, for example logger.error('message', error). ${EXCEPTION}`,
      },
    },
    create: (context) =>
      loggingVisitors(context, loggerShapes(librariesForFile(context, rootLibraries))),
  };
}

export const rule = structuredCatchLoggingRule(readHeadPolicy().libraries);

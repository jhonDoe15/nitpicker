import { ancestorsOf } from '../analysis/ancestry.mjs';

const ERROR_SUBCLASS_NAME = /Error$/;
const SUBCLASS_WRAPPER = { optionsIndex: undefined };

function wrapperFor(wrappers, name) {
  const configured = wrappers.find((candidate) => candidate.name === name);
  if (configured !== undefined) {
    return configured;
  }
  return ERROR_SUBCLASS_NAME.test(name) ? SUBCLASS_WRAPPER : undefined;
}

function matchingWrapper(wrappers, node) {
  if (node.callee.type !== 'Identifier') return undefined;
  const wrapper = wrapperFor(wrappers, node.callee.name);
  if (!wrapper) return undefined;
  const isClassified = wrapper.classificationIndex !== undefined;
  const isUnclassified =
    node.arguments[wrapper.classificationIndex]?.value === wrapper.unclassifiedValue;
  return isClassified && !isUnclassified ? undefined : wrapper;
}

function referencesCatch(caughtVariables, expression) {
  return caughtVariables.some((variable) =>
    variable.references.some(
      (reference) =>
        expression.range[0] <= reference.identifier.range[0] &&
        reference.identifier.range[1] <= expression.range[1],
    ),
  );
}

function hasCauseProperty(options, caughtVariables) {
  return (
    options?.type === 'ObjectExpression' &&
    options.properties.some(
      (property) =>
        property.type === 'Property' &&
        (property.key.name ?? property.key.value) === 'cause' &&
        referencesCatch(caughtVariables, property.value),
    )
  );
}

function preservesCause(wrapper, node, caughtVariables) {
  if (wrapper.optionsIndex !== undefined) {
    return hasCauseProperty(node.arguments[wrapper.optionsIndex], caughtVariables);
  }
  return node.arguments.some(
    (argument) =>
      hasCauseProperty(argument, caughtVariables) ||
      (argument.type === 'Identifier' && referencesCatch(caughtVariables, argument)),
  );
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          wrappers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                optionsIndex: { type: 'integer', minimum: 0 },
                classificationIndex: { type: 'integer', minimum: 0 },
                unclassifiedValue: { type: 'string' },
              },
              required: ['name', 'optionsIndex'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      lostCause:
        'Preserve the original cause when wrapping a caught failure: `new AppError(message, { cause: error })`.',
    },
  },
  create(context) {
    const wrappers = context.options[0]?.wrappers ?? [{ name: 'Error', optionsIndex: 1 }];
    return {
      NewExpression(node) {
        const wrapper = matchingWrapper(wrappers, node);
        if (!wrapper) return;
        const handler = ancestorsOf(node).find((ancestor) => ancestor.type === 'CatchClause');
        if (!handler) return;
        const caughtVariables = context.sourceCode.getDeclaredVariables(handler);
        const thrown = node.parent.type === 'ThrowStatement' && caughtVariables.length > 0;
        if (
          wrapper.classificationIndex === undefined &&
          !thrown &&
          !referencesCatch(caughtVariables, node)
        ) {
          return;
        }
        if (preservesCause(wrapper, node, caughtVariables)) return;
        context.report({ node, messageId: 'lostCause' });
      },
    };
  },
};

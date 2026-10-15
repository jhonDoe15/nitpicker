import { ancestorsOf } from './ancestry.mjs';

const ERROR_SUBCLASS_NAME = /Error$/;
const SUBCLASS_WRAPPER = { optionsIndex: undefined };

function propertyName(property) {
  return property.key.name ?? property.key.value;
}

function hasCauseProperty(options, referencesCatch) {
  return (
    options?.type === 'ObjectExpression' &&
    options.properties.some(
      (property) =>
        property.type === 'Property' &&
        propertyName(property) === 'cause' &&
        referencesCatch(property.value),
    )
  );
}

function wrapperFor(wrappers, name) {
  const configured = wrappers.find((candidate) => candidate.name === name);
  if (configured !== undefined) {
    return configured;
  }
  return ERROR_SUBCLASS_NAME.test(name) ? SUBCLASS_WRAPPER : undefined;
}

function preservesCause(wrapper, node, referencesCatch) {
  if (wrapper.optionsIndex !== undefined) {
    return hasCauseProperty(node.arguments[wrapper.optionsIndex], referencesCatch);
  }
  return node.arguments.some(
    (argument) =>
      hasCauseProperty(argument, referencesCatch) ||
      (argument.type === 'Identifier' && referencesCatch(argument)),
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
        if (node.callee.type !== 'Identifier') return;
        const wrapper = wrapperFor(wrappers, node.callee.name);
        if (
          !wrapper ||
          (wrapper.classificationIndex !== undefined &&
            node.arguments[wrapper.classificationIndex]?.value !== wrapper.unclassifiedValue)
        )
          return;
        const parent = ancestorsOf(node).find((ancestor) => ancestor.type === 'CatchClause');
        if (!parent) return;
        const caughtVariables = context.sourceCode.getDeclaredVariables(parent);
        function referencesCatch(expression) {
          return caughtVariables.some((variable) =>
            variable.references.some(
              (reference) =>
                expression.range[0] <= reference.identifier.range[0] &&
                reference.identifier.range[1] <= expression.range[1],
            ),
          );
        }
        if (wrapper.classificationIndex === undefined) {
          if (!referencesCatch(node)) return;
        }
        if (!preservesCause(wrapper, node, referencesCatch)) {
          context.report({ node, messageId: 'lostCause' });
        }
      },
    };
  },
};

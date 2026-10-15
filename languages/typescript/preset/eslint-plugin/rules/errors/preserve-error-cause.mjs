import { ancestorsOf } from '../analysis/ancestry.mjs';

function matchingWrapper(wrappers, node) {
  if (node.callee.type !== 'Identifier') return undefined;
  const wrapper = wrappers.find((candidate) => candidate.name === node.callee.name);
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

function preservesCause(options, caughtVariables) {
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
        'Preserve the original cause when wrapping an unclassified caught failure, or use the error normalization boundary.',
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
        if (wrapper.classificationIndex === undefined && !referencesCatch(caughtVariables, node)) {
          return;
        }
        if (preservesCause(node.arguments[wrapper.optionsIndex], caughtVariables)) return;
        context.report({ node, messageId: 'lostCause' });
      },
    };
  },
};

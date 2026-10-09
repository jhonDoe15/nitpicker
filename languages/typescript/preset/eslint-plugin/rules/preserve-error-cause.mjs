import { ancestorsOf } from './ancestry.mjs';
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
        if (node.callee.type !== 'Identifier') return;
        const wrapper = wrappers.find((candidate) => candidate.name === node.callee.name);
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
        // A fresh bounded error may deliberately sanitize external data. A generic
        // wrapper derived from the caught value must retain that value's cause.
        if (wrapper.classificationIndex === undefined) {
          if (!referencesCatch(node)) return;
        }
        const options = node.arguments[wrapper.optionsIndex];
        if (
          options?.type === 'ObjectExpression' &&
          options.properties.some(
            (property) =>
              property.type === 'Property' &&
              (property.key.name ?? property.key.value) === 'cause' &&
              referencesCatch(property.value),
          )
        )
          return;
        context.report({ node, messageId: 'lostCause' });
      },
    };
  },
};

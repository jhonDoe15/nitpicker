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

function isPromiseReject(call) {
  return (
    call.type === 'CallExpression' &&
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    call.callee.object.type === 'Identifier' &&
    call.callee.object.name === 'Promise' &&
    call.callee.property.name === 'reject'
  );
}

function isThrownLocal(sourceCode, declarator) {
  return sourceCode
    .getDeclaredVariables(declarator)
    .some((variable) =>
      variable.references.some(({ identifier }) => identifier.parent.type === 'ThrowStatement'),
    );
}

function isThrown(sourceCode, node) {
  const { parent } = node;
  if (parent.type === 'ThrowStatement') {
    return true;
  }
  if (isPromiseReject(parent)) {
    return parent.arguments[0] === node;
  }
  return (
    parent.type === 'VariableDeclarator' &&
    parent.init === node &&
    isThrownLocal(sourceCode, parent)
  );
}

function causeReport(sourceCode, { wrapper, node, handler }) {
  const caughtVariables = sourceCode.getDeclaredVariables(handler);
  const thrown = isThrown(sourceCode, node);
  if (thrown && handler.param === null) {
    return 'bindingLess';
  }
  const wrapsCaught =
    wrapper.classificationIndex !== undefined || thrown || referencesCatch(caughtVariables, node);
  return wrapsCaught && !preservesCause(wrapper, node, caughtVariables) ? 'lostCause' : undefined;
}

const EXCEPTION_ROUTE =
  ' If the original failure is deliberately dropped, add an exception for this rule in nitpicker.config.json.';

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
      lostCause: `Preserve the original cause when wrapping a caught failure: \`new AppError(message, { cause: error })\`.${EXCEPTION_ROUTE}`,
      bindingLess: `This catch has no binding, so the new failure loses the original cause. Bind it and pass it on: \`catch (error) { throw new AppError(message, { cause: error }); }\`.${EXCEPTION_ROUTE}`,
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
        const messageId = causeReport(context.sourceCode, { wrapper, node, handler });
        if (messageId !== undefined) {
          context.report({ node, messageId });
        }
      },
    };
  },
};

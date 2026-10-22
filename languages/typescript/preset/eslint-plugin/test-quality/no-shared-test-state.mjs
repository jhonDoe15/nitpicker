import { callbackOwner, enclosingFunction, isSuiteCall } from './test-calls.mjs';

function declaresSharedState(declaration) {
  if (declaration.kind !== 'let') {
    return false;
  }
  const owner = enclosingFunction(declaration);
  if (owner === undefined) {
    return true;
  }
  const call = callbackOwner(owner);
  return call !== undefined && isSuiteCall(call) && owner.body === declaration.parent;
}

function isTopLevelOrSuiteLevel(declaration) {
  const parent = declaration.parent;
  return (
    parent.type === 'Program' ||
    parent.type === 'ExportNamedDeclaration' ||
    (parent.type === 'BlockStatement' && declaresSharedState(declaration))
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban initialised let state shared by the tests of a file' },
    schema: [],
    messages: {
      sharedState:
        'Shared mutable state makes tests depend on their order. Keep `{{name}}` inside the test, or declare it without a value and set it in `beforeEach`. A justified exception goes in nitpicker.config.json.',
    },
  },
  create(context) {
    return {
      VariableDeclaration(node) {
        if (node.kind !== 'let' || !isTopLevelOrSuiteLevel(node)) {
          return;
        }
        for (const declarator of node.declarations) {
          if (declarator.init === null || declarator.id.type !== 'Identifier') {
            continue;
          }
          context.report({
            node: declarator,
            messageId: 'sharedState',
            data: { name: declarator.id.name },
          });
        }
      },
    };
  },
};

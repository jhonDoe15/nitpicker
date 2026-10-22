import {
  callbackOf,
  isCaseCall,
  isSuiteCall,
  isTestFunctionChain,
} from '../test-quality/test-calls.mjs';

const CONDITIONAL_SKIPS = new Set(['skipIf', 'runIf']);
const TOKEN_MESSAGES = new Map([['todo', 'todo']]);
const SWITCH_OFF_OPTIONS = new Set(['skip', 'todo']);
const SWITCH_OFF_CALLS = new Set(['skip', 'todo']);

function isBooleanLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'boolean';
}

function isFixedSwitchOff(value) {
  return value?.type === 'Literal' ? Boolean(value.value) : value?.type === 'TemplateLiteral';
}

function switchedOffOption(call) {
  return call.arguments
    .filter((argument) => argument.type === 'ObjectExpression')
    .flatMap((options) => options.properties)
    .find(
      (property) =>
        property.type === 'Property' &&
        !property.computed &&
        SWITCH_OFF_OPTIONS.has(property.key.name ?? property.key.value) &&
        isFixedSwitchOff(property.value),
    );
}

function contextNames(callback) {
  const [first] = callback.params;
  if (first?.type === 'Identifier') {
    return { context: first.name, destructured: new Set() };
  }
  const destructured = (first?.type === 'ObjectPattern' ? first.properties : [])
    .filter((property) => property.type === 'Property' && property.value.type === 'Identifier')
    .filter((property) => SWITCH_OFF_CALLS.has(property.key.name))
    .map((property) => property.value.name);
  return { context: undefined, destructured: new Set(destructured) };
}

function isSwitchOffCall(statement, names) {
  const expression = statement.type === 'ExpressionStatement' ? statement.expression : undefined;
  const callee = expression?.type === 'CallExpression' ? expression.callee : undefined;
  if (callee?.type === 'Identifier') {
    return names.destructured.has(callee.name);
  }
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    SWITCH_OFF_CALLS.has(callee.property.name) &&
    (callee.object.type === 'ThisExpression' ||
      (callee.object.type === 'Identifier' && callee.object.name === names.context))
  );
}

function bodySwitchOff(call) {
  const callback = callbackOf(call);
  if (callback?.body.type !== 'BlockStatement') {
    return undefined;
  }
  const names = contextNames(callback);
  return callback.body.body.find((statement) => isSwitchOffCall(statement, names));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban test forms that switch a test off' },
    schema: [],
    messages: {
      todo: 'Do not leave a `todo` test: write the test, or delete the stub.',
      literalCondition:
        'A literal condition switches the test off for good. Delete the test or make it run; a real platform condition such as `process.platform === "win32"` is allowed.',
      fixedOption:
        'A fixed `skip` or `todo` option switches the test off for good. Delete the test or make it run; a real condition such as `{ skip: process.platform === "win32" }` is allowed.',
      unconditionalSkip:
        'An unconditional `skip()` or `todo()` in the test body switches the test off for good. Delete the test or make it run; a skip under a real condition such as `if (process.platform === "win32") { t.skip(); }` is allowed.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed || !isTestFunctionChain(node.object)) {
          return;
        }
        const messageId = TOKEN_MESSAGES.get(node.property.name);
        if (messageId !== undefined) {
          context.report({ node: node.property, messageId });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          CONDITIONAL_SKIPS.has(callee.property.name) &&
          isTestFunctionChain(callee.object) &&
          isBooleanLiteral(node.arguments[0])
        ) {
          context.report({ node: callee.property, messageId: 'literalCondition' });
        }
        if (!isCaseCall(node) && !isSuiteCall(node)) {
          return;
        }
        const option = switchedOffOption(node);
        if (option !== undefined) {
          context.report({ node: option, messageId: 'fixedOption' });
        }
        const skipCall = bodySwitchOff(node);
        if (skipCall !== undefined) {
          context.report({ node: skipCall, messageId: 'unconditionalSkip' });
        }
      },
    };
  },
};

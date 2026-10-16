import { staticKeyName } from '../analysis/static-shapes.mjs';
import { inReactTestFilesOnly } from '../react/react-test-files.mjs';

const HOVER_EVENTS = new Set(['mouseEnter', 'mouseOver']);
const KEYBOARD_ACTIONS = new Set(['tab', 'keyboard', 'focus', 'press', 'down', 'up']);
const KEYBOARD_EVENTS = new Set(['keyDown', 'keyUp', 'keyPress', 'focusIn']);
const KEY_TOKEN = /\{[^{}]+\}/u;

function chainHasKeyboard(object) {
  const pending = [object];
  for (const current of pending) {
    if (current.type === 'Identifier') {
      return current.name === 'keyboard';
    }
    if (current.type !== 'MemberExpression') {
      return false;
    }
    if (!current.computed && current.property.name === 'keyboard') {
      return true;
    }
    pending.push(current.object);
  }
  return false;
}

function calleeMember(node) {
  const { callee } = node;
  if (callee.type !== 'MemberExpression' || callee.computed) {
    return undefined;
  }
  return { object: callee.object, name: callee.property.name };
}

function isFireEvent(object) {
  return object.type === 'Identifier' && object.name === 'fireEvent';
}

function hasKey(action, name) {
  return action.properties.some(
    (property) =>
      property.type === 'Property' && staticKeyName(property.key, property.computed) === name,
  );
}

function isPointerHover(call) {
  const actions = call.arguments.flatMap((argument) =>
    argument.type === 'ArrayExpression' ? argument.elements : [argument],
  );
  return actions.some(
    (action) =>
      action?.type === 'ObjectExpression' && hasKey(action, 'target') && !hasKey(action, 'keys'),
  );
}

function isHover(call, { object, name }) {
  return (
    name === 'hover' ||
    (isFireEvent(object) && HOVER_EVENTS.has(name)) ||
    (name === 'pointer' && isPointerHover(call))
  );
}

function typesKeyTokens(call) {
  return call.arguments.some((argument) => {
    if (argument.type === 'Literal') {
      return typeof argument.value === 'string' && KEY_TOKEN.test(argument.value);
    }
    return (
      argument.type === 'TemplateLiteral' &&
      argument.quasis.some((quasi) => KEY_TOKEN.test(quasi.value.cooked ?? ''))
    );
  });
}

function isKeyboardInteraction(call, { object, name }) {
  return (
    KEYBOARD_ACTIONS.has(name) ||
    chainHasKeyboard(object) ||
    (isFireEvent(object) && KEYBOARD_EVENTS.has(name)) ||
    (name === 'type' && typesKeyTokens(call))
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a keyboard test in every component test file that hovers',
    },
    schema: [],
    messages: {
      hoverWithoutKeyboard:
        'Every hover behavior needs a keyboard equivalent. Add a test that tabs to the element (`await user.tab()`) and asserts the same state.',
    },
  },
  create: inReactTestFilesOnly((context) => {
    const hovers = [];
    let usesKeyboard = false;
    return {
      CallExpression(node) {
        const member = calleeMember(node);
        if (member === undefined) {
          return;
        }
        if (isHover(node, member)) {
          hovers.push(node);
        }
        usesKeyboard ||= isKeyboardInteraction(node, member);
      },
      'Program:exit'() {
        if (!usesKeyboard && hovers.length > 0) {
          context.report({ node: hovers[0], messageId: 'hoverWithoutKeyboard' });
        }
      },
    };
  }),
};

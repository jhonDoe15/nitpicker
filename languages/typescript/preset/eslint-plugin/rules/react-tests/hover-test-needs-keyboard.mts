import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { staticKeyName } from '../analysis/static-shapes.mts';
import { inReactTestFilesOnly } from './react-test-files.mts';

const HOVER_EVENTS = new Set(['mouseEnter', 'mouseOver']);
const KEYBOARD = 'keyboard';
const KEYBOARD_ACTIONS = new Set(['tab', KEYBOARD, 'focus', 'press', 'down', 'up']);
const KEYBOARD_EVENTS = new Set(['keyDown', 'keyUp', 'keyPress', 'focusIn']);
const KEY_TOKEN = /\{[^{}]+\}/u;

type Member = { readonly object: TSESTree.Node; readonly name: string };

function chainHasKeyboard(object: TSESTree.Node): boolean {
  const pending = [object];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.Identifier) {
      return current.name === KEYBOARD;
    }
    if (current.type !== AST_NODE_TYPES.MemberExpression) {
      return false;
    }
    if (!current.computed && current.property.name === KEYBOARD) {
      return true;
    }
    pending.push(current.object);
  }
  return false;
}

function calleeMember(node: TSESTree.CallExpression): Member | undefined {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  return { object: callee.object, name: callee.property.name };
}

function isFireEvent(object: TSESTree.Node): boolean {
  return object.type === AST_NODE_TYPES.Identifier && object.name === 'fireEvent';
}

function hasKey(action: TSESTree.ObjectExpression, name: string): boolean {
  return action.properties.some(
    (property) => property.type === AST_NODE_TYPES.Property && staticKeyName(property) === name,
  );
}

function isPointerHover(call: TSESTree.CallExpression): boolean {
  const actions = call.arguments.flatMap((argument) =>
    argument.type === AST_NODE_TYPES.ArrayExpression ? argument.elements : [argument],
  );
  return actions.some(
    (action) =>
      action?.type === AST_NODE_TYPES.ObjectExpression &&
      hasKey(action, 'target') &&
      !hasKey(action, 'keys'),
  );
}

function isHover(call: TSESTree.CallExpression, { object, name }: Member): boolean {
  return (
    name === 'hover' ||
    (isFireEvent(object) && HOVER_EVENTS.has(name)) ||
    (name === 'pointer' && isPointerHover(call))
  );
}

function typesKeyTokens(call: TSESTree.CallExpression): boolean {
  return call.arguments.some((argument) => {
    if (argument.type === AST_NODE_TYPES.Literal) {
      return typeof argument.value === 'string' && KEY_TOKEN.test(argument.value);
    }
    return (
      argument.type === AST_NODE_TYPES.TemplateLiteral &&
      argument.quasis.some((quasi) => KEY_TOKEN.test(quasi.value.cooked ?? ''))
    );
  });
}

function isKeyboardInteraction(call: TSESTree.CallExpression, { object, name }: Member): boolean {
  return (
    KEYBOARD_ACTIONS.has(name) ||
    chainHasKeyboard(object) ||
    (isFireEvent(object) && KEYBOARD_EVENTS.has(name)) ||
    (name === 'type' && typesKeyTokens(call))
  );
}

export const rule: TSESLint.RuleModule<'hoverWithoutKeyboard'> = {
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
    const hovers: TSESTree.CallExpression[] = [];
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
        const [first] = hovers;
        if (!usesKeyboard && first !== undefined) {
          context.report({ node: first, messageId: 'hoverWithoutKeyboard' });
        }
      },
    };
  }),
};

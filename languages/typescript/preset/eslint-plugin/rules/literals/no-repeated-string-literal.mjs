import { ancestorsOf } from '../analysis/ancestry.mjs';
import {
  isDiscriminantComparison,
  isDiscriminantList,
  isRuleSeverity,
} from './literal-contexts.mjs';
import {
  DISCRIMINANT_KEYS,
  MAXIMUM_USES,
  MINIMUM_LENGTH,
  TRANSLATION_CALLS,
  isIdiomaticText,
} from '../../../../../../shared/literals/repeated-literal-exemptions.mjs';

const ALPHANUMERIC = /[A-Za-z0-9]/;
const SHOWN_LENGTH = 30;
const DISCRIMINANTS = new Set(DISCRIMINANT_KEYS);
const TRANSLATIONS = new Set(TRANSLATION_CALLS);
const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);
const MODULE_LOADERS = new Set(['require', 'import']);
const MODULE_MOCKS = new Set([
  'mock',
  'doMock',
  'unmock',
  'requireActual',
  'importActual',
  'resolve',
]);
const MOCK_OBJECTS = new Set(['vi', 'jest', 'require']);
const EVENT_CALLS = new Set([
  'on',
  'once',
  'off',
  'addListener',
  'removeListener',
  'emit',
  'addEventListener',
  'removeEventListener',
]);
const CLASS_HELPERS = new Set(['cn', 'clsx', 'classnames', 'twMerge']);
const CLASS_ATTRIBUTES = new Set(['className', 'class']);

const MESSAGE =
  'The string {{text}} is used three times or more in this file. Name it once as a constant (`const NAME = "..."`) and use the constant. An exception fits only for text that must stay inline.';

function translationName({ callee }) {
  const named = callee.type === 'MemberExpression' && !callee.computed ? callee.property : callee;
  return named.type === 'Identifier' ? named.name : undefined;
}

function isKeyOf(node, parent) {
  return (
    (parent.type === 'Property' ||
      parent.type === 'PropertyDefinition' ||
      parent.type === 'MethodDefinition' ||
      parent.type === 'TSPropertySignature' ||
      parent.type === 'TSEnumMember') &&
    parent.key === node &&
    !parent.computed
  );
}

function isDiscriminantValue(node, parent) {
  return (
    parent.type === 'Property' &&
    parent.value === node &&
    !parent.computed &&
    parent.key.type === 'Identifier' &&
    DISCRIMINANTS.has(parent.key.name)
  );
}

function isTranslationKey(node, parent) {
  return (
    parent.type === 'CallExpression' &&
    parent.arguments[0] === node &&
    TRANSLATIONS.has(translationName(parent))
  );
}

function isMockCallee({ callee }) {
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    MOCK_OBJECTS.has(callee.object.name) &&
    MODULE_MOCKS.has(callee.property.name)
  );
}

function isModuleSpecifier(node, parent) {
  return (
    parent.type === 'ImportExpression' ||
    (parent.type === 'CallExpression' &&
      parent.arguments[0] === node &&
      ((parent.callee.type === 'Identifier' && MODULE_LOADERS.has(parent.callee.name)) ||
        isMockCallee(parent)))
  );
}

function isEventName(node, parent) {
  return (
    parent.type === 'CallExpression' &&
    parent.arguments[0] === node &&
    EVENT_CALLS.has(translationName(parent))
  );
}

function isMembershipKey(node, parent) {
  return parent.type === 'BinaryExpression' && parent.operator === 'in' && parent.left === node;
}

function isNamedDeclaration(node, parent) {
  return (
    (parent.type === 'VariableDeclarator' &&
      parent.init === node &&
      parent.parent.kind === 'const') ||
    (parent.type === 'TSEnumMember' && (parent.initializer === node || parent.id === node))
  );
}

function isTypeofOperand(node, parent) {
  const other = parent.left === node ? parent.right : parent.left;
  return (
    parent.type === 'BinaryExpression' &&
    EQUALITY_OPERATORS.has(parent.operator) &&
    other.type === 'UnaryExpression' &&
    other.operator === 'typeof'
  );
}

function isStyleOrDecorator(ancestor) {
  return (
    ancestor.type === 'Decorator' ||
    (ancestor.type === 'JSXAttribute' && CLASS_ATTRIBUTES.has(ancestor.name.name)) ||
    (ancestor.type === 'CallExpression' && CLASS_HELPERS.has(translationName(ancestor)))
  );
}

function isInsideExemptContext(node) {
  return ancestorsOf(node).some(isStyleOrDecorator);
}

const PARENT_EXEMPTIONS = [
  isKeyOf,
  isTypeofOperand,
  isDiscriminantValue,
  isDiscriminantComparison,
  isDiscriminantList,
  isRuleSeverity,
  isTranslationKey,
  isModuleSpecifier,
  isEventName,
  isMembershipKey,
  isNamedDeclaration,
];

const PARENT_TYPES = new Set([
  'ImportDeclaration',
  'ExportAllDeclaration',
  'ExportNamedDeclaration',
  'ImportAttribute',
  'ExpressionStatement',
  'JSXAttribute',
  'SwitchCase',
  'TSModuleDeclaration',
  'TSExternalModuleReference',
  'TSImportType',
  'TSLiteralType',
]);

function isMemberKey(node, parent) {
  return parent.type === 'MemberExpression' && parent.computed && parent.property === node;
}

function isExempt(node) {
  const { parent } = node;
  return (
    PARENT_TYPES.has(parent.type) ||
    isMemberKey(node, parent) ||
    isInsideExemptContext(node) ||
    PARENT_EXEMPTIONS.some((exempt) => exempt(node, parent))
  );
}

function isCountable(node, text) {
  return (
    typeof text === 'string' &&
    text.length >= MINIMUM_LENGTH &&
    ALPHANUMERIC.test(text) &&
    !isIdiomaticText(text) &&
    !isExempt(node)
  );
}

function shown(text) {
  const flat = text.replaceAll(/\s+/g, ' ');
  const clipped = flat.length > SHOWN_LENGTH ? `${flat.slice(0, SHOWN_LENGTH)}...` : flat;
  return JSON.stringify(clipped);
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow a string literal used three times or more in one file' },
    schema: [],
    messages: { repeated: MESSAGE },
  },
  create(context) {
    const uses = new Map();
    function count(node, text) {
      if (isCountable(node, text)) {
        uses.set(text, [...(uses.get(text) ?? []), { node, text }]);
      }
    }
    return {
      Literal(node) {
        count(node, node.value);
      },
      TemplateLiteral(node) {
        if (node.quasis.length === 1 && node.parent.type !== 'TaggedTemplateExpression') {
          count(node, node.quasis[0].value.cooked);
        }
      },
      'Program:exit'() {
        for (const nodes of uses.values()) {
          for (const { node, text } of nodes.slice(MAXIMUM_USES)) {
            context.report({ node, messageId: 'repeated', data: { text: shown(text) } });
          }
        }
      },
    };
  },
};

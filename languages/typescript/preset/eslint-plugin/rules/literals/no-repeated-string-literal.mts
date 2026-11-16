import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import {
  isDiscriminantComparison,
  isDiscriminantList,
  isRuleSeverity,
} from './literal-contexts.mts';
import {
  DISCRIMINANT_KEYS as untypedDiscriminantKeys,
  MAXIMUM_USES as untypedMaximumUses,
  MINIMUM_LENGTH as untypedMinimumLength,
  TRANSLATION_CALLS as untypedTranslationCalls,
  isIdiomaticText as untypedIsIdiomaticText,
} from '../../../../../../shared/literals/repeated-literal-exemptions.mjs';

const DISCRIMINANT_KEYS: readonly string[] = untypedDiscriminantKeys;
const MAXIMUM_USES: number = untypedMaximumUses;
const MINIMUM_LENGTH: number = untypedMinimumLength;
const TRANSLATION_CALLS: readonly string[] = untypedTranslationCalls;
const isIdiomaticText: (text: string) => boolean = untypedIsIdiomaticText;

type Countable = TSESTree.Literal | TSESTree.TemplateLiteral;
type Counted = { readonly node: Countable; readonly text: string };
type Exemption = (node: TSESTree.Node, parent: TSESTree.Node) => boolean;

const ALPHANUMERIC = /[A-Za-z0-9]/;
const SHOWN_LENGTH = 30;
const DISCRIMINANTS = new Set<string>(DISCRIMINANT_KEYS);
const TRANSLATIONS = new Set<string>(TRANSLATION_CALLS);
const EQUALITY_OPERATORS = new Set<string>(['===', '!==', '==', '!=']);
const MODULE_LOADERS = new Set<string>(['require', 'import']);
const MODULE_MOCKS = new Set<string>([
  'mock',
  'doMock',
  'unmock',
  'requireActual',
  'importActual',
  'resolve',
]);
const MOCK_OBJECTS = new Set<string>(['vi', 'jest', 'require']);
const EVENT_CALLS = new Set<string>([
  'on',
  'once',
  'off',
  'addListener',
  'removeListener',
  'emit',
  'addEventListener',
  'removeEventListener',
]);
const CLASS_HELPERS = new Set<string>(['cn', 'clsx', 'classnames', 'twMerge']);
const CLASS_ATTRIBUTES = new Set<string>(['className', 'class']);

const MESSAGE =
  'The string {{text}} is used three times or more in this file. Name it once as a constant (`const NAME = "..."`) and use the constant. An exception fits only for text that must stay inline.';

function translationName({ callee }: TSESTree.CallExpression): string {
  const named =
    callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed ? callee.property : callee;
  return named.type === AST_NODE_TYPES.Identifier ? named.name : '';
}

function isKeyOf(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return (
    (parent.type === AST_NODE_TYPES.Property ||
      parent.type === AST_NODE_TYPES.PropertyDefinition ||
      parent.type === AST_NODE_TYPES.MethodDefinition ||
      parent.type === AST_NODE_TYPES.TSPropertySignature ||
      parent.type === AST_NODE_TYPES.TSEnumMember) &&
    'key' in parent &&
    parent.key === node &&
    !parent.computed
  );
}

function isDiscriminantValue(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.Property &&
    parent.value === node &&
    !parent.computed &&
    parent.key.type === AST_NODE_TYPES.Identifier &&
    DISCRIMINANTS.has(parent.key.name)
  );
}

function isTranslationKey(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === node &&
    TRANSLATIONS.has(translationName(parent))
  );
}

function isMockCallee({ callee }: TSESTree.CallExpression): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    MOCK_OBJECTS.has(callee.object.name) &&
    MODULE_MOCKS.has(nameOf(callee.property) ?? '')
  );
}

function isModuleSpecifier(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.ImportExpression ||
    (parent.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments[0] === node &&
      ((parent.callee.type === AST_NODE_TYPES.Identifier &&
        MODULE_LOADERS.has(parent.callee.name)) ||
        isMockCallee(parent)))
  );
}

function isEventName(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === node &&
    EVENT_CALLS.has(translationName(parent))
  );
}

function isMembershipKey(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.BinaryExpression &&
    parent.operator === 'in' &&
    parent.left === node
  );
}

function isNamedDeclaration(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return (
    (parent.type === AST_NODE_TYPES.VariableDeclarator &&
      parent.init === node &&
      parent.parent.kind === 'const') ||
    (parent.type === AST_NODE_TYPES.TSEnumMember &&
      (parent.initializer === node || parent.id === node))
  );
}

function isTypeofOperand(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  if (parent.type !== AST_NODE_TYPES.BinaryExpression) {
    return false;
  }
  const other = parent.left === node ? parent.right : parent.left;
  return (
    EQUALITY_OPERATORS.has(parent.operator) &&
    other.type === AST_NODE_TYPES.UnaryExpression &&
    other.operator === 'typeof'
  );
}

function isStyleOrDecorator(ancestor: TSESTree.Node): boolean {
  return (
    ancestor.type === AST_NODE_TYPES.Decorator ||
    (ancestor.type === AST_NODE_TYPES.JSXAttribute &&
      CLASS_ATTRIBUTES.has(nameOf(ancestor.name) ?? '')) ||
    (ancestor.type === AST_NODE_TYPES.CallExpression &&
      CLASS_HELPERS.has(translationName(ancestor)))
  );
}

function isInsideExemptContext(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(isStyleOrDecorator);
}

const PARENT_EXEMPTIONS: readonly Exemption[] = [
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

const PARENT_TYPES = new Set<string>([
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

function isMemberKey(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.MemberExpression && parent.computed && parent.property === node
  );
}

function isExempt(node: Countable): boolean {
  const { parent } = node;
  return (
    PARENT_TYPES.has(parent.type) ||
    isMemberKey(node, parent) ||
    isInsideExemptContext(node) ||
    PARENT_EXEMPTIONS.some((exempt) => exempt(node, parent))
  );
}

function isCountable(node: Countable, text: unknown): text is string {
  return (
    typeof text === 'string' &&
    text.length >= MINIMUM_LENGTH &&
    ALPHANUMERIC.test(text) &&
    !isIdiomaticText(text) &&
    !isExempt(node)
  );
}

function shown(text: string): string {
  const flat = text.replaceAll(/\s+/g, ' ');
  const clipped = flat.length > SHOWN_LENGTH ? `${flat.slice(0, SHOWN_LENGTH)}...` : flat;
  return JSON.stringify(clipped);
}

export const rule: TSESLint.RuleModule<'repeated'> = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow a string literal used three times or more in one file' },
    schema: [],
    messages: { repeated: MESSAGE },
  },
  create(context) {
    const uses = new Map<string, Counted[]>();
    function count(node: Countable, text: unknown): void {
      if (isCountable(node, text)) {
        uses.set(text, [...(uses.get(text) ?? []), { node, text }]);
      }
    }
    return {
      Literal(node) {
        count(node, node.value);
      },
      TemplateLiteral(node) {
        if (
          node.quasis.length === 1 &&
          node.parent.type !== AST_NODE_TYPES.TaggedTemplateExpression
        ) {
          count(node, node.quasis[0]?.value.cooked);
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

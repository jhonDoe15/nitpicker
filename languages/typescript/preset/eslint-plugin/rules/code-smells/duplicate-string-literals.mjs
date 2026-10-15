import { hasLiteralUnionType } from '../support/checked-types.mjs';

const MINIMUM_LENGTH = 5;
const MAXIMUM_USES = 2;
const SHOWN_LENGTH = 30;
const ALPHANUMERIC = /[A-Za-z0-9]/;
const MODULE_SOURCE_PARENTS = new Set([
  'ImportDeclaration',
  'ExportAllDeclaration',
  'ExportNamedDeclaration',
  'ImportExpression',
  'TSExternalModuleReference',
  'TSImportType',
]);
const KEY_PARENTS = new Set(['Property', 'PropertyDefinition', 'MethodDefinition']);
const DISCRIMINANT_KEYS = new Set(['type', 'kind', 'tag', 'variant']);
const SKIPPED_PARENTS = new Set([
  'TSLiteralType',
  'JSXAttribute',
  'TSEnumMember',
  'ExpressionStatement',
  'TaggedTemplateExpression',
]);

function textOf(node) {
  if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : undefined;
  return node.expressions.length === 0 ? node.quasis[0].value.cooked : undefined;
}

function isDiscriminant(parent) {
  return parent.type === 'Property' && !parent.computed && DISCRIMINANT_KEYS.has(parent.key.name);
}

function isCountable(node, value) {
  const { parent } = node;
  if (value === undefined || value.length < MINIMUM_LENGTH || !ALPHANUMERIC.test(value)) {
    return false;
  }
  if (MODULE_SOURCE_PARENTS.has(parent.type) || SKIPPED_PARENTS.has(parent.type)) return false;
  if (parent.type === 'SwitchCase' || isDiscriminant(parent)) return false;
  if (KEY_PARENTS.has(parent.type) && parent.key === node && !parent.computed) return false;
  return !(parent.type === 'CallExpression' && parent.callee.name === 'require');
}

function shown(value) {
  return value.length > SHOWN_LENGTH ? `${value.slice(0, SHOWN_LENGTH)}...` : value;
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Name a string literal that a file repeats three times or more' },
    schema: [],
    messages: {
      repeated:
        "The string '{{text}}' is repeated in this file. Name it once as a constant (`const NAME = '{{text}}'`) and use the constant. If repeating it is intended, add an exception for nitpicker/no-duplicate-string-literals in nitpicker.config.json.",
    },
  },
  create(context) {
    const uses = new Map();
    return {
      'Literal, TemplateLiteral'(node) {
        const value = textOf(node);
        if (!isCountable(node, value) || hasLiteralUnionType(context, node)) return;
        const nodes = uses.get(value) ?? [];
        nodes.push(node);
        uses.set(value, nodes);
      },
      'Program:exit'() {
        for (const [value, nodes] of uses) {
          for (const node of nodes.slice(MAXIMUM_USES)) {
            context.report({ node, messageId: 'repeated', data: { text: shown(value) } });
          }
        }
      },
    };
  },
};

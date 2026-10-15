const MINIMUM_LENGTH = 3;
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

function isCountable(node) {
  const { parent, value } = node;
  if (typeof value !== 'string' || value.length < MINIMUM_LENGTH || !ALPHANUMERIC.test(value)) {
    return false;
  }
  if (MODULE_SOURCE_PARENTS.has(parent.type) || parent.type === 'TSLiteralType') return false;
  if (parent.type === 'JSXAttribute' || parent.type === 'TSEnumMember') return false;
  if (parent.type === 'ExpressionStatement') return false;
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
      Literal(node) {
        if (!isCountable(node)) return;
        uses.set(node.value, [...(uses.get(node.value) ?? []), node]);
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

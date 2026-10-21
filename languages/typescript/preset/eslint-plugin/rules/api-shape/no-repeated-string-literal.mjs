const MINIMUM_LENGTH = 5;
const MAXIMUM_USES = 2;
const MODULE_SOURCES = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
  'TSExternalModuleReference',
]);

function isModuleSource(node) {
  const parent = node.parent;
  return (
    (MODULE_SOURCES.has(parent.type) && (parent.source === node || parent.expression === node)) ||
    (parent.type === 'CallExpression' &&
      parent.callee.type === 'Identifier' &&
      parent.callee.name === 'require' &&
      parent.arguments[0] === node)
  );
}

function isContractLiteral(node) {
  const parent = node.parent;
  return (
    parent.type === 'TSLiteralType' ||
    (parent.type === 'TSModuleDeclaration' && parent.id === node) ||
    (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent.type) &&
      parent.key === node &&
      !parent.computed) ||
    (parent.type === 'MemberExpression' && parent.property === node) ||
    parent.type === 'JSXAttribute' ||
    (parent.type === 'ExpressionStatement' && typeof parent.directive === 'string')
  );
}

function repeatedUses(uses) {
  return [...uses.values()].flatMap((nodes) => nodes.slice(MAXIMUM_USES));
}

function addUse(uses, node, value) {
  if (
    typeof value !== 'string' ||
    value.length < MINIMUM_LENGTH ||
    !/[\p{L}\p{N}]/u.test(value) ||
    isModuleSource(node) ||
    isContractLiteral(node)
  ) {
    return;
  }
  const nodes = uses.get(value) ?? [];
  nodes.push(node);
  uses.set(value, nodes);
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Name repeated runtime strings as constants' },
    schema: [],
    messages: {
      repeated:
        'This string is repeated three times or more in this file. Name a constant and reuse it so changes stay consistent. If the literals represent different concepts, add an exception for nitpicker/no-repeated-string-literal in nitpicker.config.json.',
    },
  },
  create(context) {
    const uses = new Map();
    return {
      Literal(node) {
        addUse(uses, node, node.value);
      },
      TemplateLiteral(node) {
        if (node.expressions.length === 0 && node.parent.type !== 'TaggedTemplateExpression') {
          addUse(uses, node, node.quasis[0].value.cooked);
        }
      },
      'Program:exit'() {
        for (const node of repeatedUses(uses)) {
          context.report({ node, messageId: 'repeated' });
        }
      },
    };
  },
};

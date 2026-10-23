import { hasLiteralUnionType } from '../support/checked-types.mjs';
import {
  DISCRIMINANT_KEYS,
  MAXIMUM_USES,
  MINIMUM_LENGTH,
  TRANSLATION_CALLS,
  isIdiomaticText,
} from '../../../../../../shared/literals/repeated-literal-exemptions.mjs';

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
const PROPERTY = 'Property';
const KEY_PARENTS = new Set([PROPERTY, 'PropertyDefinition', 'MethodDefinition']);
const DISCRIMINANTS = new Set(DISCRIMINANT_KEYS);
const TRANSLATIONS = new Set(TRANSLATION_CALLS);
const CALL = 'CallExpression';
const SKIPPED_PARENTS = new Set([
  'TSLiteralType',
  'JSXAttribute',
  'TSEnumMember',
  'ExpressionStatement',
  'TaggedTemplateExpression',
]);

function textOf(node) {
  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : undefined;
  }
  return node.expressions.length === 0 ? node.quasis[0].value.cooked : undefined;
}

function isDiscriminant(parent) {
  return parent.type === PROPERTY && !parent.computed && DISCRIMINANTS.has(parent.key.name);
}

function calleeName({ callee }) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : undefined;
}

function isTranslationArgument(node) {
  const { parent } = node;
  return (
    parent?.type === CALL && parent.arguments[0] === node && TRANSLATIONS.has(calleeName(parent))
  );
}

function isTranslationKey(node) {
  const { parent } = node;
  if (parent.type === 'JSXExpressionContainer') {
    return parent.parent.type === 'JSXAttribute';
  }
  const inMessageDescriptor =
    parent.type === PROPERTY && parent.value === node && parent.parent.type === 'ObjectExpression';
  return (
    isTranslationArgument(node) || (inMessageDescriptor && isTranslationArgument(parent.parent))
  );
}

function isCandidateText(value) {
  if (value === undefined || value.length < MINIMUM_LENGTH) {
    return false;
  }
  return ALPHANUMERIC.test(value) && !isIdiomaticText(value);
}

function isCountable(node, value) {
  const { parent } = node;
  if (!isCandidateText(value)) {
    return false;
  }
  if (MODULE_SOURCE_PARENTS.has(parent.type) || SKIPPED_PARENTS.has(parent.type)) {
    return false;
  }
  if (parent.type === 'SwitchCase' || isDiscriminant(parent) || isTranslationKey(node)) {
    return false;
  }
  if (KEY_PARENTS.has(parent.type) && parent.key === node && !parent.computed) {
    return false;
  }
  if (parent.type === 'MemberExpression' && parent.computed && parent.property === node) {
    return false;
  }
  if (parent.type === 'TSModuleDeclaration' && parent.id === node) {
    return false;
  }
  return !(parent.type === CALL && parent.callee.name === 'require');
}

function shown(value) {
  return value.length > SHOWN_LENGTH ? `${value.slice(0, SHOWN_LENGTH)}...` : value;
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Name a string literal that a file repeats three times or more',
      requiresTypeChecking: true,
      typeCheckingOnlyExempts: true,
    },
    schema: [],
    messages: {
      repeated:
        "The string '{{text}}' is repeated in this file. Name it once as a constant (`const NAME = '{{text}}'`) and use the constant. An exception fits only when repeating it is intended.",
    },
  },
  create(context) {
    const uses = new Map();
    return {
      'Literal, TemplateLiteral'(node) {
        const value = textOf(node);
        if (!isCountable(node, value) || hasLiteralUnionType(context, node)) {
          return;
        }
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

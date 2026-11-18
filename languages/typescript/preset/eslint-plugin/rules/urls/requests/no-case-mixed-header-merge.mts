import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, stringValue } from '../../analysis/constant-resolution.mts';
import { nameOf } from '../../typed/node-views.mts';
import { NULLISH_WRAPPERS, unwrapOf } from '../../typed/syntax-views.mts';
import { lastNameOf } from '../construction/url-values.mts';

type RuleContext = Readonly<TSESLint.RuleContext<'mixedCase', []>>;

const HEADER_NAMES = new Set([
  'content-type',
  'authorization',
  'accept',
  'user-agent',
  'content-length',
  'accept-language',
  'accept-encoding',
  'cache-control',
  'cookie',
  'origin',
  'referer',
  'host',
  'x-api-key',
  'x-requested-with',
  'x-csrf-token',
  'if-none-match',
  'range',
]);
const HEADER_VALUE_NAME = /headers$/iu;
const INCOMING_MESSAGE_NAME = /^(?:req|request|incoming)$/u;

function propertyKey(property: TSESTree.Property): string | undefined {
  if (property.computed) {
    return stringValue(property.key);
  }
  return property.key.type === AST_NODE_TYPES.Identifier
    ? property.key.name
    : stringValue(property.key);
}

function isHeadersTarget(node: TSESTree.ObjectExpression): boolean {
  const { parent } = node;
  if (parent.type === AST_NODE_TYPES.Property) {
    return !parent.computed && nameOf(parent.key) === 'headers' && parent.value === node;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return HEADER_VALUE_NAME.test(nameOf(parent.id) ?? '') && parent.init === node;
  }
  return (
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.right === node &&
    HEADER_VALUE_NAME.test(lastNameOf(parent.left) ?? '')
  );
}

function isCallerHeaders(context: RuleContext, spread: TSESTree.SpreadElement): boolean {
  const value = unwrapOf(spread.argument, NULLISH_WRAPPERS);
  if (!HEADER_VALUE_NAME.test(lastNameOf(value) ?? '')) {
    return false;
  }
  const resolved = resolveConstant(context, value);
  return (
    resolved === undefined ||
    (resolved.type !== AST_NODE_TYPES.ObjectExpression &&
      resolved.type !== AST_NODE_TYPES.NewExpression &&
      resolved.type !== AST_NODE_TYPES.CallExpression)
  );
}

function isLowercaseSource(spread: TSESTree.SpreadElement): boolean {
  const value = unwrapOf(spread.argument, NULLISH_WRAPPERS);
  return (
    value.type === AST_NODE_TYPES.MemberExpression &&
    !value.computed &&
    nameOf(value.property) === 'headers' &&
    INCOMING_MESSAGE_NAME.test(nameOf(unwrapOf(value.object, NULLISH_WRAPPERS)) ?? '')
  );
}

function isMixable(context: RuleContext, spread: TSESTree.SpreadElement, key: string): boolean {
  return (
    isCallerHeaders(context, spread) && (key !== key.toLowerCase() || !isLowercaseSource(spread))
  );
}

export const rule: TSESLint.RuleModule<'mixedCase'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report request headers merged in a plain object where a caller key in another case ' +
        'is kept next to the default',
    },
    schema: [],
    messages: {
      mixedCase:
        'Object keys are case-sensitive but header names are not: a caller header spread next ' +
        'to a literal header name in another case is sent twice and the override does not ' +
        'happen. Merge with `new Headers(headers)` and `merged.set(name, value)`, or lowercase ' +
        'every key first.',
    },
  },
  create(context) {
    return {
      ObjectExpression(node: TSESTree.ObjectExpression) {
        if (!isHeadersTarget(node)) {
          return;
        }
        const spreads = node.properties.filter(
          (property): property is TSESTree.SpreadElement =>
            property.type === AST_NODE_TYPES.SpreadElement,
        );
        const named = node.properties.find(
          (property): property is TSESTree.Property =>
            property.type === AST_NODE_TYPES.Property &&
            HEADER_NAMES.has(propertyKey(property)?.toLowerCase() ?? '') &&
            spreads.some((spread) => isMixable(context, spread, propertyKey(property) ?? '')),
        );
        if (named !== undefined) {
          context.report({ node: named, messageId: 'mixedCase' });
        }
      },
    };
  },
};

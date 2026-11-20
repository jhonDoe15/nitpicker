import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { typedScopeOf, type TypedScope } from '../promises/cannot-reject.mts';
import {
  isIntentionalSpread,
  isParameterValue,
  isTestSupportFile,
  isTextOrNumber,
  isOptionsType,
  isParameterBased,
  keyName,
  optionalPropertyOf,
  readsFrom,
} from './spread-facts.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type MessageIds = 'explicitFirst' | 'defaultAfter';
type Scope = TypedScope<MessageIds>;

type Pair = {
  readonly spread: TSESTree.SpreadElement;
  readonly property: TSESTree.Property;
  readonly key: string;
  readonly before: boolean;
};

function pairsOf(node: TSESTree.ObjectExpression): Pair[] {
  const { properties } = node;
  return properties.flatMap((spread, spreadIndex) =>
    spread.type === AST_NODE_TYPES.SpreadElement
      ? properties.flatMap((property, index) => {
          const key = property.type === AST_NODE_TYPES.Property ? keyName(property) : undefined;
          return property.type === AST_NODE_TYPES.Property && key !== undefined
            ? [{ spread, property, key, before: index < spreadIndex }]
            : [];
        })
      : [],
  );
}

function checkPair(scope: Scope, { spread, property, key, before }: Pair): void {
  const found = optionalPropertyOf(scope, spread.argument, key);
  const { value } = property;
  if (
    found === undefined ||
    isIntentionalSpread(spread.argument, key) ||
    readsFrom(scope, value, spread.argument)
  ) {
    return;
  }
  const forced =
    isTextOrNumber(value) &&
    isOptionsType(found.typeName) &&
    isParameterBased(scope, spread.argument);
  if (before ? isParameterValue(scope, value) : forced) {
    const messageId = before ? 'explicitFirst' : 'defaultAfter';
    scope.context.report({ node: property, messageId, data: { key } });
  }
}

type JsxPair = {
  readonly spread: TSESTree.JSXSpreadAttribute;
  readonly attribute: TSESTree.JSXAttribute;
  readonly key: string;
  readonly expression: TSESTree.Expression;
};

function explicitAttribute(
  spread: TSESTree.JSXSpreadAttribute,
  attribute: TSESTree.JSXOpeningElement['attributes'][number],
): JsxPair[] {
  if (attribute.type !== AST_NODE_TYPES.JSXAttribute) {
    return [];
  }
  const { name, value } = attribute;
  const expression =
    value?.type === AST_NODE_TYPES.JSXExpressionContainer ? value.expression : undefined;
  return name.type === AST_NODE_TYPES.JSXIdentifier &&
    expression !== undefined &&
    expression.type !== AST_NODE_TYPES.JSXEmptyExpression
    ? [{ spread, attribute, key: name.name, expression }]
    : [];
}

function jsxPairsOf(node: TSESTree.JSXOpeningElement): JsxPair[] {
  return node.attributes.flatMap((spread, spreadIndex) =>
    spread.type === AST_NODE_TYPES.JSXSpreadAttribute
      ? node.attributes.slice(0, spreadIndex).flatMap((each) => explicitAttribute(spread, each))
      : [],
  );
}

function checkJsxPair(scope: Scope, { spread, attribute, key, expression }: JsxPair): void {
  if (
    isParameterValue(scope, expression) &&
    !isIntentionalSpread(spread.argument, key) &&
    optionalPropertyOf(scope, spread.argument, key) !== undefined &&
    !readsFrom(scope, expression, spread.argument)
  ) {
    scope.context.report({ node: attribute, messageId: 'explicitFirst', data: { key } });
  }
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow an explicit key and a spread of the same key where the wrong one wins',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      explicitFirst:
        '`{{key}}` is written before a spread whose type can carry `{{key}}`, so the spread ' +
        'value replaces this one. Write the spread first (`{ ...data, {{key}} }`).',
      defaultAfter:
        '`{{key}}` is set after a spread of caller options whose type allows `{{key}}`, so ' +
        'the caller value is ignored. Put the default before the spread, or use ' +
        '`options.{{key}} ?? value`.',
    },
  },
  create(context) {
    const scope = typedScopeOf(context);
    if (scope === undefined || isTestSupportFile(context.filename)) {
      return {};
    }
    return {
      ObjectExpression(node: TSESTree.ObjectExpression) {
        for (const pair of pairsOf(node)) {
          checkPair(scope, pair);
        }
      },
      JSXOpeningElement(node: TSESTree.JSXOpeningElement) {
        for (const pair of jsxPairsOf(node)) {
          checkJsxPair(scope, pair);
        }
      },
    };
  },
};

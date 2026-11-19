import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import { typedListeners, type TypedScope } from '../promises/cannot-reject.mts';
import { ts } from '../typed/typescript-views.mts';
import { hasInputShape, isBlankChecked, isSplitPart, numberChecks } from './blank-guards.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type MessageIds = 'blankNumber';
type Scope = TypedScope<MessageIds>;

const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
const TEXT = ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.TemplateLiteral;
const LOOSE = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Object;

function canBeBlank(part: TypeScript.Type): boolean {
  return part.isStringLiteral() ? part.value.trim() === '' : (part.flags & TEXT) !== 0;
}

function isBlankableText(scope: Scope, node: TSESTree.Node): boolean {
  const type = scope.services.getTypeAtLocation(node);
  const present = partsOf(type).filter((part) => (part.flags & NULLISH) === 0);
  if (present.length > 0 && present.every((part) => (part.flags & (TEXT | NULLISH)) !== 0)) {
    return present.some(canBeBlank);
  }
  const loose = present.length > 0 && present.every((part) => (part.flags & (LOOSE | TEXT)) !== 0);
  return loose && hasInputShape(scope.sourceCode.getText(node));
}

function coercedValue(node: TSESTree.Node): TSESTree.Node | undefined {
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Number' &&
    node.arguments.length === 1
  ) {
    return node.arguments[0];
  }
  return node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '+'
    ? node.argument
    : undefined;
}

function hasTextDefault(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.LogicalExpression &&
    node.operator === '||' &&
    node.right.type === AST_NODE_TYPES.Literal &&
    typeof node.right.value === 'string' &&
    node.right.value.trim() !== ''
  );
}

function check(scope: Scope, node: TSESTree.Node): void {
  const value = coercedValue(node);
  if (value === undefined || value.type === AST_NODE_TYPES.SpreadElement || hasTextDefault(value)) {
    return;
  }
  const { sourceCode } = scope;
  const { checked, bounded } = numberChecks(sourceCode, node);
  if (
    checked &&
    !bounded &&
    isBlankableText(scope, value) &&
    !isBlankChecked(sourceCode, node, value) &&
    !isSplitPart(sourceCode, value)
  ) {
    scope.context.report({
      node,
      messageId: 'blankNumber',
      data: { value: sourceCode.getText(value) },
    });
  }
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Number() of a string that can be blank checked only with isNaN',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      blankNumber:
        '`Number("")` is 0, not NaN, so a blank `{{value}}` passes this check as the number 0. ' +
        'Reject blank text first (`if (!{{value}}?.trim())`), or use `Number.parseInt(..., 10)`, ' +
        'which gives NaN for an empty string.',
    },
  },
  create(context) {
    return typedListeners(context, (scope) => ({
      CallExpression: (node: TSESTree.CallExpression) => {
        check(scope, node);
      },
      UnaryExpression: (node: TSESTree.UnaryExpression) => {
        check(scope, node);
      },
    }));
  },
};

import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typedScopeOf, type TypedScope } from '../promises/cannot-reject.mts';
import { ts } from '../typed/typescript-views.mts';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import { conditionRoot, plainText } from './conditions.mts';
import { isValueHandled } from './in-guards.mts';
import { includesUndefined, isOnlyUndefined } from './value-facts.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type MessageIds = 'inPresence';
type Scope = TypedScope<MessageIds>;

function keyOf(node: TSESTree.BinaryExpression): string | undefined {
  const { left } = node;
  return left.type === AST_NODE_TYPES.Literal && typeof left.value === 'string'
    ? left.value
    : undefined;
}

type Declared = {
  readonly checker: TypeScript.TypeChecker;
  readonly part: TypeScript.Type;
  readonly key: string;
  readonly at: TypeScript.Node;
};

function declaredValueType({ checker, part, key, at }: Declared): TypeScript.Type | undefined {
  const property = checker.getPropertyOfType(part, key);
  if (property !== undefined) {
    return checker.getTypeOfSymbolAtLocation(property, at);
  }
  return checker.getIndexInfoOfType(part, ts.IndexKind.String)?.type;
}

function canHoldUndefined(scope: Scope, node: TSESTree.BinaryExpression, key: string): boolean {
  const { services } = scope;
  const checker = services.program.getTypeChecker();
  const at = services.esTreeNodeToTSNodeMap.get(node.right);
  const type = checker.getNonNullableType(services.getTypeAtLocation(node.right));
  const parts = partsOf(type).map((part) => checker.getBaseConstraintOfType(part) ?? part);
  const types = parts.map((part) => declaredValueType({ checker, part, key, at }));
  return (
    types.length > 0 &&
    types.every((valueType) => valueType !== undefined && !isOnlyUndefined(valueType)) &&
    types.some((valueType) => valueType !== undefined && includesUndefined(valueType))
  );
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description: "Disallow 'key' in object as a presence check where the key can hold undefined",
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      inPresence:
        "`'{{key}}' in {{object}}` is true when the key exists with the value `undefined`, " +
        'and this type allows that. Test `{{object}}.{{key}} !== undefined` (or `!= null`), ' +
        "or add `Object.hasOwn({{object}}, '{{key}}') && ...` when both are meant.",
    },
  },
  create(context) {
    const scope = typedScopeOf(context);
    if (scope === undefined) {
      return {};
    }
    return {
      BinaryExpression(node: TSESTree.BinaryExpression) {
        const key = node.operator === 'in' ? keyOf(node) : undefined;
        const root = key === undefined ? undefined : conditionRoot(node);
        if (
          key !== undefined &&
          root !== undefined &&
          !isValueHandled({ facts: scope, node, root, key }) &&
          canHoldUndefined(scope, node, key)
        ) {
          const object = plainText(node.right, scope.sourceCode);
          context.report({ node, messageId: 'inPresence', data: { key, object } });
        }
      },
    };
  },
};

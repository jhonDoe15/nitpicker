import { type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { typedScopeOf, type TypedScope } from '../promises/cannot-reject.mts';
import { type FunctionNode } from '../typed/syntax-views.mts';
import { helperMutation } from './aliases/helper-mutations.mts';
import { mutationAt, parameterWalk } from './aliases/mutations.mts';
import { nestedCopyWrite } from './aliases/shallow-copies.mts';
import { isDefaultFill } from './parameter-copies.mts';
import { changedParameter } from './parameter-owners.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type MessageIds = 'parameterMutation' | 'propertyWrite' | 'helperMutation';
type Scope = TypedScope<MessageIds>;

type Hit = {
  readonly parameter: TSESTree.Node;
  readonly messageId: MessageIds;
  readonly data: Readonly<Record<string, string>>;
};

function mutationHit(scope: Scope, node: TSESTree.Node): Hit | undefined {
  const mutation = mutationAt(scope, node);
  if (mutation === undefined) {
    return undefined;
  }
  const direct = changedParameter(parameterWalk(scope), mutation.object, node);
  const definition = direct ?? nestedCopyWrite(scope, mutation, node);
  const fills = definition !== undefined && isDefaultFill(node, definition.name, definition.node);
  return definition === undefined || fills
    ? undefined
    : { parameter: definition.name, messageId: mutation.messageId, data: { name: mutation.name } };
}

function findHit(
  scope: Scope,
  node: TSESTree.Node,
  helpers: Map<FunctionNode, Set<number>>,
): Hit | undefined {
  if (mutationAt(scope, node) !== undefined) {
    return mutationHit(scope, node);
  }
  const helper = node.type === 'CallExpression' ? helperMutation(scope, node, helpers) : undefined;
  return helper === undefined
    ? undefined
    : {
        parameter: helper.parameter.name,
        messageId: 'helperMutation',
        data: { name: scope.sourceCode.getText(helper.argument), callee: helper.callee },
      };
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow changing an array, Set, Map, indexed object or project object ' +
        'that a parameter holds in place',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      parameterMutation:
        '`{{ name }}` changes the value the caller passed in. Build and return a new value ' +
        '(`[...items, item]`, `{ ...table, [key]: value }`, `items.toSorted()`), or copy the ' +
        'parameter first (`const copy = [...items]`).',
      helperMutation:
        "`{{ name }}` is passed to `{{ callee }}`, which changes it in place, so the caller's " +
        'value changes. Pass a copy (`[...{{ name }}]` or `{ ...{{ name }} }`), or make ' +
        '`{{ callee }}` return a new value.',
      propertyWrite:
        '`{{ name }}` writes to the object the caller passed in, so a frozen or shared object ' +
        'breaks. Build a new object (`{ ...options, timeout: 5000 }`), or copy the parameter ' +
        'first (`const next = { ...options }`).',
    },
  },
  create(context) {
    const scope = typedScopeOf(context);
    if (scope === undefined) {
      return {};
    }
    const helpers = new Map<FunctionNode, Set<number>>();
    const reported = new Set<TSESTree.Node>();
    const visit = (node: TSESTree.Node): void => {
      const hit = findHit(scope, node, helpers);
      if (hit !== undefined && !reported.has(hit.parameter)) {
        reported.add(hit.parameter);
        context.report({ node, messageId: hit.messageId, data: hit.data });
      }
    };
    return {
      CallExpression: visit,
      AssignmentExpression: visit,
      UpdateExpression: visit,
      UnaryExpression(node: TSESTree.UnaryExpression) {
        if (node.operator === 'delete') {
          visit(node);
        }
      },
    };
  },
};

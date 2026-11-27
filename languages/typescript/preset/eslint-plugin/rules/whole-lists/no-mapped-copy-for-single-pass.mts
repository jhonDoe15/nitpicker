import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  referencesOf,
  resolveFunction,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import { isFunction, isNamedMember } from '../typed/syntax-views.mts';
import { isLoop, isUnboundedList } from './unbounded-lists.mts';

const COPY_STEPS = new Set(['map', 'filter', 'flatMap']);

function spreadCopy(context: SourceContext, node: TSESTree.ArrayExpression): boolean {
  const [only] = node.elements;
  return (
    node.elements.length === 1 &&
    only?.type === AST_NODE_TYPES.SpreadElement &&
    isUnboundedList(context, only.argument)
  );
}

function copiedList(context: SourceContext, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return spreadCopy(context, node);
  }
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    COPY_STEPS.has(nameOf(node.callee.property) ?? '') &&
    isUnboundedList(context, node)
  );
}

function walksOnce(reference: TSESTree.Identifier | TSESTree.JSXIdentifier): boolean {
  const { parent } = reference;
  if (parent.type === AST_NODE_TYPES.ForOfStatement) {
    return parent.right === reference;
  }
  if (parent.type === AST_NODE_TYPES.YieldExpression) {
    return parent.delegate;
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    isNamedMember(parent.callee, 'Readable', 'from') &&
    parent.arguments[0] === reference
  );
}

function repeatedWithin(reference: TSESTree.Node, target: TSESTree.Node): boolean {
  const ancestors = ancestorsOf(reference);
  const between = ancestors.slice(1, ancestors.indexOf(target));
  return between.some((ancestor) => isLoop(ancestor) || isFunction(ancestor));
}

function walkedOnce(
  references: readonly TSESLint.Scope.Reference[],
  target: TSESTree.Node,
): boolean {
  const [only] = references;
  return (
    references.length === 1 &&
    only !== undefined &&
    walksOnce(only.identifier) &&
    !repeatedWithin(only.identifier, target)
  );
}

function iteratesOnce(
  context: SourceContext,
  call: TSESTree.CallExpression,
  index: number,
): boolean {
  const target = resolveFunction(context, call.callee);
  const parameter = target?.params[index];
  if (target === undefined || parameter?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  return walkedOnce(referencesOf(context, target, parameter.name), target);
}

export const rule: TSESLint.RuleModule<'copyForOnePass'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow mapping a list that grows with the input into a new array that is only walked once',
    },
    schema: [],
    messages: {
      copyForOnePass:
        'This maps or filters a list that grows with the input into a new array only to hand it to a function that walks it once. The new array and every object in it stay alive next to the original until the walk ends, and survive long enough to reach the old generation. Map each item as it is consumed instead: a generator (function* over the list that yields the mapped item) or the mapping inside the loop.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        for (const [index, argument] of node.arguments.entries()) {
          if (copiedList(context, argument) && iteratesOnce(context, node, index)) {
            context.report({ node: argument, messageId: 'copyForOnePass' });
          }
        }
      },
    };
  },
};

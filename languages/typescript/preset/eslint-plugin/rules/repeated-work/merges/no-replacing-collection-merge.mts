import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  calledMember,
  memberName,
  someNode,
} from '../../collections/costly-forms/repeated-runs.mts';
import { contains } from '../../typed/node-views.mts';
import { calleeNameOf, unwrapped } from '../../typed/syntax-views.mts';
import { innermostRepeat, type Repeat } from '../support/loop-invariance.mts';
import { collectionValuedTarget } from './collection-values.mts';

type Merge = { readonly target: TSESTree.Node; readonly sources: TSESTree.Node };

function entryPair(repeat: Repeat): readonly [string, string] | undefined {
  if (repeat.node.type === AST_NODE_TYPES.ForOfStatement) {
    const { left } = repeat.node;
    const [declarator] = left.type === AST_NODE_TYPES.VariableDeclaration ? left.declarations : [];
    const pattern = declarator?.id;
    const [key, value] = pattern?.type === AST_NODE_TYPES.ArrayPattern ? pattern.elements : [];
    return key?.type === AST_NODE_TYPES.Identifier && value?.type === AST_NODE_TYPES.Identifier
      ? [key.name, value.name]
      : undefined;
  }
  const params = 'params' in repeat.node ? repeat.node.params : [];
  const [value, key] = params;
  const call = repeat.node.parent;
  return call?.type === AST_NODE_TYPES.CallExpression &&
    calleeNameOf(call.callee) === 'forEach' &&
    key?.type === AST_NODE_TYPES.Identifier &&
    value?.type === AST_NODE_TYPES.Identifier
    ? [key.name, value.name]
    : undefined;
}

function isName(node: TSESTree.Node | undefined, name: string): boolean {
  return node?.type === AST_NODE_TYPES.Identifier && node.name === name;
}

const PROBES = new Set(['get', 'has']);

function readsTarget(area: TSESTree.Node, target: TSESTree.Node): boolean {
  const wanted = unwrapped(target);
  return someNode(area, (node) => {
    const member = node.type === AST_NODE_TYPES.CallExpression ? calledMember(node) : undefined;
    const owner = member === undefined ? undefined : unwrapped(member.object);
    return (
      member !== undefined &&
      PROBES.has(memberName(member) ?? '') &&
      owner?.type === AST_NODE_TYPES.Identifier &&
      wanted.type === AST_NODE_TYPES.Identifier &&
      owner.name === wanted.name
    );
  });
}

function setMerge(call: TSESTree.CallExpression): Merge | undefined {
  const member = calledMember(call);
  const [key, value] = call.arguments;
  const repeat = innermostRepeat(call);
  const pair = repeat === undefined ? undefined : entryPair(repeat);
  if (
    member === undefined ||
    memberName(member) !== 'set' ||
    call.arguments.length !== 2 ||
    pair === undefined ||
    repeat === undefined ||
    !isName(key, pair[0]) ||
    !isName(value, pair[1])
  ) {
    return undefined;
  }
  if (readsTarget(repeat.node, member.object)) {
    return undefined;
  }
  const outer = innermostRepeat(repeat.node);
  return outer === undefined ? undefined : { target: member.object, sources: outer.node };
}

function assignMerge(call: TSESTree.CallExpression): Merge | undefined {
  const [target, source] = call.arguments;
  const callee = unwrapped(call.callee);
  const repeat = innermostRepeat(call);
  return target !== undefined &&
    repeat !== undefined &&
    callee.type === AST_NODE_TYPES.MemberExpression &&
    isName(callee.object, 'Object') &&
    memberName(callee) === 'assign' &&
    call.arguments.length === 2 &&
    source?.type !== AST_NODE_TYPES.ObjectExpression
    ? { target, sources: repeat.node }
    : undefined;
}

export const rule: TSESLint.RuleModule<'replacingMerge'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow merging maps of collections by replacing the collection of a key that is already there',
    },
    schema: [],
    messages: {
      replacingMerge:
        '`{{call}}` merges into `{{target}}`, whose values are collections, by replacing the whole collection of a key that an earlier source already filled, so the values of a key seen twice are lost and the result depends on the order of the sources. Merge the values instead: get the collection of the key and add to it, creating it when it is missing.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(call) {
        const merge = setMerge(call) ?? assignMerge(call);
        const declarator =
          merge === undefined ? undefined : collectionValuedTarget(sourceCode, merge.target);
        if (
          merge !== undefined &&
          declarator !== undefined &&
          !contains(merge.sources, declarator)
        ) {
          context.report({
            node: call,
            messageId: 'replacingMerge',
            data: {
              call: sourceCode.getText(call.callee),
              target: sourceCode.getText(merge.target),
            },
          });
        }
      },
    };
  },
};

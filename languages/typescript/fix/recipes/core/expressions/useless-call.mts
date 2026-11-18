import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { REVIEW as untypedReview } from '../../../../../../core/fix/engine/safety.mjs';
import { coreRuleRecipe, type CorePlan, type CoreRequest } from '../core-rule-recipe.mts';
import { hasComment } from '../text-ranges.mts';

const REVIEW: string = untypedReview;
const PLAIN_RECEIVERS = new Set<string>([AST_NODE_TYPES.Identifier, AST_NODE_TYPES.ThisExpression]);
const PLAIN_CALLEES = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.CallExpression,
]);

function isUndefined(node: TSESTree.Node | undefined): boolean {
  return (
    (node?.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') ||
    (node?.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'void')
  );
}

function argumentsText(
  text: string,
  call: TSESTree.CallExpression,
  method: string,
): string | undefined {
  const rest = call.arguments.slice(1);
  if (method === 'call') {
    return rest.map(({ range }) => text.slice(...range)).join(', ');
  }
  const [list] = rest;
  if (
    list?.type !== AST_NODE_TYPES.ArrayExpression ||
    list.elements.some((element) => element === null)
  ) {
    return undefined;
  }
  return list.elements
    .map((element) => (element === null ? '' : text.slice(...element.range)))
    .join(', ');
}

function isReadOnce(receiver: TSESTree.Node | undefined, call: TSESTree.CallExpression): boolean {
  return receiver === undefined
    ? isUndefined(call.arguments[0])
    : PLAIN_RECEIVERS.has(receiver.type);
}

function direct({ text, sourceCode, node }: CoreRequest): CorePlan {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    node.callee.type !== AST_NODE_TYPES.MemberExpression ||
    node.parent.type === AST_NODE_TYPES.ChainExpression
  ) {
    return { declined: 'the call goes through an optional chain' };
  }
  const { object: target, property } = node.callee;
  const method = property.type === AST_NODE_TYPES.Identifier ? property.name : '';
  const receiver = target.type === AST_NODE_TYPES.MemberExpression ? target.object : undefined;
  if (!isReadOnce(receiver, node)) {
    return {
      declined:
        'the receiver is read twice and a read may run a getter, or this would change from null',
    };
  }
  const args = argumentsText(text, node, method);
  if (
    args === undefined ||
    hasComment(sourceCode, { start: target.range[1], end: node.range[1] })
  ) {
    return { declined: 'the arguments are not an array literal, or a comment sits in the call' };
  }
  const callee = text.slice(...target.range);
  const plain = PLAIN_CALLEES.has(target.type) ? callee : `(${callee})`;
  return { edits: [{ start: node.range[0], end: node.range[1], text: `${plain}(${args})` }] };
}

export const uselessCallRecipe = coreRuleRecipe({
  id: 'typescript-no-useless-call',
  rule: 'no-useless-call',
  safety: REVIEW,
  plan: direct,
});

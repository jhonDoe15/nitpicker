import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isMemberList, orderedPick } from './member-picks.mts';

type MessageId = 'memberPick' | 'typeText';
type Docs = { readonly requiresTypeChecking: boolean };

const EQUALITY = new Set(['===', '!==', '==', '!=']);
const UNION_TEXT = ' | ';

function isTypeText(node: TSESTree.Node): boolean {
  const call = node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    !call.callee.computed &&
    call.callee.property.type === AST_NODE_TYPES.Identifier &&
    call.callee.property.name === 'typeToString'
  );
}

function isUnionText(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Literal) {
    return typeof node.value === 'string' && node.value.includes(UNION_TEXT);
  }
  return (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.quasis.some((quasi) => (quasi.value.cooked ?? '').includes(UNION_TEXT))
  );
}

function comparesTypeText(node: TSESTree.BinaryExpression): boolean {
  const { left, right } = node;
  if (!EQUALITY.has(node.operator)) {
    return false;
  }
  return (isTypeText(left) && isUnionText(right)) || (isTypeText(right) && isUnionText(left));
}

export const rule: TSESLint.RuleModule<MessageId, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Do not let a result depend on the order the type checker lists union or intersection members in',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      memberPick:
        "{{form}} picks a union or intersection member by its place in the list (for a map, the last entry with the same key wins), and the compiler does not promise that order: TypeScript 6 lists members in the order their types were created, TypeScript 7 sorts them, so the same source gives a different result. Choose by something the source decides (the declaration's file and position, or a name), or compare all members. An exception fits only when every member that can be picked gives the same result.",
      typeText:
        'Comparing `typeToString` text with union text depends on the order the compiler prints union members in, which differs between compiler versions (`A | B` or `B | A`). Compare the types with `checker.isTypeAssignableTo` or by symbol instead.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const pick = isMemberList(context, node) ? orderedPick(context, node) : undefined;
        if (pick !== undefined) {
          context.report({ node: pick.node, messageId: 'memberPick', data: { form: pick.form } });
        }
      },
      BinaryExpression(node) {
        if (comparesTypeText(node)) {
          context.report({ node, messageId: 'typeText' });
        }
      },
    };
  },
};

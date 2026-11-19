import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { chainOf } from '../../typed/node-views.mts';
import { handoffOf, isRealWork } from './response-calls.mts';

function chainRoot(node: TSESTree.IfStatement): TSESTree.IfStatement {
  const chain = chainOf<TSESTree.IfStatement>(node, (link) =>
    link.parent.type === AST_NODE_TYPES.IfStatement && link.parent.alternate === link
      ? link.parent
      : undefined,
  );
  return chain.at(-1) ?? node;
}

function siblingsOf(parent: TSESTree.Node): readonly TSESTree.Node[] {
  if (parent.type === AST_NODE_TYPES.BlockStatement || parent.type === AST_NODE_TYPES.Program) {
    return parent.body;
  }
  return parent.type === AST_NODE_TYPES.SwitchCase ? parent.consequent : [];
}

function followingStatements(root: TSESTree.IfStatement): readonly TSESTree.Node[] {
  const siblings = siblingsOf(root.parent);
  return siblings.slice(siblings.indexOf(root) + 1);
}

function testMentions(test: TSESTree.Node, name: string, code: TSESLint.SourceCode): boolean {
  return code
    .getTokens(test)
    .some((token) => token.type === AST_TOKEN_TYPES.Identifier && token.value === name);
}

function lastStatement(branch: TSESTree.Statement): TSESTree.Node | undefined {
  return branch.type === AST_NODE_TYPES.BlockStatement ? branch.body.at(-1) : branch;
}

export const rule: TSESLint.RuleModule<'fallsThrough'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report an if branch that sends a response or calls next or a callback without returning, so the code after it runs too',
    },
    schema: [],
    messages: {
      fallsThrough:
        'This branch hands off the request ({{text}}) but does not return, so the code after the `if` runs too: it can send a second response or do the work the branch meant to refuse. Return after it (`return next();`, `return res.status(400).json(...)`, or a `return;` on the next line), or put the rest in an `else`. An exception fits only when the code after the branch must run for this case too.',
    },
  },
  create(context) {
    return {
      IfStatement(node) {
        if (node.alternate !== null) {
          return;
        }
        const last = lastStatement(node.consequent);
        const handoff = last === undefined ? undefined : handoffOf(context.sourceCode, last);
        if (last === undefined || handoff === undefined) {
          return;
        }
        if (testMentions(node.test, handoff.name, context.sourceCode)) {
          return;
        }
        if (followingStatements(chainRoot(node)).some(isRealWork)) {
          context.report({ node: last, messageId: 'fallsThrough', data: { text: handoff.text } });
        }
      },
    };
  },
};

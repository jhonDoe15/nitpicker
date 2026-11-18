import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { handoffOf, isRealWork } from './response-calls.mts';

function chainRoot(node: TSESTree.IfStatement): TSESTree.IfStatement {
  let current = node;
  while (
    current.parent.type === AST_NODE_TYPES.IfStatement &&
    current.parent.alternate === current
  ) {
    current = current.parent;
  }
  return current;
}

function followingStatements(root: TSESTree.IfStatement): readonly TSESTree.Node[] {
  const parent = root.parent;
  const siblings =
    parent.type === AST_NODE_TYPES.BlockStatement || parent.type === AST_NODE_TYPES.Program
      ? parent.body
      : parent.type === AST_NODE_TYPES.SwitchCase
        ? parent.consequent
        : [];
  return siblings.slice(siblings.indexOf(root) + 1);
}

function testMentions(test: TSESTree.Node, name: string, code: TSESLint.SourceCode): boolean {
  return code.getTokens(test).some((token) => token.type === 'Identifier' && token.value === name);
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

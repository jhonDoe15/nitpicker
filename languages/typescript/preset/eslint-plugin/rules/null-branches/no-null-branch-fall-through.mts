import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { branchFacts } from './branch-facts.mts';
import { firstUse } from './later-use.mts';
import { useText } from './uses/use-text.mts';
import { throwingNames } from './branch-calls/leaving-calls.mts';
import { isSharedKey, nullTarget } from './null-targets.mts';

type MessageId = 'fallsThrough';

function followingStatements(node: TSESTree.IfStatement): readonly TSESTree.Node[] {
  const { parent } = node;
  let list: readonly TSESTree.Node[] = [];
  if (
    parent.type === AST_NODE_TYPES.BlockStatement ||
    parent.type === AST_NODE_TYPES.Program ||
    parent.type === AST_NODE_TYPES.StaticBlock ||
    parent.type === AST_NODE_TYPES.TSModuleBlock
  ) {
    list = parent.body;
  } else if (parent.type === AST_NODE_TYPES.SwitchCase) {
    list = parent.consequent;
  }
  return list.slice(list.indexOf(node) + 1);
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not let a null branch fall through to code that uses the same value',
    },
    schema: [],
    messages: {
      fallsThrough:
        'The null branch handles `{{name}}` and then falls through to `{{use}}`, which uses `{{name}}`; add `return` (or an `else`) so the null case is handled once.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    let throwers: ReadonlySet<string> = new Set();
    return {
      Program(program) {
        throwers = throwingNames(program);
      },
      IfStatement(node) {
        const key = node.alternate === null ? nullTarget(node.test) : undefined;
        if (key === undefined) {
          return;
        }
        const facts = branchFacts(node.consequent, key, { sourceCode, throwers });
        const shared = isSharedKey(key, sourceCode.getScope(node));
        if (!facts.acts || facts.leaves || (shared && facts.initialises)) {
          return;
        }
        const scan = { key, callees: facts.callees, sourceCode };
        const use = firstUse(followingStatements(node), scan);
        if (use !== undefined) {
          context.report({
            node: node.test,
            messageId: 'fallsThrough',
            data: { name: key, use: useText(use, sourceCode) },
          });
        }
      },
    };
  },
};

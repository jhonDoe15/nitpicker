import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { enclosingLoop } from '../loops/loop-shapes.mts';
import { nameOf, type FileContext } from '../typed/node-views.mts';
import { openerCallback } from '../transactions/clients.mts';
import { WRITE_OPTIONS_SCHEMA, type WriteOptions } from '../transactions/writes-in-units.mts';
import {
  looksLikeGuard,
  readStatement,
  readsEarlier,
  runsInTransaction,
  type ReadStatement,
} from './read-calls.mts';

function declaredName(read: ReadStatement, sourceCode: TSESLint.SourceCode): string {
  return nameOf(read.id) ?? sourceCode.getText(read.id);
}

function independentRuns(
  statements: readonly TSESTree.Statement[],
  orms: readonly string[],
  context: FileContext,
): ReadStatement[][] {
  const { sourceCode } = context;
  const runs: ReadStatement[][] = [];
  let run: ReadStatement[] = [];
  for (const statement of statements) {
    const read = readStatement(statement, orms, context);
    if (
      read === undefined ||
      looksLikeGuard(read, sourceCode) ||
      runsInTransaction(read, sourceCode)
    ) {
      runs.push(run);
      run = [];
    } else if (readsEarlier(read, run, sourceCode)) {
      runs.push(run);
      run = [read];
    } else {
      run.push(read);
    }
  }
  runs.push(run);
  return runs.filter((each) => each.length > 1);
}

export const rule: TSESLint.RuleModule<'sequential', WriteOptions> = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Start independent reads together instead of awaiting them one after another',
    },
    schema: WRITE_OPTIONS_SCHEMA,
    messages: {
      sequential: [
        "These {{count}} reads do not use each other's results but are awaited one after another, so the",
        'caller waits for the sum of their times instead of the longest one.',
        'Start them together: `const [{{names}}] = await Promise.all([...])`.',
        'An exception fits only when the order matters in a way the code does not show',
        "(a rate limit, a read that must see an earlier one's side effect, one shared connection).",
      ].join(' '),
    },
  },
  create(context) {
    const { orms = [] } = context.options[0] ?? { opensTransactions: false };
    const { sourceCode } = context;
    return {
      BlockStatement(block: TSESTree.BlockStatement) {
        if (enclosingLoop(block, context) !== undefined || openerCallback(block) !== undefined) {
          return;
        }
        for (const run of independentRuns(block.body, orms, context)) {
          const [first] = run;
          if (first !== undefined) {
            context.report({
              node: first.statement,
              messageId: 'sequential',
              data: {
                count: String(run.length),
                names: run.map((read) => declaredName(read, sourceCode)).join(', '),
              },
            });
          }
        }
      },
    };
  },
};

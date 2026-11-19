import type { TSESLint } from '@typescript-eslint/utils';
import type { Subprocess } from '../../analysis/subprocess-calls.mts';
import {
  describeSubprocess,
  describeWrapperCall,
  gitSubcommand,
} from '../../analysis/test-code-analysis.mts';
import { perTestSubprocessVisitors } from '../per-test-subprocess.mts';
import { vocabularyOf } from '../../runner-apis/runner-option.mts';

const REPOSITORY_CREATING_SUBCOMMANDS = new Set(['init', 'clone']);

function createsRepository(described: Pick<Subprocess, 'command' | 'tokens'> | undefined): boolean {
  return (
    described?.command === 'git' &&
    REPOSITORY_CREATING_SUBCOMMANDS.has(gitSubcommand(described.tokens) ?? '')
  );
}

export const rule: TSESLint.RuleModule<'repositoryPerTest'> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      repositoryPerTest:
        'Do not create a git repository in each test or beforeEach. Build a template repository once in {{sharedSetupHook}} and copy it per test with cpSync.',
    },
  },
  create(context) {
    const data = { sharedSetupHook: vocabularyOf(context).sharedSetupHook };
    return perTestSubprocessVisitors(
      context,
      { messageId: 'repositoryPerTest', data },
      (node, bindings) => {
        const direct = describeSubprocess(context, node, bindings);
        return createsRepository(direct ?? describeWrapperCall(context, node, bindings));
      },
    );
  },
};

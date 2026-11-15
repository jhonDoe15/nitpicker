import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import type { ModuleBindings, Subprocess } from '../../analysis/subprocess-calls.mts';
import {
  describeSubprocess,
  describeWrapperCall,
  gitSubcommand,
  perTestVisitors,
  subprocessBindings,
} from '../../analysis/test-code-analysis.mts';

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
        'Do not create a git repository in each test or beforeEach. Build a template repository once in beforeAll and copy it per test with cpSync.',
    },
  },
  create(context) {
    let bindings: ModuleBindings = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        bindings = subprocessBindings(node);
      },
      ...perTestVisitors(context, (node) => {
        if (node.type !== AST_NODE_TYPES.CallExpression) {
          return undefined;
        }
        const direct = describeSubprocess(context, node, bindings);
        if (direct !== undefined) {
          return createsRepository(direct) ? { messageId: 'repositoryPerTest' } : undefined;
        }
        return createsRepository(describeWrapperCall(context, node, bindings))
          ? { messageId: 'repositoryPerTest' }
          : undefined;
      }),
    };
  },
};

import {
  describeSubprocess,
  describeWrapperCall,
  gitSubcommand,
  perTestVisitors,
  subprocessBindings,
} from '../../analysis/test-code-analysis.mjs';

const REPOSITORY_CREATING_SUBCOMMANDS = new Set(['init', 'clone']);

function createsRepository(described) {
  return (
    described?.command === 'git' &&
    REPOSITORY_CREATING_SUBCOMMANDS.has(gitSubcommand(described.tokens) ?? '')
  );
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      repositoryPerTest:
        'Do not create a git repository in each test or beforeEach. Build a template repository once in beforeAll and copy it per test with cpSync.',
    },
  },
  create(context) {
    let bindings = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        bindings = subprocessBindings(node);
      },
      ...perTestVisitors(context, (node) => {
        if (node.type !== 'CallExpression') return undefined;
        const direct = describeSubprocess(context, node, bindings);
        if (direct)
          return createsRepository(direct) ? { messageId: 'repositoryPerTest' } : undefined;
        return createsRepository(describeWrapperCall(context, node, bindings))
          ? { messageId: 'repositoryPerTest' }
          : undefined;
      }),
    };
  },
};

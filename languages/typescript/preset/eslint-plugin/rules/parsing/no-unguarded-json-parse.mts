import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains, nameOf } from '../typed/node-views.mts';
import { isJsonCall } from '../json-values/no-lossy-json-stringify.mts';
import { isInsideTry } from './handled-contexts.mts';
import { isStoredText } from './stored-text-sources.mts';

function isHandled(node: TSESTree.Node): boolean {
  return (
    isInsideTry(node) ||
    ancestorsOf(node).some(
      (ancestor) =>
        ancestor.type === AST_NODE_TYPES.CallExpression &&
        ancestor.callee.type === AST_NODE_TYPES.MemberExpression &&
        nameOf(ancestor.callee.property) === 'catch' &&
        contains(ancestor.callee.object, node),
    )
  );
}

const TOOLING_FOLDERS = [
  'scripts?',
  'bin',
  'tools?',
  '\\.github',
  '\\.agents',
  'e2e',
  'fixtures?',
  '__mocks__',
  'test-utils',
  'test-support',
  'testing',
  'templates?',
  'examples?',
  'astro-docs',
  'benchmarks',
  'docker',
  'playground',
  'vendor',
];
const TOOLING_FILES = new RegExp(
  `(^|/)(${TOOLING_FOLDERS.join('|')})/|package-?json|\\.config\\.[cm]?[jt]s$|\\.min\\.[cm]?js$`,
  'i',
);

export const rule: TSESLint.RuleModule<'unguarded'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Report JSON.parse of file, storage or message text outside a try with a catch',
    },
    schema: [],
    messages: {
      unguarded:
        'This `JSON.parse` reads a file, web storage, a response body or a message, and a ' +
        'truncated write or an older value throws a SyntaxError nothing here handles. Parse ' +
        'inside `try { ... } catch { ... }` that returns a failure result or a default, then validate.',
    },
  },
  create(context) {
    if (TOOLING_FILES.test(context.filename)) {
      return {};
    }
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const [argument] = node.arguments;
        if (
          isJsonCall(node.callee, 'parse') &&
          argument !== undefined &&
          argument.type !== AST_NODE_TYPES.SpreadElement &&
          isStoredText(context, argument) &&
          !isHandled(node)
        ) {
          context.report({ node, messageId: 'unguarded' });
        }
      },
    };
  },
};

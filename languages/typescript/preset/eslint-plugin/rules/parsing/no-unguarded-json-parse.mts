import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import { isJsonCall } from '../json-values/no-lossy-json-stringify.mts';
import { inBlock } from './no-unhandled-url-parse.mts';
import { isStoredText } from './stored-text-sources.mts';

const NAMED_FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
]);

function isHandled(node: TSESTree.Node): boolean {
  const ancestors = ancestorsOf(node);
  const scope = ancestors.find((ancestor) => NAMED_FUNCTIONS.has(ancestor.type));
  return ancestors.some(
    (ancestor) =>
      (ancestor.type === AST_NODE_TYPES.TryStatement &&
        ancestor.handler !== null &&
        inBlock(ancestor.block, node) &&
        (scope === undefined || inBlock(scope, ancestor))) ||
      (ancestor.type === AST_NODE_TYPES.CallExpression &&
        ancestor.callee.type === AST_NODE_TYPES.MemberExpression &&
        nameOf(ancestor.callee.property) === 'catch' &&
        inBlock(ancestor.callee.object, node)),
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

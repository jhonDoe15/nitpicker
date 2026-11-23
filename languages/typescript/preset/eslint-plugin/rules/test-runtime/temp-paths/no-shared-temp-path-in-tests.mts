import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { calleeName } from '../../typed/syntax-views.mts';
import { isJoin } from '../../unique-names/time-values.mts';
import { isSharedTempPath, pathParts } from './temp-path-parts.mts';
import { isPathPiece, reachesFileChange } from './temp-path-uses.mts';

type MessageId = 'fixed' | 'processOnly';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;

const TEMP_DIRECTORY_CALLS = new Set(['mkdtemp', 'mkdtempSync']);

function isTempDirectoryPrefix(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent?.type !== AST_NODE_TYPES.CallExpression || parent.arguments[0] !== node) {
    return false;
  }
  return TEMP_DIRECTORY_CALLS.has(calleeName(parent.callee));
}

function isOnlyBuiltOn(context: Context, node: TSESTree.Node): boolean {
  const { parent } = node;
  if (
    parent?.type !== AST_NODE_TYPES.VariableDeclarator ||
    parent.init !== node ||
    parent.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const variable = findVariable(context, parent.id, parent.id.name);
  const reads = variable?.references.filter((use) => use.isRead()) ?? [];
  return (
    reads.length > 0 &&
    reads.every(
      ({ identifier }) => isPathPiece(identifier.parent) || isTempDirectoryPrefix(identifier),
    )
  );
}

function isPlainText(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0)
  );
}

function isCandidate(node: TSESTree.Node): boolean {
  return (
    !isPathPiece(node.parent) &&
    node.parent?.type !== AST_NODE_TYPES.TSLiteralType &&
    (isPathPiece(node) || isPlainText(node))
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report a test temp path that is the same for every test, or unique only per process',
    },
    schema: [],
    messages: {
      fixed:
        'This temp path is the same in every test run, so tests that run at the same time ' +
        '(concurrent tests, or other test files on other workers) write the same file and one ' +
        "overwrites or deletes the other's. Create a directory per test with " +
        '`fs.mkdtemp(path.join(os.tmpdir(), "prefix-"))` and write inside it.',
      processOnly:
        'This temp path is unique only per process (`process.pid`), so tests in the same process ' +
        "or worker threads build the same name and one overwrites or deletes the other's file. " +
        'Create a directory per test with `fs.mkdtemp(path.join(os.tmpdir(), "prefix-"))` and ' +
        'write inside it.',
    },
  },
  create(context) {
    function check(node: TSESTree.Node): void {
      if (!isCandidate(node) || isTempDirectoryPrefix(node) || isOnlyBuiltOn(context, node)) {
        return;
      }
      const parts = pathParts(context, node);
      if (isSharedTempPath(parts) && reachesFileChange(context, node)) {
        context.report({ node, messageId: parts.processId ? 'processOnly' : 'fixed' });
      }
    }
    return {
      Literal: check,
      TemplateLiteral: check,
      BinaryExpression: check,
      CallExpression(node: TSESTree.CallExpression) {
        if (isJoin(node)) {
          check(node);
        }
      },
    };
  },
};

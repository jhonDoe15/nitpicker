import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf, type SourceCode } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';
import { operandOf, type Operand } from './path-operands.mts';

type MessageId = 'path' | 'authority';

const COMPARISONS = new Set(['===', '!==', '==', '!=']);
const CONTAINMENT = new Set(['startsWith', 'endsWith', 'includes']);
const PLATFORM_AWARE =
  /process\.platform|isWindows|isCaseSensitive|caseSensitive|CaseSensitiveFileNames/u;

function sameSource(sourceCode: SourceCode, first: Operand, second: Operand): boolean {
  const { owner } = first;
  return (
    first.kind === 'path' &&
    first.name !== 'fsPath' &&
    (first.name === second.name ||
      (owner !== undefined &&
        second.owner !== undefined &&
        sourceCode.getText(owner) === sourceCode.getText(second.owner)))
  );
}

function mismatch(
  sourceCode: SourceCode,
  left: TSESTree.Node,
  right: TSESTree.Node,
): MessageId | undefined {
  const first = operandOf(left);
  const second = operandOf(right);
  if (
    first === undefined ||
    second === undefined ||
    first.kind !== second.kind ||
    first.folded ||
    second.folded ||
    !(first.strong || second.strong) ||
    (first.kind === 'path' && !(first.foreign || second.foreign)) ||
    sameSource(sourceCode, first, second)
  ) {
    return undefined;
  }
  return first.kind;
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require file paths and URI authorities to be compared with case folding',
    },
    schema: [],
    messages: {
      path:
        'These file system paths are compared as plain strings, but Windows and macOS ignore ' +
        'case. Compare `path.relative(a, b) === ""`, or normalize both sides with one helper ' +
        'that lowercases on win32 and darwin.',
      authority:
        'Host names and URI authorities are case-insensitive. Lowercase both sides ' +
        '(`a.toLowerCase() === b.toLowerCase()`) before comparing them.',
    },
  },
  create(context) {
    function platformAware(node: TSESTree.Node): boolean {
      const scope = ancestorsOf(node).find(isFunction);
      return scope !== undefined && PLATFORM_AWARE.test(context.sourceCode.getText(scope));
    }

    function report(node: TSESTree.Node, left: TSESTree.Node, right: TSESTree.Node) {
      const messageId = mismatch(context.sourceCode, left, right);
      if (messageId !== undefined && !platformAware(node)) {
        context.report({ node, messageId });
      }
    }

    return {
      BinaryExpression(node: TSESTree.BinaryExpression) {
        if (COMPARISONS.has(node.operator) && node.left.type !== AST_NODE_TYPES.PrivateIdentifier) {
          report(node, node.left, node.right);
        }
      },
      CallExpression(node: TSESTree.CallExpression) {
        const { callee } = node;
        const [argument] = node.arguments;
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          CONTAINMENT.has(nameOf(callee.property) ?? '') &&
          argument !== undefined &&
          argument.type !== AST_NODE_TYPES.SpreadElement
        ) {
          report(node, callee.object, argument);
        }
      },
    };
  },
};

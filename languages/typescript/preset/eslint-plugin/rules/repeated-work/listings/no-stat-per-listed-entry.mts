import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isFsCall } from '../repeated-calls/call-shapes.mts';
import { calledName, listedEntry } from './listed-entries.mts';

const STATS = new Set(['lstat', 'lstatSync', 'stat', 'statSync']);
const KIND_TESTS = new Set(['isDirectory', 'isFile', 'isSymbolicLink']);

function outerValue(call: TSESTree.CallExpression): TSESTree.Node {
  return call.parent.type === AST_NODE_TYPES.AwaitExpression ? call.parent : call;
}

function isKindTest(value: TSESTree.Node): boolean {
  const member = value.parent;
  return (
    member?.type === AST_NODE_TYPES.MemberExpression &&
    member.object === value &&
    KIND_TESTS.has(memberName(member) ?? '') &&
    member.parent.type === AST_NODE_TYPES.CallExpression &&
    member.parent.callee === member
  );
}

function isEntryName(node: TSESTree.Node | undefined, entry: string): boolean {
  return node?.type === AST_NODE_TYPES.Identifier && node.name === entry;
}

function endsWithEntry(path: TSESTree.Node, entry: string): boolean {
  if (isEntryName(path, entry)) {
    return true;
  }
  if (path.type === AST_NODE_TYPES.CallExpression) {
    return isEntryName(path.arguments.at(-1), entry);
  }
  if (path.type === AST_NODE_TYPES.TemplateLiteral) {
    return isEntryName(path.expressions.at(-1), entry) && path.quasis.at(-1)?.value.cooked === '';
  }
  return path.type === AST_NODE_TYPES.BinaryExpression && isEntryName(path.right, entry);
}

function onlyKindTests(sourceCode: SourceCode, value: TSESTree.Node): boolean {
  if (isKindTest(value)) {
    return true;
  }
  const declarator = value.parent;
  if (
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.init !== value ||
    declarator.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const reads = (variableNamed(sourceCode, declarator.id)?.references ?? []).filter(
    (reference) => !reference.init,
  );
  return reads.length > 0 && reads.every((reference) => isKindTest(reference.identifier));
}

export const rule: TSESLint.RuleModule<'statPerEntry'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow asking the file system for the kind of every entry a directory listing returned',
    },
    schema: [],
    messages: {
      statPerEntry:
        '`{{call}}` asks the file system about every entry of this directory listing, one system call per entry, only to learn its kind. List with `{ withFileTypes: true }` and ask the entry itself (`entry.isDirectory()`, `entry.isFile()`); keep a stat only for a symbolic link you follow on purpose.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(call) {
        const [path] = call.arguments;
        if (
          path === undefined ||
          !STATS.has(calledName(call.callee) ?? '') ||
          !isFsCall(sourceCode, call.callee) ||
          !onlyKindTests(sourceCode, outerValue(call))
        ) {
          return;
        }
        const entry = listedEntry(sourceCode, call);
        if (entry !== undefined && endsWithEntry(path, entry.name)) {
          context.report({
            node: call,
            messageId: 'statPerEntry',
            data: { call: sourceCode.getText(call.callee) },
          });
        }
      },
    };
  },
};

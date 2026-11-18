import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  isFunctionNode,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { depthFirst, nodeChildren } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';
import { isDirectoryName, nameText } from './names.mts';

type MessageId = 'suffix' | 'prefix';
type Node = TSESTree.Node;

const SUFFIX_PATTERN = /^\.[a-z0-9]{1,8}$/iu;
const URL_PARTS = new Set(['port', 'host', 'hostname', 'pathname', 'origin']);
const WORKING_DIRECTORIES = new Set(['homedir', 'cwd']);
const TRANSPARENT = new Set<string>([
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.IfStatement,
]);
const CHECKS = new Set(['startsWith', 'endsWith']);

function isRegularExpression(node: Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && 'regex' in node) ||
    (node.type === AST_NODE_TYPES.NewExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === 'RegExp')
  );
}

function isPrefixValue(node: Node): boolean {
  const name = nameText(node);
  if (name === undefined || node.type === AST_NODE_TYPES.Literal) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return WORKING_DIRECTORIES.has(name);
  }
  const urlPart = node.type === AST_NODE_TYPES.MemberExpression && URL_PARTS.has(name);
  return urlPart || isDirectoryName(node);
}

const STATEMENT_STEPS = new Set<string>([
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ExpressionStatement,
  AST_NODE_TYPES.VariableDeclaration,
  AST_NODE_TYPES.VariableDeclarator,
  AST_NODE_TYPES.AssignmentExpression,
]);

function enclosingIf(node: Node): Node | undefined {
  let current: Node | undefined = node.parent ?? undefined;
  while (current !== undefined && STATEMENT_STEPS.has(current.type)) {
    current = current.parent ?? undefined;
  }
  return current?.type === AST_NODE_TYPES.IfStatement ? current : undefined;
}

function guardRoot(node: Node): Node {
  let current = node;
  while (current.parent !== undefined && TRANSPARENT.has(current.parent.type)) {
    current = current.parent;
  }
  return current.type === AST_NODE_TYPES.IfStatement ? current : (enclosingIf(current) ?? current);
}

function filteredSource(fn: Node): Node | undefined {
  const call = fn.parent;
  return call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.includes(fn as TSESTree.CallExpressionArgument) &&
    call.callee.type === AST_NODE_TYPES.MemberExpression
    ? call.callee.object
    : undefined;
}

function filteredSources(call: Node): Node[] {
  const sources: Node[] = [];
  let current: Node | undefined = call;
  while (current !== undefined) {
    const source = isFunctionNode(current) ? filteredSource(current) : undefined;
    if (source !== undefined) {
      sources.push(source);
    }
    current = current.parent ?? undefined;
  }
  return sources;
}

function guardRoots(call: TSESTree.CallExpression): Node[] {
  return [guardRoot(call), ...filteredSources(call)];
}

function endsWithText(context: SourceContext, receiver: Node, pattern: Node): boolean {
  const suffix = stringValue(resolveConstant(context, pattern) ?? pattern);
  const built = resolveConstant(context, receiver) ?? receiver;
  const tail =
    built.type === AST_NODE_TYPES.TemplateLiteral
      ? built.quasis.at(-1)?.value.cooked
      : built.type === AST_NODE_TYPES.BinaryExpression && built.operator === '+'
        ? stringValue(built.right)
        : undefined;
  return suffix !== undefined && tail?.endsWith(suffix) === true;
}

function isGuarded(context: SourceContext, call: TSESTree.CallExpression, pattern: Node): boolean {
  const text = context.sourceCode.getText(pattern);
  return guardRoots(call).some((root) =>
    [...depthFirst<Node>(root, nodeChildren)].some((node) => {
      if (node === call || node.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }
      const callee = unwrapped(node.callee);
      const [first] = node.arguments;
      return (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        CHECKS.has(nameText(callee) ?? '') &&
        first !== undefined &&
        context.sourceCode.getText(first) === text
      );
    }),
  );
}

function messageFor(
  context: SourceContext,
  pattern: Node,
  replacement: Node,
): MessageId | undefined {
  const literal = stringValue(resolveConstant(context, pattern) ?? pattern);
  if (literal !== undefined) {
    return SUFFIX_PATTERN.test(literal) && stringValue(replacement) === '' ? 'suffix' : undefined;
  }
  return isPrefixValue(pattern) ? 'prefix' : undefined;
}

export const rule: TSESLint.RuleModule<MessageId, []> = {
  meta: {
    type: 'problem',
    docs: { description: 'Remove a suffix or prefix with an anchored check, not a string replace' },
    schema: [],
    messages: {
      suffix:
        'A string pattern replaces the first occurrence anywhere, so `blog.git.io` loses its `.git`. ' +
        'Anchor it: `name.replace(/\\.git$/, "")`, or `endsWith` and `slice`.',
      prefix:
        'A string pattern replaces the first occurrence anywhere, not the leading part. ' +
        'Check `startsWith` and `slice`, use an anchored pattern, or set the field on the parsed URL.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = unwrapped(node.callee);
        const [pattern, replacement] = node.arguments;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          nameText(callee) !== 'replace' ||
          node.arguments.length !== 2 ||
          pattern === undefined ||
          replacement === undefined ||
          pattern.type === AST_NODE_TYPES.SpreadElement ||
          replacement.type === AST_NODE_TYPES.SpreadElement ||
          isRegularExpression(pattern)
        ) {
          return;
        }
        const messageId = messageFor(context, pattern, replacement);
        const built = endsWithText(context, callee.object, pattern);
        if (messageId !== undefined && !built && !isGuarded(context, node, pattern)) {
          context.report({ node, messageId });
        }
      },
    };
  },
};

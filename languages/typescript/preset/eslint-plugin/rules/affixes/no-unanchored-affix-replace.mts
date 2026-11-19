import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  isFunctionNode,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { depthFirst, nodeChildren } from '../typed/node-views.mts';
import { callbackReceiverOf, unwrapped } from '../typed/syntax-views.mts';
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
  const first = node.parent ?? undefined;
  const pending: Node[] = first === undefined ? [] : [first];
  for (const current of pending) {
    if (!STATEMENT_STEPS.has(current.type)) {
      return current.type === AST_NODE_TYPES.IfStatement ? current : undefined;
    }
    const next = current.parent ?? undefined;
    if (next !== undefined) {
      pending.push(next);
    }
  }
  return undefined;
}

function guardRoot(node: Node): Node {
  const chain = [node];
  for (const item of chain) {
    const { parent } = item;
    if (parent !== undefined && TRANSPARENT.has(parent.type)) {
      chain.push(parent);
    }
  }
  const current = chain.at(-1) ?? node;
  return current.type === AST_NODE_TYPES.IfStatement ? current : (enclosingIf(current) ?? current);
}

function filteredSources(call: Node): Node[] {
  const ancestors = [call];
  for (const current of ancestors) {
    const parent = current.parent ?? undefined;
    if (parent !== undefined) {
      ancestors.push(parent);
    }
  }
  return ancestors.flatMap((current) => {
    const source = isFunctionNode(current) ? callbackReceiverOf(current) : undefined;
    return source === undefined ? [] : [source];
  });
}

function guardRoots(call: TSESTree.CallExpression): Node[] {
  return [guardRoot(call), ...filteredSources(call)];
}

function tailText(built: Node): string | undefined {
  if (built.type === AST_NODE_TYPES.TemplateLiteral) {
    return built.quasis.at(-1)?.value.cooked ?? undefined;
  }
  return built.type === AST_NODE_TYPES.BinaryExpression && built.operator === '+'
    ? stringValue(built.right)
    : undefined;
}

function endsWithText(context: SourceContext, receiver: Node, pattern: Node): boolean {
  const suffix = stringValue(resolveConstant(context, pattern) ?? pattern);
  const built = resolveConstant(context, receiver) ?? receiver;
  const tail = tailText(built);
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

export const rule: TSESLint.RuleModule<MessageId> = {
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

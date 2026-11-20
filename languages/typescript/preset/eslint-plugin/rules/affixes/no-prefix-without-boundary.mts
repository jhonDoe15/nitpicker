import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { depthFirst, nodeChildren } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';
import { endsWithBoundary, startsWithBoundary } from './boundaries.mts';
import { isDirectoryName, isHostName, isLocationName, isPrefixName, nameText } from './names.mts';

type MessageId = 'prefix' | 'suffix' | 'origin';
type Node = TSESTree.Node;
type AffixMethod = 'startsWith' | 'endsWith';

const ORIGIN_ONLY = /^https?:\/\/[^/]+$/iu;
const PATH_SHAPED = /^(?:[/~@]|[\w.-]+\/)/u;
const COMPARISONS = new Set(['===', '==']);
const LENGTH_COMPARISONS = new Set(['===', '==', '!==', '!=', '>', '>=', '<', '<=']);
const WORD_LITERAL = /[\p{L}\p{N}]/u;
const TRANSPARENT = new Set<string>([
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSNonNullExpression,
]);

function climbs(parent: Node | undefined, current: Node): parent is Node {
  return (
    parent !== undefined &&
    (TRANSPARENT.has(parent.type) ||
      (parent.type === AST_NODE_TYPES.ConditionalExpression && parent.test === current))
  );
}

function conditionRoot(node: Node): Node {
  const chain = [node];
  for (const current of chain) {
    const { parent } = current;
    if (climbs(parent, current)) {
      chain.push(parent);
    }
  }
  return chain.at(-1) ?? node;
}

function sameText(context: SourceContext, left: Node, right: Node): boolean {
  return context.sourceCode.getText(left) === context.sourceCode.getText(right);
}

function isLeadingBoundaryCheck(context: SourceContext, node: TSESTree.CallExpression, arg: Node) {
  const callee = unwrapped(node.callee);
  const [first] = node.arguments;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    first !== undefined &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'startsWith' &&
    sameText(context, callee.object, arg) &&
    startsWithBoundary(context, first)
  );
}

function isGuarded(
  context: SourceContext,
  call: TSESTree.CallExpression,
  operands: { receiver: Node; arg: Node },
) {
  const { receiver, arg } = operands;
  const argText = context.sourceCode.getText(arg);
  return [...depthFirst<Node>(conditionRoot(call), nodeChildren)].some((node) => {
    if (comparesLength(context, node, arg)) {
      return true;
    }
    if (node.type === AST_NODE_TYPES.BinaryExpression && COMPARISONS.has(node.operator)) {
      return (
        (sameText(context, node.left, receiver) && sameText(context, node.right, arg)) ||
        (sameText(context, node.left, arg) && sameText(context, node.right, receiver))
      );
    }
    if (node === call || node.type !== AST_NODE_TYPES.CallExpression) {
      return false;
    }
    const callee = unwrapped(node.callee);
    const other = node.arguments[0];
    if (isLeadingBoundaryCheck(context, node, arg)) {
      return true;
    }
    return (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      sameText(context, callee.object, receiver) &&
      other !== undefined &&
      context.sourceCode.getText(other).includes(argText) &&
      endsWithBoundary(context, other)
    );
  });
}

function comparesLength(context: SourceContext, node: Node, arg: Node): boolean {
  const lengthText = `${context.sourceCode.getText(arg)}.length`;
  return (
    node.type === AST_NODE_TYPES.BinaryExpression &&
    LENGTH_COMPARISONS.has(node.operator) &&
    (context.sourceCode.getText(node.left).includes(lengthText) ||
      context.sourceCode.getText(node.right).includes(lengthText))
  );
}

function literalOf(context: SourceContext, node: Node): string | undefined {
  return stringValue(resolveConstant(context, node) ?? node);
}

function leadingText(context: SourceContext, node: Node): string | undefined {
  const pending = [node];
  for (const item of pending) {
    const resolved = resolveConstant(context, item) ?? item;
    if (resolved.type === AST_NODE_TYPES.TemplateLiteral) {
      return resolved.quasis[0]?.value.cooked ?? undefined;
    }
    if (resolved.type !== AST_NODE_TYPES.BinaryExpression || resolved.operator !== '+') {
      return undefined;
    }
    const literal = literalOf(context, resolved.left);
    if (literal !== undefined) {
      return literal;
    }
    pending.push(resolved.left);
  }
  return undefined;
}

function startsWithMessage(
  context: SourceContext,
  receiver: Node,
  arg: Node,
): MessageId | undefined {
  const literal = literalOf(context, arg);
  if (literal !== undefined) {
    if (ORIGIN_ONLY.test(literal)) {
      return 'origin';
    }
    return undefined;
  }
  const built = leadingText(context, arg);
  if (built !== undefined && PATH_SHAPED.test(built) && isLocationName(receiver)) {
    return endsWithBoundary(context, arg) ? undefined : 'prefix';
  }
  const named = isDirectoryName(arg) || (isPrefixName(arg) && isDirectoryName(receiver));
  return named && !endsWithBoundary(context, arg) ? 'prefix' : undefined;
}

function endsWithMessage(context: SourceContext, receiver: Node, arg: Node): MessageId | undefined {
  const literal = literalOf(context, arg);
  if (literal !== undefined && !WORD_LITERAL.test(literal)) {
    return undefined;
  }
  const hostLike = isHostName(arg) || (isHostName(receiver) && literal !== undefined);
  return hostLike && !startsWithBoundary(context, arg) ? 'suffix' : undefined;
}

const CHECKS = {
  startsWith: startsWithMessage,
  endsWith: endsWithMessage,
};

function affixMethod(name: string | undefined): AffixMethod | undefined {
  return name === 'startsWith' || name === 'endsWith' ? name : undefined;
}

function affixCall(
  node: TSESTree.CallExpression,
): { receiver: Node; method: AffixMethod } | undefined {
  const callee = unwrapped(node.callee);
  const method =
    callee.type === AST_NODE_TYPES.MemberExpression ? affixMethod(nameText(callee)) : undefined;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    method !== undefined &&
    node.arguments.length === 1
    ? { receiver: callee.object, method }
    : undefined;
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a separator boundary when a path, route, package or host is matched by text',
    },
    schema: [],
    messages: {
      prefix:
        'A text prefix check also accepts siblings that only share the text (`/foo` matches `/foobar`). ' +
        `Compare whole segments: \`x === base || x.startsWith(\`\${base}/\`)\`, or use \`path.relative\`.`,
      suffix:
        'A host suffix check also accepts `evilexample.com` for `example.com`. ' +
        `Compare \`host === domain || host.endsWith(\`.\${domain}\`)\`.`,
      origin:
        'A URL prefix without a boundary also accepts `http://localhost.attacker.example`. ' +
        'Parse the value and compare `new URL(x).origin` or `hostname`.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const found = affixCall(node);
        const arg = node.arguments[0];
        if (found === undefined || arg === undefined || arg.type === AST_NODE_TYPES.SpreadElement) {
          return;
        }
        const messageId = CHECKS[found.method](context, found.receiver, arg);
        if (
          messageId !== undefined &&
          !isGuarded(context, node, { receiver: found.receiver, arg })
        ) {
          context.report({ node, messageId });
        }
      },
    };
  },
};

import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mts';
import { valueKind } from '../encoding/value-kinds.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';

type MessageId = 'escapeValue' | 'handEscaped';
type Part = { readonly text: string } | { readonly node: TSESTree.Node };

const DOM_METHODS = new Set([
  'querySelector',
  'querySelectorAll',
  'closest',
  'matches',
  'webkitMatchesSelector',
]);
const TOOL_METHODS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['cy', new Set(['get', 'find'])],
  ['page', new Set(['$', '$$', 'waitForSelector'])],
]);
const NAME_POSITION = /(?:[#.]|\[[^\]]*=\s*["']?)$/u;
const SAFE_TEXT = /^[\w-]*$/u;
const SAFE_PROPERTIES = new Set(['length', 'size', 'index']);
const CLASS_NAME = /class|cls/iu;
const REPLACERS = new Set(['replace', 'replaceAll']);
const CONSTANT_ROOT = /^[A-Z][A-Z0-9_]*$/u;
const COUNT_NAME = /(?:index|idx|count|month|year|num)$/iu;
const BACKSLASH_PREFIX = '\\$';

function isSelectorCall(call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const method = memberName(callee) ?? '';
  const owner = callee.object.type === AST_NODE_TYPES.Identifier ? callee.object.name : '';
  return DOM_METHODS.has(method) || (TOOL_METHODS.get(owner)?.has(method) ?? false);
}

function leafParts(plain: TSESTree.Node): Part[] | undefined {
  if (plain.type === AST_NODE_TYPES.TemplateLiteral) {
    return plain.quasis.flatMap((quasi, index) => [
      { text: quasi.value.cooked ?? '' },
      ...(plain.expressions[index] === undefined ? [] : [{ node: plain.expressions[index] }]),
    ]);
  }
  const text = stringValue(plain);
  return text === undefined ? undefined : [{ text }];
}

function isConcatenation(node: TSESTree.Node): node is TSESTree.BinaryExpression {
  return node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+';
}

function partsOf(node: TSESTree.Node): Part[] | undefined {
  const root = unwrapped(node);
  if (!isConcatenation(root)) {
    return leafParts(root);
  }
  const operands: TSESTree.Node[] = [root.left, root.right];
  const leaves: TSESTree.Node[] = [];
  for (const [index, operand] of operands.entries()) {
    const plain = unwrapped(operand);
    if (isConcatenation(plain)) {
      operands.splice(index + 1, 0, plain.left, plain.right);
    } else {
      leaves.push(operand);
    }
  }
  return leaves.flatMap((leaf) => leafParts(unwrapped(leaf)) ?? [{ node: leaf }]);
}

function calleeName(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return memberName(callee);
  }
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : undefined;
}

function isEscapeCall(node: TSESTree.CallExpression): boolean {
  const callee = unwrapped(node.callee);
  const name = calleeName(callee);
  return /escape/iu.test(name ?? '') || name === 'Number' || name === 'parseInt';
}

function isSafeValue(context: Context, node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  const kind = valueKind(context, plain);
  if (kind === 'number' || kind === 'literals') {
    return true;
  }
  const constant = resolveConstant(context, plain);
  if (constant?.type === AST_NODE_TYPES.Literal && typeof constant.value === 'number') {
    return true;
  }
  const text = stringValue(constant);
  if (text !== undefined) {
    return SAFE_TEXT.test(text);
  }
  return (
    plain.type === AST_NODE_TYPES.MemberExpression && SAFE_PROPERTIES.has(memberName(plain) ?? '')
  );
}

function lastName(node: TSESTree.Node): string {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  return node.type === AST_NODE_TYPES.MemberExpression ? (memberName(node) ?? '') : '';
}

function isHandEscaped(node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  const callee = plain.type === AST_NODE_TYPES.CallExpression ? unwrapped(plain.callee) : undefined;
  return (
    callee?.type === AST_NODE_TYPES.MemberExpression && REPLACERS.has(memberName(callee) ?? '')
  );
}

function isBackslashEscape(node: TSESTree.CallExpression): boolean {
  const replacement = node.arguments[1];
  const text = replacement === undefined ? undefined : stringValue(replacement);
  return text !== undefined && text.includes(BACKSLASH_PREFIX);
}

function rootName(node: TSESTree.Node): string {
  const chain: TSESTree.Node[] = [node];
  for (const link of chain) {
    const plain = unwrapped(link);
    if (plain.type !== AST_NODE_TYPES.MemberExpression) {
      return lastName(plain);
    }
    chain.push(plain.object);
  }
  return '';
}

function isConstantOrCount(node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  return (
    (plain.type === AST_NODE_TYPES.MemberExpression && CONSTANT_ROOT.test(rootName(plain))) ||
    COUNT_NAME.test(lastName(plain))
  );
}

function isCheckedKind(node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  return (
    plain.type === AST_NODE_TYPES.Identifier ||
    plain.type === AST_NODE_TYPES.MemberExpression ||
    isHandEscaped(plain)
  );
}

function findings(
  context: Context,
  parts: readonly Part[],
): { node: TSESTree.Node; hand: boolean }[] {
  return parts.flatMap((part, index) => {
    const before = parts[index - 1];
    if (!('node' in part) || before === undefined || !('text' in before)) {
      return [];
    }
    const plain = unwrapped(part.node);
    const backslash = plain.type === AST_NODE_TYPES.CallExpression && isBackslashEscape(plain);
    const hand = isHandEscaped(plain) && !backslash;
    const escaped = plain.type === AST_NODE_TYPES.CallExpression && !hand && isEscapeCall(plain);
    const safe = backslash || isConstantOrCount(plain) || (!hand && isSafeValue(context, plain));
    const skip = escaped || !isCheckedKind(plain) || safe;
    const className = before.text.endsWith('.') && CLASS_NAME.test(lastName(plain));
    return !skip && !className && NAME_POSITION.test(before.text)
      ? [{ node: part.node, hand }]
      : [];
  });
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow runtime values in a CSS selector without CSS.escape',
    },
    schema: [],
    messages: {
      escapeValue:
        'A runtime value in a CSS selector can hold quotes, brackets, colons, dots or a leading digit and ' +
        `then throw or match the wrong elements. Write \`#\${CSS.escape(id)}\` or \`[data-name="\${CSS.escape(name)}"]\`.`,
      handEscaped:
        'This value is escaped by hand for a CSS selector, which covers only the characters the `replace` ' +
        'names. Use `CSS.escape(value)` instead.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const [selector] = node.arguments;
        const parts =
          selector === undefined || !isSelectorCall(node) ? undefined : partsOf(selector);
        for (const found of parts === undefined ? [] : findings(context, parts)) {
          context.report({
            node: found.node,
            messageId: found.hand ? 'handEscaped' : 'escapeValue',
          });
        }
      },
    };
  },
};

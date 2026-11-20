import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { calleeNameOf, operandsOf } from '../../typed/syntax-views.mts';

type Node = TSESTree.Node;
export type Fragment = {
  readonly texts: readonly string[];
  readonly values: readonly Node[];
  readonly parts: readonly (string | Node)[];
};

const TAGS = [
  'a',
  'abbr',
  'article',
  'aside',
  'b',
  'blockquote',
  'body',
  'br',
  'button',
  'caption',
  'code',
  'dd',
  'del',
  'div',
  'dl',
  'dt',
  'em',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'label',
  'li',
  'link',
  'main',
  'mark',
  'meta',
  'nav',
  'ol',
  'option',
  'p',
  'pre',
  'script',
  'section',
  'select',
  'small',
  'span',
  'strong',
  'style',
  'sub',
  'sup',
  'svg',
  'table',
  'tbody',
  'td',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'title',
  'tr',
  'u',
  'ul',
];
const MARKUP = new RegExp(`(?<![\\w)\\]])<\\/?(?:${TAGS.join('|')})(?=[\\s>/]|$)`, 'u');

const COMPONENT_TAG = /<[A-Z][\w.]*(?=[\s>/]|$)/u;

export function isMarkup(texts: readonly string[]): boolean {
  return texts.some((text) => MARKUP.test(text)) && !texts.some((text) => COMPONENT_TAG.test(text));
}

export function fragmentOf(node: Node): Fragment | undefined {
  if (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length > 0) {
    const texts = node.quasis.map((quasi) => quasi.value.cooked ?? '');
    const parts = node.quasis.flatMap((quasi, index) => [
      quasi.value.cooked ?? '',
      ...(node.expressions[index] === undefined ? [] : [node.expressions[index]]),
    ]);
    return { texts, values: node.expressions, parts };
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+') {
    const operands = operandsOf(node, '+');
    const texts = operands.flatMap((operand) => stringValue(operand) ?? []);
    const values = operands.filter((operand) => stringValue(operand) === undefined);
    const parts = operands.map((operand) => stringValue(operand) ?? operand);
    return texts.length > 0 && values.length > 0 ? { texts, values, parts } : undefined;
  }
  return undefined;
}

export function isFragmentTop(node: Node): boolean {
  const holder = node.parent;
  if (holder === undefined) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return holder.type !== AST_NODE_TYPES.TaggedTemplateExpression;
  }
  return !(holder.type === AST_NODE_TYPES.BinaryExpression && holder.operator === '+');
}

const DIAGNOSTIC_CALLS = new Set<string>([
  'invariant',
  'warning',
  'warn',
  'assert',
  'error',
  'log',
  'info',
  'debug',
]);

export function isDiagnosticText(node: Node): boolean {
  const holder = node.parent;
  if (holder === undefined) {
    return false;
  }
  if (holder.type === AST_NODE_TYPES.ThrowStatement) {
    return true;
  }
  if (
    holder.type !== AST_NODE_TYPES.NewExpression &&
    holder.type !== AST_NODE_TYPES.CallExpression
  ) {
    return false;
  }
  const name = calleeNameOf(holder.callee) ?? '';
  return (
    holder.arguments.some((argument) => argument === node) &&
    (/Error$/u.test(name) || DIAGNOSTIC_CALLS.has(name))
  );
}

const PLAIN_RUN = /[\n=;{}]/u;

function isPlainRun(text: string): boolean {
  return !PLAIN_RUN.test(text.trim());
}

function literalPartsText(parts: readonly (string | Node)[]): string {
  return parts.map((part) => (typeof part === 'string' ? part : '')).join('');
}

export function isPlacedInMarkup(fragment: Fragment, value: Node): boolean {
  const at = fragment.parts.indexOf(value);
  const before = literalPartsText(fragment.parts.slice(0, at));
  const after = literalPartsText(fragment.parts.slice(at + 1));
  const open = before.lastIndexOf('<');
  if (open > before.lastIndexOf('>')) {
    return true;
  }
  const next = after.indexOf('<');
  return (
    isPlainRun(before.slice(before.lastIndexOf('>') + 1)) &&
    (next >= 0 ? isPlainRun(after.slice(0, next)) : after.trim() === '')
  );
}

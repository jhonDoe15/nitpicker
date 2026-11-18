import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, resolveFunction, stringValue } from '../analysis/constant-resolution.mts';
import { plainName } from '../encoding/plain-names.mts';
import { valueKind } from '../encoding/value-kinds.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';

type MessageId = 'quoteValue';

const QUOTES = ['"', "'"];
const SOURCE_TEXT = new RegExp(
  [
    String.raw`(?:^|[\n;])\s*import\s+[^"'\n]*\sfrom\s+["'\u0000]`,
    String.raw`(?:^|[\n;])\s*import\s*["'\u0000][^\n]*;`,
    String.raw`(?:^|[\n;])\s*export\s+(?:\*|\{[^}]*\}|(?:default|const|let|function)\b)`,
    String.raw`\brequire\(\s*["'\u0000]`,
    String.raw`\bimport\(\s*["'\u0000]`,
    String.raw`(?:^|[\n;])\s*(?:const|let|var)\s+[\w$\u0000{}, ]+\s*=`,
    String.raw`\.default\(["'\u0000]`,
  ].join('|'),
  'u',
);
const SPECIFIER_POSITION =
  /(?:\bfrom|\bimport|\bimport\(|\brequire\(|\.default\(|\[|\b(?:const|let|var)\s+[\w$]+\s*=)\s*$/u;
const FIXED_SOURCE = /__dirname|require\.resolve|JSON\.stringify/u;
const MESSAGE_OWNERS = new Set(['console', 'logger', 'log', 'output']);
const SAFE_CALL = /stringify|escape|quote/iu;
const SAFE_NAME = /^(?:i|j|n|index|count|length|size|line|column|col|port|id)$/iu;
const SAFE_PROPERTY = new Set(['length', 'size', 'index']);

function templateText(node: TSESTree.TemplateLiteral): string {
  return node.quasis.map((quasi) => quasi.value.cooked ?? '').join('\u0000');
}

function isSafeConstant(context: Context, node: TSESTree.Node): boolean | undefined {
  const kind = valueKind(context, node);
  if (kind === 'number' || kind === 'literals') {
    return true;
  }
  const constant = resolveConstant(context, node);
  if (constant?.type === AST_NODE_TYPES.CallExpression) {
    return FIXED_SOURCE.test(context.sourceCode.getText(constant)) || undefined;
  }
  const text = stringValue(constant);
  if (text !== undefined) {
    return !/["'\\\n\r`$]/u.test(text);
  }
  return constant?.type === AST_NODE_TYPES.Literal ? typeof constant.value === 'number' : undefined;
}

function isSafeValue(context: Context, node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  const constant = isSafeConstant(context, plain);
  if (constant !== undefined) {
    return constant;
  }
  if (plain.type === AST_NODE_TYPES.CallExpression) {
    const name = plainName(plain.callee) ?? '';
    const target = resolveFunction(context, unwrapped(plain.callee));
    const builds =
      target !== undefined && /JSON\.stringify/u.test(context.sourceCode.getText(target));
    return SAFE_CALL.test(name) || name === 'Number' || name === 'parseInt' || builds;
  }
  if (plain.type === AST_NODE_TYPES.MemberExpression) {
    return SAFE_PROPERTY.has(memberName(plain) ?? '');
  }
  return (
    plain.type === AST_NODE_TYPES.Identifier &&
    (SAFE_NAME.test(plain.name) || /^[A-Z][A-Z\d_]+$/u.test(plain.name))
  );
}

function quotedBetween(node: TSESTree.TemplateLiteral, index: number): boolean {
  const before = node.quasis[index]?.value.cooked ?? '';
  const after = node.quasis[index + 1]?.value.cooked ?? '';
  return QUOTES.some(
    (quote) =>
      before.endsWith(quote) &&
      after.startsWith(quote) &&
      SPECIFIER_POSITION.test(before.slice(0, -1)),
  );
}

function isMessageText(node: TSESTree.TemplateLiteral): boolean {
  const parent = node.parent;
  if (parent.type === AST_NODE_TYPES.ThrowStatement) {
    return true;
  }
  if (
    parent.type !== AST_NODE_TYPES.NewExpression &&
    parent.type !== AST_NODE_TYPES.CallExpression
  ) {
    return false;
  }
  const callee = unwrapped(parent.callee);
  const owner =
    callee.type === AST_NODE_TYPES.MemberExpression ? plainName(callee.object) : undefined;
  return /Error$/u.test(plainName(callee) ?? '') || MESSAGE_OWNERS.has(owner ?? '');
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow placing a value between hand-written quotes in generated source code',
    },
    schema: [],
    messages: {
      quoteValue:
        'A quote, backslash or newline in a value between hand-written quotes in generated code breaks it. ' +
        'Write the value with `JSON.stringify(value)` in place of the quotes (`const x = ${JSON.stringify(name)}`).',
    },
  },
  create(context) {
    return {
      TemplateLiteral(node) {
        if (
          node.parent.type === AST_NODE_TYPES.TaggedTemplateExpression ||
          isMessageText(node) ||
          !SOURCE_TEXT.test(templateText(node))
        ) {
          return;
        }
        node.expressions.forEach((expression, index) => {
          if (quotedBetween(node, index) && !isSafeValue(context, expression)) {
            context.report({ node: expression, messageId: 'quoteValue' });
          }
        });
      },
    };
  },
};

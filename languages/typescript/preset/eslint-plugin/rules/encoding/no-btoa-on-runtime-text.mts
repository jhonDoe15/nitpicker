import { appendAll } from '../../../../../../shared/lists/lists.mts';
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  resolveFunction,
  stringValue,
} from '../analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';
import { ancestorsOf } from '../typed/node-views.mts';
import { valueKind } from './value-kinds.mts';

type MessageId = 'utf8First';

const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);
const BYTE_TEXT = /fromCharCode|fromCodePoint|encodeURI|\bescape\(|latin1|binary|ascii|hex\b/iu;
const MAX_WRITE_DEPTH = 3;
const BYTE_WORDS = new Set([
  'binary',
  'byte',
  'bytes',
  'latin',
  'latin1',
  'ascii',
  'hex',
  'digest',
]);
const BYTE_WORDS_MORE = new Set(['buffer', 'chunk', 'raw']);

function isGlobalBtoa(context: Context, call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return (
      callee.name === 'btoa' && (findVariable(context, callee, 'btoa')?.defs.length ?? 0) === 0
    );
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    GLOBAL_OBJECTS.has(callee.object.name) &&
    memberName(callee) === 'btoa'
  );
}

function writtenValues(context: Context, identifier: TSESTree.Identifier): TSESTree.Node[] {
  const variable = findVariable(context, identifier, identifier.name);
  return (variable?.references ?? []).flatMap((reference) =>
    reference.isWrite() && reference.writeExpr ? [reference.writeExpr] : [],
  );
}

function isByteName(name: string): boolean {
  const words = name.split(/(?=[A-Z])|_/u).map((word) => word.toLowerCase());
  return (
    words.some((word) => BYTE_WORDS.has(word)) ||
    (words.length === 1 && BYTE_WORDS_MORE.has(name.toLowerCase()))
  );
}

function pushedByteText(context: Context, call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || memberName(callee) !== 'join') {
    return false;
  }
  const owner = unwrapped(callee.object);
  if (owner.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = findVariable(context, owner, owner.name);
  return (variable?.references ?? []).some((reference) => {
    const member = reference.identifier.parent;
    const pushed = member.parent;
    return (
      member.type === AST_NODE_TYPES.MemberExpression &&
      memberName(member) === 'push' &&
      pushed?.type === AST_NODE_TYPES.CallExpression &&
      BYTE_TEXT.test(context.sourceCode.getText(pushed))
    );
  });
}

function isLocalByteCall(context: Context, node: TSESTree.Node): boolean {
  const callee = node.type === AST_NODE_TYPES.CallExpression ? unwrapped(node.callee) : undefined;
  const target = callee === undefined ? undefined : resolveFunction(context, callee);
  return target !== undefined && BYTE_TEXT.test(context.sourceCode.getText(target));
}

function isDirectByteText(context: Context, node: TSESTree.Node): boolean {
  const kind = valueKind(context, node);
  return (
    BYTE_TEXT.test(context.sourceCode.getText(node)) ||
    (node.type === AST_NODE_TYPES.CallExpression && pushedByteText(context, node)) ||
    isLocalByteCall(context, node) ||
    (node.type === AST_NODE_TYPES.MemberExpression && memberName(node) === 'length') ||
    kind === 'literals' ||
    kind === 'number'
  );
}

function isByteText(context: Context, node: TSESTree.Node): boolean {
  const pending = [{ node, depth: 0 }];
  for (const current of pending) {
    if (isDirectByteText(context, current.node)) {
      return true;
    }
    const identifier = current.node.type === AST_NODE_TYPES.Identifier ? current.node : undefined;
    const expands = identifier !== undefined && current.depth < MAX_WRITE_DEPTH;
    if (expands && isByteName(identifier.name)) {
      return true;
    }
    for (const value of expands ? writtenValues(context, identifier) : []) {
      pending.push({ node: value, depth: current.depth + 1 });
    }
  }
  return false;
}

function isConstantText(context: Context, node: TSESTree.Node): boolean {
  const resolved = resolveConstant(context, node);
  return (
    stringValue(resolved) !== undefined ||
    (resolved?.type === AST_NODE_TYPES.Literal && typeof resolved.value === 'number')
  );
}

function isSafeText(context: Context, node: TSESTree.Node): boolean {
  const pending = [node];
  for (const item of pending) {
    const plain = unwrapped(item);
    if (plain.type === AST_NODE_TYPES.AwaitExpression) {
      pending.push(plain.argument);
    } else if (plain.type === AST_NODE_TYPES.TemplateLiteral) {
      appendAll(pending, plain.expressions);
    } else if (plain.type === AST_NODE_TYPES.BinaryExpression && plain.operator === '+') {
      pending.push(plain.left, plain.right);
    } else if (!(isConstantText(context, plain) || isByteText(context, plain))) {
      return false;
    }
  }
  return true;
}

function isCaught(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(
    (parent, index, chain) =>
      parent.type === AST_NODE_TYPES.TryStatement &&
      parent.handler !== null &&
      (chain[index - 1] ?? node) === parent.block,
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow btoa on runtime text, which throws for characters above U+00FF',
    },
    schema: [],
    messages: {
      utf8First:
        '`btoa` throws for any character above U+00FF, so a name, password or JSON with an accented letter, ' +
        'emoji or CJK text fails. Encode to UTF-8 bytes first: `Buffer.from(text, "utf8").toString("base64")` ' +
        'or `new TextEncoder().encode(text)` with a bytes-to-base64 step.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const [argument] = node.arguments;
        if (
          argument !== undefined &&
          argument.type !== AST_NODE_TYPES.SpreadElement &&
          isGlobalBtoa(context, node) &&
          !isCaught(node) &&
          !isSafeText(context, argument)
        ) {
          context.report({ node, messageId: 'utf8First' });
        }
      },
    };
  },
};

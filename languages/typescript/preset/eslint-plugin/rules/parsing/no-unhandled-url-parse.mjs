import { ancestorsOf } from '../analysis/ancestry.mjs';
import { isFunctionNode, resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';

const MAX_PARTS = 32;
const PARSED_MEMBERS = new Set(['href', 'url']);
const NAMED_FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression']);

function isUrlIdentifier(node) {
  return node.type === 'Identifier' && node.name === 'URL';
}

function isCanParse(node) {
  const { callee } = node;
  return (
    callee.type === 'MemberExpression' &&
    isUrlIdentifier(callee.object) &&
    !callee.computed &&
    callee.property.name === 'canParse'
  );
}

function textParts(context, node) {
  const value = resolveConstant(context, node);
  if (stringValue(value) !== undefined) {
    return [];
  }
  if (value?.type === 'BinaryExpression' && value.operator === '+') {
    return [value.left, value.right];
  }
  return value?.type === 'TemplateLiteral' ? value.expressions : undefined;
}

function isConstantText(context, node) {
  const pending = [node];
  for (const current of pending) {
    const parts = textParts(context, current);
    if (parts === undefined || pending.length > MAX_PARTS) {
      return false;
    }
    pending.push(...parts);
  }
  return true;
}

function isParsedMember(node) {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    PARSED_MEMBERS.has(node.property.name)
  );
}

function isModuleBase(node) {
  return (
    node?.type === 'MemberExpression' &&
    node.object.type === 'MetaProperty' &&
    node.object.meta.name === 'import' &&
    node.property.name === 'url'
  );
}

function inBlock(block, node) {
  return block.range[0] <= node.range[0] && node.range[1] <= block.range[1];
}

function isInsideTry(node) {
  const scope = ancestorsOf(node).find((ancestor) => NAMED_FUNCTIONS.has(ancestor.type));
  return ancestorsOf(node).some(
    (ancestor) =>
      ancestor.type === 'TryStatement' &&
      ancestor.handler !== null &&
      inBlock(ancestor.block, node) &&
      (scope === undefined || inBlock(scope, ancestor)),
  );
}

function functionOf(node) {
  return ancestorsOf(node).find(
    (ancestor) => isFunctionNode(ancestor) || ancestor.type === 'Program',
  );
}

function isGuarded(sourceCode, candidate, guards) {
  const text = sourceCode.getText(candidate.argument);
  const scopes = new Set([candidate.node, ...ancestorsOf(candidate.node)]);
  return guards.some((guard) => guard.text === text && scopes.has(guard.scope));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require new URL(text) on runtime text to be checked with URL.canParse, parsed with URL.parse, or wrapped in a try',
    },
    schema: [],
    messages: {
      unhandledUrlParse:
        'Parse this text with `URL.parse(text)` (null when it is not a URL), check `URL.canParse(text)` first, or build the URL in a `try` whose catch handles the failure. `new URL(text)` throws a TypeError on text that is not an absolute URL (no scheme, a bad host, `//` against a base), so one odd stored, user or header value turns this call into an error response. A constant is fine, and so are an already parsed `.href` or `.url` and `new URL(path, import.meta.url)`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const candidates = [];
    const guards = [];

    return {
      NewExpression(node) {
        const [argument, base] = node.arguments;
        if (
          !isUrlIdentifier(node.callee) ||
          argument === undefined ||
          argument.type === 'SpreadElement' ||
          isModuleBase(base) ||
          isParsedMember(argument) ||
          isConstantText(context, argument) ||
          isInsideTry(node)
        ) {
          return;
        }
        candidates.push({ node, argument });
      },
      CallExpression(node) {
        const [argument] = node.arguments;
        if (isCanParse(node) && argument !== undefined) {
          guards.push({ text: sourceCode.getText(argument), scope: functionOf(node) });
        }
      },
      'Program:exit'() {
        for (const candidate of candidates) {
          if (!isGuarded(sourceCode, candidate, guards)) {
            context.report({ node: candidate.node, messageId: 'unhandledUrlParse' });
          }
        }
      },
    };
  },
};

import { ancestorsOf } from '../analysis/ancestry.mjs';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  stringValue,
} from '../analysis/constant-resolution.mjs';

const MAX_PARTS = 100;
const PARSED_MEMBERS = new Set(['href', 'url', 'origin']);
const WRAPPERS = new Set(['TSNonNullExpression', 'TSAsExpression', 'TSSatisfiesExpression']);
const NAMED_FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression']);

function isUrlIdentifier(node) {
  return node.type === 'Identifier' && node.name === 'URL';
}

function isUrlConstructor(node) {
  return (
    isUrlIdentifier(node) ||
    (node.type === 'MemberExpression' &&
      node.object.type === 'Identifier' &&
      node.object.name === 'globalThis' &&
      isUrlIdentifier(node.property))
  );
}

function bare(node) {
  const chain = [node];
  for (const current of chain) {
    if (WRAPPERS.has(current.type)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function annotatedType(definition) {
  const holder = definition.type === 'Variable' ? definition.node.id : definition.name;
  return holder.typeAnnotation?.typeAnnotation;
}

function isUrlTyped(context, node) {
  if (node.type !== 'Identifier') {
    return false;
  }
  const definitions = findVariable(context, node, node.name)?.defs ?? [];
  const type = definitions.length === 1 ? annotatedType(definitions[0]) : undefined;
  return type?.type === 'TSTypeReference' && isUrlIdentifier(type.typeName);
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

function isUrlValue(context, node) {
  const value = bare(node);
  const resolved = resolveConstant(context, value);
  return (
    isParsedMember(value) ||
    isUrlTyped(context, value) ||
    (resolved?.type === 'NewExpression' && isUrlConstructor(resolved.callee))
  );
}

function isSafeText(context, node) {
  return isConstantText(context, node) || isUrlValue(context, node);
}

function isImportMetaUrl(node) {
  return (
    node?.type === 'MemberExpression' &&
    node.object.type === 'MetaProperty' &&
    node.object.meta.name === 'import' &&
    node.property.name === 'url'
  );
}

function isModuleBase(context, node) {
  const chain = [node];
  for (const current of chain) {
    const value = current === undefined ? undefined : resolveConstant(context, current);
    if (isImportMetaUrl(value)) {
      return true;
    }
    if (
      value?.type === 'NewExpression' &&
      isUrlConstructor(value.callee) &&
      chain.length < MAX_PARTS
    ) {
      chain.push(value.arguments[1]);
    }
  }
  return false;
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
  const text = sourceCode.getText(bare(candidate.argument));
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
        'Parse this text with `URL.parse(text)` (null when it is not a URL), check `URL.canParse(text)` first, or build the URL in a `try` whose catch handles the failure. `new URL(text)` throws a TypeError on text that is not an absolute URL (no scheme, a bad host, `//` against a base), so one odd stored, user or header value turns this call into an error response. Constant text and a base are fine, and so are a `URL` value, an already parsed `.href`, `.url` or `.origin`, and `new URL(path, import.meta.url)`.',
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
          !isUrlConstructor(node.callee) ||
          argument === undefined ||
          argument.type === 'SpreadElement' ||
          isModuleBase(context, base) ||
          (isSafeText(context, argument) && (base === undefined || isSafeText(context, base))) ||
          isInsideTry(node)
        ) {
          return;
        }
        candidates.push({ node, argument });
      },
      CallExpression(node) {
        const [argument] = node.arguments;
        if (isCanParse(node) && argument !== undefined) {
          guards.push({ text: sourceCode.getText(bare(argument)), scope: functionOf(node) });
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

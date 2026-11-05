import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';
import { dependsOnInput } from './input-dependence.mjs';
import { unwrapped } from './regex-bindings.mjs';

const PATTERN_METHODS = new Set(['match', 'matchAll', 'search']);
const RUNTIME_STRING_FLAGS = ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral;

function partsOf(type) {
  return type.isUnion() ? type.types : [type];
}

function isStringType(type) {
  const parts = partsOf(type);
  return parts.length > 0 && parts.every((part) => part.flags & ts.TypeFlags.StringLike);
}

function isRuntimeStringType(type) {
  return partsOf(type).some((part) => part.flags & RUNTIME_STRING_FLAGS);
}

function calleeName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : undefined;
}

function concatenationParts(node) {
  const pending = [node];
  const parts = [];
  for (const current of pending) {
    if (current.type === 'BinaryExpression' && current.operator === '+') {
      pending.push(current.left, current.right);
    } else {
      parts.push(current);
    }
  }
  return parts;
}

function patternParts(node) {
  const target = unwrapped(node);
  if (target.type === 'TemplateLiteral') {
    return target.expressions;
  }
  if (
    target.type === 'TaggedTemplateExpression' &&
    target.tag.type === 'MemberExpression' &&
    target.tag.object.name === 'String' &&
    target.tag.property.name === 'raw'
  ) {
    return target.quasi.expressions;
  }
  if (target.type === 'BinaryExpression' && target.operator === '+') {
    const parts = concatenationParts(target);
    const hasText = parts.some((part) => stringValue(part) !== undefined);
    return hasText ? parts.filter((part) => stringValue(part) === undefined) : [];
  }
  return [];
}

function isRegExpConstruction(node) {
  return node.callee.type === 'Identifier' && node.callee.name === 'RegExp';
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow passing a string to match(), matchAll() or search(), and building a regex from an unescaped runtime string',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      stringPattern:
        '`{{ method }}()` compiles this string as a regex, so `.`, `*`, `?`, `(` and the other metacharacters in it change what matches. Use `includes`, `startsWith`, `indexOf` or `===` for plain text, or pass a RegExp (`/…/` or `new RegExp(pattern)`) when it is meant as a pattern.',
      unescapedValue:
        "`{{ value }}` is built into this regex unescaped, so the metacharacters in it change the pattern. Escape it first (`RegExp.escape({{ value }})` or the project's escape helper), interpolate a RegExp's `.source` when the value is meant as a pattern, or compare plain text with `includes` or `startsWith`.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    if (services?.program === null || services?.program === undefined) {
      return {};
    }
    const checker = services.program.getTypeChecker();

    function typeOf(node) {
      return services.getTypeAtLocation(node);
    }

    function isPatternSource(node) {
      return (
        node.type === 'MemberExpression' &&
        !node.computed &&
        node.property.name === 'source' &&
        typeOf(node.object).getSymbol()?.getName() === 'RegExp'
      );
    }

    function isRuntimeValue(part) {
      const target = unwrapped(part);
      if (isPatternSource(target)) {
        return false;
      }
      if (stringValue(resolveConstant(context, target)) !== undefined) {
        return false;
      }
      const type = checker.getBaseConstraintOfType(typeOf(target)) ?? typeOf(target);
      return isRuntimeStringType(type) && dependsOnInput(context, target);
    }

    function checkConstruction(node) {
      const [pattern] = node.arguments;
      if (pattern === undefined || !isRegExpConstruction(node)) {
        return;
      }
      const runtime = patternParts(pattern).find(isRuntimeValue);
      if (runtime !== undefined) {
        context.report({
          node: runtime,
          messageId: 'unescapedValue',
          data: { value: sourceCode.getText(unwrapped(runtime)) },
        });
      }
    }

    return {
      NewExpression: checkConstruction,
      CallExpression(node) {
        checkConstruction(node);
        const method = calleeName(node.callee);
        const [argument] = node.arguments;
        if (
          node.callee.type !== 'MemberExpression' ||
          !PATTERN_METHODS.has(method) ||
          argument === undefined ||
          argument.type === 'SpreadElement'
        ) {
          return;
        }
        if (isStringType(typeOf(node.callee.object)) && isStringType(typeOf(argument))) {
          context.report({ node: argument, messageId: 'stringPattern', data: { method } });
        }
      },
    };
  },
};

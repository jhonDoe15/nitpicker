import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';
import { dependsOnInput } from './input-dependence.mjs';
import { unwrapped } from './regex-bindings.mjs';

const PATTERN_METHODS = new Set(['match', 'matchAll', 'search']);
const RUNTIME_STRING_FLAGS = ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral;

function isStringType(type) {
  const parts = type.isUnion() ? type.types : [type];
  return parts.length > 0 && parts.every((part) => part.flags & ts.TypeFlags.StringLike);
}

function isRuntimeStringType(type) {
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((part) => part.flags & RUNTIME_STRING_FLAGS);
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

function isPatternSource(state, node) {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.name === 'source' &&
    state.typeOf(node.object).getSymbol()?.getName() === 'RegExp'
  );
}

function isRuntimeValue(state, part) {
  const target = unwrapped(part);
  if (isPatternSource(state, target)) {
    return false;
  }
  if (stringValue(resolveConstant(state.context, target)) !== undefined) {
    return false;
  }
  const type = state.checker.getBaseConstraintOfType(state.typeOf(target)) ?? state.typeOf(target);
  return isRuntimeStringType(type) && dependsOnInput(state.context, target);
}

function checkConstruction(state, node) {
  const [pattern] = node.arguments;
  if (pattern === undefined || !isRegExpConstruction(node)) {
    return;
  }
  const runtime = patternParts(pattern).find((part) => isRuntimeValue(state, part));
  if (runtime !== undefined) {
    state.context.report({
      node: runtime,
      messageId: 'unescapedValue',
      data: { value: state.context.sourceCode.getText(unwrapped(runtime)) },
    });
  }
}

function checkStringArgument(state, node) {
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
  if (isStringType(state.typeOf(node.callee.object)) && isStringType(state.typeOf(argument))) {
    state.context.report({ node: argument, messageId: 'stringPattern', data: { method } });
  }
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
        'Use `includes`, `startsWith`, `indexOf` or `===` for plain text, or pass a RegExp (`/…/` or `new RegExp(pattern)`) when the string is meant as a pattern. `{{ method }}()` compiles a string argument as a regex, so `.`, `*`, `?`, `(` and the other metacharacters in it change what matches.',
      unescapedValue:
        "Escape `{{ value }}` with the project's escape helper (`escapeRegExp({{ value }})`, or `RegExp.escape` on a runtime that has it), interpolate a RegExp's `.source` when the value is meant as a pattern, or compare plain text with `includes` or `startsWith`. Built into this regex unescaped, the metacharacters in it change the pattern.",
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (services?.program === null || services?.program === undefined) {
      return {};
    }
    const state = {
      context,
      checker: services.program.getTypeChecker(),
      typeOf: (node) => services.getTypeAtLocation(node),
    };
    return {
      NewExpression(node) {
        checkConstruction(state, node);
      },
      CallExpression(node) {
        checkConstruction(state, node);
        checkStringArgument(state, node);
      },
    };
  },
};

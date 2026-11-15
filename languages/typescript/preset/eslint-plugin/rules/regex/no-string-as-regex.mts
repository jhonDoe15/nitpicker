import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mts';
import { typeServices } from '../security/security-values.mts';
import { nameOf } from '../typed/node-views.mts';
import { ts } from '../typed/typescript-views.mts';
import { dependsOnInput } from './input-dependence.mts';
import { unwrapped } from './regex-bindings.mts';

type Node = TSESTree.Node;
type Context = TSESLint.RuleContext<'stringPattern' | 'unescapedValue', readonly unknown[]>;
type State = {
  readonly context: Context;
  readonly checker: TypeScript.TypeChecker;
  readonly typeOf: (node: Node) => TypeScript.Type;
};
type Docs = { readonly requiresTypeChecking: boolean };

const PATTERN_METHODS = new Set<string>(['match', 'matchAll', 'search']);
const RUNTIME_STRING_FLAGS = ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral;

function isStringType(type: TypeScript.Type): boolean {
  const parts = type.isUnion() ? type.types : [type];
  return parts.length > 0 && parts.every((part) => (part.flags & ts.TypeFlags.StringLike) !== 0);
}

function isRuntimeStringType(type: TypeScript.Type): boolean {
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((part) => (part.flags & RUNTIME_STRING_FLAGS) !== 0);
}

function calleeName(callee: Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? nameOf(callee.property)
    : undefined;
}

function concatenationParts(node: Node): Node[] {
  const pending = [node];
  const parts: Node[] = [];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.BinaryExpression && current.operator === '+') {
      pending.push(current.left, current.right);
    } else {
      parts.push(current);
    }
  }
  return parts;
}

function patternParts(node: Node): readonly Node[] {
  const target = unwrapped(node);
  if (target.type === AST_NODE_TYPES.TemplateLiteral) {
    return target.expressions;
  }
  if (
    target.type === AST_NODE_TYPES.TaggedTemplateExpression &&
    target.tag.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(target.tag.object) === 'String' &&
    nameOf(target.tag.property) === 'raw'
  ) {
    return target.quasi.expressions;
  }
  if (target.type === AST_NODE_TYPES.BinaryExpression && target.operator === '+') {
    const parts = concatenationParts(target);
    const hasText = parts.some((part) => stringValue(part) !== undefined);
    return hasText ? parts.filter((part) => stringValue(part) === undefined) : [];
  }
  return [];
}

function isRegExpConstruction(node: TSESTree.CallExpression | TSESTree.NewExpression): boolean {
  return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'RegExp';
}

function isPatternSource(state: State, node: Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    nameOf(node.property) === 'source' &&
    state.typeOf(node.object).getSymbol()?.getName() === 'RegExp'
  );
}

function isRuntimeValue(state: State, part: Node): boolean {
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

function checkConstruction(
  state: State,
  node: TSESTree.CallExpression | TSESTree.NewExpression,
): void {
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

function checkStringArgument(state: State, node: TSESTree.CallExpression): void {
  const method = calleeName(node.callee);
  const [argument] = node.arguments;
  if (
    node.callee.type !== AST_NODE_TYPES.MemberExpression ||
    method === undefined ||
    !PATTERN_METHODS.has(method) ||
    argument === undefined ||
    argument.type === AST_NODE_TYPES.SpreadElement
  ) {
    return;
  }
  if (isStringType(state.typeOf(node.callee.object)) && isStringType(state.typeOf(argument))) {
    state.context.report({ node: argument, messageId: 'stringPattern', data: { method } });
  }
}

export const rule: TSESLint.RuleModule<'stringPattern' | 'unescapedValue', [], Docs> = {
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
    const services = typeServices(context);
    if (services === undefined) {
      return {};
    }
    const state: State = {
      context,
      checker: services.program.getTypeChecker(),
      typeOf: (node: Node) => services.getTypeAtLocation(node),
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

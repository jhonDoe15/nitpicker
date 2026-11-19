import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, scopeChain, type SourceCode } from '../../typed/node-views.mts';

const NAMES = new Set<string>(['debounce', 'throttle']);
const LIBRARIES =
  /^(lodash([.\-/].*)?|es-toolkit(\/.*)?|throttle-debounce|just-(debounce-it|throttle)|underscore)$/u;
const { DefinitionType } = TSESLint.Scope;

function definitionsOf(
  sourceCode: SourceCode,
  at: TSESTree.Node,
  name: string,
): readonly TSESLint.Scope.Definition[] {
  const variable = scopeChain(sourceCode.getScope(at))
    .map((scope) => scope.set.get(name))
    .find((found) => found !== undefined);
  return variable?.defs ?? [];
}

function fromLibrary(definition: TSESLint.Scope.Definition): boolean {
  const { node } = definition;
  return (
    definition.type === DefinitionType.ImportBinding &&
    node.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    LIBRARIES.test(node.parent.source.value)
  );
}

function isLocalFunction(definition: TSESLint.Scope.Definition): boolean {
  return (
    definition.type === DefinitionType.FunctionName ||
    (definition.type === DefinitionType.Variable &&
      (definition.node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        definition.node.init?.type === AST_NODE_TYPES.FunctionExpression))
  );
}

export function debounceName(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): string | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier && NAMES.has(callee.name)) {
    const found = definitionsOf(sourceCode, call, callee.name);
    return found.length > 0 &&
      found.every((definition) => fromLibrary(definition) || isLocalFunction(definition))
      ? callee.name
      : undefined;
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    NAMES.has(nameOf(callee.property) ?? '')
  ) {
    const found = definitionsOf(sourceCode, call, callee.object.name);
    return found.length > 0 && found.every(fromLibrary) ? nameOf(callee.property) : undefined;
  }
  return undefined;
}

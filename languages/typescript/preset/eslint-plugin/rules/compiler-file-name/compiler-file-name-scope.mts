import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, scopeChain } from '../typed/node-views.mts';

const { DefinitionType } = TSESLint.Scope;
const FUNCTION_NODE_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
]);
const FILE_NAME_ENDINGS = new Set(['file', 'path', 'filename', 'filepath']);

function splitWords(identifier: string): string[] {
  return identifier
    .replace(/^[_$]+|[_$]+$/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .split('_')
    .filter((word) => word.length > 0);
}

export function isFileNameIdentifier(name: string): boolean {
  const words = splitWords(name);
  const last = words.at(-1);
  if (last === undefined) {
    return false;
  }
  if (FILE_NAME_ENDINGS.has(last)) {
    return true;
  }
  return last === 'name' && words.at(-2) === 'file';
}

function isFunctionNode(node: TSESTree.Node): boolean {
  return FUNCTION_NODE_TYPES.has(node.type);
}

function isInsideFunction(node: TSESTree.Node): boolean {
  return isFunctionNode(node) || ancestorsOf(node).some(isFunctionNode);
}

function isAvailableBeforeCall(
  definition: TSESLint.Scope.Definition,
  call: TSESTree.CallExpression,
): boolean {
  if (definition.type === DefinitionType.Parameter) {
    return true;
  }
  return definition.type === DefinitionType.Variable && definition.node.range[1] < call.range[0];
}

function scopeCandidate(
  scope: TSESLint.Scope.Scope,
  call: TSESTree.CallExpression,
): string | undefined {
  for (const variable of scope.variables) {
    if (
      isFileNameIdentifier(variable.name) &&
      variable.defs.some((definition) => isAvailableBeforeCall(definition, call))
    ) {
      return variable.name;
    }
  }
  return undefined;
}

export function enclosingFileNameCandidate(
  sourceCode: Readonly<TSESLint.SourceCode>,
  call: TSESTree.CallExpression,
): string | undefined {
  if (!ancestorsOf(call).some(isFunctionNode)) {
    return undefined;
  }
  for (const scope of scopeChain(sourceCode.getScope(call))) {
    if (scope.type === 'module' || scope.type === 'global' || !isInsideFunction(scope.block)) {
      break;
    }
    const found = scopeCandidate(scope, call);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

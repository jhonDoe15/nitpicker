import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveModuleSpecifier as untypedResolveModuleSpecifier } from '../../../../modules/module-resolution.mts';
import { nameOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isFunction, TYPE_ASSERTIONS, unwrapOf } from '../../typed/syntax-views.mts';
import { exportIsAsyncFunction } from './async-exports.mts';

type Definition = TSESLint.Scope.Definition;
type ModuleResolution = { readonly kind: string; readonly path?: string };
export type Lookup = { readonly sourceCode: SourceCode; readonly filename: string };

const resolveModuleSpecifier: (written: string, containingFile: string) => ModuleResolution =
  untypedResolveModuleSpecifier;
const { DefinitionType } = TSESLint.Scope;
const COMBINATORS = new Set<string | undefined>(['all', 'allSettled', 'race', 'any']);
const CHAIN_METHODS = new Set<string | undefined>(['then', 'catch', 'finally']);

function isGlobal(sourceCode: SourceCode, node: TSESTree.Node, name: string): boolean {
  return (
    node.type === AST_NODE_TYPES.Identifier &&
    node.name === name &&
    (variableNamed(sourceCode, node)?.defs.length ?? 0) === 0
  );
}

function importedName(definition: Definition): string | undefined {
  if (definition.node.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    return 'default';
  }
  return definition.node.type === AST_NODE_TYPES.ImportSpecifier
    ? nameOf(definition.node.imported)
    : undefined;
}

function importsAsyncFunction({ filename }: Lookup, definition: Definition): boolean {
  const name = importedName(definition);
  if (definition.parent?.type !== AST_NODE_TYPES.ImportDeclaration || name === undefined) {
    return false;
  }
  const target = resolveModuleSpecifier(definition.parent.source.value, filename);
  return (
    target.kind === 'file' && target.path !== undefined && exportIsAsyncFunction(target.path, name)
  );
}

function isAsyncFunction(lookup: Lookup, callee: TSESTree.Identifier): boolean {
  const variable = variableNamed(lookup.sourceCode, callee);
  const definition = variable?.defs.at(0);
  const isReassigned = variable?.references.some(
    (reference) => reference.isWrite() && !reference.init,
  );
  if (definition === undefined || variable?.defs.length !== 1 || isReassigned === true) {
    return false;
  }
  if (definition.type === DefinitionType.FunctionName) {
    return definition.node.async;
  }
  if (definition.type === DefinitionType.Variable) {
    const { init } = definition.node;
    return definition.parent.kind === 'const' && init !== null && isFunction(init) && init.async;
  }
  return (
    definition.type === DefinitionType.ImportBinding && importsAsyncFunction(lookup, definition)
  );
}

function freshCall(lookup: Lookup, call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (isFunction(callee)) {
    return callee.async ? 'The inline async function returns' : undefined;
  }
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return isAsyncFunction(lookup, callee)
      ? `\`${callee.name}\` is an async function and returns`
      : undefined;
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const method = nameOf(callee.property);
  if (isGlobal(lookup.sourceCode, callee.object, 'Promise')) {
    return COMBINATORS.has(method) ? `\`Promise.${method ?? ''}(...)\` returns` : undefined;
  }
  return CHAIN_METHODS.has(method) ? `\`.${method ?? ''}(...)\` returns` : undefined;
}

export function freshPromise(lookup: Lookup, expression: TSESTree.Node): string | undefined {
  const value = unwrapOf(expression, TYPE_ASSERTIONS);
  if (value.type === AST_NODE_TYPES.NewExpression) {
    return isGlobal(lookup.sourceCode, value.callee, 'Promise')
      ? '`new Promise(...)` builds'
      : undefined;
  }
  return value.type === AST_NODE_TYPES.CallExpression ? freshCall(lookup, value) : undefined;
}

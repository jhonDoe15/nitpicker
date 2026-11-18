import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';

export type ListingScope = { readonly sourceCode: SourceCode };

const { DefinitionType } = TSESLint.Scope;

const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);
const PATH_MODULES = new Set(['path', 'node:path', 'path/posix', 'node:path/posix']);
const UTF8_ENCODINGS = new Set(['utf8', 'utf-8']);
const ITERATION_METHODS = new Set([
  'map',
  'forEach',
  'filter',
  'flatMap',
  'some',
  'every',
  'find',
  'findLast',
  'endsWith',
  'startsWith',
  'includes',
  'isDirectory',
  'isFile',
  'isSymbolicLink',
  'sort',
  'toSorted',
  'slice',
  'reverse',
  'toReversed',
  'then',
]);

function isUtf8(value: unknown): boolean {
  return typeof value === 'string' && UTF8_ENCODINGS.has(value);
}

function importedDefinition(
  sourceCode: SourceCode,
  definition: TSESLint.Scope.Definition,
  modules: ReadonlySet<string>,
): boolean {
  if (definition.type === DefinitionType.ImportBinding) {
    return (
      definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
      modules.has(definition.parent.source.value)
    );
  }
  const init = definition.type === DefinitionType.Variable ? definition.node.init : undefined;
  const argument = init?.type === AST_NODE_TYPES.CallExpression ? init.arguments[0] : undefined;
  return (
    init?.type === AST_NODE_TYPES.CallExpression &&
    init.callee.type === AST_NODE_TYPES.Identifier &&
    init.callee.name === 'require' &&
    (variableNamed(sourceCode, init.callee)?.defs.length ?? 0) === 0 &&
    argument?.type === AST_NODE_TYPES.Literal &&
    typeof argument.value === 'string' &&
    modules.has(argument.value)
  );
}

function stableImportReference(reference: TSESLint.Scope.Reference): boolean {
  if (reference.isWrite()) {
    return reference.init === true;
  }
  const node = reference.identifier;
  const member = node.parent;
  if (member.type !== AST_NODE_TYPES.MemberExpression || member.object !== node) {
    return false;
  }
  const owner = member.parent;
  return (
    !(owner.type === AST_NODE_TYPES.AssignmentExpression && owner.left === member) &&
    owner.type !== AST_NODE_TYPES.UpdateExpression &&
    owner.type !== AST_NODE_TYPES.UnaryExpression
  );
}

function isModuleCall(
  scope: ListingScope,
  call: TSESTree.CallExpression,
  modules: ReadonlySet<string>,
): boolean {
  const callee = call.callee;
  const identifier = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : callee;
  if (identifier.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = variableNamed(scope.sourceCode, identifier);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return (
    variable !== undefined &&
    definition !== undefined &&
    variable.references.every((reference) =>
      callee.type === AST_NODE_TYPES.Identifier
        ? !reference.isWrite() || reference.init === true
        : stableImportReference(reference),
    ) &&
    importedDefinition(scope.sourceCode, definition, modules)
  );
}

export function isFsListing(scope: ListingScope, call: TSESTree.CallExpression): boolean {
  return isModuleCall(scope, call, FS_MODULES);
}

export function isPathBuilder(scope: ListingScope, call: TSESTree.CallExpression): boolean {
  return isModuleCall(scope, call, PATH_MODULES);
}

function keyName(key: TSESTree.Node): unknown {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  return key.type === AST_NODE_TYPES.Literal ? key.value : undefined;
}

export function usesOrdinaryEncoding(call: TSESTree.CallExpression): boolean {
  const option = call.arguments[1];
  if (option === undefined) {
    return true;
  }
  if (option.type === AST_NODE_TYPES.Literal) {
    return isUtf8(option.value);
  }
  if (option.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }
  return option.properties.every(
    (property) =>
      property.type === AST_NODE_TYPES.Property &&
      !property.computed &&
      property.kind === 'init' &&
      !property.method &&
      (keyName(property.key) !== 'encoding' ||
        (property.value.type === AST_NODE_TYPES.Literal && isUtf8(property.value.value))),
  );
}

function staticKey(member: TSESTree.MemberExpression): unknown {
  if (!member.computed) {
    return nameOf(member.property);
  }
  return member.property.type === AST_NODE_TYPES.Literal ? member.property.value : undefined;
}

function safeMemberReference(member: TSESTree.MemberExpression): boolean {
  const owner = member.parent;
  if (owner.type === AST_NODE_TYPES.AssignmentExpression && owner.left === member) {
    return false;
  }
  if (
    owner.type === AST_NODE_TYPES.UpdateExpression ||
    owner.type === AST_NODE_TYPES.UnaryExpression
  ) {
    return false;
  }
  if (owner.type !== AST_NODE_TYPES.CallExpression || owner.callee !== member) {
    return true;
  }
  const method = staticKey(member);
  return typeof method === 'string' && ITERATION_METHODS.has(method);
}

export function hasUnsafeObjectReferences(variable: TSESLint.Scope.Variable): boolean {
  return variable.references.some((reference) => {
    if (reference.init) {
      return false;
    }
    const node = reference.identifier;
    const parent = node.parent;
    if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === node) {
      return !safeMemberReference(parent);
    }
    return (
      parent.type !== AST_NODE_TYPES.ForOfStatement &&
      parent.type !== AST_NODE_TYPES.AwaitExpression
    );
  });
}

export function safeIterationCallback(sourceCode: SourceCode, callback: TSESTree.Node): boolean {
  if (
    callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    callback.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return false;
  }
  if (callback.params.length > 2) {
    return false;
  }
  return callback.params.every((identifier) => {
    if (identifier.type !== AST_NODE_TYPES.Identifier) {
      return false;
    }
    const variable = variableNamed(sourceCode, identifier);
    return variable !== undefined && !hasUnsafeObjectReferences(variable);
  });
}

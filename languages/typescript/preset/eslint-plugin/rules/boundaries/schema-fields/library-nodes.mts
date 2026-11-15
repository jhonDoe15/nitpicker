import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, type SourceCode } from '../../typed/node-views.mts';
import { callChainLink } from '../../typed/syntax-views.mts';
import { libraryBinding, variableOf, VALIDATION_LIBRARIES } from './library-bindings.mts';
import { SCHEMA_FORMS, type SchemaForms, type SchemaId } from './schema-forms.mts';

export type SchemaLibrary = {
  readonly id: SchemaId;
  readonly packages: readonly string[];
  readonly forms: SchemaForms;
};
type Binding = { readonly library: SchemaLibrary; readonly name: string | undefined };
type NamedExport = { readonly library: SchemaLibrary; readonly name: string };

function isSchemaId(id: string): id is SchemaId {
  return Object.hasOwn(SCHEMA_FORMS, id);
}

export const SCHEMA_LIBRARIES: SchemaLibrary[] = VALIDATION_LIBRARIES.flatMap((library) =>
  isSchemaId(library.id)
    ? [{ id: library.id, packages: library.packages, forms: SCHEMA_FORMS[library.id] }]
    : [],
);

export function propertyName(member: TSESTree.Node): string | undefined {
  if (member.type !== AST_NODE_TYPES.MemberExpression || member.computed) {
    return undefined;
  }
  return member.property.type === AST_NODE_TYPES.Identifier ? member.property.name : undefined;
}

function isDeclared(variable: TSESLint.Scope.Variable | undefined): boolean {
  return variable !== undefined && variable.defs.length > 0;
}

function bindingOf(sourceCode: SourceCode, identifier: TSESTree.Identifier): Binding | undefined {
  const variable = variableOf(sourceCode, identifier);
  for (const library of SCHEMA_LIBRARIES) {
    const binding = libraryBinding(variable, library.packages);
    if (binding !== undefined) {
      return { library, name: binding.name };
    }
  }
  const global = SCHEMA_LIBRARIES.find(({ forms }) => forms.globals.includes(identifier.name));
  return global !== undefined && !isDeclared(variable)
    ? { library: global, name: undefined }
    : undefined;
}

function isNamespaceBinding(binding: Binding): boolean {
  return binding.name === undefined || binding.library.forms.namespaces.includes(binding.name);
}

function namespaceOf(sourceCode: SourceCode, node: TSESTree.Node): SchemaLibrary | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    const binding = bindingOf(sourceCode, node);
    return binding !== undefined && isNamespaceBinding(binding) ? binding.library : undefined;
  }
  const name = propertyName(node);
  if (
    node.type !== AST_NODE_TYPES.MemberExpression ||
    name === undefined ||
    node.object.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const binding = bindingOf(sourceCode, node.object);
  return binding !== undefined &&
    binding.name === undefined &&
    binding.library.forms.namespaces.includes(name)
    ? binding.library
    : undefined;
}

export function exportOf(sourceCode: SourceCode, node: TSESTree.Node): NamedExport | undefined {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    const name = propertyName(node);
    if (name === undefined) {
      return undefined;
    }
    const library = namespaceOf(sourceCode, node.object);
    return library === undefined ? undefined : { library, name };
  }
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const binding = bindingOf(sourceCode, node);
  return binding === undefined || binding.name === undefined || isNamespaceBinding(binding)
    ? undefined
    : { library: binding.library, name: binding.name };
}

export function calledExport(sourceCode: SourceCode, node: TSESTree.Node): NamedExport | undefined {
  return node.type === AST_NODE_TYPES.CallExpression
    ? exportOf(sourceCode, node.callee)
    : undefined;
}

export function chainBase(node: TSESTree.Node): TSESTree.Node {
  return chainOf(node, callChainLink).at(-1) ?? node;
}

export function chainLibrary(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): SchemaLibrary | undefined {
  const base = chainBase(node);
  return base.type === AST_NODE_TYPES.Identifier ? bindingOf(sourceCode, base)?.library : undefined;
}

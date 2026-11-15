import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { bindingsOf, loadedModule, type ModuleBindings } from '../../security/imported-names.mts';
import { staticKey } from '../../security/security-values.mts';
import { depthFirst, isNode, nameOf, nodeChildren } from '../../typed/node-views.mts';
import type { Env, Ref, SpecOf, TypeName } from './origin-types.mts';

const { DefinitionType } = TSESLint.Scope;
const DEFAULT = 'default';

function declaratorsOf(program: TSESTree.Program): TSESTree.VariableDeclarator[] {
  return [...depthFirst(program, nodeChildren)].filter(
    (node) => node.type === AST_NODE_TYPES.VariableDeclarator,
  );
}

function addLoaded(bindings: ModuleBindings, declarator: TSESTree.VariableDeclarator): void {
  const { id } = declarator;
  if (id.type === AST_NODE_TYPES.Identifier) {
    bindings.namespaces.add(id.name);
    return;
  }
  for (const property of id.type === AST_NODE_TYPES.ObjectPattern ? id.properties : []) {
    if (property.type !== AST_NODE_TYPES.Property) {
      continue;
    }
    const key = staticKey(property);
    if (key === DEFAULT && property.value.type === AST_NODE_TYPES.Identifier) {
      bindings.namespaces.add(property.value.name);
    } else if (key !== undefined && property.value.type === AST_NODE_TYPES.Identifier) {
      bindings.named.set(property.value.name, key);
    }
  }
}

export function moduleBindingsOf(
  program: TSESTree.Program,
  wanted: (source: string) => boolean,
): Env['entries'] {
  const declarators = declaratorsOf(program).map((node) => ({
    node,
    source: loadedModule(node.init ?? undefined),
  }));
  const imports = program.body
    .filter((statement) => statement.type === AST_NODE_TYPES.ImportDeclaration)
    .map((statement) => statement.source.value);
  const sources = new Set(
    [...imports, ...declarators.map(({ source }) => source)].filter(
      (source): source is string => source !== undefined && wanted(source),
    ),
  );
  return [...sources].map((source) => {
    const bindings = bindingsOf(program, new Set([source]));
    for (const declarator of declarators.filter((entry) => entry.source === source)) {
      addLoaded(bindings, declarator.node);
    }
    return { source, bindings };
  });
}

function importedRef(entry: Env['entries'][number], name: string): Ref | undefined {
  const { source, bindings } = entry;
  const imported =
    bindings.named.get(name) ?? (bindings.namespaces.has(name) ? DEFAULT : undefined);
  return imported === undefined ? undefined : { source, imported, instance: false };
}

export function annotationOf(node: TSESTree.Node): TSESTree.TSTypeAnnotation | undefined {
  return 'typeAnnotation' in node && node.typeAnnotation?.type === AST_NODE_TYPES.TSTypeAnnotation
    ? node.typeAnnotation
    : undefined;
}

export function typeName(annotation: TSESTree.TSTypeAnnotation | undefined): TypeName | undefined {
  const outer = annotation?.typeAnnotation;
  const inner: unknown = outer === undefined ? undefined : Reflect.get(outer, 'typeAnnotation');
  const reference = isNode(inner) ? inner : outer;
  const name = reference?.type === AST_NODE_TYPES.TSTypeReference ? reference.typeName : undefined;
  if (name?.type === AST_NODE_TYPES.TSQualifiedName) {
    return { owner: nameOf(name.left), name: name.right.name };
  }
  return name?.type === AST_NODE_TYPES.Identifier ? { name: name.name } : undefined;
}

export function moduleRef(env: Env, scopeNode: TSESTree.Node, name: string): Ref | undefined {
  const variable = findVariable(env.context, scopeNode, name);
  const local = variable?.defs.some((definition) => definition.type === DefinitionType.Parameter);
  const found = local ? [] : env.entries.map((entry) => importedRef(entry, name));
  return found.find((ref) => ref !== undefined);
}

export function typeImportsOf(program: TSESTree.Program, clientSpec: SpecOf): Map<string, Ref> {
  const found = new Map<string, Ref>();
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      clientSpec(statement.source.value) === undefined
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      const imported =
        specifier.type === AST_NODE_TYPES.ImportSpecifier ? nameOf(specifier.imported) : DEFAULT;
      found.set(specifier.local.name, {
        source: statement.source.value,
        imported,
        instance: false,
      });
    }
  }
  return found;
}

import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, stringValue } from '../analysis/constant-resolution.mts';
import { loadedModule } from '../security/imported-names.mts';
import { memberName, staticKey, unwrapped, type Context } from '../security/security-values.mts';
import { chainOf } from '../typed/node-views.mts';

export type OrmBinding = { readonly source: string; readonly imported: string | undefined };
export type ModuleScope = {
  readonly context: Context;
  readonly bindings: Map<string, OrmBinding>;
  readonly families: Set<string>;
};
type Entry = readonly [string, OrmBinding];

export const TYPEORM = 'typeorm';
export const SEQUELIZE = 'sequelize';
export const MIKRO_ORM = 'mikro-orm';
export const DRIZZLE = 'drizzle';

const SEQUELIZE_MODULES = new Set([
  'sequelize',
  'sequelize-typescript',
  '@sequelize/core',
  '@nestjs/sequelize',
]);
const FAMILIES: readonly (readonly [string, (source: string) => boolean])[] = [
  [TYPEORM, (source) => source === 'typeorm' || source === '@nestjs/typeorm'],
  [SEQUELIZE, (source) => SEQUELIZE_MODULES.has(source)],
  [MIKRO_ORM, (source) => source.startsWith('@mikro-orm/')],
  [DRIZZLE, (source) => source === 'drizzle-orm' || source.startsWith('drizzle-orm/')],
];

function statementsOf(program: TSESTree.Program): TSESTree.Node[] {
  return program.body.map((statement) =>
    statement.type === AST_NODE_TYPES.ExportNamedDeclaration && statement.declaration
      ? statement.declaration
      : statement,
  );
}

function importedName(specifier: TSESTree.ImportClause): string {
  if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
    return '*';
  }
  return specifier.imported.type === AST_NODE_TYPES.Identifier
    ? specifier.imported.name
    : specifier.imported.value;
}

function patternBindings(pattern: TSESTree.BindingName, source: string): Entry[] {
  if (pattern.type === AST_NODE_TYPES.Identifier) {
    return [[pattern.name, { source, imported: '*' }]];
  }
  const properties = pattern.type === AST_NODE_TYPES.ObjectPattern ? pattern.properties : [];
  return properties.flatMap((property): Entry[] =>
    property.type === AST_NODE_TYPES.Property && property.value.type === AST_NODE_TYPES.Identifier
      ? [[property.value.name, { source, imported: staticKey(property) }]]
      : [],
  );
}

function statementBindings(statement: TSESTree.Node): Entry[] {
  if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
    return statement.specifiers.map((specifier): Entry => [
      specifier.local.name,
      { source: statement.source.value, imported: importedName(specifier) },
    ]);
  }
  if (statement.type === AST_NODE_TYPES.TSImportEqualsDeclaration) {
    const source =
      statement.moduleReference.type === AST_NODE_TYPES.TSExternalModuleReference
        ? stringValue(statement.moduleReference.expression)
        : undefined;
    return source === undefined ? [] : [[statement.id.name, { source, imported: '*' }]];
  }
  const declarations =
    statement.type === AST_NODE_TYPES.VariableDeclaration ? statement.declarations : [];
  return declarations.flatMap((declarator) => {
    const source = loadedModule(declarator.init ?? undefined);
    return typeof source === 'string' ? patternBindings(declarator.id, source) : [];
  });
}

export function ormFamilyOf(source: string): string | undefined {
  return FAMILIES.find(([, matches]) => matches(source))?.[0];
}

export function moduleScope(context: Context): ModuleScope {
  const bindings = new Map(statementsOf(context.sourceCode.ast).flatMap(statementBindings));
  const sources = [...bindings.values()].map(({ source }) => source);
  const families = new Set(
    FAMILIES.filter(([, matches]) => sources.some(matches)).map(([family]) => family),
  );
  return { context, bindings, families };
}

export function ormLocals(
  scope: Pick<ModuleScope, 'bindings'>,
  name: string,
): Set<string | undefined> {
  const locals = [...scope.bindings]
    .filter(([, { source, imported }]) => ormFamilyOf(source) !== undefined && imported === name)
    .map(([local]) => local);
  return new Set<string | undefined>(locals);
}

function rootName(node: TSESTree.Node): string | undefined {
  const steps = chainOf(unwrapped(node), (current) => {
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      return unwrapped(current.object);
    }
    return current.type === AST_NODE_TYPES.CallExpression ? unwrapped(current.callee) : undefined;
  });
  const root = steps.at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}

export function isForeignReceiver(
  scope: Pick<ModuleScope, 'bindings'>,
  receiver: TSESTree.Node,
): boolean {
  const name = rootName(receiver);
  const binding = name === undefined ? undefined : scope.bindings.get(name);
  return binding !== undefined && !binding.source.startsWith('.') && !ormFamilyOf(binding.source) !== undefined;
}

export function calleeLabel(
  call: TSESTree.CallExpression | TSESTree.NewExpression,
): string | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const owner = unwrapped(callee.object);
  const name = memberName(callee);
  return owner.type === AST_NODE_TYPES.Identifier && name !== undefined
    ? `${owner.name}.${name}`
    : name;
}

export function constructedName(
  call: TSESTree.CallExpression | TSESTree.NewExpression,
): string | undefined {
  return calleeLabel(call)?.split('.').at(-1);
}

export function initializerOf(
  scope: Pick<ModuleScope, 'context'>,
  receiver: TSESTree.Node,
): TSESTree.Node | undefined {
  const target = unwrapped(receiver);
  if (target.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = findVariable(scope.context, target, target.name)?.defs[0];
  const init =
    definition?.type === TSESLint.Scope.DefinitionType.Variable
      ? unwrapped(definition.node.init ?? undefined)
      : undefined;
  return init?.type === AST_NODE_TYPES.AwaitExpression ? unwrapped(init.argument) : init;
}

const FORM_LENGTH = 40;

export function shortText<Fallback extends string | undefined>(
  context: Context,
  node: TSESTree.Node,
  fallback: Fallback,
): string | Fallback {
  const text = context.sourceCode.getText(node);
  return text.length > FORM_LENGTH || text.includes('\n') ? fallback : text;
}

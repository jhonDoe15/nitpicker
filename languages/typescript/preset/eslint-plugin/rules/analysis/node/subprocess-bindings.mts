import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import { stringValue } from '../constant-resolution.mts';
import { CHILD_PROCESS_MODULES, EXECA_MODULES } from './node-sync-modules.mts';

export type ModuleBindings = {
  readonly named: Map<string, string>;
  readonly namespaces: Set<string>;
};

type IdentifierProperty = TSESTree.Property & {
  readonly key: TSESTree.Identifier;
  readonly value: TSESTree.Identifier;
};

const SUBPROCESS_MODULES = new Set([...CHILD_PROCESS_MODULES, ...EXECA_MODULES, 'cross-spawn']);
const DEFAULT_IMPORT_NAMES = new Map([
  ['execa', 'execa'],
  ['cross-spawn', 'spawn'],
]);

function importedName(specifier: TSESTree.ImportSpecifier): string {
  return specifier.imported.type === AST_NODE_TYPES.Identifier
    ? specifier.imported.name
    : specifier.imported.value;
}

function addImportBindings(statement: TSESTree.ImportDeclaration, bindings: ModuleBindings): void {
  if (statement.importKind === 'type') {
    return;
  }
  for (const specifier of statement.specifiers) {
    if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
      bindings.named.set(specifier.local.name, importedName(specifier));
    } else {
      bindings.namespaces.add(specifier.local.name);
    }
  }
}

function isRequireOf(init: TSESTree.Expression | undefined, modules: ReadonlySet<string>): boolean {
  const source =
    init?.type === AST_NODE_TYPES.CallExpression ? stringValue(init.arguments[0]) : undefined;
  return (
    init?.type === AST_NODE_TYPES.CallExpression &&
    init.callee.type === AST_NODE_TYPES.Identifier &&
    init.callee.name === 'require' &&
    source !== undefined &&
    modules.has(source)
  );
}

function isIdentifierProperty(property: TSESTree.Node): property is IdentifierProperty {
  return (
    property.type === AST_NODE_TYPES.Property &&
    property.key.type === AST_NODE_TYPES.Identifier &&
    property.value.type === AST_NODE_TYPES.Identifier
  );
}

function addRequireBindings(pattern: TSESTree.BindingName, bindings: ModuleBindings): void {
  if (pattern.type === AST_NODE_TYPES.Identifier) {
    bindings.namespaces.add(pattern.name);
  }
  if (pattern.type !== AST_NODE_TYPES.ObjectPattern) {
    return;
  }
  for (const property of pattern.properties.filter(isIdentifierProperty)) {
    bindings.named.set(property.value.name, property.key.name);
  }
}

function addStatementBindings(
  statement: TSESTree.ProgramStatement,
  modules: ReadonlySet<string>,
  bindings: ModuleBindings,
): void {
  if (statement.type === AST_NODE_TYPES.ImportDeclaration && modules.has(statement.source.value)) {
    addImportBindings(statement, bindings);
  }
  if (statement.type !== AST_NODE_TYPES.VariableDeclaration) {
    return;
  }
  for (const declarator of statement.declarations) {
    if (isRequireOf(declarator.init ?? undefined, modules)) {
      addRequireBindings(declarator.id, bindings);
    }
  }
}

export function moduleBindings(
  program: TSESTree.Program,
  modules: ReadonlySet<string>,
): ModuleBindings {
  const bindings: ModuleBindings = { named: new Map(), namespaces: new Set() };
  for (const statement of program.body) {
    addStatementBindings(statement, modules, bindings);
  }
  return bindings;
}

export function importedCalleeName(
  callee: TSESTree.Node,
  bindings: ModuleBindings,
): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return bindings.named.get(callee.name);
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    bindings.namespaces.has(callee.object.name) &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }
  return undefined;
}

function defaultImportLocals(statement: TSESTree.ImportDeclaration): string[] {
  return statement.specifiers
    .filter((specifier) => specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier)
    .map((specifier) => specifier.local.name);
}

export function isPromisify(callee: TSESTree.Node): boolean {
  return (
    (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'promisify') ||
    (callee.type === AST_NODE_TYPES.MemberExpression && nameOf(callee.property) === 'promisify')
  );
}

export function withPromisified(
  program: TSESTree.Program,
  bindings: ModuleBindings,
): ModuleBindings {
  const named = new Map(bindings.named);
  const declarators = program.body.flatMap((statement) =>
    statement.type === AST_NODE_TYPES.VariableDeclaration ? statement.declarations : [],
  );
  for (const { id, init } of declarators) {
    if (id.type !== AST_NODE_TYPES.Identifier || init?.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const [wrapped] = init.arguments;
    const name = wrapped === undefined ? undefined : importedCalleeName(wrapped, bindings);
    if (isPromisify(init.callee) && name !== undefined) {
      named.set(id.name, name);
    }
  }
  return { ...bindings, named };
}

export function subprocessBindings(program: TSESTree.Program): ModuleBindings {
  const bindings = moduleBindings(program, SUBPROCESS_MODULES);
  for (const statement of program.body) {
    const name =
      statement.type === AST_NODE_TYPES.ImportDeclaration
        ? DEFAULT_IMPORT_NAMES.get(statement.source.value)
        : undefined;
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration || name === undefined) {
      continue;
    }
    for (const local of defaultImportLocals(statement)) {
      bindings.named.set(local, name);
    }
  }
  return bindings;
}

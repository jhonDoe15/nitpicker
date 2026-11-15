import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, resolveConstant, stringValue } from '../analysis/constant-resolution.mts';
import { importedCalleeName, moduleBindings } from '../analysis/subprocess-calls.mts';
import { memoized } from '../support/memo.mts';
import { chainOf, nameOf } from '../typed/node-views.mts';
import { DEPTHS, memberName, staticKey, unwrapped, type Context } from './security-values.mts';

export type ModuleBindings = {
  readonly named: Map<string, string>;
  readonly namespaces: Set<string>;
  readonly modules: ReadonlySet<string>;
};
export type ImportedBinding = { readonly module: string; readonly name: string };
type MaybeNode = TSESTree.Node | undefined;

const programBindings = new WeakMap<TSESTree.Program, Map<string, ImportedBinding>>();
const DEFAULT = 'default';

function includes(modules: ReadonlySet<string>, name: string | undefined): boolean {
  return name !== undefined && modules.has(name);
}

function loadedModuleCall(node: TSESTree.Node | undefined): string | undefined {
  const target = unwrapped(node);
  if (target?.type === AST_NODE_TYPES.ImportExpression) {
    return stringValue(target.source);
  }
  const isRequire =
    target?.type === AST_NODE_TYPES.CallExpression &&
    target.callee.type === AST_NODE_TYPES.Identifier &&
    target.callee.name === 'require';
  return isRequire ? stringValue(target.arguments[0]) : undefined;
}

function moduleStep(node: TSESTree.Node): TSESTree.Node | undefined {
  const target = unwrapped(node);
  if (target.type === AST_NODE_TYPES.AwaitExpression) {
    return target.argument;
  }
  return target.type === AST_NODE_TYPES.MemberExpression && memberName(target) === DEFAULT
    ? target.object
    : undefined;
}

export function loadedModule(node: MaybeNode): string | undefined {
  return loadedModuleCall(chainOf(node, moduleStep).at(-1));
}

function importEqualsModule(statement: TSESTree.Node): string | undefined {
  return statement.type === AST_NODE_TYPES.TSImportEqualsDeclaration &&
    statement.moduleReference.type === AST_NODE_TYPES.TSExternalModuleReference
    ? stringValue(statement.moduleReference.expression)
    : undefined;
}

function addPatternBindings(pattern: TSESTree.ObjectPattern, bindings: ModuleBindings): void {
  for (const property of pattern.properties) {
    const key = staticKey(property);
    if (
      key !== undefined &&
      property.type === AST_NODE_TYPES.Property &&
      property.value.type === AST_NODE_TYPES.Identifier
    ) {
      bindings.named.set(property.value.name, key);
    }
  }
}

function addDeclaratorBindings(
  declarator: TSESTree.VariableDeclarator,
  modules: ReadonlySet<string>,
  bindings: ModuleBindings,
): void {
  if (!includes(modules, loadedModule(declarator.init ?? undefined))) {
    return;
  }
  if (declarator.id.type === AST_NODE_TYPES.Identifier) {
    bindings.namespaces.add(declarator.id.name);
  }
  if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
    addPatternBindings(declarator.id, bindings);
  }
}

function addLoadedBindings(
  statement: TSESTree.Node,
  modules: ReadonlySet<string>,
  bindings: ModuleBindings,
): void {
  if (
    statement.type === AST_NODE_TYPES.TSImportEqualsDeclaration &&
    includes(modules, importEqualsModule(statement))
  ) {
    bindings.namespaces.add(statement.id.name);
  }
  const declarations =
    statement.type === AST_NODE_TYPES.VariableDeclaration ? statement.declarations : [];
  for (const declarator of declarations) {
    addDeclaratorBindings(declarator, modules, bindings);
  }
}

export function bindingsOf(
  program: TSESTree.Program,
  modules: ReadonlySet<string>,
): ModuleBindings {
  const base = moduleBindings(program, modules);
  const bindings: ModuleBindings = {
    named: new Map(),
    namespaces: new Set(base.namespaces),
    modules,
  };
  for (const [local, imported] of base.named) {
    if (imported === DEFAULT) {
      bindings.namespaces.add(local);
    } else {
      bindings.named.set(local, imported);
    }
  }
  for (const statement of program.body) {
    addLoadedBindings(statement, modules, bindings);
  }
  return bindings;
}

function statementModules(statement: TSESTree.Node): (string | undefined)[] {
  if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
    return statement.importKind === 'type' ? [] : [statement.source.value];
  }
  const declarations =
    statement.type === AST_NODE_TYPES.VariableDeclaration ? statement.declarations : [];
  return [
    importEqualsModule(statement),
    ...declarations.map(({ init }) => loadedModule(init ?? undefined)),
  ];
}

function collectedBindings(program: TSESTree.Program): Map<string, ImportedBinding> {
  const modules = new Set(program.body.flatMap(statementModules));
  const found = new Map<string, ImportedBinding>();
  for (const module of [...modules].filter((each) => typeof each === 'string')) {
    const bindings = bindingsOf(program, new Set([module]));
    for (const local of bindings.namespaces) {
      found.set(local, { module, name: DEFAULT });
    }
    for (const [local, name] of bindings.named) {
      found.set(local, { module, name });
    }
  }
  return found;
}

export function importedBindings(program: TSESTree.Program): Map<string, ImportedBinding> {
  return memoized(programBindings, program, collectedBindings);
}

export function isBindCall(
  node: MaybeNode,
): node is TSESTree.CallExpression & { callee: TSESTree.MemberExpression } {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    memberName(node.callee) === 'bind'
  );
}

function unaliased(context: Context, node: TSESTree.Node): TSESTree.Node {
  return unwrapped(resolveConstant(context, unwrapped(node))) ?? node;
}

function aliasTarget(context: Context, callee: TSESTree.Node): TSESTree.Node {
  const start = unaliased(context, callee);
  return DEPTHS.reduce(
    (current) => (isBindCall(current) ? unaliased(context, current.callee.object) : current),
    start,
  );
}

export function isModuleValue(
  context: Context,
  node: MaybeNode,
  bindings: ModuleBindings,
): boolean {
  const target = node === undefined ? undefined : unaliased(context, node);
  if (target?.type === AST_NODE_TYPES.Identifier) {
    return bindings.namespaces.has(target.name);
  }
  return includes(bindings.modules, loadedModule(target));
}

function destructuredName(
  context: Context,
  node: TSESTree.Node,
  bindings: ModuleBindings,
): string | undefined {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = findVariable(context, node, node.name)?.defs[0];
  if (definition?.type !== TSESLint.Scope.DefinitionType.Variable) {
    return undefined;
  }
  const { id: pattern, init } = definition.node;
  if (
    pattern.type !== AST_NODE_TYPES.ObjectPattern ||
    !isModuleValue(context, init ?? undefined, bindings)
  ) {
    return undefined;
  }
  const property = pattern.properties.find(
    (entry) =>
      entry.type === AST_NODE_TYPES.Property &&
      (nameOf(entry.value) === node.name ||
        (entry.value.type === AST_NODE_TYPES.AssignmentPattern &&
          nameOf(entry.value.left) === node.name)),
  );
  return property === undefined ? undefined : staticKey(property);
}

function moduleMemberName(
  context: Context,
  target: TSESTree.Node,
  bindings: ModuleBindings,
): string | undefined {
  const isMember = target.type === AST_NODE_TYPES.MemberExpression && !target.computed;
  return isMember && isModuleValue(context, target.object, bindings)
    ? memberName(target)
    : undefined;
}

export function importedFunction(
  context: Context,
  callee: TSESTree.Node,
  bindings: ModuleBindings,
): string | undefined {
  const target = unwrapped(aliasTarget(context, callee));
  return (
    importedCalleeName(target, bindings) ??
    destructuredName(context, target, bindings) ??
    moduleMemberName(context, target, bindings)
  );
}

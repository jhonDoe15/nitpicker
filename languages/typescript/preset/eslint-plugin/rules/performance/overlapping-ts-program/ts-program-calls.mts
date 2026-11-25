import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import {
  bindingsOf,
  importedFunction,
  type ModuleBindings,
} from '../../security/imported-names.mts';
import type { Context } from '../../security/security-values.mts';
import {
  ASSERTION_WRAPPERS,
  NULLISH_WRAPPERS,
  outermostOf,
  unwrapOf,
} from '../../typed/syntax-views.mts';

export type BoundVariable = {
  readonly variable: TSESLint.Scope.Variable;
  readonly pos: number;
};

export type ProgramCall = {
  readonly call: TSESTree.CallExpression;
  readonly factory: string;
  readonly binding: BoundVariable | undefined;
};

const { DefinitionType, ScopeType } = TSESLint.Scope;
const TYPESCRIPT_MODULES = new Set(['typescript']);
const PROGRAM_FACTORIES = new Set([
  'createProgram',
  'createWatchProgram',
  'createLanguageService',
  'createSemanticDiagnosticsBuilderProgram',
]);

export function typescriptBindings(program: TSESTree.Program): ModuleBindings {
  return bindingsOf(program, TYPESCRIPT_MODULES);
}

function isShadowedCallee(context: SourceContext, callee: TSESTree.Node): boolean {
  const target = unwrapOf(callee, NULLISH_WRAPPERS);
  const root =
    target.type === AST_NODE_TYPES.MemberExpression
      ? unwrapOf(target.object, NULLISH_WRAPPERS)
      : target;
  if (root.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = findVariable(context, root, root.name);
  if (
    variable === undefined ||
    variable.scope.type === ScopeType.module ||
    variable.scope.type === ScopeType.global
  ) {
    return false;
  }
  return variable.defs.some(
    (definition) =>
      definition.type === DefinitionType.Parameter ||
      (definition.type === DefinitionType.Variable && definition.parent.kind !== 'const'),
  );
}

export function programFactoryName(
  context: Context,
  call: TSESTree.CallExpression,
  bindings: ModuleBindings,
): string | undefined {
  if (isShadowedCallee(context, call.callee)) {
    return undefined;
  }
  const name = importedFunction(context, call.callee, bindings);
  return name !== undefined && PROGRAM_FACTORIES.has(name) ? name : undefined;
}

export function boundVariable(
  context: SourceContext,
  expression: TSESTree.Expression,
): BoundVariable | undefined {
  const outer = outermostOf(expression, ASSERTION_WRAPPERS);
  const { parent } = outer;
  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === outer &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    const variable = findVariable(context, parent.id, parent.id.name);
    return variable === undefined ? undefined : { variable, pos: parent.range[1] };
  }
  if (
    parent?.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.operator === '=' &&
    parent.right === outer &&
    parent.left.type === AST_NODE_TYPES.Identifier
  ) {
    const variable = findVariable(context, parent.left, parent.left.name);
    return variable === undefined ? undefined : { variable, pos: parent.range[1] };
  }
  return undefined;
}

function typeCheckerCallFor(identifier: TSESTree.Identifier): TSESTree.CallExpression | undefined {
  const receiver = outermostOf(identifier, NULLISH_WRAPPERS);
  const member = receiver.parent;
  if (
    member?.type !== AST_NODE_TYPES.MemberExpression ||
    member.object !== receiver ||
    member.computed ||
    member.property.type !== AST_NODE_TYPES.Identifier ||
    member.property.name !== 'getTypeChecker'
  ) {
    return undefined;
  }
  const callee = outermostOf(member, NULLISH_WRAPPERS);
  const call = callee.parent;
  return call?.type === AST_NODE_TYPES.CallExpression && call.callee === callee ? call : undefined;
}

export function derivedCheckers(
  context: SourceContext,
  program: BoundVariable,
  beforePos: number,
): BoundVariable[] {
  const found: BoundVariable[] = [];
  for (const reference of program.variable.references) {
    if (!reference.isRead() || !reference.isValueReference) {
      continue;
    }
    const { identifier } = reference;
    if (
      identifier.type !== AST_NODE_TYPES.Identifier ||
      identifier.range[0] <= program.pos ||
      identifier.range[1] >= beforePos
    ) {
      continue;
    }
    const call = typeCheckerCallFor(identifier);
    const binding = call === undefined ? undefined : boundVariable(context, call);
    if (binding !== undefined) {
      found.push(binding);
    }
  }
  return found;
}

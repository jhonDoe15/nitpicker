import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, stringValue } from '../../rules/analysis/constant-resolution.mts';
import type { Context } from '../../rules/security/security-values.mts';

export type ModuleCallee =
  | {
      readonly kind: 'member';
      readonly module: string;
      readonly object: string;
      readonly method: string;
    }
  | { readonly kind: 'named'; readonly module: string; readonly method: string };

const { DefinitionType } = TSESLint.Scope;

function isRequire(node: TSESTree.Node | undefined): node is TSESTree.CallExpression {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'require' &&
    node.arguments.length === 1
  );
}

function importedName(specifier: TSESTree.ImportSpecifier): string {
  const { imported } = specifier;
  return imported.type === AST_NODE_TYPES.Identifier ? imported.name : imported.value;
}

function isReassigned(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length !== 1 || variable.references.some((ref) => ref.isWrite() && !ref.init)
  );
}

function importEqualsModule(node: TSESTree.TSImportEqualsDeclaration): string | undefined {
  return node.importKind !== 'type' &&
    node.moduleReference.type === AST_NODE_TYPES.TSExternalModuleReference
    ? stringValue(node.moduleReference.expression)
    : undefined;
}

function valueImport(declaration: TSESTree.Node): string | undefined {
  return declaration.type === AST_NODE_TYPES.ImportDeclaration && declaration.importKind !== 'type'
    ? declaration.source.value
    : undefined;
}

function namespaceModule(definition: TSESLint.Scope.Definition): string | undefined {
  if (definition.type === DefinitionType.Variable) {
    const { init, id } = definition.node;
    const call = init ?? undefined;
    return id.type === AST_NODE_TYPES.Identifier && isRequire(call)
      ? stringValue(call.arguments[0])
      : undefined;
  }
  const { node } = definition;
  if (node.type === AST_NODE_TYPES.TSImportEqualsDeclaration) {
    return importEqualsModule(node);
  }
  const whole =
    node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
    node.type === AST_NODE_TYPES.ImportNamespaceSpecifier;
  return whole ? valueImport(node.parent) : undefined;
}

function memberCallee(
  context: Context,
  callee: TSESTree.MemberExpression,
): ModuleCallee | undefined {
  const { object, property } = callee;
  if (
    callee.computed ||
    callee.optional ||
    object.type !== AST_NODE_TYPES.Identifier ||
    property.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const variable = findVariable(context, object, object.name);
  const definition = variable?.defs[0];
  const module =
    variable === undefined || definition === undefined || isReassigned(variable)
      ? undefined
      : namespaceModule(definition);
  return module === undefined
    ? undefined
    : { kind: 'member', module, object: object.name, method: property.name };
}

function namedCallee(context: Context, callee: TSESTree.Identifier): ModuleCallee | undefined {
  const definition = findVariable(context, callee, callee.name)?.defs[0];
  const node = definition?.node;
  if (
    definition?.type !== DefinitionType.ImportBinding ||
    node?.type !== AST_NODE_TYPES.ImportSpecifier ||
    node.importKind === 'type'
  ) {
    return undefined;
  }
  const module = valueImport(node.parent);
  return module === undefined ? undefined : { kind: 'named', module, method: importedName(node) };
}

export function moduleCallee(
  context: Context,
  call: TSESTree.CallExpression,
): ModuleCallee | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return namedCallee(context, callee);
  }
  return callee.type === AST_NODE_TYPES.MemberExpression
    ? memberCallee(context, callee)
    : undefined;
}

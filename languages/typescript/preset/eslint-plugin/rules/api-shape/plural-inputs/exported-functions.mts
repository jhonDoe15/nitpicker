import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

type FunctionValue =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.TSDeclareFunction
  | TSESTree.TSEmptyBodyFunctionExpression;
type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;
type PublicMethod = TSESTree.MethodDefinition | TSESTree.TSAbstractMethodDefinition;
type ExportDeclaration = TSESTree.ExportNamedDeclaration | TSESTree.ExportDefaultDeclaration;
type Locals = Map<string, FunctionValue[]>;

const METHOD_KINDS = new Set<string>(['method', 'constructor']);
const HIDDEN = new Set<string | undefined>(['private', 'protected']);

function isFunctionValue(node: TSESTree.Node): node is FunctionValue {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.TSDeclareFunction ||
    node.type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression
  );
}

function isClassNode(node: TSESTree.Node): node is ClassNode {
  return (
    node.type === AST_NODE_TYPES.ClassDeclaration || node.type === AST_NODE_TYPES.ClassExpression
  );
}

function isExportDeclaration(node: TSESTree.Node): node is ExportDeclaration {
  return (
    node.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    node.type === AST_NODE_TYPES.ExportDefaultDeclaration
  );
}

function isPublicMethod(member: TSESTree.ClassElement): member is PublicMethod {
  return (
    (member.type === AST_NODE_TYPES.MethodDefinition ||
      member.type === AST_NODE_TYPES.TSAbstractMethodDefinition) &&
    METHOD_KINDS.has(member.kind) &&
    !HIDDEN.has(member.accessibility) &&
    member.key.type !== AST_NODE_TYPES.PrivateIdentifier &&
    !member.override
  );
}

function valueFunctions(node: TSESTree.Node | undefined): FunctionValue[] {
  if (node === undefined) {
    return [];
  }
  if (isFunctionValue(node)) {
    return [node];
  }
  return isClassNode(node)
    ? node.body.body.filter(isPublicMethod).map((member) => member.value)
    : [];
}

function functionsOf(node: TSESTree.Node): FunctionValue[] {
  return node.type === AST_NODE_TYPES.VariableDeclaration
    ? node.declarations.flatMap((declarator) => valueFunctions(declarator.init ?? undefined))
    : valueFunctions(node);
}

function declaredNames(node: TSESTree.Node): (readonly [string, FunctionValue[]])[] {
  if (node.type === AST_NODE_TYPES.VariableDeclaration) {
    return node.declarations.flatMap((declarator) =>
      declarator.id.type === AST_NODE_TYPES.Identifier
        ? [[declarator.id.name, valueFunctions(declarator.init ?? undefined)]]
        : [],
    );
  }
  return (isFunctionValue(node) || isClassNode(node)) && node.id !== null
    ? [[node.id.name, functionsOf(node)]]
    : [];
}

function localFunctions(program: TSESTree.Program): Locals {
  const locals: Locals = new Map();
  for (const statement of program.body) {
    const declaration = isExportDeclaration(statement) ? statement.declaration : statement;
    for (const [name, functions] of declaration === null ? [] : declaredNames(declaration)) {
      locals.set(name, [...(locals.get(name) ?? []), ...functions]);
    }
  }
  return locals;
}

function exportedFrom(statement: TSESTree.ProgramStatement, locals: Locals): FunctionValue[] {
  if (
    statement.type === AST_NODE_TYPES.ExportDefaultDeclaration &&
    statement.declaration.type === AST_NODE_TYPES.Identifier
  ) {
    return locals.get(statement.declaration.name) ?? [];
  }
  if (statement.type === AST_NODE_TYPES.ExportNamedDeclaration && statement.declaration === null) {
    return statement.source === null
      ? statement.specifiers.flatMap(({ local }) => locals.get(local.name) ?? [])
      : [];
  }
  return isExportDeclaration(statement) ? functionsOf(statement.declaration) : [];
}

export function exportedFunctions(program: TSESTree.Program): FunctionValue[] {
  const locals = localFunctions(program);
  return [...new Set(program.body.flatMap((statement) => exportedFrom(statement, locals)))];
}

export function parameterOf(parameter: TSESTree.Parameter): {
  readonly name: string | undefined;
  readonly annotation: TSESTree.TypeNode | undefined;
  readonly optional: boolean;
  readonly node: TSESTree.Parameter;
} {
  const inner =
    parameter.type === AST_NODE_TYPES.TSParameterProperty ? parameter.parameter : parameter;
  const defaulted = inner.type === AST_NODE_TYPES.AssignmentPattern;
  const target = inner.type === AST_NODE_TYPES.AssignmentPattern ? inner.left : inner;
  return {
    name: target.type === AST_NODE_TYPES.Identifier ? target.name : undefined,
    annotation: target.typeAnnotation?.typeAnnotation,
    optional: defaulted || target.optional,
    node: parameter,
  };
}

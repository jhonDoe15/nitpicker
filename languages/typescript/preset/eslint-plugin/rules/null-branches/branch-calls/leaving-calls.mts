import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../../analysis/constant-resolution.mts';
import type { SourceCode } from '../../typed/node-views.mts';

export type Environment = {
  readonly sourceCode: SourceCode;
  readonly throwers: ReadonlySet<string>;
};

const LEAVING_NAMES = new Set(['fail', 'abort', 'die', 'panic', 'unreachable', 'assertNever']);
const PROCESS_EXITS = new Set(['process.exit', 'process.abort']);

export function calleeName(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  const named = callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed;
  return named && callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

type Declared = { readonly name: string; readonly value: TSESTree.Node | undefined };

function onlyThrows(node: TSESTree.Node | undefined): boolean {
  return (
    node !== undefined &&
    isFunctionNode(node) &&
    node.body.type === AST_NODE_TYPES.BlockStatement &&
    node.body.body.length === 1 &&
    node.body.body[0]?.type === AST_NODE_TYPES.ThrowStatement
  );
}

function declaredFunctions(statement: TSESTree.Node): Declared[] {
  const declaration =
    statement.type === AST_NODE_TYPES.ExportNamedDeclaration
      ? (statement.declaration ?? undefined)
      : statement;
  if (declaration?.type === AST_NODE_TYPES.FunctionDeclaration) {
    return declaration.id === null ? [] : [{ name: declaration.id.name, value: declaration }];
  }
  if (declaration?.type !== AST_NODE_TYPES.VariableDeclaration) {
    return [];
  }
  return declaration.declarations.flatMap(({ id, init }) =>
    id.type === AST_NODE_TYPES.Identifier ? [{ name: id.name, value: init ?? undefined }] : [],
  );
}

export function throwingNames(program: TSESTree.Program): Set<string> {
  const names = program.body
    .flatMap(declaredFunctions)
    .filter(({ value }) => onlyThrows(value))
    .map(({ name }) => name);
  return new Set(names);
}

export function isLeavingCall(node: TSESTree.Node, environment: Environment): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const name = calleeName(node);
  return (
    PROCESS_EXITS.has(environment.sourceCode.getText(node.callee)) ||
    (name !== undefined && (LEAVING_NAMES.has(name) || environment.throwers.has(name)))
  );
}

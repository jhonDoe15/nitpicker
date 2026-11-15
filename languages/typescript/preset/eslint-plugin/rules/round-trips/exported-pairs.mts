import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { roundTripPairs as untypedRoundTripPairs } from '../../../../../../shared/rules/round-trips/round-trips.mjs';

export type Member = {
  readonly name: string;
  readonly node: TSESTree.Node;
  readonly line: number;
  readonly isStatic: boolean;
};
type RoundTripPair = {
  readonly earlier: Member;
  readonly later: Member;
  readonly inner: Member;
  readonly outer: Member;
};
export type OwnedPair = RoundTripPair & { readonly owner?: string | undefined };
type Entry = {
  readonly declaration: TSESTree.Node;
  readonly keep: (name: string) => boolean;
};
type PublicMethod = TSESTree.MethodDefinition & { readonly key: TSESTree.Identifier };

const roundTripPairs: (members: readonly Member[]) => RoundTripPair[] = untypedRoundTripPairs;

const FUNCTION_VALUES = new Set<string>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
]);
const HIDDEN = new Set(['private', 'protected']);

function member(name: string, node: TSESTree.Node, isStatic = true): Member {
  return { name, node, line: node.loc.start.line, isStatic };
}

function unwrapped(value: TSESTree.Node): TSESTree.Node {
  const chain = [value];
  for (const current of chain) {
    if (
      current.type === AST_NODE_TYPES.TSAsExpression ||
      current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      current.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1) ?? value;
}

function functionsOf(statement: TSESTree.Node): Member[] {
  if (statement.type === AST_NODE_TYPES.FunctionDeclaration && statement.id !== null) {
    return [member(statement.id.name, statement.id)];
  }
  if (statement.type !== AST_NODE_TYPES.VariableDeclaration) {
    return [];
  }
  return statement.declarations.flatMap(({ id, init }) =>
    id.type === AST_NODE_TYPES.Identifier &&
    init !== null &&
    FUNCTION_VALUES.has(unwrapped(init).type)
      ? [member(id.name, id)]
      : [],
  );
}

function isPublicMethod(node: TSESTree.ClassElement): node is PublicMethod {
  return (
    node.type === AST_NODE_TYPES.MethodDefinition &&
    node.kind === 'method' &&
    !node.computed &&
    node.key.type === AST_NODE_TYPES.Identifier &&
    (node.accessibility === undefined || !HIDDEN.has(node.accessibility)) &&
    node.value.body !== null
  );
}

function methodsOf(declaration: TSESTree.ClassDeclaration): Member[] {
  return declaration.body.body
    .filter(isPublicMethod)
    .map((method) => member(method.key.name, method.key, method.static));
}

function localNames(program: TSESTree.Program): Set<string> {
  return new Set(
    program.body.flatMap((statement) =>
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration && statement.source === null
        ? statement.specifiers.map(({ local }) => local.name)
        : [],
    ),
  );
}

function exportedDeclarations(program: TSESTree.Program): Entry[] {
  const listed = localNames(program);
  return program.body.flatMap((statement): Entry[] => {
    if (statement.type !== AST_NODE_TYPES.ExportNamedDeclaration) {
      return [{ declaration: statement, keep: (name) => listed.has(name) }];
    }
    return statement.declaration === null
      ? []
      : [{ declaration: statement.declaration, keep: () => true }];
  });
}

export function exportedPairs(program: TSESTree.Program): OwnedPair[] {
  const entries = exportedDeclarations(program);
  const functions = entries.flatMap(({ declaration, keep }) =>
    functionsOf(declaration).filter(({ name }) => keep(name)),
  );
  const classes = entries.flatMap(({ declaration, keep }) =>
    declaration.type === AST_NODE_TYPES.ClassDeclaration &&
    declaration.id !== null &&
    keep(declaration.id.name)
      ? [{ declaration, owner: declaration.id.name }]
      : [],
  );
  return [
    ...roundTripPairs(functions),
    ...classes.flatMap(({ declaration, owner }) =>
      roundTripPairs(methodsOf(declaration)).map((pair) => ({ ...pair, owner })),
    ),
  ];
}

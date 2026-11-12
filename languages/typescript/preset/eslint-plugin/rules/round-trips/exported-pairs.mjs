import { roundTripPairs } from '../../../../../../shared/rules/round-trips/round-trips.mjs';

const FUNCTION_VALUES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const HIDDEN = new Set(['private', 'protected']);
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

function member(name, node, isStatic = true) {
  return { name, node, line: node.loc.start.line, isStatic };
}

function unwrapped(value) {
  const chain = [value];
  for (const current of chain) {
    if (WRAPPERS.has(current?.type)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function functionsOf(statement) {
  if (statement?.type === 'FunctionDeclaration' && statement.id !== null) {
    return [member(statement.id.name, statement.id)];
  }
  if (statement?.type !== 'VariableDeclaration') {
    return [];
  }
  return statement.declarations
    .filter(
      ({ id, init }) => id.type === 'Identifier' && FUNCTION_VALUES.has(unwrapped(init)?.type),
    )
    .map(({ id }) => member(id.name, id));
}

function isPublicMethod(node) {
  return (
    node.type === 'MethodDefinition' &&
    node.kind === 'method' &&
    !node.computed &&
    node.key.type === 'Identifier' &&
    !HIDDEN.has(node.accessibility) &&
    node.value.body !== null
  );
}

function methodsOf(declaration) {
  return declaration.body.body
    .filter(isPublicMethod)
    .map((method) => member(method.key.name, method.key, method.static));
}

function localNames(program) {
  return new Set(
    program.body.flatMap((statement) =>
      statement.type === 'ExportNamedDeclaration' && statement.source === null
        ? statement.specifiers.map(({ local }) => local.name)
        : [],
    ),
  );
}

function exportedDeclarations(program) {
  const listed = localNames(program);
  return program.body.flatMap((statement) => {
    if (statement.type !== 'ExportNamedDeclaration') {
      return [{ declaration: statement, keep: (name) => listed.has(name) }];
    }
    return statement.declaration === null
      ? []
      : [{ declaration: statement.declaration, keep: () => true }];
  });
}

export function exportedPairs(program) {
  const entries = exportedDeclarations(program);
  const functions = entries.flatMap(({ declaration, keep }) =>
    functionsOf(declaration).filter(({ name }) => keep(name)),
  );
  const classes = entries
    .map(({ declaration, keep }) =>
      declaration.type === 'ClassDeclaration' &&
      declaration.id !== null &&
      keep(declaration.id.name)
        ? declaration
        : undefined,
    )
    .filter(Boolean);
  return [
    ...roundTripPairs(functions),
    ...classes.flatMap((declaration) =>
      roundTripPairs(methodsOf(declaration)).map((pair) => ({
        ...pair,
        owner: declaration.id.name,
      })),
    ),
  ];
}

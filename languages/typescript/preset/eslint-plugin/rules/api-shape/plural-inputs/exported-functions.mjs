const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'TSDeclareFunction',
  'TSEmptyBodyFunctionExpression',
]);
const CLASS_TYPES = new Set(['ClassDeclaration', 'ClassExpression']);
const METHOD_TYPES = new Set(['MethodDefinition', 'TSAbstractMethodDefinition']);
const METHOD_KINDS = new Set(['method', 'constructor']);
const HIDDEN = new Set(['private', 'protected']);
const EXPORT_TYPES = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);

function isPublicMethod(member) {
  return (
    METHOD_TYPES.has(member.type) &&
    METHOD_KINDS.has(member.kind) &&
    !HIDDEN.has(member.accessibility) &&
    member.key.type !== 'PrivateIdentifier' &&
    member.override !== true
  );
}

function valueFunctions(node) {
  if (node === null || node === undefined) {
    return [];
  }
  if (FUNCTION_TYPES.has(node.type)) {
    return [node];
  }
  return CLASS_TYPES.has(node.type)
    ? node.body.body.filter(isPublicMethod).map((member) => member.value)
    : [];
}

function functionsOf(node) {
  return node.type === 'VariableDeclaration'
    ? node.declarations.flatMap((declarator) => valueFunctions(declarator.init))
    : valueFunctions(node);
}

function declaredNames(node) {
  if (node.type === 'VariableDeclaration') {
    return node.declarations.flatMap((declarator) =>
      declarator.id.type === 'Identifier'
        ? [[declarator.id.name, valueFunctions(declarator.init)]]
        : [],
    );
  }
  const named = FUNCTION_TYPES.has(node.type) || CLASS_TYPES.has(node.type);
  return named && node.id !== null && node.id !== undefined
    ? [[node.id.name, functionsOf(node)]]
    : [];
}

function localFunctions(program) {
  const locals = new Map();
  for (const statement of program.body) {
    const declaration = EXPORT_TYPES.has(statement.type) ? statement.declaration : statement;
    for (const [name, functions] of declaration === null ? [] : declaredNames(declaration)) {
      locals.set(name, [...(locals.get(name) ?? []), ...functions]);
    }
  }
  return locals;
}

function exportedFrom(statement, locals) {
  if (
    statement.type === 'ExportDefaultDeclaration' &&
    statement.declaration.type === 'Identifier'
  ) {
    return locals.get(statement.declaration.name) ?? [];
  }
  if (statement.type === 'ExportNamedDeclaration' && statement.declaration === null) {
    return statement.source === null
      ? statement.specifiers.flatMap(({ local }) => locals.get(local.name) ?? [])
      : [];
  }
  return EXPORT_TYPES.has(statement.type) ? functionsOf(statement.declaration) : [];
}

export function exportedFunctions(program) {
  const locals = localFunctions(program);
  return [...new Set(program.body.flatMap((statement) => exportedFrom(statement, locals)))];
}

export function parameterOf(parameter) {
  const inner = parameter.type === 'TSParameterProperty' ? parameter.parameter : parameter;
  const defaulted = inner.type === 'AssignmentPattern';
  const target = defaulted ? inner.left : inner;
  return {
    name: target.type === 'Identifier' ? target.name : undefined,
    annotation: target.typeAnnotation?.typeAnnotation,
    optional: defaulted || target.optional === true,
    node: parameter,
  };
}

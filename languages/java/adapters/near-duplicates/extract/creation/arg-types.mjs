import { descendants, field, isLiteral, javaTypeOf, namedChildren, squashed } from '../syntax.mjs';

const STRING = 'String';
const DATE_LIKE = { getTime: 'long' };
const RETURNS = {
  'java.util.Date': DATE_LIKE,
  'java.sql.Date': DATE_LIKE,
  'java.sql.Time': DATE_LIKE,
  'java.sql.Timestamp': DATE_LIKE,
  'java.lang.String': {
    length: 'int',
    isEmpty: 'boolean',
    trim: STRING,
    strip: STRING,
    toLowerCase: STRING,
    toUpperCase: STRING,
  },
};
const IMPORT = /^import\s+([\w.]+)\s*;/u;

export function importsOf(root) {
  const entries = root.children
    .filter(({ type }) => type === 'import_declaration')
    .flatMap(({ text }) => IMPORT.exec(text)?.[1] ?? [])
    .map((name) => [name.slice(name.lastIndexOf('.') + 1), name]);
  return new Map(entries);
}

function declaredIn(declaration) {
  if (declaration.type === 'local_variable_declaration') {
    return declaration.namedChildren
      .filter(({ type }) => type === 'variable_declarator')
      .map((declarator) => [field(declarator, 'name').text, field(declarator, 'dimensions')]);
  }
  return [[field(declaration, 'name').text, field(declaration, 'dimensions')]];
}

export function declaredTypes(method) {
  const types = new Map();
  const kinds = new Set([
    'formal_parameter',
    'local_variable_declaration',
    'enhanced_for_statement',
  ]);
  for (const declaration of descendants(method).filter(({ type }) => kinds.has(type))) {
    const type = squashed(field(declaration, 'type'));
    for (const [name, dimensions] of declaredIn(declaration)) {
      const known = types.has(name) && types.get(name) !== type;
      types.set(name, known || dimensions !== undefined || type === 'var' ? undefined : type);
    }
  }
  return types;
}

export function qualified(type, imports) {
  if (type.includes('.')) {
    return type;
  }
  return type === STRING ? 'java.lang.String' : imports.get(type);
}

function typeOf(node, env) {
  if (isLiteral(node)) {
    return javaTypeOf(node);
  }
  if (node.type === 'identifier') {
    return env.declared.get(node.text) ?? undefined;
  }
  if (node.type === 'method_invocation') {
    const object = field(node, 'object');
    const declared = object?.type === 'identifier' ? env.declared.get(object.text) : undefined;
    const owner = declared === undefined ? undefined : qualified(declared, env.imports);
    const noArguments = namedChildren(field(node, 'arguments')).length === 0;
    return noArguments && owner !== undefined
      ? RETURNS[owner]?.[field(node, 'name').text]
      : undefined;
  }
  return undefined;
}

export function argumentTypes(creation, env) {
  const types = namedChildren(field(creation, 'arguments')).map((node) => typeOf(node, env));
  return types.includes(undefined) ? undefined : types;
}

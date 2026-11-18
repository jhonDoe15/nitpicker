import type { Node } from 'web-tree-sitter';
import type { ArgEnv } from '../../extract-types.mts';
import {
  descendants,
  field,
  isLiteral,
  javaTypeOf,
  namedChildren,
  required,
  squashed,
} from '../syntax.mts';

const STRING = 'String';
const DATE_LIKE = { getTime: 'long' };
const RETURNS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
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

export function importsOf(root: Node): Map<string, string> {
  const entries = root.children
    .filter(({ type }) => type === 'import_declaration')
    .flatMap(({ text }) => IMPORT.exec(text)?.[1] ?? [])
    .map((name): [string, string] => [name.slice(name.lastIndexOf('.') + 1), name]);
  return new Map(entries);
}

function declaredIn(declaration: Node): [string, Node | undefined][] {
  if (declaration.type === 'local_variable_declaration') {
    return declaration.namedChildren
      .filter(({ type }) => type === 'variable_declarator')
      .map((declarator): [string, Node | undefined] => [
        required(declarator, 'name').text,
        field(declarator, 'dimensions'),
      ]);
  }
  return [[required(declaration, 'name').text, field(declaration, 'dimensions')]];
}

export function declaredTypes(method: Node): Map<string, string | undefined> {
  const types = new Map<string, string | undefined>();
  const kinds = new Set([
    'formal_parameter',
    'local_variable_declaration',
    'enhanced_for_statement',
  ]);
  for (const declaration of descendants(method).filter(({ type }) => kinds.has(type))) {
    const type = squashed(required(declaration, 'type'));
    for (const [name, dimensions] of declaredIn(declaration)) {
      const known = types.has(name) && types.get(name) !== type;
      types.set(name, known || dimensions !== undefined || type === 'var' ? undefined : type);
    }
  }
  return types;
}

export function qualified(type: string, imports: ReadonlyMap<string, string>): string | undefined {
  if (type.includes('.')) {
    return type;
  }
  return type === STRING ? 'java.lang.String' : imports.get(type);
}

function typeOf(node: Node, env: ArgEnv): string | undefined {
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
    const noArguments = namedChildren(required(node, 'arguments')).length === 0;
    return noArguments && owner !== undefined
      ? RETURNS[owner]?.[required(node, 'name').text]
      : undefined;
  }
  return undefined;
}

export function argumentTypes(creation: Node, env: ArgEnv): string[] | undefined {
  const types = namedChildren(required(creation, 'arguments')).map((node) => typeOf(node, env));
  const known = types.filter((type) => type !== undefined);
  return known.length === types.length ? known : undefined;
}

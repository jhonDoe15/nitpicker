import type { Node } from 'web-tree-sitter';
import { depthFirst } from '../jvm-views.mts';
import type { ClassScope, FileScope, Names, ShapeNode } from '../jvm-types.mts';
import { codeChildren, field, present, required } from './nodes.mts';

const DECLARING = new Set([
  'formal_parameter',
  'catch_formal_parameter',
  'variable_declarator',
  'enhanced_for_statement',
  'resource',
  'type_pattern',
  'instanceof_expression',
  'record_pattern_component',
]);

function declaredNames(node: Node): string[] {
  if (node.type === 'spread_parameter') {
    const declarator = codeChildren(node).find((child) => child.type === 'variable_declarator');
    return declarator === undefined ? [] : [required(declarator, 'name').text];
  }
  if (node.type === 'lambda_expression') {
    const parameters = required(node, 'parameters');
    return parameters.type === 'identifier'
      ? [parameters.text]
      : codeChildren(parameters)
          .filter((child) => child.type === 'identifier')
          .map(({ text }) => text);
  }
  if (node.type === 'type_pattern') {
    return codeChildren(node)
      .filter((child) => child.type === 'identifier')
      .map(({ text }) => text);
  }
  const name = DECLARING.has(node.type) ? field(node, 'name') : undefined;
  return name === undefined ? [] : [name.text];
}

export function boundNames(root: Node): Set<string> {
  return new Set([...depthFirst(root, codeChildren)].flatMap(declaredNames));
}

function importsOf(program: Node): Map<string, string> {
  const imported = new Map<string, string>();
  for (const declaration of codeChildren(program).filter(
    (child) => child.type === 'import_declaration',
  )) {
    const text = declaration.text
      .replace(/^import\s+(static\s+)?/u, '')
      .replace(/;$/u, '')
      .replaceAll(/\s+/gu, '');
    if (!text.endsWith('.*')) {
      imported.set(text.slice(text.lastIndexOf('.') + 1), text);
    }
  }
  return imported;
}

function packageOf(program: Node): string {
  const declaration = codeChildren(program).find((child) => child.type === 'package_declaration');
  return declaration === undefined
    ? ''
    : present(codeChildren(declaration)[0]).text.replaceAll(/\s+/gu, '');
}

export function fileScope(program: Node): FileScope {
  return { imported: importsOf(program), packageName: packageOf(program) };
}

function memberNames(body: Node): { fields: string[]; methods: string[] } {
  const members = codeChildren(body);
  const fieldNames = members
    .filter(
      (member) => member.type === 'field_declaration' || member.type === 'constant_declaration',
    )
    .flatMap((member) =>
      member
        .childrenForFieldName('declarator')
        .map((declarator) => required(declarator, 'name').text),
    );
  const constants = members
    .filter((member) => member.type === 'enum_constant')
    .map((member) => required(member, 'name').text);
  const methods = members
    .filter((member) => member.type === 'method_declaration')
    .map((member) => required(member, 'name').text);
  return { fields: [...fieldNames, ...constants], methods };
}

export function classScope(
  outer: ClassScope,
  { qualifier, body }: { qualifier: string; body: Node | undefined },
): ClassScope {
  const { fields, methods } = body === undefined ? { fields: [], methods: [] } : memberNames(body);
  const enumBody =
    body?.type === 'enum_body'
      ? codeChildren(body).find((child) => child.type === 'enum_body_declarations')
      : undefined;
  const extra = enumBody === undefined ? { fields: [], methods: [] } : memberNames(enumBody);
  return {
    fields: new Map([
      ...outer.fields,
      ...[...fields, ...extra.fields].map((name): [string, string] => [
        name,
        `${qualifier}#${name}`,
      ]),
    ]),
    methods: new Map([
      ...outer.methods,
      ...[...methods, ...extra.methods].map((name): [string, string] => [
        name,
        `${qualifier}#${name}()`,
      ]),
    ]),
  };
}

export const EMPTY_CLASS_SCOPE: ClassScope = Object.freeze({
  fields: new Map<string, string>(),
  methods: new Map<string, string>(),
});

export function nameNode(text: string, { bound, scope, file }: Names): ShapeNode {
  if (bound.has(text)) {
    return { kind: 'name', children: [], binding: 'bound', value: text, text };
  }
  const value = scope.fields.get(text) ?? file.imported.get(text) ?? text;
  return { kind: 'name', children: [], binding: 'free', value, text };
}

export function methodNode(text: string, { scope }: Pick<Names, 'scope'>): ShapeNode {
  return {
    kind: 'name',
    children: [],
    binding: 'free',
    value: scope.methods.get(text) ?? `#${text}()`,
    text,
  };
}

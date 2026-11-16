import type { Node } from 'web-tree-sitter';
import { depthFirst } from '../jvm-views.mts';
import type { ClassScope, FileScope, Names, ShapeNode, Unstable } from '../jvm-types.mts';
import {
  type ScopeParts,
  codeChildren,
  declaredClasses,
  field,
  present,
  required,
  scopeOf,
} from './nodes.mts';

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

const IMPORT_PREFIX = /^import\s+(static\s+)?/u;

function importEntries(declaration: Node): [string, string][] {
  const text = declaration.text
    .replace(IMPORT_PREFIX, '')
    .replace(/;$/u, '')
    .replaceAll(/\s+/gu, '');
  if (text.endsWith('.*')) {
    return [];
  }
  const simple = text.slice(text.lastIndexOf('.') + 1);
  const isStatic = /^import\s+static\s/u.test(declaration.text);
  return isStatic
    ? [
        [simple, text],
        [`#${simple}()`, text],
      ]
    : [[simple, text]];
}

function importsOf(program: Node): Map<string, string> {
  return new Map(
    codeChildren(program)
      .filter((child) => child.type === 'import_declaration')
      .flatMap(importEntries),
  );
}

function packageOf(program: Node): string {
  const declaration = codeChildren(program).find((child) => child.type === 'package_declaration');
  return declaration === undefined
    ? ''
    : present(codeChildren(declaration)[0]).text.replaceAll(/\s+/gu, '');
}

const CLASS_DECLARATIONS = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'annotation_type_declaration',
]);

function starsOf(program: Node): string[] {
  return codeChildren(program)
    .filter((child) => child.type === 'import_declaration' && /\.\*\s*;?$/u.test(child.text))
    .map((child) => child.text.replace(IMPORT_PREFIX, '').replace(/\.\*\s*;?$/u, ''))
    .map((text) => text.replaceAll(/\s+/gu, ''));
}

function classesOf(program: Node): string[] {
  return declaredClasses(
    program,
    (node) => CLASS_DECLARATIONS.has(node.type),
    (node) => field(node, 'name')?.text,
  );
}

const SCOPE_PARTS: ScopeParts = {
  imports: importsOf,
  packageName: packageOf,
  stars: starsOf,
  classes: classesOf,
};

export function fileScope(program: Node): FileScope {
  return scopeOf(program, SCOPE_PARTS);
}

function declaredFields(members: readonly Node[]): { names: string[]; isVolatile: boolean }[] {
  return members
    .filter(
      (member) => member.type === 'field_declaration' || member.type === 'constant_declaration',
    )
    .map((member) => ({
      names: member
        .childrenForFieldName('declarator')
        .map((declarator) => required(declarator, 'name').text),
      isVolatile: codeChildren(member).some(
        (child) => child.type === 'modifiers' && /\bvolatile\b/u.test(child.text),
      ),
    }));
}

type MemberNames = { fields: string[]; methods: string[]; unstable: string[] };

function memberNames(body: Node): MemberNames {
  const members = codeChildren(body);
  const declared = declaredFields(members);
  const fieldNames = declared.flatMap(({ names }) => names);
  const unstable = declared.filter(({ isVolatile }) => isVolatile).flatMap(({ names }) => names);
  const constants = members
    .filter((member) => member.type === 'enum_constant')
    .map((member) => required(member, 'name').text);
  const methods = members
    .filter((member) => member.type === 'method_declaration')
    .map((member) => required(member, 'name').text);
  return { fields: [...fieldNames, ...constants], methods, unstable };
}

export function classScope(
  outer: ClassScope,
  { qualifier, body }: { qualifier: string; body: Node | undefined },
): ClassScope {
  const none: MemberNames = { fields: [], methods: [], unstable: [] };
  const { fields, methods, unstable } = body === undefined ? none : memberNames(body);
  const enumBody =
    body?.type === 'enum_body'
      ? codeChildren(body).find((child) => child.type === 'enum_body_declarations')
      : undefined;
  const extra = enumBody === undefined ? none : memberNames(enumBody);
  const own = new Set([...fields, ...extra.fields]);
  return {
    unstable: new Set([
      ...[...outer.unstable].filter((name) => !own.has(name)),
      ...unstable,
      ...extra.unstable,
    ]),
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
  unstable: new Set<string>(),
});

export function nameNode(text: string, { bound, scope, file }: Names): ShapeNode {
  if (bound.has(text)) {
    return { kind: 'name', children: [], binding: 'bound', value: text, text };
  }
  const value = scope.fields.get(text) ?? file.imported.get(text) ?? text;
  const unstable: Unstable = scope.unstable.has(text) ? { unstable: true } : {};
  return { kind: 'name', children: [], binding: 'free', value, text, ...unstable };
}

export function methodNode(
  text: string,
  { scope, file }: Pick<Names, 'scope' | 'file'>,
): ShapeNode {
  return {
    kind: 'name',
    children: [],
    binding: 'free',
    value: scope.methods.get(text) ?? file.imported.get(`#${text}()`) ?? `#${text}()`,
    text,
  };
}

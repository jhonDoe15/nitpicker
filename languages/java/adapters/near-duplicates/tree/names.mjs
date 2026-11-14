import { depthFirst } from '../../../../../shared/traversal.mjs';
import { codeChildren, field } from './nodes.mjs';

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

function declaredNames(node) {
  if (node.type === 'spread_parameter') {
    const declarator = codeChildren(node).find((child) => child.type === 'variable_declarator');
    return declarator === undefined ? [] : [field(declarator, 'name').text];
  }
  if (node.type === 'lambda_expression') {
    const parameters = field(node, 'parameters');
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

export function boundNames(root) {
  return new Set([...depthFirst(root, codeChildren)].flatMap(declaredNames));
}

function importEntries(declaration) {
  const text = declaration.text
    .replace(/^import\s+(static\s+)?/u, '')
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

function importsOf(program) {
  return new Map(
    codeChildren(program)
      .filter((child) => child.type === 'import_declaration')
      .flatMap(importEntries),
  );
}

function packageOf(program) {
  const declaration = codeChildren(program).find((child) => child.type === 'package_declaration');
  return declaration === undefined ? '' : codeChildren(declaration)[0].text.replaceAll(/\s+/gu, '');
}

export function fileScope(program) {
  return { imported: importsOf(program), packageName: packageOf(program) };
}

function declaredFields(members) {
  return members
    .filter(
      (member) => member.type === 'field_declaration' || member.type === 'constant_declaration',
    )
    .map((member) => ({
      names: member
        .childrenForFieldName('declarator')
        .map((declarator) => field(declarator, 'name').text),
      isVolatile: codeChildren(member).some(
        (child) => child.type === 'modifiers' && /\bvolatile\b/u.test(child.text),
      ),
    }));
}

function memberNames(body) {
  const members = codeChildren(body);
  const declared = declaredFields(members);
  const fieldNames = declared.flatMap(({ names }) => names);
  const unstable = declared.filter(({ isVolatile }) => isVolatile).flatMap(({ names }) => names);
  const constants = members
    .filter((member) => member.type === 'enum_constant')
    .map((member) => field(member, 'name').text);
  const methods = members
    .filter((member) => member.type === 'method_declaration')
    .map((member) => field(member, 'name').text);
  return { fields: [...fieldNames, ...constants], methods, unstable };
}

export function classScope(outer, { qualifier, body }) {
  const none = { fields: [], methods: [], unstable: [] };
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
      ...[...fields, ...extra.fields].map((name) => [name, `${qualifier}#${name}`]),
    ]),
    methods: new Map([
      ...outer.methods,
      ...[...methods, ...extra.methods].map((name) => [name, `${qualifier}#${name}()`]),
    ]),
  };
}

export const EMPTY_CLASS_SCOPE = Object.freeze({
  fields: new Map(),
  methods: new Map(),
  unstable: new Set(),
});

export function nameNode(text, { bound, scope, file }) {
  if (bound.has(text)) {
    return { kind: 'name', children: [], binding: 'bound', value: text, text };
  }
  const value = scope.fields.get(text) ?? file.imported.get(text) ?? text;
  const unstable = scope.unstable.has(text) ? { unstable: true } : {};
  return { kind: 'name', children: [], binding: 'free', value, text, ...unstable };
}

export function methodNode(text, { scope, file }) {
  return {
    kind: 'name',
    children: [],
    binding: 'free',
    value: scope.methods.get(text) ?? file.imported.get(`#${text}()`) ?? `#${text}()`,
    text,
  };
}

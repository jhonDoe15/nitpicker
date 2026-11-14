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

function importsOf(program) {
  const imported = new Map();
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

function packageOf(program) {
  const declaration = codeChildren(program).find((child) => child.type === 'package_declaration');
  return declaration === undefined ? '' : codeChildren(declaration)[0].text.replaceAll(/\s+/gu, '');
}

export function fileScope(program) {
  return { imported: importsOf(program), packageName: packageOf(program) };
}

function memberNames(body) {
  const members = codeChildren(body);
  const fieldNames = members
    .filter(
      (member) => member.type === 'field_declaration' || member.type === 'constant_declaration',
    )
    .flatMap((member) =>
      member.childrenForFieldName('declarator').map((declarator) => field(declarator, 'name').text),
    );
  const constants = members
    .filter((member) => member.type === 'enum_constant')
    .map((member) => field(member, 'name').text);
  const methods = members
    .filter((member) => member.type === 'method_declaration')
    .map((member) => field(member, 'name').text);
  return { fields: [...fieldNames, ...constants], methods };
}

export function classScope(outer, { qualifier, body }) {
  const { fields, methods } = body === undefined ? { fields: [], methods: [] } : memberNames(body);
  const enumBody =
    body?.type === 'enum_body'
      ? codeChildren(body).find((child) => child.type === 'enum_body_declarations')
      : undefined;
  const extra = enumBody === undefined ? { fields: [], methods: [] } : memberNames(enumBody);
  return {
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

export const EMPTY_CLASS_SCOPE = Object.freeze({ fields: new Map(), methods: new Map() });

export function nameNode(text, { bound, scope, file }) {
  if (bound.has(text)) {
    return { kind: 'name', children: [], binding: 'bound', value: text, text };
  }
  const value = scope.fields.get(text) ?? file.imported.get(text) ?? text;
  return { kind: 'name', children: [], binding: 'free', value, text };
}

export function methodNode(text, { scope }) {
  return {
    kind: 'name',
    children: [],
    binding: 'free',
    value: scope.methods.get(text) ?? `#${text}()`,
    text,
  };
}

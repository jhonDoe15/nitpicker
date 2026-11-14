import { depthFirst } from '../../../../../shared/traversal.mjs';
import { codeChildren, field } from '../tree/nodes.mjs';

const DECLARATIONS = new Set([
  'variable_declaration',
  'parameter',
  'catch_block',
  'class_parameter',
]);

function declaredNames(node) {
  if (node.type === 'setter') {
    const [name] = codeChildren(node);
    return name?.type === 'identifier' ? [name.text] : [];
  }
  const [name] = DECLARATIONS.has(node.type) ? codeChildren(node) : [];
  return name?.type === 'identifier' ? [name.text] : [];
}

export function boundNames(root) {
  return new Set(['it', 'field', ...[...depthFirst(root, codeChildren)].flatMap(declaredNames)]);
}

function qualifiedText(node) {
  return node.text.replaceAll(/\s+/gu, '');
}

function importsOf(program) {
  const imported = new Map();
  for (const declaration of codeChildren(program).filter((child) => child.type === 'import')) {
    const [path, alias] = codeChildren(declaration);
    const text = qualifiedText(path);
    if (!declaration.children.some((child) => child.type === '*')) {
      imported.set(alias?.text ?? text.slice(text.lastIndexOf('.') + 1), text);
    }
  }
  return imported;
}

function packageOf(program) {
  const header = codeChildren(program).find((child) => child.type === 'package_header');
  return header === undefined ? '' : qualifiedText(codeChildren(header)[0]);
}

export function fileScope(program) {
  return { imported: importsOf(program), packageName: packageOf(program) };
}

function nameOf(declaration) {
  const name = field(declaration, 'name');
  if (name !== undefined) {
    return name.text;
  }
  const variable = codeChildren(declaration).find((child) => child.type === 'variable_declaration');
  return variable === undefined ? undefined : codeChildren(variable)[0]?.text;
}

function isPropertyParameter(parameter) {
  return parameter.children.some((child) => child.type === 'val' || child.type === 'var');
}

function memberNames(members) {
  const properties = members
    .filter((member) => member.type === 'property_declaration')
    .map(nameOf)
    .filter(Boolean);
  const entries = members
    .filter((member) => member.type === 'enum_entry')
    .map((member) => codeChildren(member)[0].text);
  const functions = members
    .filter((member) => member.type === 'function_declaration')
    .map(nameOf)
    .filter(Boolean);
  return { properties: [...properties, ...entries], functions };
}

function companionMembers(body) {
  return codeChildren(body)
    .filter((member) => member.type === 'companion_object')
    .flatMap((companion) =>
      codeChildren(companion)
        .filter((child) => child.type === 'class_body')
        .flatMap((child) => codeChildren(child)),
    );
}

export function classMembers(declaration) {
  const parts = codeChildren(declaration);
  const body = parts.find(
    (child) => child.type === 'class_body' || child.type === 'enum_class_body',
  );
  const constructorParameters = parts
    .filter((child) => child.type === 'primary_constructor')
    .flatMap((constructor) => codeChildren(constructor))
    .filter((child) => child.type === 'class_parameters')
    .flatMap((list) => codeChildren(list))
    .filter(isPropertyParameter)
    .map((parameter) => codeChildren(parameter).find((child) => child.type === 'identifier').text);
  const members = body === undefined ? [] : [...codeChildren(body), ...companionMembers(body)];
  const { properties, functions } = memberNames(members);
  return { properties: [...constructorParameters, ...properties], functions };
}

export function memberScope(outer, { qualifier, members }) {
  return {
    fields: new Map([
      ...outer.fields,
      ...members.properties.map((name) => [name, `${qualifier}#${name}`]),
    ]),
    methods: new Map([
      ...outer.methods,
      ...members.functions.map((name) => [name, `${qualifier}#${name}()`]),
    ]),
  };
}

export function topLevelScope(program, { packageName }) {
  const { properties, functions } = memberNames(codeChildren(program));
  return memberScope(
    { fields: new Map(), methods: new Map() },
    { qualifier: packageName, members: { properties, functions } },
  );
}

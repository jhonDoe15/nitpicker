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
      const name = alias?.text ?? text.slice(text.lastIndexOf('.') + 1);
      imported.set(name, text);
      imported.set(`#${name}()`, text);
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

function isUnstableProperty(member) {
  const parts = codeChildren(member);
  const delegate = parts.find((part) => part.type === 'property_delegate');
  return (
    parts.some((part) => part.type === 'getter') ||
    parts.some((part) => part.type === 'modifiers' && /@Volatile\b/u.test(part.text)) ||
    (delegate !== undefined && !/^by\s+lazy\b/u.test(delegate.text))
  );
}

function memberNames(members) {
  const declared = members.filter((member) => member.type === 'property_declaration');
  const properties = declared.map(nameOf).filter(Boolean);
  const unstable = declared.filter(isUnstableProperty).map(nameOf).filter(Boolean);
  const entries = members
    .filter((member) => member.type === 'enum_entry')
    .map((member) => codeChildren(member)[0].text);
  const functions = members
    .filter((member) => member.type === 'function_declaration')
    .map(nameOf)
    .filter(Boolean);
  return { properties: [...properties, ...entries], functions, unstable };
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
  const { properties, functions, unstable } = memberNames(members);
  return { properties: [...constructorParameters, ...properties], functions, unstable };
}

export function memberScope(outer, { qualifier, members }) {
  const own = new Set(members.properties);
  return {
    unstable: new Set([
      ...[...(outer.unstable ?? [])].filter((name) => !own.has(name)),
      ...members.unstable,
    ]),
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
  const members = memberNames(codeChildren(program));
  return memberScope(
    { fields: new Map(), methods: new Map(), unstable: new Set() },
    { qualifier: packageName, members },
  );
}

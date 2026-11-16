import type { Node } from 'web-tree-sitter';
import { depthFirst } from '../jvm-views.mts';
import type { ClassScope, FileScope } from '../jvm-types.mts';
import { codeChildren, field, present } from '../tree/nodes.mts';

const DECLARATIONS = new Set([
  'variable_declaration',
  'parameter',
  'catch_block',
  'class_parameter',
]);

function declaredNames(node: Node): string[] {
  if (node.type === 'setter') {
    const [name] = codeChildren(node);
    return name?.type === 'identifier' ? [name.text] : [];
  }
  const [name] = DECLARATIONS.has(node.type) ? codeChildren(node) : [];
  return name?.type === 'identifier' ? [name.text] : [];
}

export function boundNames(root: Node): Set<string> {
  return new Set(['it', 'field', ...[...depthFirst(root, codeChildren)].flatMap(declaredNames)]);
}

function qualifiedText(node: Node): string {
  return node.text.replaceAll(/\s+/gu, '');
}

function importEntry(declaration: Node): [string, string] {
  const [path, alias] = codeChildren(declaration);
  const text = qualifiedText(present(path));
  return [alias?.text ?? text.slice(text.lastIndexOf('.') + 1), text];
}

function importsOf(program: Node): Map<string, string> {
  return new Map(
    codeChildren(program)
      .filter((child) => child.type === 'import')
      .filter((declaration) => !declaration.children.some((child) => child.type === '*'))
      .map(importEntry),
  );
}

function packageOf(program: Node): string {
  const header = codeChildren(program).find((child) => child.type === 'package_header');
  return header === undefined ? '' : qualifiedText(present(codeChildren(header)[0]));
}

export function fileScope(program: Node): FileScope {
  return { imported: importsOf(program), packageName: packageOf(program) };
}

function nameOf(declaration: Node): string | undefined {
  const name = field(declaration, 'name');
  if (name !== undefined) {
    return name.text;
  }
  const variable = codeChildren(declaration).find((child) => child.type === 'variable_declaration');
  return variable === undefined ? undefined : codeChildren(variable)[0]?.text;
}

function isPropertyParameter(parameter: Node): boolean {
  return parameter.children.some((child) => child.type === 'val' || child.type === 'var');
}

type Members = { properties: string[]; functions: string[] };

function memberNames(members: readonly Node[]): Members {
  const properties = members
    .filter((member) => member.type === 'property_declaration')
    .map(nameOf)
    .filter((name): name is string => Boolean(name));
  const entries = members
    .filter((member) => member.type === 'enum_entry')
    .map((member) => present(codeChildren(member)[0]).text);
  const functions = members
    .filter((member) => member.type === 'function_declaration')
    .map(nameOf)
    .filter((name): name is string => Boolean(name));
  return { properties: [...properties, ...entries], functions };
}

function companionMembers(body: Node): Node[] {
  return codeChildren(body)
    .filter((member) => member.type === 'companion_object')
    .flatMap((companion) =>
      codeChildren(companion)
        .filter((child) => child.type === 'class_body')
        .flatMap((child) => codeChildren(child)),
    );
}

export function classMembers(declaration: Node): Members {
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
    .map(
      (parameter) =>
        present(codeChildren(parameter).find((child) => child.type === 'identifier')).text,
    );
  const members = body === undefined ? [] : [...codeChildren(body), ...companionMembers(body)];
  const { properties, functions } = memberNames(members);
  return { properties: [...constructorParameters, ...properties], functions };
}

export function memberScope(
  outer: ClassScope,
  { qualifier, members }: { qualifier: string; members: Members },
): ClassScope {
  return {
    fields: new Map([
      ...outer.fields,
      ...members.properties.map((name): [string, string] => [name, `${qualifier}#${name}`]),
    ]),
    methods: new Map([
      ...outer.methods,
      ...members.functions.map((name): [string, string] => [name, `${qualifier}#${name}()`]),
    ]),
  };
}

export function topLevelScope(program: Node, { packageName }: FileScope): ClassScope {
  const { properties, functions } = memberNames(codeChildren(program));
  return memberScope(
    { fields: new Map<string, string>(), methods: new Map<string, string>() },
    { qualifier: packageName, members: { properties, functions } },
  );
}

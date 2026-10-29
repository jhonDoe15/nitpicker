import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { hash } from '../../../../../../shared/rules/finding-helpers.mjs';
import { fileImports } from '../../../syntax/module-facts.mjs';
import { declaredNames, referencedNames } from '../../../syntax/references.mjs';
import { leafTexts, normalizedTexts } from './tokens.mjs';

export function declarationParts(node) {
  return [
    ...(node.typeParameters ?? []),
    ...(node.parameters ?? []),
    ...(node.heritageClauses ?? []),
    ...(node.members ?? []),
    node.type,
    node.initializer,
    node.body,
  ].filter((part) => part !== undefined);
}

function importBindings(sourceFile) {
  const bindings = new Map();
  for (const { specifier, defaultName, namespaceName, named } of fileImports(sourceFile)) {
    const entries = [
      ...(defaultName === undefined ? [] : [[defaultName, 'default']]),
      ...(namespaceName === undefined ? [] : [[namespaceName, '*']]),
      ...named.map(({ local, imported }) => [local, imported]),
    ];
    for (const [local, imported] of entries) {
      bindings.set(local, { kind: 'import', specifier, imported });
    }
  }
  return bindings;
}

function statementNodes(statement) {
  return ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations]
    : [statement.name, ...declarationParts(statement)].filter((node) => node !== undefined);
}

function statementNames(statement) {
  return ts.isVariableStatement(statement)
    ? [...declaredNames(statement.declarationList.declarations.map(({ name }) => name))]
    : [statement.name?.text].filter((name) => name !== undefined);
}

function statementsByName(sourceFile) {
  const statements = new Map();
  for (const statement of sourceFile.statements) {
    for (const name of statementNames(statement)) statements.set(name, statement);
  }
  return statements;
}

export function fileBindings(sourceFile) {
  const imported = importBindings(sourceFile);
  const statements = statementsByName(sourceFile);
  const locals = new Map();
  function localBinding(name) {
    const statement = statements.get(name);
    if (statement === undefined) return undefined;
    const text = normalizedTexts(leafTexts(statementNodes(statement), sourceFile)).join(' ');
    locals.set(name, locals.get(name) ?? { kind: 'local', text: hash(text) });
    return locals.get(name);
  }
  return (name) => imported.get(name) ?? localBinding(name);
}

export function freeBindings(nodes, lookup) {
  const declared = declaredNames(nodes);
  return [...referencedNames(nodes)]
    .filter((name) => !declared.has(name))
    .toSorted()
    .flatMap((name) => {
      const binding = lookup(name);
      return binding === undefined ? [] : [{ name, binding }];
    });
}

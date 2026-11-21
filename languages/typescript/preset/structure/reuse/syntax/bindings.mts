import type TypeScript from 'typescript';
import { ts } from '../../../../typescript-api/typescript-api.mts';
import { hash as hashText } from '../../../../../../shared/rules/finding-parts.mts';
import { importEntries } from './import-entries.mts';
import { declaredNames, referencedNames } from '../../../syntax/references.mts';
import { leafTexts, normalizedTexts } from './tokens.mts';
import type {
  Binding,
  FreeBinding,
  Lookup,
  NamedStatement,
  PartsNode,
} from '../typed/syntax-types.mts';

const hash: (value: string) => string = hashText;

export function declarationParts(node: PartsNode): TypeScript.Node[] {
  return [
    ...(node.typeParameters ?? []),
    ...(node.parameters ?? []),
    ...(node.heritageClauses ?? []),
    ...(node.members ?? []),
    node.type,
    node.initializer,
    node.body,
  ].flatMap((part) => (part === undefined ? [] : [part]));
}

function importBindings(sourceFile: TypeScript.SourceFile): Map<string, Binding> {
  const bindings = new Map<string, Binding>();
  for (const { specifier, local, imported } of importEntries(sourceFile)) {
    bindings.set(local, { kind: 'import', specifier, imported });
  }
  return bindings;
}

function statementNodes(statement: NamedStatement): TypeScript.Node[] {
  return ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations]
    : [statement.name, ...declarationParts(statement)].flatMap((node) =>
        node === undefined ? [] : [node],
      );
}

function statementNames(statement: NamedStatement): string[] {
  return ts.isVariableStatement(statement)
    ? [...declaredNames(statement.declarationList.declarations.map(({ name }) => name))]
    : [statement.name?.text].filter((name) => name !== undefined);
}

function statementsByName(sourceFile: TypeScript.SourceFile): Map<string, NamedStatement> {
  const statements = new Map<string, NamedStatement>();
  for (const statement of sourceFile.statements) {
    for (const name of statementNames(statement)) {
      statements.set(name, statement);
    }
  }
  return statements;
}

export function fileBindings(sourceFile: TypeScript.SourceFile): Lookup {
  const imported = importBindings(sourceFile);
  const statements = statementsByName(sourceFile);
  const locals = new Map<string, Binding>();
  function localBinding(name: string): Binding | undefined {
    const statement = statements.get(name);
    if (statement === undefined) {
      return undefined;
    }
    const text = normalizedTexts(leafTexts(statementNodes(statement), sourceFile)).join(' ');
    locals.set(name, locals.get(name) ?? { kind: 'local', text: hash(text) });
    return locals.get(name);
  }
  return (name: string) => imported.get(name) ?? localBinding(name);
}

export function freeBindings(nodes: readonly TypeScript.Node[], lookup: Lookup): FreeBinding[] {
  const declared = declaredNames(nodes);
  return [...referencedNames(nodes)]
    .filter((name) => !declared.has(name))
    .toSorted()
    .flatMap((name) => {
      const binding = lookup(name);
      return binding === undefined ? [] : [{ name, binding }];
    });
}

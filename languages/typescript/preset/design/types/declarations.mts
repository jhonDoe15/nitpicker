import path from 'node:path';
import type TypeScript from 'typescript';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { ts } from '../syntax/typed.mts';
import type { OwnedFile, State, TypeEntry, TypeFact, TypeKind } from '../design-types.mts';
import { isFunctionValue } from '../syntax/function-values.mts';
import { heritageClausesOf, lineOf } from '../syntax/nodes.mts';
import { scopedStatements } from '../syntax/scopes.mts';
import { enumMemberNames, literalCases } from './enum-cases.mts';
import { moduleFields, propertyFields } from './fields.mts';
import { entryOfSymbol } from './type-lookup.mts';

type Described = { kind: TypeKind; cases?: string[] };

type NewEntry = Omit<TypeEntry, 'id' | 'file' | 'fieldNames'> & { prefix: string };

const OBJECT_METHODS = new Set(['toString', 'toJSON', 'valueOf']);

function hasBehaviour(classNode: TypeScript.ClassDeclaration): boolean {
  return classNode.members.some(
    (member) =>
      (ts.isMethodDeclaration(member) && !OBJECT_METHODS.has(member.name.getText())) ||
      (ts.isPropertyDeclaration(member) && isFunctionValue(member.initializer)),
  );
}

function describeStatement(
  statement: TypeScript.Statement,
  checker: TypeScript.TypeChecker,
): Described | undefined {
  if (ts.isClassDeclaration(statement)) {
    return { kind: hasBehaviour(statement) ? 'class' : 'data' };
  }
  if (ts.isInterfaceDeclaration(statement)) {
    return { kind: 'data' };
  }
  if (ts.isEnumDeclaration(statement)) {
    return { kind: 'enum', cases: enumMemberNames(statement) };
  }
  if (!ts.isTypeAliasDeclaration(statement)) {
    return undefined;
  }
  if (ts.isTypeLiteralNode(statement.type)) {
    return { kind: 'data' };
  }
  const cases = literalCases(checker, statement);
  return cases === undefined ? undefined : { kind: 'enum', cases };
}

function mergeEntry(known: TypeEntry, entry: Omit<TypeEntry, 'id' | 'file' | 'fieldNames'>): void {
  const exported = known.exported || entry.exported;
  if (ts.isClassDeclaration(entry.node) && !ts.isClassDeclaration(known.node)) {
    Object.assign(known, entry);
  }
  known.exported = exported;
}

function addEntry(state: State, file: OwnedFile, entry: NewEntry): void {
  const { registry } = state;
  const { prefix, ...described } = entry;
  const id = `${file.path}#${prefix}${entry.name}`;
  const known = registry.typeIds.get(id);
  if (known !== undefined) {
    mergeEntry(known, described);
    registry.typeByNode.set(entry.node, known);
    return;
  }
  const created = { ...described, id, file: file.path, fieldNames: new Set<string>() };
  registry.typeIds.set(id, created);
  registry.typeByNode.set(entry.node, created);
  registry.entries.push(created);
}

function addModule(state: State, file: OwnedFile): void {
  const { registry } = state;
  const name = path.posix.basename(file.path, path.posix.extname(file.path));
  const entry: TypeEntry = {
    id: file.path,
    file: file.path,
    name,
    node: file.sourceFile,
    kind: 'module',
    exported: true,
    fieldNames: new Set(),
  };
  registry.typeIds.set(entry.id, entry);
  registry.typeByNode.set(file.sourceFile, entry);
  registry.entries.push(entry);
}

function addFileTypes(state: State, file: OwnedFile): void {
  addModule(state, file);
  for (const scope of scopedStatements(file)) {
    const { statement } = scope;
    const described = describeStatement(statement, state.checker);
    if (described !== undefined) {
      const text = fieldOf(fieldOf(statement, 'name'), 'text');
      const name = typeof text === 'string' ? text : 'default';
      const exported = scope.isExported(statement);
      addEntry(state, file, {
        node: statement,
        name,
        prefix: scope.prefix,
        anchor: scope.anchor,
        exported,
        ...described,
      });
    }
  }
}

function heritageEntries(
  state: State,
  entry: TypeEntry,
  keep: (token: TypeScript.SyntaxKind) => boolean,
): TypeEntry[] {
  return heritageClausesOf(entry.node)
    .filter(({ token }) => keep(token))
    .flatMap(({ types }) => types)
    .map((type) => entryOfSymbol(state, state.checker.getSymbolAtLocation(type.expression)))
    .filter((target): target is TypeEntry => target !== undefined && target !== entry);
}

function implementedEntries(state: State, entry: TypeEntry): TypeEntry[] {
  return heritageEntries(state, entry, (token) => token === ts.SyntaxKind.ImplementsKeyword);
}

function supertypeIds(state: State, entry: TypeEntry): string[] {
  return [...new Set(heritageEntries(state, entry, () => true).map(({ id }) => id))];
}

function markImplemented(state: State): void {
  const classes = state.registry.entries.filter((entry) => ts.isClassDeclaration(entry.node));
  for (const target of classes.flatMap((entry) => implementedEntries(state, entry))) {
    target.implemented = true;
  }
}

export function collectTypes(files: readonly OwnedFile[], state: State): void {
  for (const file of files) {
    state.registry.exportedByFile.set(file.sourceFile.fileName, file.exported);
  }
  for (const file of files) {
    addFileTypes(state, file);
  }
  markImplemented(state);
  for (const entry of state.registry.entries) {
    const isShape = entry.kind === 'data' && !ts.isClassDeclaration(entry.node);
    if (isShape && entry.implemented === true) {
      entry.kind = 'interface';
    }
  }
}

function fieldsOf(state: State, entry: TypeEntry) {
  if (entry.kind === 'module' && ts.isSourceFile(entry.node)) {
    return moduleFields(
      entry.node,
      state.registry.exportedByFile.get(entry.node.fileName) ?? new Set(),
    );
  }
  return entry.kind === 'enum' ? [] : propertyFields(state, entry);
}

export function typeFact(state: State, entry: TypeEntry): TypeFact {
  const fields = fieldsOf(state, entry);
  const supertypes = supertypeIds(state, entry);
  entry.fieldNames = new Set(fields.map(({ name }) => name));
  return {
    id: entry.id,
    file: entry.file,
    name: entry.name,
    line: entry.kind === 'module' ? 1 : lineOf(entry.node),
    kind: entry.kind,
    exported: entry.exported,
    ...(fields.length === 0 ? {} : { fields }),
    ...(supertypes.length === 0 ? {} : { supertypes }),
    ...(entry.cases === undefined ? {} : { cases: entry.cases }),
  };
}

import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { isFunctionValue } from '../syntax/function-values.mjs';
import { lineOf } from '../syntax/nodes.mjs';
import { scopedStatements } from '../syntax/scopes.mjs';
import { enumMemberNames, literalCases } from './enum-cases.mjs';
import { moduleFields, propertyFields } from './fields.mjs';
import { entryOfSymbol } from './type-lookup.mjs';

const OBJECT_METHODS = new Set(['toString', 'toJSON', 'valueOf']);

function hasBehaviour(classNode) {
  return classNode.members.some(
    (member) =>
      (ts.isMethodDeclaration(member) && !OBJECT_METHODS.has(member.name.getText())) ||
      (ts.isPropertyDeclaration(member) && isFunctionValue(member.initializer)),
  );
}

function describeStatement(statement, checker) {
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

function mergeEntry(known, entry) {
  const exported = known.exported || entry.exported;
  if (ts.isClassDeclaration(entry.node) && !ts.isClassDeclaration(known.node)) {
    Object.assign(known, entry);
  }
  known.exported = exported;
}

function addEntry(state, file, entry) {
  const { registry } = state;
  const { prefix, ...described } = entry;
  const id = `${file.path}#${prefix}${entry.name}`;
  const known = registry.typeIds.get(id);
  if (known !== undefined) {
    mergeEntry(known, described);
    registry.typeByNode.set(entry.node, known);
    return;
  }
  const created = { ...described, id, file: file.path };
  registry.typeIds.set(id, created);
  registry.typeByNode.set(entry.node, created);
  registry.entries.push(created);
}

function addModule(state, file) {
  const { registry } = state;
  const name = path.posix.basename(file.path, path.posix.extname(file.path));
  const entry = { id: file.path, file: file.path, name, node: file.sourceFile, kind: 'module' };
  entry.exported = true;
  registry.typeIds.set(entry.id, entry);
  registry.typeByNode.set(file.sourceFile, entry);
  registry.entries.push(entry);
}

function addFileTypes(state, file) {
  addModule(state, file);
  for (const scope of scopedStatements(file)) {
    const { statement } = scope;
    const described = describeStatement(statement, state.checker);
    if (described !== undefined) {
      const name = statement.name?.text ?? 'default';
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

function implementedEntries(state, entry) {
  const clauses = (entry.node.heritageClauses ?? []).filter(
    ({ token }) => token === ts.SyntaxKind.ImplementsKeyword,
  );
  return clauses
    .flatMap(({ types }) => types)
    .map((type) => entryOfSymbol(state, state.checker.getSymbolAtLocation(type.expression)))
    .filter((target) => target !== undefined);
}

function markImplemented(state) {
  const classes = state.registry.entries.filter((entry) => ts.isClassDeclaration(entry.node));
  for (const target of classes.flatMap((entry) => implementedEntries(state, entry))) {
    target.implemented = true;
  }
}

export function collectTypes(files, state) {
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

function fieldsOf(state, entry) {
  if (entry.kind === 'module') {
    return moduleFields(entry.node, state.registry.exportedByFile.get(entry.node.fileName));
  }
  return entry.kind === 'enum' ? [] : propertyFields(state, entry);
}

export function typeFact(state, entry) {
  const fields = fieldsOf(state, entry);
  entry.fieldNames = new Set(fields.map(({ name }) => name));
  return {
    id: entry.id,
    file: entry.file,
    name: entry.name,
    line: entry.kind === 'module' ? 1 : lineOf(entry.node),
    kind: entry.kind,
    exported: entry.exported,
    ...(fields.length === 0 ? {} : { fields }),
    ...(entry.cases === undefined ? {} : { cases: entry.cases }),
  };
}

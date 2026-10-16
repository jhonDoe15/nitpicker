import ts from 'typescript';
import { depthFirst } from '../../../../../shared/traversal.mjs';
import { syntaxChildren } from '../../syntax/children.mjs';

const ALL = '*';
const NAMED = '**';

const SPECIFIER_PARENTS = [
  ts.isImportSpecifier,
  ts.isImportClause,
  ts.isNamespaceImport,
  ts.isExportSpecifier,
  ts.isNamespaceExport,
  ts.isExportAssignment,
];

function importBindings(sourceFile) {
  return sourceFile.statements.filter(ts.isImportDeclaration).flatMap((statement) => {
    const specifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    const named = clause?.namedBindings;
    const names = clause?.name ? [{ local: clause.name.text, specifier, imported: 'default' }] : [];
    if (named !== undefined && ts.isNamespaceImport(named)) {
      return [...names, { local: named.name.text, specifier, imported: ALL }];
    }
    const elements = named?.elements ?? [];
    return [
      ...names,
      ...elements.map((element) => ({
        local: element.name.text,
        specifier,
        imported: (element.propertyName ?? element.name).text,
      })),
    ];
  });
}

function usedLocally(sourceFile) {
  return new Set(
    [...depthFirst(sourceFile, syntaxChildren)]
      .filter((node) => ts.isIdentifier(node) && !SPECIFIER_PARENTS.some((is) => is(node.parent)))
      .map(({ text }) => text),
  );
}

function dynamicLoads(sourceFile) {
  return [...depthFirst(sourceFile, syntaxChildren)]
    .filter(ts.isCallExpression)
    .filter(
      ({ expression }) =>
        expression.kind === ts.SyntaxKind.ImportKeyword || expression.text === 'require',
    )
    .map(({ arguments: [argument] }) => argument)
    .filter((argument) => argument !== undefined && ts.isStringLiteralLike(argument))
    .map(({ text }) => ({ specifier: text, imported: ALL }));
}

function declarationEdges(statement, bindings) {
  const clause = statement.exportClause;
  const specifier = statement.moduleSpecifier?.text;
  if (clause === undefined) return [{ exported: ALL, specifier, imported: ALL }];
  if (ts.isNamespaceExport(clause))
    return [{ exported: clause.name.text, specifier, imported: ALL }];
  return clause.elements.flatMap((element) => {
    const local = (element.propertyName ?? element.name).text;
    const binding = specifier === undefined ? bindings.get(local) : undefined;
    if (specifier !== undefined)
      return [{ exported: element.name.text, specifier, imported: local }];
    return binding === undefined
      ? []
      : [{ exported: element.name.text, ...binding, viaImport: true }];
  });
}

function assignmentEdges(statement, bindings) {
  const binding = ts.isIdentifier(statement.expression)
    ? bindings.get(statement.expression.text)
    : undefined;
  return binding === undefined ? [] : [{ exported: 'default', ...binding, viaImport: true }];
}

export function moduleSyntax(sourceFile) {
  const bindings = importBindings(sourceFile);
  const used = usedLocally(sourceFile);
  const reexportable = new Map(
    bindings.filter(({ local }) => !used.has(local)).map((binding) => [binding.local, binding]),
  );
  const edges = sourceFile.statements.flatMap((statement) => {
    if (ts.isExportDeclaration(statement)) return declarationEdges(statement, reexportable);
    return ts.isExportAssignment(statement) ? assignmentEdges(statement, reexportable) : [];
  });
  const references = [
    ...bindings.filter(({ local }) => !reexportable.has(local)),
    ...dynamicLoads(sourceFile),
  ];
  return { edges, references };
}

function covers(edge, name) {
  return (
    edge.imported === name ||
    (edge.imported === ALL && (edge.exported !== ALL || name !== 'default'))
  );
}

function followed(edge, name) {
  const isStar = edge.exported === ALL;
  if (name === ALL || name === NAMED) {
    if (name === NAMED && edge.exported === 'default') return undefined;
    return { file: edge.source, name: isStar ? NAMED : edge.imported };
  }
  if (isStar) return name === 'default' ? undefined : { file: edge.source, name };
  return edge.exported === name ? { file: edge.source, name: edge.imported } : undefined;
}

function nodeKey({ file, name }) {
  return `${file}\0${name}`;
}

function publicSurface(edges, entries) {
  const pending = entries.map((file) => ({ file, name: ALL }));
  const reached = new Set(pending.map(nodeKey));
  for (const node of pending) {
    const fresh = edges
      .filter(({ from }) => from === node.file)
      .map((edge) => followed(edge, node.name))
      .filter((next) => next !== undefined && !reached.has(nodeKey(next)));
    for (const next of fresh) {
      reached.add(nodeKey(next));
      pending.push(next);
    }
  }
  return (file, name) =>
    reached.has(nodeKey({ file, name })) ||
    reached.has(nodeKey({ file, name: ALL })) ||
    (name !== 'default' && reached.has(nodeKey({ file, name: NAMED })));
}

export function namesExport(reference, file, name) {
  return reference.source === file && (reference.imported === name || reference.imported === ALL);
}

export function reexportGraph(modules, publicEntries) {
  const members = [...modules.entries()];
  const edges = members.flatMap(([from, module]) =>
    module.edges.map((edge) => ({ ...edge, from })),
  );
  const references = members.flatMap(([from, module]) =>
    module.references.map((reference) => ({ ...reference, from })),
  );
  const isPublic = publicSurface(edges, publicEntries);
  return {
    hasReexports: edges.length > 0,
    reexports: (file, name) => edges.some((edge) => edge.source === file && covers(edge, name)),
    isReexportSpecifier: (file, name) =>
      edges.some((edge) => edge.from === file && edge.exported === name),
    importedEdge: (file, name) =>
      edges.find((edge) => edge.from === file && edge.exported === name && edge.viaImport),
    consumers: (file, name) => ({
      references: references.filter((reference) => namesExport(reference, file, name)),
      edges: edges.filter((edge) => namesExport(edge, file, name)),
    }),
    isPublic,
  };
}

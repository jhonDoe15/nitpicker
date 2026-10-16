export const EVERYTHING = '<everything>';
export const NAMED_EXPORTS = '<named exports>';

const WILDCARDS = new Set([EVERYTHING, NAMED_EXPORTS]);

function nodeKey({ file, name }) {
  return `${file}\0${name}`;
}

function bindingsOf(imports) {
  return new Map(
    imports.flatMap(({ specifier, defaultName, namespaceName, named }) => [
      ...(defaultName === undefined ? [] : [[defaultName, { specifier, imported: 'default' }]]),
      ...(namespaceName === undefined
        ? []
        : [[namespaceName, { specifier, imported: EVERYTHING }]]),
      ...named.map(({ local, imported }) => [local, { specifier, imported }]),
    ]),
  );
}

function usedNames({ aliases, referenced }) {
  const readThroughAlias = aliases
    .filter(({ exported }) => referenced.has(exported))
    .map(({ local }) => local);
  return new Set([...referenced, ...readThroughAlias]);
}

export function moduleLinks({ imports, dynamicImports, exports, referenced }) {
  const bindings = bindingsOf(imports);
  const used = usedNames({ aliases: exports.aliases, referenced });
  const edges = [
    ...exports.reexports.flatMap(({ specifier, star, names }) =>
      star
        ? [{ star: true, specifier }]
        : names.map(({ imported, exported }) => ({ exported, imported, specifier })),
    ),
    ...exports.namespaces.map(({ specifier, name }) => ({
      exported: name,
      imported: EVERYTHING,
      namespace: true,
      specifier,
    })),
    ...[...exports.locals, ...exports.aliases]
      .filter(({ local }) => bindings.has(local) && !used.has(local))
      .map(({ local, exported }) => ({ exported, ...bindings.get(local), viaImport: true })),
  ];
  const references = [
    ...[...bindings.entries()].filter(([local]) => used.has(local)).map(([, binding]) => binding),
    ...dynamicImports.map((specifier) => ({ specifier, imported: EVERYTHING })),
  ];
  return { edges, references };
}

function nextNode(node, link) {
  return {
    file: link.source,
    name: link.imported,
    viaImport: node.viaImport || link.viaImport === true,
  };
}

function expandWildcard(node, links) {
  const next = links
    .filter((link) => !(node.name === NAMED_EXPORTS && link.exported === 'default'))
    .map((link) =>
      link.star
        ? { file: link.source, name: NAMED_EXPORTS, viaImport: node.viaImport }
        : nextNode(node, link),
    );
  return { isDeclaration: true, next };
}

function expand(node, links) {
  if (WILDCARDS.has(node.name)) return expandWildcard(node, links);
  const named = links.filter((link) => !link.star && link.exported === node.name);
  if (named.length > 0)
    return { isDeclaration: false, next: named.map((link) => nextNode(node, link)) };
  const stars = node.name === 'default' ? [] : links.filter((link) => link.star);
  return {
    isDeclaration: true,
    next: stars.map((link) => ({ file: link.source, name: node.name, viaImport: node.viaImport })),
  };
}

export function isCovered(used, { file, name }) {
  return (
    used.has(nodeKey({ file, name })) ||
    used.has(nodeKey({ file, name: EVERYTHING })) ||
    (name !== 'default' && used.has(nodeKey({ file, name: NAMED_EXPORTS })))
  );
}

export function reexportGraph(moduleOf) {
  function declarationsFrom(start) {
    const seen = new Set();
    const pending = [start];
    const found = [];
    for (const node of pending) {
      const unseen = !seen.has(nodeKey(node));
      const { isDeclaration, next } = unseen
        ? expand(node, moduleOf(node.file).edges)
        : { isDeclaration: false, next: [] };
      seen.add(nodeKey(node));
      if (isDeclaration) found.push(node);
      pending.push(...next);
    }
    return found;
  }

  function usedBy(references) {
    return new Set(
      references.flatMap(({ source, imported }) =>
        declarationsFrom({ file: source, name: imported, viaImport: false }).map(nodeKey),
      ),
    );
  }

  function chainsOf(file) {
    return moduleOf(file).edges.flatMap((link) => {
      const start = link.star
        ? { file: link.source, name: NAMED_EXPORTS, viaImport: false }
        : { file, name: link.exported, viaImport: false };
      return declarationsFrom(start).map((node) => ({
        hostFile: file,
        hostName: link.star || link.namespace ? undefined : link.exported,
        node,
      }));
    });
  }

  function surfaceOf(files) {
    return new Set(
      files.flatMap((file) =>
        declarationsFrom({ file, name: EVERYTHING, viaImport: false }).map(nodeKey),
      ),
    );
  }

  return { chainsOf, usedBy, surfaceOf };
}

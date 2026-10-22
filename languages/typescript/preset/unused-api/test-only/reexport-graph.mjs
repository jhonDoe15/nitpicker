export const EVERYTHING = '<everything>';
export const NAMED_EXPORTS = '<named exports>';

const WILDCARDS = new Set([EVERYTHING, NAMED_EXPORTS]);

function nodeKey({ file, name }) {
  return `${file}\0${name}`;
}

function visitKey(node) {
  return `${nodeKey(node)}\0${node.members?.join(',') ?? ''}`;
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
  const used = new Set(referenced);
  for (const name of used) {
    const locals = aliases.filter(({ exported }) => exported === name).map(({ local }) => local);
    for (const local of locals) {
      used.add(local);
    }
  }
  return used;
}

function rootOf(name, aliases) {
  const chain = [name];
  for (const current of chain) {
    const alias = aliases.find(({ exported }) => exported === current);
    if (alias !== undefined && !chain.includes(alias.local)) {
      chain.push(alias.local);
    }
  }
  return chain.at(-1);
}

function onwardEdges({ exports, bindings, used }) {
  return [...exports.locals, ...exports.aliases]
    .map(({ local, exported }) => ({ exported, root: rootOf(local, exports.aliases) }))
    .filter(({ root }) => bindings.has(root) && !used.has(root))
    .map(({ exported, root }) => ({ exported, ...bindings.get(root), viaImport: true }));
}

function readMembers(local, binding, { exports, members }) {
  const escapes = [...exports.locals, ...exports.aliases].some((link) => link.local === local);
  const only = escapes || binding.imported === EVERYTHING ? undefined : members.get(local);
  return only === undefined ? binding : { ...binding, members: only };
}

export function moduleLinks({ imports, dynamicImports, exports, referenced, members = new Map() }) {
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
    ...onwardEdges({ exports, bindings, used }),
  ];
  const references = [
    ...[...bindings.entries()]
      .filter(([local]) => used.has(local))
      .map(([local, binding]) => readMembers(local, binding, { exports, members })),
    ...dynamicImports.map((specifier) => ({ specifier, imported: EVERYTHING })),
  ];
  return { edges, references };
}

function nextNodes(node, link) {
  const viaImport = node.viaImport || link.viaImport === true;
  if (link.imported === EVERYTHING && node.members !== undefined) {
    return node.members.map((name) => ({ file: link.source, name, viaImport }));
  }
  return [
    {
      file: link.source,
      name: link.imported,
      viaImport,
      ...(node.members === undefined ? {} : { members: node.members }),
    },
  ];
}

function expandWildcard(node, links) {
  const next = links
    .filter((link) => !(node.name === NAMED_EXPORTS && link.exported === 'default'))
    .flatMap((link) =>
      link.star
        ? [{ file: link.source, name: NAMED_EXPORTS, viaImport: node.viaImport }]
        : nextNodes(node, link),
    );
  return { isDeclaration: true, next };
}

function expand(node, links) {
  if (WILDCARDS.has(node.name)) {
    return expandWildcard(node, links);
  }
  const named = links.filter((link) => !link.star && link.exported === node.name);
  if (named.length > 0) {
    return { isDeclaration: false, next: named.flatMap((link) => nextNodes(node, link)) };
  }
  const stars = node.name === 'default' ? [] : links.filter((link) => link.star);
  return {
    isDeclaration: true,
    next: stars.map((link) => ({ ...node, file: link.source })),
  };
}

function referenceStart({ source, imported, members }) {
  return {
    file: source,
    name: imported,
    viaImport: false,
    ...(members === undefined ? {} : { members }),
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
      const unseen = !seen.has(visitKey(node));
      const { isDeclaration, next } = unseen
        ? expand(node, moduleOf(node.file).edges)
        : { isDeclaration: false, next: [] };
      seen.add(visitKey(node));
      if (isDeclaration) {
        found.push(node);
      }
      pending.push(...next);
    }
    return found;
  }

  function usedBy(references) {
    return new Set(
      references.flatMap((reference) => declarationsFrom(referenceStart(reference)).map(nodeKey)),
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

import type {
  Alias,
  Binding,
  Chain,
  Expansion,
  GraphLink,
  GraphNode,
  ImportFact,
  Link,
  ModuleExports,
  ModuleFacts,
  NamedLink,
  Reference,
  ResolvedModule,
} from './typed/graph-types.mts';

export const EVERYTHING = '<everything>';
export const NAMED_EXPORTS = '<named exports>';

const WILDCARDS = new Set([EVERYTHING, NAMED_EXPORTS]);
const DEFAULT_EXPORT = 'default';

function nodeKey({ file, name }: { readonly file: string; readonly name: string }): string {
  return `${file}\0${name}`;
}

function visitKey(node: GraphNode): string {
  return `${nodeKey(node)}\0${node.members?.join(',') ?? ''}`;
}

function bindingsOf(imports: readonly ImportFact[]): Map<string, Binding> {
  return new Map(
    imports.flatMap(
      ({ specifier, defaultName, namespaceName, named }): (readonly [string, Binding])[] => [
        ...(defaultName === undefined
          ? []
          : [[defaultName, { specifier, imported: DEFAULT_EXPORT }] as const]),
        ...(namespaceName === undefined
          ? []
          : [[namespaceName, { specifier, imported: EVERYTHING }] as const]),
        ...named.map(({ local, imported }) => [local, { specifier, imported }] as const),
      ],
    ),
  );
}

function usedNames({
  aliases,
  referenced,
}: {
  aliases: readonly Alias[];
  referenced: Iterable<string>;
}): Set<string> {
  const used = new Set(referenced);
  for (const name of used) {
    const locals = aliases.filter(({ exported }) => exported === name).map(({ local }) => local);
    for (const local of locals) {
      used.add(local);
    }
  }
  return used;
}

function rootOf(name: string, aliases: readonly Alias[]): string {
  const chain = [name];
  for (const current of chain) {
    const alias = aliases.find(({ exported }) => exported === current);
    if (alias !== undefined && !chain.includes(alias.local)) {
      chain.push(alias.local);
    }
  }
  return chain.at(-1) ?? name;
}

function onwardEdges({
  exports,
  bindings,
  used,
}: {
  exports: ModuleExports;
  bindings: ReadonlyMap<string, Binding>;
  used: ReadonlySet<string>;
}): (NamedLink & { readonly specifier: string })[] {
  return [...exports.locals, ...exports.aliases]
    .map(({ local, exported }) => ({ exported, root: rootOf(local, exports.aliases) }))
    .flatMap(({ exported, root }) => {
      const binding = bindings.get(root);
      return binding === undefined || used.has(root)
        ? []
        : [{ exported, ...binding, viaImport: true as const }];
    });
}

function readMembers(
  local: string,
  binding: Binding,
  {
    exports,
    members,
  }: { exports: ModuleExports; members: ReadonlyMap<string, readonly string[] | undefined> },
): Binding {
  const escapes = [...exports.locals, ...exports.aliases].some((link) => link.local === local);
  const only = escapes || binding.imported === EVERYTHING ? undefined : members.get(local);
  return only === undefined ? binding : { ...binding, members: only };
}

export function moduleLinks({
  imports,
  dynamicImports,
  exports,
  referenced,
  members = new Map(),
}: {
  imports: readonly ImportFact[];
  dynamicImports: readonly string[];
  exports: ModuleExports;
  referenced: Iterable<string>;
  members?: ReadonlyMap<string, readonly string[] | undefined>;
}): ModuleFacts {
  const bindings = bindingsOf(imports);
  const used = usedNames({ aliases: exports.aliases, referenced });
  const edges: Link[] = [
    ...exports.reexports.flatMap(({ specifier, star, names }): Link[] =>
      star
        ? [{ star: true, specifier }]
        : names.map(({ imported, exported }) => ({ exported, imported, specifier })),
    ),
    ...exports.namespaces.map(({ specifier, name }) => ({
      exported: name,
      imported: EVERYTHING,
      namespace: true as const,
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

function nextNodes(node: GraphNode, link: GraphLink & NamedLink): GraphNode[] {
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

function expandWildcard(node: GraphNode, links: readonly GraphLink[]): Expansion {
  const next = links
    .filter((link) => !(node.name === NAMED_EXPORTS && link.exported === DEFAULT_EXPORT))
    .flatMap((link) =>
      link.star
        ? [{ file: link.source, name: NAMED_EXPORTS, viaImport: node.viaImport }]
        : nextNodes(node, link),
    );
  return { isDeclaration: true, next };
}

function expand(node: GraphNode, links: readonly GraphLink[]): Expansion {
  if (WILDCARDS.has(node.name)) {
    return expandWildcard(node, links);
  }
  const named = links.filter(
    (link): link is GraphLink & NamedLink => !link.star && link.exported === node.name,
  );
  if (named.length > 0) {
    return { isDeclaration: false, next: named.flatMap((link) => nextNodes(node, link)) };
  }
  const stars = node.name === DEFAULT_EXPORT ? [] : links.filter((link) => link.star);
  return {
    isDeclaration: true,
    next: stars.map((link) => ({ ...node, file: link.source })),
  };
}

function referenceStart({ source, imported, members }: Reference): GraphNode {
  return {
    file: source,
    name: imported,
    viaImport: false,
    ...(members === undefined ? {} : { members }),
  };
}

export function isCovered(
  used: ReadonlySet<string>,
  { file, name }: { readonly file: string; readonly name: string },
): boolean {
  return (
    used.has(nodeKey({ file, name })) ||
    used.has(nodeKey({ file, name: EVERYTHING })) ||
    (name !== DEFAULT_EXPORT && used.has(nodeKey({ file, name: NAMED_EXPORTS })))
  );
}

function declarationsFrom(
  start: GraphNode,
  moduleOf: (file: string) => ResolvedModule,
): GraphNode[] {
  const seen = new Set<string>();
  const pending = [start];
  const found: GraphNode[] = [];
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

export function reexportGraph(moduleOf: (file: string) => ResolvedModule): {
  chainsOf: (file: string) => Chain[];
  usedBy: (references: readonly Reference[]) => Set<string>;
  surfaceOf: (files: readonly string[]) => Set<string>;
} {
  function usedBy(references: readonly Reference[]): Set<string> {
    return new Set(
      references.flatMap((reference) =>
        declarationsFrom(referenceStart(reference), moduleOf).map(nodeKey),
      ),
    );
  }

  function chainsOf(file: string): Chain[] {
    return moduleOf(file).edges.flatMap((link) => {
      const start = link.star
        ? { file: link.source, name: NAMED_EXPORTS, viaImport: false }
        : { file, name: link.exported, viaImport: false };
      return declarationsFrom(start, moduleOf).map((node) => ({
        hostFile: file,
        hostName: link.star || link.namespace ? undefined : link.exported,
        node,
      }));
    });
  }

  function surfaceOf(files: readonly string[]): Set<string> {
    return new Set(
      files.flatMap((file) =>
        declarationsFrom({ file, name: EVERYTHING, viaImport: false }, moduleOf).map(nodeKey),
      ),
    );
  }

  return { chainsOf, usedBy, surfaceOf };
}

type Snippetable = { readonly kind: string; readonly text?: string };

function isList<Item>(value: Item | readonly Item[]): value is readonly Item[] {
  return Array.isArray(value);
}

const ELLIPSIS = '...';
const SNIPPET_LENGTH = 60;
const SNIPPET_KINDS = new Set([
  'call',
  'new',
  'member',
  'index',
  'binary',
  'unary',
  'update',
  'assign',
  'conditional',
  'lambda',
  'expression',
]);

export function shortText(text: string, limit: number): string {
  const flat = text.replaceAll(/\s+/gu, ' ');
  return flat.length > limit ? `${flat.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}` : flat;
}

export function withSnippet<Node extends Snippetable | readonly unknown[]>(
  node: Node,
  text: string,
): Node {
  if (isList(node) || !SNIPPET_KINDS.has(node.kind) || node.text !== undefined) {
    return node;
  }
  return Object.assign({}, node, { text: shortText(text, SNIPPET_LENGTH) });
}

export function statementsOf<Source, Item>(
  source: Source,
  context: { readonly get: (source: Source) => Item | readonly Item[] },
): Item[] {
  const converted = context.get(source);
  return isList(converted) ? [...converted] : [converted];
}

export function listOf<Source, Item>(
  sources: readonly Source[],
  context: { readonly get: (source: Source) => Item | readonly Item[] },
): Item[] {
  return sources.flatMap((source) => statementsOf(source, context));
}

export function uniqueNames<Item extends { readonly name: string }>(
  units: readonly Item[],
): Item[] {
  const seen = new Map<string, number>();
  return units.map((unit) => {
    const count = (seen.get(unit.name) ?? 0) + 1;
    seen.set(unit.name, count);
    return count === 1 ? unit : { ...unit, name: `${unit.name}#${String(count)}` };
  });
}

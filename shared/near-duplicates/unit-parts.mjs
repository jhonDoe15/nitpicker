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

export function shortText(text, limit) {
  const flat = text.replaceAll(/\s+/gu, ' ');
  return flat.length > limit ? `${flat.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}` : flat;
}

export function withSnippet(node, text) {
  if (Array.isArray(node) || !SNIPPET_KINDS.has(node.kind) || node.text !== undefined) {
    return node;
  }
  return { ...node, text: shortText(text, SNIPPET_LENGTH) };
}

export function statementsOf(source, context) {
  const converted = context.get(source);
  return Array.isArray(converted) ? converted : [converted];
}

export function listOf(sources, context) {
  return sources.flatMap((source) => statementsOf(source, context));
}

export function uniqueNames(units) {
  const seen = new Map();
  return units.map((unit) => {
    const count = (seen.get(unit.name) ?? 0) + 1;
    seen.set(unit.name, count);
    return count === 1 ? unit : { ...unit, name: `${unit.name}#${String(count)}` };
  });
}

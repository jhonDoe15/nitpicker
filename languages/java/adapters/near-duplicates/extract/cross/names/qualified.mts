import type { Node } from 'web-tree-sitter';
import type { Attempt, Edit, ImportedName, QualifiedUse } from '../../../extract-types.mts';
import { escapeRegExp } from '../../../jvm-views.mts';
import { present } from '../../syntax.mts';
import { IMPORT, IMPORT_NODE, NOISE, nestedTypes, unusedImports } from './imports.mts';

type Span = { readonly start: number; readonly end: number };
type Use = Span & { readonly prefix: string };
type Removed = { node: Node; found: ImportedName };

function blank(match: string): string {
  return match.replace(/[^\n]/gu, ' ');
}

function masked(text: string, spans: readonly Span[]): string {
  const cleared = spans.reduce(
    (out, { start, end }) => out.slice(0, start) + blank(out.slice(start, end)) + out.slice(end),
    text,
  );
  return cleared.replaceAll(NOISE, blank);
}

function overlaps(use: Span, spans: readonly Span[]): boolean {
  return spans.some(({ start, end }) => use.start < end && use.end > start);
}

function qualifiedTypes(root: Node, name: string): QualifiedUse[] {
  const word = new RegExp(`^((?:[a-z_][\\w$]*\\.)+)${escapeRegExp(name)}$`, 'u');
  return root.descendantsOfType('scoped_type_identifier').flatMap((node) => {
    const found = word.exec(node.text.replaceAll(/\s+/gu, ''));
    const prefix = found?.[1];
    return found === null || prefix === undefined || prefix.startsWith('this.')
      ? []
      : [{ start: node.startIndex, end: node.endIndex, prefix, text: found[0] }];
  });
}

function textUses(text: string, known: readonly QualifiedUse[]): Use[] {
  if (known.length === 0) {
    return [];
  }
  const texts = [...new Set(known.map((use) => use.text))].toSorted((a, b) => b.length - a.length);
  const alternatives = texts.map(escapeRegExp).join('|');
  const prefixes = new Map(known.map((use) => [use.text, use.prefix]));
  const word = new RegExp(`(?<![\\w$.])(?:${alternatives})(?![\\w$])`, 'gu');
  const uses = [...masked(text, []).matchAll(word)];
  return uses.map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    prefix: present(prefixes.get(match[0])),
  }));
}

function simplified(text: string, uses: readonly Span[], name: string): string {
  return uses
    .toReversed()
    .reduce((out, { start, end }) => `${out.slice(0, start)}${name}${out.slice(end)}`, text);
}

function newImportBlock(
  { root, text }: { root: Node; text: string },
  removed: readonly Removed[],
  lines: readonly string[],
): Edit {
  const all = root.children.filter(({ type }) => type === IMPORT_NODE);
  const start = present(all[0]).startIndex;
  const end = present(all.at(-1)).endIndex;
  const gone = new Set(removed.map(({ node }) => node.text));
  const kept = text
    .slice(start, end)
    .split('\n')
    .filter((row) => !gone.has(row.trim()));
  const eol = kept[0]?.endsWith('\r') ? '\r' : '';
  for (const line of lines) {
    const name = present(present(IMPORT.exec(line))[2]);
    const plain = kept.map((row) => IMPORT.exec(row.trim()));
    const after = plain.findIndex(
      (found) => found !== null && !found[1] && (found[2] ?? '') > name,
    );
    const last = plain.findLastIndex((found) => found !== null && !found[1]);
    kept.splice(after >= 0 ? after : last + 1, 0, `${line}${eol}`);
  }
  return { start, end, text: kept.join('\n') };
}

function qualifiedPlan(
  { root }: { root: Node },
  edits: readonly Edit[],
  removed: readonly Removed[],
): { last: string; outside: Use[]; prefix: string; single: boolean }[] {
  const clash = nestedTypes(root);
  const topLevel = root.children
    .filter(({ type }) => type.endsWith('_declaration') && type !== IMPORT_NODE)
    .map((node) => node.childForFieldName('name')?.text);
  return removed.flatMap(({ found: { last } }) => {
    const known = qualifiedTypes(root, last);
    const outside = known.filter((use) => !overlaps(use, edits));
    const inside = edits.flatMap((edit) => textUses(edit.text, known));
    const prefixes = new Set([...outside, ...inside].map(({ prefix }) => prefix));
    if (prefixes.size === 0) {
      return [];
    }
    const taken = clash.has(last) || topLevel.includes(last);
    return [
      { last, outside, prefix: present([...prefixes][0]), single: prefixes.size === 1 && !taken },
    ];
  });
}

function clashReason(name: string): string {
  return `the file uses ${name} from a package that clashes with the removed import`;
}

export function importEditing(
  root: Node,
  text: string,
  edits: readonly Edit[],
): Attempt<{ edits: Edit[] }> {
  const removed = unusedImports(root, edits);
  const plans = qualifiedPlan({ root }, edits, removed);
  const unclear = plans.find(({ single }) => !single);
  if (unclear !== undefined) {
    return { declined: clashReason(unclear.last) };
  }
  const removals = removed.map(({ node }) => ({
    start: node.startIndex,
    end: text[node.endIndex] === '\n' ? node.endIndex + 1 : node.endIndex,
    text: '',
  }));
  if (plans.length === 0) {
    return { edits: [...edits, ...removals] };
  }
  const changed = edits.map((edit) =>
    plans.reduce(
      (current, { last }) => ({
        ...current,
        text: simplified(current.text, textUses(current.text, qualifiedTypes(root, last)), last),
      }),
      edit,
    ),
  );
  const rewrites = plans.flatMap(({ last, outside }) =>
    outside.map(({ start, end }) => ({ start, end, text: last })),
  );
  const lines = plans.map(({ prefix, last }) => `import ${prefix}${last};`);
  const block = newImportBlock({ root, text }, removed, lines);
  return { edits: [...changed, ...rewrites, block] };
}

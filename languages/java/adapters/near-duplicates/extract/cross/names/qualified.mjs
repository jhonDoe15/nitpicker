import { IMPORT, IMPORT_NODE, NOISE, nestedTypes, unusedImports } from '../imports.mjs';

function blank(match) {
  return match.replace(/[^\n]/gu, ' ');
}

function masked(text, spans) {
  const cleared = spans.reduce(
    (out, { start, end }) => out.slice(0, start) + blank(out.slice(start, end)) + out.slice(end),
    text,
  );
  return cleared.replaceAll(NOISE, blank);
}

function overlaps(use, spans) {
  return spans.some(({ start, end }) => use.start < end && use.end > start);
}

function qualifiedUses(text, name, skip) {
  const word = new RegExp(`(?<![\\w$.])((?:[a-z_][\\w$]*\\.)+)${name}(?![\\w$])`, 'gu');
  return [...masked(text, skip).matchAll(word)]
    .filter(([, prefix]) => !/^(?:this|super)\./u.test(prefix))
    .map((match) => ({ start: match.index, end: match.index + match[0].length, prefix: match[1] }));
}

function simplified(text, uses, name) {
  return uses
    .toReversed()
    .reduce((out, { start, end }) => `${out.slice(0, start)}${name}${out.slice(end)}`, text);
}

function newImportBlock({ root, text }, removed, lines) {
  const all = root.children.filter(({ type }) => type === IMPORT_NODE);
  const start = all[0].startIndex;
  const end = all.at(-1).endIndex;
  const gone = new Set(removed.map(({ node }) => node.text));
  const kept = text
    .slice(start, end)
    .split('\n')
    .filter((row) => !gone.has(row.trim()));
  const eol = kept[0]?.endsWith('\r') ? '\r' : '';
  for (const line of lines) {
    const name = IMPORT.exec(line)[2];
    const plain = kept.map((row) => IMPORT.exec(row.trim()));
    const after = plain.findIndex((found) => found !== null && !found[1] && found[2] > name);
    const last = plain.findLastIndex((found) => found !== null && !found[1]);
    kept.splice(after >= 0 ? after : last + 1, 0, `${line}${eol}`);
  }
  return { start, end, text: kept.join('\n') };
}

function qualifiedPlan({ root, text }, edits, removed) {
  const spans = root.children
    .filter(({ type }) => type === IMPORT_NODE || type === 'package_declaration')
    .map((node) => ({ start: node.startIndex, end: node.endIndex }));
  const clash = nestedTypes(root);
  const topLevel = root.children
    .filter(({ type }) => type.endsWith('_declaration') && type !== IMPORT_NODE)
    .map((node) => node.childForFieldName('name')?.text);
  return removed.flatMap(({ found: { last } }) => {
    const outside = qualifiedUses(text, last, spans).filter((use) => !overlaps(use, edits));
    const inside = edits.flatMap((edit) => qualifiedUses(edit.text, last, []));
    const prefixes = new Set([...outside, ...inside].map(({ prefix }) => prefix));
    if (prefixes.size === 0) {
      return [];
    }
    const taken = clash.has(last) || topLevel.includes(last);
    return [{ last, outside, prefix: [...prefixes][0], single: prefixes.size === 1 && !taken }];
  });
}

function clashReason(name) {
  return `the file uses ${name} from a package that clashes with the removed import`;
}

export function importEditing(root, text, edits) {
  const removed = unusedImports(root, edits);
  const plans = qualifiedPlan({ root, text }, edits, removed);
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
        text: simplified(current.text, qualifiedUses(current.text, last, []), last),
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

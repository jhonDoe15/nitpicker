import { relaxKey } from '../../../../adapters/spring/spring-config-parser.mjs';
import { openInViewInsertion } from '../locate/insert-locate.mjs';
import { lineTable, removalRange } from '../locate/lines.mjs';
import { propertyAt } from '../locate/properties-locate.mjs';
import { bareKeyAt, flowTokens, parentLine, yamlAt } from '../locate/yaml-locate.mjs';
import { withEmptiedParents } from '../locate/yaml-prune.mjs';
import { exposureItems, isOffending } from './config-fixes.mjs';

const ACTIVE_WORD = /active(?=(?:\[\d+\])?['"]?$)/i;
const INDEXED = /\[\d+\]$/;
const UNSUPPORTED = 'its layout is not one --fix edits, change it by hand';

export function configFile({ path: name, text }) {
  const kind = /\.properties$/.test(name) ? 'properties' : 'yaml';
  return { path: name, text, kind, table: lineTable(text) };
}

function locate(file, entry) {
  const found =
    file.kind === 'properties'
      ? propertyAt(file.table, entry.line, entry)
      : yamlAt(file.table, entry.line, entry);
  if (found === undefined) {
    return undefined;
  }
  const raw = file.text.slice(found.value.start, found.value.end);
  return file.kind === 'properties' && raw !== entry.value ? undefined : found;
}

function replace(file, span, text) {
  return { type: 'replace', path: file.path, start: span.start, end: span.end, text };
}

function quoted(span, text) {
  return `${span.quote}${text}${span.quote}`;
}

function valueEdits(file, entry, to) {
  const found = locate(file, entry);
  return found === undefined || found.value.flow
    ? undefined
    : [replace(file, found.value, quoted(found.value, to(entry.value)))];
}

function narrowedItems(items) {
  const kept = items.filter((item) => !isOffending(item));
  return kept.length === 0 ? ['health'] : kept;
}

function narrowEdits(file, entry) {
  const found = locate(file, entry);
  if (found === undefined) {
    return undefined;
  }
  if (!found.value.flow) {
    const text = narrowedItems(exposureItems(entry.value)).join(',');
    return [replace(file, found.value, quoted(found.value, text))];
  }
  const tokens = flowTokens(file.text.slice(found.value.start, found.value.end));
  const kept = tokens.filter((token) => !isOffending(token.replaceAll(/^["']|["']$/g, '')));
  const quote = /^["']/.test(tokens[0] ?? '') ? tokens[0][0] : '';
  const list = kept.length === 0 ? [`${quote}health${quote}`] : kept;
  return [replace(file, found.value, `[${list.join(', ')}]`)];
}

function renameEdits(file, entry, seen) {
  const found = locate(file, entry);
  if (found === undefined) {
    return undefined;
  }
  const parent = found.key === undefined ? parentLine(file.table, found.first) : undefined;
  const key = found.key ?? (parent === undefined ? undefined : bareKeyAt(file.table, parent));
  const at = key === undefined ? -1 : file.text.slice(key.start, key.end).search(ACTIVE_WORD);
  if (at < 0) {
    return undefined;
  }
  const start = key.start + at;
  if (seen.has(start)) {
    return [];
  }
  seen.add(start);
  return [replace(file, { start, end: start + 'active'.length }, 'default')];
}

function isListItem(file, entry) {
  const found = locate(file, entry);
  if (found === undefined) {
    return false;
  }
  return file.kind === 'properties' ? INDEXED.test(entry.key) : found.key === undefined;
}

function removalLines(file, entry) {
  const found = locate(file, entry);
  return found === undefined
    ? undefined
    : Array.from({ length: found.last - found.first + 1 }, (_, offset) => found.first + offset);
}

function runsOf(indices) {
  const sorted = [...indices].sort((left, right) => left - right);
  return sorted.reduce((runs, index) => {
    const run = runs.at(-1);
    if (run !== undefined && run.at(-1) === index - 1) {
      run.push(index);
    } else {
      runs.push([index]);
    }
    return runs;
  }, []);
}

function removalEdits(file, removed) {
  const deleted = file.kind === 'yaml' ? withEmptiedParents(file.table, removed) : removed;
  const byOwner = new Map();
  for (const [index, owner] of deleted) {
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), index]);
  }
  return new Map(
    [...byOwner].map(([owner, indices]) => [
      owner,
      runsOf(indices).map((run) => {
        const range = removalRange(file.table, run[0], run.at(-1));
        return { type: 'replace', path: file.path, start: range.start, end: range.end, text: '' };
      }),
    ]),
  );
}

function insertEdits(file, target) {
  const insertion = openInViewInsertion({
    table: file.table,
    kind: file.kind,
    text: file.text,
    firstEntryLine: target.document.entries[0]?.line,
  });
  return insertion === undefined ? undefined : [{ type: 'replace', path: file.path, ...insertion }];
}

function listGroups(file, items) {
  const groups = new Map();
  const narrowed = items.filter(
    ({ op, target }) => op.kind === 'narrow' && isListItem(file, target.entry),
  );
  for (const item of narrowed) {
    const { document, entry } = item.target;
    const byKey = groups.get(document) ?? new Map();
    const key = relaxKey(entry.key);
    groups.set(document, byKey.set(key, [...(byKey.get(key) ?? []), item]));
  }
  return [...groups.values()].flatMap((byKey) => [...byKey]);
}

function planListItem(file, { item, position, kept }, state) {
  const swap = !kept && position === 0;
  const to = swap ? valueEdits(file, item.target.entry, () => 'health') : undefined;
  const lines = swap ? undefined : removalLines(file, item.target.entry);
  if (to !== undefined) {
    state.edits.set(item, to);
  } else if (lines === undefined) {
    state.left.push({ item, why: UNSUPPORTED });
  } else {
    for (const line of lines) {
      state.removed.set(line, item);
    }
  }
}

function planGroups(file, items, state) {
  const handled = new Set();
  for (const [key, group] of listGroups(file, items)) {
    const kept = group[0].target.document.entries.some(
      (entry) => relaxKey(entry.key) === key && !isOffending(entry.value),
    );
    for (const [position, item] of group.entries()) {
      handled.add(item);
      planListItem(file, { item, position, kept }, state);
    }
  }
  return handled;
}

function singleEdits(file, item, state) {
  const { op, target } = item;
  const { entry } = target;
  switch (op.kind) {
    case 'insert':
      return insertEdits(file, target);
    case 'value':
      return valueEdits(file, entry, op.to);
    case 'narrow':
      return narrowEdits(file, entry);
    case 'rename':
      return renameEdits(file, entry, state.renamed);
    default: {
      const lines = removalLines(file, entry);
      for (const line of lines ?? []) {
        state.removed.set(line, item);
      }
      return lines === undefined ? undefined : [];
    }
  }
}

export function fixesFor(file, items) {
  const state = { edits: new Map(), removed: new Map(), left: [], renamed: new Set() };
  const handled = planGroups(file, items, state);
  for (const item of items.filter((entry) => !handled.has(entry))) {
    const found = item.op.skip === undefined ? singleEdits(file, item, state) : undefined;
    if (found === undefined) {
      state.left.push({ item, why: item.op.skip ?? UNSUPPORTED });
    } else if (found.length > 0) {
      state.edits.set(item, found);
    }
  }
  const removals = removalEdits(file, state.removed);
  const owners = new Set([...state.edits.keys(), ...removals.keys()]);
  return {
    fixes: [...owners].map((item) => ({
      item,
      edits: [...(state.edits.get(item) ?? []), ...(removals.get(item) ?? [])],
    })),
    notes: state.left.map(
      ({ item: { target }, why }) =>
        `${target.path}:${target.entry?.line ?? 1} spring/${target.rule}: left as is, ${why}`,
    ),
  };
}

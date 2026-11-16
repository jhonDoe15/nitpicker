import type { RecipeEdit } from '../../../../../../core/fix/typed/fix-types.mts';
import { relaxKey as untypedRelaxKey } from '../../../../adapters/spring/spring-config-parser.mjs';
import type { Located, Range, Span } from '../locate/locate-types.mts';
import { openInViewInsertion } from '../locate/insert-locate.mts';
import { lineTable, removalRange } from '../locate/lines.mts';
import { propertyAt } from '../locate/properties-locate.mts';
import { bareKeyAt, flowTokens, parentLine, yamlAt } from '../locate/yaml-locate.mts';
import { withEmptiedParents } from '../locate/yaml-prune.mts';
import { exposureItems, isOffending } from './config-fixes.mts';
import type { ConfigFile, ConfigItem, SpringDocument, SpringEntry } from './config-types.mts';

type PlanState = {
  readonly edits: Map<ConfigItem, RecipeEdit[]>;
  readonly removed: Map<number, ConfigItem>;
  readonly left: { readonly item: ConfigItem; readonly why: string }[];
  readonly renamed: Set<number>;
};

type Group = readonly [string, ConfigItem[]];

const relaxKey: (key: string) => string = untypedRelaxKey;

const ACTIVE_WORD = /active(?=(?:\[\d+\])?['"]?$)/i;
const INDEXED = /\[\d+\]$/;
const UNSUPPORTED = 'its layout is not one --fix edits, change it by hand';

export function configFile({
  path: name,
  text,
}: {
  readonly path: string;
  readonly text: string;
}): ConfigFile {
  const kind = /\.properties$/.test(name) ? 'properties' : 'yaml';
  return { path: name, text, kind, table: lineTable(text) };
}

function locate(file: ConfigFile, entry: SpringEntry): Located | undefined {
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

function replace(file: ConfigFile, span: Range, text: string): RecipeEdit {
  return { type: 'replace', path: file.path, start: span.start, end: span.end, text };
}

function quoted(span: Span, text: string): string {
  return `${span.quote}${text}${span.quote}`;
}

function valueEdits(
  file: ConfigFile,
  entry: SpringEntry,
  to: (old: string) => string,
): RecipeEdit[] | undefined {
  const found = locate(file, entry);
  return found === undefined || found.value.flow
    ? undefined
    : [replace(file, found.value, quoted(found.value, to(entry.value)))];
}

function narrowedItems(items: readonly string[]): string[] {
  const kept = items.filter((item) => !isOffending(item));
  return kept.length === 0 ? ['health'] : kept;
}

function narrowEdits(file: ConfigFile, entry: SpringEntry): RecipeEdit[] | undefined {
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
  const quote = /^["']/.test(tokens[0] ?? '') ? (tokens[0] ?? '').charAt(0) : '';
  const list = kept.length === 0 ? [`${quote}health${quote}`] : kept;
  return [replace(file, found.value, `[${list.join(', ')}]`)];
}

function renameEdits(
  file: ConfigFile,
  entry: SpringEntry,
  seen: Set<number>,
): RecipeEdit[] | undefined {
  const found = locate(file, entry);
  if (found === undefined) {
    return undefined;
  }
  const parent = found.key === undefined ? parentLine(file.table, found.first) : undefined;
  const key = found.key ?? (parent === undefined ? undefined : bareKeyAt(file.table, parent));
  const at = key === undefined ? -1 : file.text.slice(key.start, key.end).search(ACTIVE_WORD);
  if (key === undefined || at < 0) {
    return undefined;
  }
  const start = key.start + at;
  if (seen.has(start)) {
    return [];
  }
  seen.add(start);
  return [replace(file, { start, end: start + 'active'.length }, 'default')];
}

function isListItem(file: ConfigFile, entry: SpringEntry): boolean {
  const found = locate(file, entry);
  if (found === undefined) {
    return false;
  }
  return file.kind === 'properties' ? INDEXED.test(entry.key) : found.key === undefined;
}

function removalLines(file: ConfigFile, entry: SpringEntry): number[] | undefined {
  const found = locate(file, entry);
  return found === undefined
    ? undefined
    : Array.from({ length: found.last - found.first + 1 }, (_, offset) => found.first + offset);
}

function runsOf(indices: Iterable<number>): number[][] {
  const sorted = [...indices].sort((left, right) => left - right);
  return sorted.reduce<number[][]>((runs, index) => {
    const run = runs.at(-1);
    if (run !== undefined && run.at(-1) === index - 1) {
      run.push(index);
    } else {
      runs.push([index]);
    }
    return runs;
  }, []);
}

function removalEdits(
  file: ConfigFile,
  removed: ReadonlyMap<number, ConfigItem>,
): Map<ConfigItem, RecipeEdit[]> {
  const deleted = file.kind === 'yaml' ? withEmptiedParents(file.table, removed) : removed;
  const byOwner = new Map<ConfigItem, number[]>();
  for (const [index, owner] of deleted) {
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), index]);
  }
  return new Map(
    [...byOwner].map(([owner, indices]) => [
      owner,
      runsOf(indices).map((run) => {
        const range = removalRange(file.table, run[0] ?? 0, run.at(-1));
        return { type: 'replace', path: file.path, start: range.start, end: range.end, text: '' };
      }),
    ]),
  );
}

function insertEdits(file: ConfigFile, target: ConfigItem['target']): RecipeEdit[] | undefined {
  const insertion = openInViewInsertion({
    table: file.table,
    kind: file.kind,
    text: file.text,
    firstEntryLine: target.document.entries[0]?.line,
  });
  return insertion === undefined ? undefined : [{ type: 'replace', path: file.path, ...insertion }];
}

function listGroups(file: ConfigFile, items: readonly ConfigItem[]): Group[] {
  const groups = new Map<SpringDocument, Map<string, ConfigItem[]>>();
  const narrowed = items.filter(
    ({ op, target }) =>
      op.kind === 'narrow' && target.entry !== undefined && isListItem(file, target.entry),
  );
  for (const item of narrowed) {
    const { document, entry } = item.target;
    if (entry === undefined) {
      continue;
    }
    const byKey = groups.get(document) ?? new Map();
    const key = relaxKey(entry.key);
    groups.set(document, byKey.set(key, [...(byKey.get(key) ?? []), item]));
  }
  return [...groups.values()].flatMap((byKey) => [...byKey]);
}

function planListItem(
  file: ConfigFile,
  { item, position, kept }: { item: ConfigItem; position: number; kept: boolean },
  state: PlanState,
): void {
  const { entry } = item.target;
  if (entry === undefined) {
    return;
  }
  const swap = !kept && position === 0;
  const to = swap ? valueEdits(file, entry, () => 'health') : undefined;
  const lines = swap ? undefined : removalLines(file, entry);
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

function planGroups(
  file: ConfigFile,
  items: readonly ConfigItem[],
  state: PlanState,
): Set<ConfigItem> {
  const handled = new Set<ConfigItem>();
  for (const [key, group] of listGroups(file, items)) {
    const kept =
      group[0]?.target.document.entries.some(
        (entry) => relaxKey(entry.key) === key && !isOffending(entry.value),
      ) === true;
    for (const [position, item] of group.entries()) {
      handled.add(item);
      planListItem(file, { item, position, kept }, state);
    }
  }
  return handled;
}

function singleEdits(
  file: ConfigFile,
  item: ConfigItem,
  state: PlanState,
): RecipeEdit[] | undefined {
  const { op, target } = item;
  const { entry } = target;
  if (op.kind === 'insert') {
    return insertEdits(file, target);
  }
  if (entry === undefined) {
    return undefined;
  }
  switch (op.kind) {
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

export function fixesFor(
  file: ConfigFile,
  items: readonly ConfigItem[],
): {
  readonly fixes: { readonly item: ConfigItem; readonly edits: RecipeEdit[] }[];
  readonly notes: string[];
} {
  const state: PlanState = { edits: new Map(), removed: new Map(), left: [], renamed: new Set() };
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

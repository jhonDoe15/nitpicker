import {
  ROUTE_SENTENCE,
  escapeGlob,
  exceptionSentence,
} from '../../../../../shared/messages/exception-sentence.mjs';
import { areaRank } from './finding-areas.mts';
import { singleLine } from '../text.mjs';
import type { ReportEntry } from '../../../../../shared/values/findings.mts';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';

type Entry = Readonly<Record<string, unknown>>;

type RoutePart = { readonly body: string; readonly entry?: Entry; readonly list?: string };

type ParsedEntry = { readonly kind: 'entry'; readonly entry: Entry } | { readonly kind: string };

type Routed = RoutePart & { readonly entry: Entry; readonly path: unknown };

type Row = {
  readonly path: unknown;
  readonly detail: string;
  readonly tag: string;
  readonly positions: Map<string, number>;
  unplaced: number;
};

const routeSentence: RegExp = ROUTE_SENTENCE;
const escapedGlob: (path: string) => string = escapeGlob;
const sentenceFor: (entryText: string, key?: string) => string = exceptionSentence;
const oneLine: (value: unknown) => string = singleLine;
const parseJson: (text: string) => unknown = JSON.parse;

const SENTENCE_END = /[.!?](?=\s|$)/gu;
const ABBREVIATION = /\b(?:e\.g|i\.e)\.$/iu;
const LIST_KEY = /to "(?<list>(?:python\.)?exceptions)" in nitpicker\.config\.json\.$/u;
const TAG_KEYS = ['function', 'name', 'packages'];

function isEntry(value: unknown): value is Entry {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isParsedEntry(parsed: ParsedEntry): parsed is { kind: 'entry'; entry: Entry } {
  return parsed.kind === 'entry';
}

export function byFixOrder(left: ReportEntry, right: ReportEntry): number {
  return areaRank(left.tool) - areaRank(right.tool) || byPosition(left, right);
}

function byPosition(left: ReportEntry, right: ReportEntry): number {
  const leftPath = textOf(left.path);
  const rightPath = textOf(right.path);
  return (
    Number(leftPath > rightPath) - Number(leftPath < rightPath) ||
    Number(fieldOf(left['location'], 'line') ?? Infinity) -
      Number(fieldOf(right['location'], 'line') ?? Infinity) ||
    Number(fieldOf(left['location'], 'column') ?? 0) -
      Number(fieldOf(right['location'], 'column') ?? 0)
  );
}

export function ruleGroupLines(
  findings: readonly ReportEntry[],
  styleLabel: (label: string) => string,
): string[] {
  return groupByRule(findings).flatMap(({ label, members }) =>
    groupLines(styleLabel(label), members),
  );
}

function groupByRule(
  findings: readonly ReportEntry[],
): { readonly label: string; readonly members: ReportEntry[] }[] {
  const groups = new Map<string, ReportEntry[]>();
  for (const finding of findings.toSorted(byFixOrder)) {
    const label = `${textOf(finding.tool)}/${textOf(finding.rule)}`;
    groups.set(label, [...(groups.get(label) ?? []), finding]);
  }
  return [...groups.entries()].map(([label, members]) => ({ label, members }));
}

function groupLines(label: string, members: readonly ReportEntry[]): string[] {
  const parts = members.map((finding) => splitRoute(oneLine(finding.message)));
  const split = parts.map(({ body }) => sentences(body));
  const unfolded = split.filter((_, index) => members[index]?.['folded'] !== true);
  const base = unfolded.length > 1 || unfolded.length === split.length ? unfolded : split;
  const [firstBase = []] = base;
  const shared = firstBase.filter((sentence) => base.every((list) => list.includes(sentence)));
  const sharedSet = new Set(shared);
  const details = split.map((list) => list.filter((sentence) => !sharedSet.has(sentence)));
  const advice = shared.join(' ');
  const differing = differingKeys(parts);
  const route = groupRoute(members, parts, differing);
  return [
    advice === '' ? `  ${label}` : `  ${label}: ${advice}`,
    ...locationLines(
      members,
      details,
      parts.map(({ entry }) => entryTags(entry, differing)),
    ),
    ...(route === undefined ? [] : [`    ${route}`]),
  ];
}

function locationLines(
  members: readonly ReportEntry[],
  details: readonly (readonly string[])[],
  tags: readonly string[],
): string[] {
  const rows = new Map<string, Row>();
  for (const [index, finding] of members.entries()) {
    const detail = (details[index] ?? []).join(' ');
    const tag = tags[index] ?? '';
    const key = `${textOf(finding.path)}\0${detail}\0${tag}`;
    const row = rows.get(key) ?? {
      path: finding.path,
      detail,
      tag,
      positions: new Map<string, number>(),
      unplaced: 0,
    };
    if (finding['location'] === undefined) {
      row.unplaced += 1;
    } else {
      const text = position(finding['location']);
      row.positions.set(text, (row.positions.get(text) ?? 0) + 1);
    }
    rows.set(key, row);
  }
  return [...rows.values()].map(({ path, detail, tag, positions, unplaced }, index, all) => {
    const shownTag = tag === '' || all[index - 1]?.tag === tag ? '' : ` ${tag}`;
    return `    ${place(path, positions, unplaced)}${shownTag}${detail === '' ? '' : ` ${detail}`}`;
  });
}

function place(path: unknown, positions: ReadonlyMap<string, number>, unplaced: number): string {
  if (positions.size === 0) {
    return unplaced > 1 ? `${textOf(path)} (${String(unplaced)} times)` : textOf(path);
  }
  const listed = [...positions].map(([text, count]) =>
    count > 1 ? `${text} (${String(count)} times)` : text,
  );
  const rest = unplaced === 0 ? '' : ` (+${String(unplaced)} without a location)`;
  return `${textOf(path)}:${listed.join(', ')}${rest}`;
}

function position(location: unknown): string {
  const line = fieldOf(location, 'line');
  const column = fieldOf(location, 'column');
  return column === undefined ? textOf(line) : `${textOf(line)}:${textOf(column)}`;
}

function entryTags(entry: Entry | undefined, differing: ReadonlySet<string>): string {
  if (entry === undefined) {
    return '';
  }
  return TAG_KEYS.filter((key) => differing.has(key) && key in entry)
    .map((key) => `(${key} ${[entry[key]].flat().join(', ')})`)
    .join(' ');
}

function splitRoute(text: string): RoutePart {
  const route = routeSentence.exec(text);
  if (route === null) {
    return { body: text };
  }
  const parsed = parseEntry(route.groups?.['entry'] ?? '');
  if (!isParsedEntry(parsed)) {
    return { body: text };
  }
  const list = LIST_KEY.exec(route[0])?.groups?.['list'];
  return {
    body: text.slice(0, route.index).trim(),
    entry: parsed.entry,
    ...(list === undefined ? {} : { list }),
  };
}

function parseEntry(text: string): ParsedEntry {
  try {
    const entry = parseJson(text);
    return isEntry(entry) ? { kind: 'entry', entry } : { kind: 'not-an-object' };
  } catch {
    return { kind: 'malformed-json' };
  }
}

function differingKeys(parts: readonly RoutePart[]): Set<string> {
  const entries = parts.flatMap(({ entry }) => (entry === undefined ? [] : [entry]));
  const [first] = entries;
  const keys = [...new Set(entries.flatMap((entry) => Object.keys(entry)))];
  const differing = keys.filter(
    (key) =>
      !entries.every(
        (entry) => key in entry && JSON.stringify(entry[key]) === JSON.stringify(first?.[key]),
      ),
  );
  return new Set(entries.length < parts.length ? [...differing, 'paths'] : differing);
}

function groupRoute(
  members: readonly ReportEntry[],
  parts: readonly RoutePart[],
  differing: ReadonlySet<string>,
): string | undefined {
  const routed = parts.flatMap((part, index): Routed[] =>
    part.entry === undefined ? [] : [{ ...part, entry: part.entry, path: members[index]?.path }],
  );
  const [firstRouted] = routed;
  if (firstRouted === undefined) {
    return undefined;
  }
  const keys = [...new Set(routed.flatMap(({ entry }) => Object.keys(entry)))];
  const merged = Object.fromEntries(
    keys.map((key) => [
      key,
      differing.has(key) ? placeholder(key, routed) : firstRouted.entry[key],
    ]),
  );
  return sentenceFor(JSON.stringify(merged), firstRouted.list);
}

function placeholder(key: string, routed: readonly Routed[]): unknown {
  if (key === 'paths') {
    const suffixes = new Set(routed.map(({ entry, path }) => globSuffix(entry['paths'], path)));
    const [suffix] = suffixes;
    return [`<path>${suffixes.size === 1 && suffix !== undefined ? suffix : ''}`];
  }
  return key === 'packages' ? ['<package>'] : `<${key}>`;
}

function globSuffix(paths: unknown, path: unknown): string | undefined {
  const list = listOf(paths);
  const [only] = list;
  if (list.length !== 1 || typeof only !== 'string') {
    return undefined;
  }
  const base = escapedGlob(textOf(path));
  return only.startsWith(base) ? only.slice(base.length) : undefined;
}

function sentences(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = match.index + 1;
    if (!ABBREVIATION.test(text.slice(start, end))) {
      parts.push(text.slice(start, end).trim());
      start = end;
    }
  }
  const rest = text.slice(start).trim();
  return rest === '' ? parts : [...parts, rest];
}

export function withoutRoute(finding: ReportEntry): ReportEntry {
  return { ...finding, message: splitRoute(oneLine(finding.message)).body };
}

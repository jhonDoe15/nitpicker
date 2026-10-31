import {
  ROUTE_SENTENCE,
  escapeGlob,
  exceptionSentence,
} from '../../../../shared/messages/exception-sentence.mjs';
import { areaRank } from './finding-areas.mjs';
import { singleLine } from './text.mjs';

const SENTENCE_END = /[.!?](?=\s|$)/gu;
const ABBREVIATION = /\b(?:e\.g|i\.e)\.$/iu;
const LIST_KEY = /to "(?<list>(?:python\.)?exceptions)" in nitpicker\.config\.json\.$/u;
const TAG_KEYS = ['function', 'name', 'packages'];

export function byFixOrder(left, right) {
  return areaRank(left.tool) - areaRank(right.tool) || byPosition(left, right);
}

function byPosition(left, right) {
  return (
    Number(left.path > right.path) - Number(left.path < right.path) ||
    (left.location?.line ?? Infinity) - (right.location?.line ?? Infinity) ||
    (left.location?.column ?? 0) - (right.location?.column ?? 0)
  );
}

export function ruleGroupLines(findings, styleLabel) {
  return groupByRule(findings).flatMap(({ label, members }) =>
    groupLines(styleLabel(label), members),
  );
}

function groupByRule(findings) {
  const groups = new Map();
  for (const finding of findings.toSorted(byFixOrder)) {
    const label = `${finding.tool}/${finding.rule}`;
    groups.set(label, [...(groups.get(label) ?? []), finding]);
  }
  return [...groups.entries()].map(([label, members]) => ({ label, members }));
}

function groupLines(label, members) {
  const parts = members.map((finding) => splitRoute(singleLine(finding.message)));
  const split = parts.map(({ body }) => sentences(body));
  const unfolded = split.filter((_, index) => members[index].folded !== true);
  const base = unfolded.length > 1 || unfolded.length === split.length ? unfolded : split;
  const shared = base[0].filter((sentence) => base.every((list) => list.includes(sentence)));
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

function locationLines(members, details, tags) {
  const rows = new Map();
  for (const [index, finding] of members.entries()) {
    const detail = details[index].join(' ');
    const tag = tags[index];
    const key = `${finding.path}\0${detail}\0${tag}`;
    const row = rows.get(key) ?? {
      path: finding.path,
      detail,
      tag,
      positions: new Map(),
      unplaced: 0,
    };
    if (finding.location === undefined) {
      row.unplaced += 1;
    } else {
      const text = position(finding.location);
      row.positions.set(text, (row.positions.get(text) ?? 0) + 1);
    }
    rows.set(key, row);
  }
  return [...rows.values()].map(({ path, detail, tag, positions, unplaced }, index, all) => {
    const shownTag = tag === '' || all[index - 1]?.tag === tag ? '' : ` ${tag}`;
    return `    ${place(path, positions, unplaced)}${shownTag}${detail === '' ? '' : ` ${detail}`}`;
  });
}

function place(path, positions, unplaced) {
  if (positions.size === 0) {
    return unplaced > 1 ? `${path} (${String(unplaced)} times)` : path;
  }
  const listed = [...positions].map(([text, count]) =>
    count > 1 ? `${text} (${String(count)} times)` : text,
  );
  const rest = unplaced === 0 ? '' : ` (+${String(unplaced)} without a location)`;
  return `${path}:${listed.join(', ')}${rest}`;
}

function position({ line, column }) {
  return column === undefined ? String(line) : `${String(line)}:${String(column)}`;
}

function entryTags(entry, differing) {
  if (entry === undefined) {
    return '';
  }
  return TAG_KEYS.filter((key) => differing.has(key) && key in entry)
    .map((key) => `(${key} ${[entry[key]].flat().join(', ')})`)
    .join(' ');
}

function splitRoute(text) {
  const route = ROUTE_SENTENCE.exec(text);
  const parsed = route === null ? { kind: 'no-route' } : parseEntry(route.groups.entry);
  if (parsed.kind !== 'entry') {
    return { body: text };
  }
  return {
    body: text.slice(0, route.index).trim(),
    entry: parsed.entry,
    list: LIST_KEY.exec(route[0]).groups.list,
  };
}

function parseEntry(text) {
  try {
    const entry = JSON.parse(text);
    return typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ? { kind: 'entry', entry }
      : { kind: 'not-an-object' };
  } catch {
    return { kind: 'malformed-json' };
  }
}

function differingKeys(parts) {
  const entries = parts.flatMap(({ entry }) => (entry === undefined ? [] : [entry]));
  const [first] = entries;
  const keys = [...new Set(entries.flatMap((entry) => Object.keys(entry)))];
  const differing = keys.filter(
    (key) =>
      !entries.every(
        (entry) => key in entry && JSON.stringify(entry[key]) === JSON.stringify(first[key]),
      ),
  );
  return new Set(entries.length < parts.length ? [...differing, 'paths'] : differing);
}

function groupRoute(members, parts, differing) {
  const routed = parts.flatMap((part, index) =>
    part.entry === undefined ? [] : [{ ...part, path: members[index].path }],
  );
  if (routed.length === 0) {
    return undefined;
  }
  const keys = [...new Set(routed.flatMap(({ entry }) => Object.keys(entry)))];
  const merged = Object.fromEntries(
    keys.map((key) => [key, differing.has(key) ? placeholder(key, routed) : routed[0].entry[key]]),
  );
  return exceptionSentence(JSON.stringify(merged), routed[0].list);
}

function placeholder(key, routed) {
  if (key === 'paths') {
    const suffixes = new Set(routed.map(({ entry, path }) => globSuffix(entry.paths, path)));
    const [suffix] = suffixes;
    return [`<path>${suffixes.size === 1 && suffix !== undefined ? suffix : ''}`];
  }
  return key === 'packages' ? ['<package>'] : `<${key}>`;
}

function globSuffix(paths, path) {
  if (!Array.isArray(paths) || paths.length !== 1 || typeof paths[0] !== 'string') {
    return undefined;
  }
  const base = escapeGlob(path);
  return paths[0].startsWith(base) ? paths[0].slice(base.length) : undefined;
}

function sentences(text) {
  const parts = [];
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

export function withoutRoute(finding) {
  return { ...finding, message: splitRoute(singleLine(finding.message)).body };
}

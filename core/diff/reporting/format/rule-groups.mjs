import {
  ROUTE_SENTENCE,
  exceptionSentence,
} from '../../../../shared/messages/exception-sentence.mjs';
import { areaRank } from './finding-areas.mjs';
import { singleLine } from './text.mjs';

const SENTENCE_END = /[.!?](?=\s|$)/gu;
const ABBREVIATION = /\b(?:e\.g|i\.e)\.$/iu;
const LIST_KEY = /to "(?<list>(?:python\.)?exceptions)" in nitpicker\.config\.json\.$/u;
const PLACEHOLDERS = { paths: ['<path>'], packages: ['<package>'] };

export function byFixOrder(left, right) {
  return areaRank(left.tool) - areaRank(right.tool) || byPosition(left, right);
}

function byPosition(left, right) {
  return (
    left.path.localeCompare(right.path) ||
    (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
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
  const shared = split[0].filter((sentence) => split.every((list) => list.includes(sentence)));
  const sharedSet = new Set(shared);
  const details = split.map((list) => list.filter((sentence) => !sharedSet.has(sentence)));
  const advice = shared.join(' ');
  const route = groupRoute(parts);
  return [
    advice === '' ? `  ${label}` : `  ${label}: ${advice}`,
    ...locationLines(members, details),
    ...(route === undefined ? [] : [`    ${route}`]),
  ];
}

function locationLines(members, details) {
  const rows = new Map();
  members.forEach((finding, index) => {
    const detail = details[index].join(' ');
    const key = `${finding.path}\0${detail}`;
    const row = rows.get(key) ?? { path: finding.path, detail, positions: [], unplaced: 0 };
    if (finding.location === undefined) {
      row.unplaced += 1;
    } else {
      row.positions.push(position(finding.location));
    }
    rows.set(key, row);
  });
  return [...rows.values()].map(({ path, detail, positions, unplaced }) => {
    const place = positions.length === 0 ? path : `${path}:${positions.join(', ')}`;
    const times = unplaced > 1 && positions.length === 0 ? ` (${String(unplaced)} times)` : '';
    return `    ${place}${times}${detail === '' ? '' : ` ${detail}`}`;
  });
}

function position({ line, column }) {
  return column === undefined ? String(line) : `${String(line)}:${String(column)}`;
}

function splitRoute(text) {
  const route = ROUTE_SENTENCE.exec(text);
  const entry = route === null ? undefined : parseEntry(route.groups.entry);
  if (entry === undefined) {
    return { body: text };
  }
  return {
    body: text.slice(0, route.index).trim(),
    entry,
    list: LIST_KEY.exec(route[0]).groups.list,
  };
}

function parseEntry(text) {
  try {
    const entry = JSON.parse(text);
    return typeof entry === 'object' && entry !== null && !Array.isArray(entry) ? entry : undefined;
  } catch {
    return undefined;
  }
}

function groupRoute(parts) {
  const routed = parts.filter(({ entry }) => entry !== undefined);
  if (routed.length === 0) {
    return undefined;
  }
  const entries = routed.map(({ entry }) => entry);
  const keys = [...new Set(entries.flatMap((entry) => Object.keys(entry)))];
  const merged = Object.fromEntries(
    keys.map((key) => [key, sharedValue(entries, key) ?? PLACEHOLDERS[key] ?? `<${key}>`]),
  );
  return exceptionSentence(JSON.stringify(merged), routed[0].list);
}

function sharedValue(entries, key) {
  const [first] = entries;
  const text = JSON.stringify(first[key]);
  const same = entries.every((entry) => key in entry && JSON.stringify(entry[key]) === text);
  return same ? first[key] : undefined;
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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lineLocator } from './java-spans.mjs';

export const OVERLAP_PAIRS = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'overlap-pairs.json'), 'utf8'),
);
const SYMBOL_MEMBER = /[(#]/u;

function ruleOf(finding) {
  return `${finding.tool}/${finding.rule}`;
}

export function matchesRule(patterns, rule) {
  return patterns.some((pattern) =>
    pattern.endsWith('*') ? rule.startsWith(pattern.slice(0, -1)) : pattern === rule,
  );
}

function symbolField({ tool, symbol }) {
  if (tool !== 'spotbugs' || typeof symbol !== 'string' || SYMBOL_MEMBER.test(symbol)) {
    return {};
  }
  const segments = symbol.split('.');
  return segments.length < 2 ? {} : { className: segments.at(-2), field: segments.at(-1) };
}

function sourceLocations(readSource) {
  const locators = new Map();
  return (finding) => {
    const line = finding.location?.line;
    if (!finding.path.endsWith('.java') || line === undefined) {
      return {};
    }
    if (!locators.has(finding.path)) {
      const text = readSource(finding.path);
      locators.set(finding.path, text === undefined ? undefined : lineLocator(text));
    }
    return locators.get(finding.path)?.(line) ?? {};
  };
}

function scopeKey(scope, finding, locate) {
  const line = finding.location?.line;
  if (scope === 'file') {
    return finding.path;
  }
  if (scope === 'line') {
    return line === undefined ? undefined : JSON.stringify([finding.path, line]);
  }
  const located = { ...locate(finding), ...symbolField(finding) };
  const parts = {
    class: [located.className],
    member: [located.member],
    field: [located.className, located.field],
  }[scope];
  return parts.includes(undefined) ? undefined : JSON.stringify([finding.path, ...parts]);
}

function scopeKeys(locate) {
  const keys = new Map();
  return (scope, finding) => {
    const byScope = keys.get(finding) ?? new Map();
    keys.set(finding, byScope);
    if (!byScope.has(scope)) {
      byScope.set(scope, scopeKey(scope, finding, locate));
    }
    return byScope.get(scope);
  };
}

function primaryIndex(findings, keyOf) {
  return OVERLAP_PAIRS.map(({ primary, scope }) => {
    const index = new Map();
    for (const finding of findings.filter((candidate) => matchesRule(primary, ruleOf(candidate)))) {
      const key = keyOf(scope, finding);
      if (key !== undefined) {
        index.set(key, [...(index.get(key) ?? []), finding]);
      }
    }
    return index;
  });
}

function coveringPrimaries(finding, primaries, keyOf) {
  return OVERLAP_PAIRS.flatMap(({ secondary, scope }, index) =>
    matchesRule(secondary, ruleOf(finding))
      ? (primaries[index].get(keyOf(scope, finding)) ?? []).filter((primary) => primary !== finding)
      : [],
  );
}

function coveredSecondaries(covering) {
  const edges = [...covering].flatMap(([secondary, primaryFindings]) =>
    primaryFindings.map((primary) => ({ primary, secondary })),
  );
  return new Map(
    [...Map.groupBy(edges, ({ primary }) => primary)].map(([primary, group]) => [
      primary,
      group.map(({ secondary }) => secondary),
    ]),
  );
}

function released(finding, covers, undecided) {
  return (covers.get(finding) ?? []).filter((secondary) => {
    undecided.set(secondary, undecided.get(secondary) - 1);
    return undecided.get(secondary) === 0;
  });
}

function droppedFindings(findings, covering) {
  const covers = coveredSecondaries(covering);
  const undecided = new Map(findings.map((finding) => [finding, covering.get(finding).length]));
  const dropped = new Set();
  const pending = findings.filter((finding) => undecided.get(finding) === 0);
  for (const finding of pending) {
    if (covering.get(finding).some((primary) => !dropped.has(primary))) {
      dropped.add(finding);
    }
    pending.push(...released(finding, covers, undecided));
  }
  return dropped;
}

export function withoutOverlaps(findings, { readSource = () => undefined } = {}) {
  const keyOf = scopeKeys(sourceLocations(readSource));
  const primaries = primaryIndex(findings, keyOf);
  const covering = new Map(
    findings.map((finding) => [finding, coveringPrimaries(finding, primaries, keyOf)]),
  );
  const dropped = droppedFindings(findings, covering);
  return findings.filter((finding) => !dropped.has(finding));
}

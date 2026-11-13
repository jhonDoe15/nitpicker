import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type LineLocation, lineLocator } from './java-spans.mts';
import type { JavaFinding, SourceReader } from '../typed/java-values.mts';
import { fieldOf, listOf, textsOf } from '../../../../shared/values/readers.mts';

type Scope = 'file' | 'line' | 'class' | 'member' | 'javadoc' | 'catch' | 'field';
export type OverlapPair = {
  readonly primary: readonly string[];
  readonly secondary: readonly string[];
  readonly scope: Scope;
};
type Located = Partial<LineLocation> & {
  readonly className?: string | undefined;
  readonly field?: string | undefined;
};
type Locate = (finding: JavaFinding) => Partial<LineLocation>;
type KeyOf = (scope: Scope, finding: JavaFinding) => string | undefined;
type Covering = Map<JavaFinding, JavaFinding[]>;
type IndexedPair = { readonly pair: OverlapPair; readonly primaries: Map<string, JavaFinding[]> };

const SCOPES: readonly Scope[] = ['file', 'line', 'class', 'member', 'javadoc', 'catch', 'field'];
const SYMBOL_MEMBER = /[(#]/u;
const FIELD_SEGMENTS = 2;

function scopeOf(value: unknown): Scope {
  const scope = SCOPES.find((known) => known === value);
  if (scope === undefined) {
    throw new TypeError(`overlap-pairs.json names an unknown scope: ${String(value)}`);
  }
  return scope;
}

export function overlapPairs(): OverlapPair[] {
  const pairs: unknown = JSON.parse(
    readFileSync(path.join(import.meta.dirname, 'overlap-pairs.json'), 'utf8'),
  );
  return listOf(pairs).map((pair) => ({
    primary: textsOf(fieldOf(pair, 'primary')),
    secondary: textsOf(fieldOf(pair, 'secondary')),
    scope: scopeOf(fieldOf(pair, 'scope')),
  }));
}

function ruleOf(finding: JavaFinding): string {
  return `${finding.tool}/${finding.rule}`;
}

export function matchesRule(patterns: readonly string[], rule: string): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith('*') ? rule.startsWith(pattern.slice(0, -1)) : pattern === rule,
  );
}

function symbolField({ tool, symbol }: JavaFinding): Located {
  if (tool !== 'spotbugs' || typeof symbol !== 'string' || SYMBOL_MEMBER.test(symbol)) {
    return {};
  }
  const segments = symbol.split('.');
  const [className, field] = segments.slice(-FIELD_SEGMENTS);
  return segments.length < FIELD_SEGMENTS ? {} : { className, field };
}

function sourceLocations(readSource: SourceReader): Locate {
  const locators = new Map<string, ((line: number) => LineLocation) | undefined>();
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

function scopeKey(scope: Scope, finding: JavaFinding, locate: Locate): string | undefined {
  const line = finding.location?.line;
  if (scope === 'file') {
    return finding.path;
  }
  if (scope === 'line') {
    return line === undefined ? undefined : JSON.stringify([finding.path, line]);
  }
  const located: Located = { ...locate(finding), ...symbolField(finding) };
  const parts = {
    class: [located.className],
    member: [located.member],
    javadoc: [located.javadoc],
    catch: [located.catchLine],
    field: [located.className, located.field],
  }[scope];
  return parts.includes(undefined) ? undefined : JSON.stringify([finding.path, ...parts]);
}

function scopeKeys(locate: Locate): KeyOf {
  const keys = new Map<JavaFinding, Map<Scope, string | undefined>>();
  return (scope, finding) => {
    const byScope = keys.get(finding) ?? new Map<Scope, string | undefined>();
    keys.set(finding, byScope);
    if (!byScope.has(scope)) {
      byScope.set(scope, scopeKey(scope, finding, locate));
    }
    return byScope.get(scope);
  };
}

function primaryIndex(
  pairs: readonly OverlapPair[],
  findings: readonly JavaFinding[],
  keyOf: KeyOf,
): IndexedPair[] {
  return pairs.map((pair) => {
    const primaries = new Map<string, JavaFinding[]>();
    for (const finding of findings.filter((candidate) =>
      matchesRule(pair.primary, ruleOf(candidate)),
    )) {
      const key = keyOf(pair.scope, finding);
      if (key !== undefined) {
        primaries.set(key, [...(primaries.get(key) ?? []), finding]);
      }
    }
    return { pair, primaries };
  });
}

function coveringPrimaries(
  indexed: readonly IndexedPair[],
  finding: JavaFinding,
  keyOf: KeyOf,
): JavaFinding[] {
  return indexed.flatMap(({ pair: { secondary, scope }, primaries }) => {
    const key = matchesRule(secondary, ruleOf(finding)) ? keyOf(scope, finding) : undefined;
    return key === undefined
      ? []
      : (primaries.get(key) ?? []).filter((primary) => primary !== finding);
  });
}

function coveredSecondaries(covering: Covering): Map<JavaFinding, JavaFinding[]> {
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

function released(
  finding: JavaFinding,
  covers: Map<JavaFinding, JavaFinding[]>,
  undecided: Map<JavaFinding, number>,
): JavaFinding[] {
  return (covers.get(finding) ?? []).filter((secondary) => {
    undecided.set(secondary, (undecided.get(secondary) ?? 0) - 1);
    return undecided.get(secondary) === 0;
  });
}

function droppedFindings(findings: readonly JavaFinding[], covering: Covering): Set<JavaFinding> {
  const covers = coveredSecondaries(covering);
  const undecided = new Map(
    findings.map((finding) => [finding, covering.get(finding)?.length ?? 0]),
  );
  const dropped = new Set<JavaFinding>();
  const pending = findings.filter((finding) => undecided.get(finding) === 0);
  for (const finding of pending) {
    if (covering.get(finding)?.some((primary) => !dropped.has(primary)) === true) {
      dropped.add(finding);
    }
    pending.push(...released(finding, covers, undecided));
  }
  return dropped;
}

export function withoutOverlaps<T extends JavaFinding>(
  findings: readonly T[],
  { readSource = () => undefined }: { readonly readSource?: SourceReader } = {},
): T[] {
  const keyOf = scopeKeys(sourceLocations(readSource));
  const indexed = primaryIndex(overlapPairs(), findings, keyOf);
  const covering: Covering = new Map(
    findings.map((finding) => [finding, coveringPrimaries(indexed, finding, keyOf)]),
  );
  const dropped = droppedFindings(findings, covering);
  return findings.filter((finding) => !dropped.has(finding));
}

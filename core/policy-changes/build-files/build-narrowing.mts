import { listed } from '../paths/hidden-code.mts';
import { isUnder } from '../policy-scope.mts';
import type {
  BuildSource,
  ChangePart,
  ExcludesSource,
  IncludesSource,
  PolicyScope,
  RootsSource,
} from '../types/policy-types.mts';

const LISTED_FILES = 3;
const NOTHING_NEW = 'covers no checked file it did not cover before';
const NOTHING_LEFT_OUT = 'leaves out no checked file it did not leave out before';

function within(entry: RootsSource, file: string): boolean {
  if (entry.roots === undefined) {
    return true;
  }
  const contains = entry.contains ?? isUnder;
  return entry.roots.some((root) => contains(file, root));
}

function lostText(label: string, lost: readonly string[], limit: number): string {
  return `${label} no longer includes checked code: ${listed(lost, limit)}`;
}

function rootsChange(
  base: RootsSource,
  head: RootsSource | undefined,
  { scope, headEntries }: { scope: PolicyScope; headEntries: readonly BuildSource[] },
): ChangePart {
  const headRoots = headEntries.filter((entry) => entry.type === 'roots');
  const applies = head?.applies ?? base.applies ?? (() => true);
  const lost = scope.keptCode.filter(
    (file) =>
      applies(file) &&
      within(base, file) &&
      !headRoots.some((entry) => (entry.applies?.(file) ?? true) && within(entry, file)),
  );
  return lostChange({ label: base.label, file: (head ?? base).file, lost, kind: base.kind });
}

function lostChange({
  label,
  file,
  lost,
  kind = 'build-roots',
}: {
  label: string;
  file: string;
  lost: readonly string[];
  kind?: string | undefined;
}): ChangePart {
  if (lost.length === 0) {
    return { loosened: [], changed: [] };
  }
  return {
    loosened: [
      {
        text: lostText(label, lost, LISTED_FILES),
        key: lostText(label, lost, lost.length),
        kind,
        files: [file, ...lost],
      },
    ],
    changed: [],
  };
}

function admitted(entry: IncludesSource | undefined, file: string): boolean {
  return entry === undefined || entry.patterns.some((pattern) => entry.admits(file, pattern));
}

function includesChange(
  base: IncludesSource | undefined,
  head: IncludesSource | undefined,
  scope: PolicyScope,
): ChangePart {
  const before = base?.patterns ?? [];
  const added = (head?.patterns ?? []).filter((pattern) => !before.includes(pattern));
  const removed = before.filter((pattern) => !(head?.patterns ?? []).includes(pattern));
  const removedText = removed.map((pattern) => `${base?.label ?? ''} removed: ${pattern}`);
  if (head === undefined) {
    return { loosened: [], changed: removedText };
  }
  const lost = scope.keptCode.filter(
    (file) => head.inScope(file) && admitted(base, file) && !admitted(head, file),
  );
  const addedText = added.map((pattern) => `${head.label} added: ${pattern}`);
  if (lost.length === 0) {
    return {
      loosened: [],
      changed: [...addedText.map((text) => `${text} (${NOTHING_LEFT_OUT})`), ...removedText],
    };
  }
  return {
    loosened: [
      {
        text: `${head.label} leave out checked code: ${listed(lost, LISTED_FILES)}`,
        key: `${head.label} leave out checked code: ${listed(lost, lost.length)}`,
        kind: 'build-filter',
        files: [head.file, ...lost],
      },
    ],
    changed: removedText,
  };
}

function excludesChange(
  base: ExcludesSource | undefined,
  head: ExcludesSource,
  scope: PolicyScope,
): ChangePart {
  const before = base?.patterns ?? [];
  const added = head.patterns.filter((pattern) => !before.includes(pattern));
  const outcomes = added.map((pattern) => {
    const covered = scope.keptCode.filter(
      (file) =>
        head.covers(file, pattern) && !before.some((known) => base?.covers(file, known) === true),
    );
    return { pattern, covered };
  });
  return {
    loosened: outcomes
      .filter(({ covered }) => covered.length > 0)
      .map(({ pattern, covered }) => ({
        text: `${head.label} added: ${pattern}`,
        kind: 'build-filter',
        files: [head.file, ...covered],
      })),
    changed: [
      ...outcomes
        .filter(({ covered }) => covered.length === 0)
        .map(({ pattern }) => `${head.label} added: ${pattern} (${NOTHING_NEW})`),
      ...before
        .filter((pattern) => !head.patterns.includes(pattern))
        .map((pattern) => `${head.label} removed: ${pattern}`),
    ],
  };
}

function entryChange({
  base,
  head,
  headEntries,
  scope,
}: {
  base: BuildSource | undefined;
  head: BuildSource | undefined;
  headEntries: readonly BuildSource[];
  scope: PolicyScope;
}): ChangePart {
  if (base?.type === 'roots') {
    return rootsChange(base, head?.type === 'roots' ? head : undefined, { scope, headEntries });
  }
  if (head?.type === 'excludes') {
    return excludesChange(base?.type === 'excludes' ? base : undefined, head, scope);
  }
  if (head?.type === 'includes' || base?.type === 'includes') {
    return includesChange(
      base?.type === 'includes' ? base : undefined,
      head?.type === 'includes' ? head : undefined,
      scope,
    );
  }
  const removed = base?.type === 'excludes' ? base.patterns : [];
  return {
    loosened: [],
    changed: removed.map((pattern) => `${base?.label ?? ''} removed: ${pattern}`),
  };
}

export function buildNarrowingChanges(scope: PolicyScope): ChangePart[] {
  const { base = [], head = [] } = scope.buildSources ?? {};
  const baseByKey = new Map(base.map((entry) => [entry.key, entry]));
  const headByKey = new Map(head.map((entry) => [entry.key, entry]));
  const keys = new Set([...baseByKey.keys(), ...headByKey.keys()]);
  return [...keys].map((key) =>
    entryChange({ base: baseByKey.get(key), head: headByKey.get(key), headEntries: head, scope }),
  );
}

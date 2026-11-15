import type { ChangePart, Loosening, PolicyConfig, PolicyScope } from '../types/policy-types.mts';
import { hidingSets } from './hiding.mts';
import type { HidingSet } from './hiding.mts';

const LISTED_FILES = 3;
const REASONS = {
  unhidden: 'where the base config checked it',
  dormant: 'where the base hid no code',
  imported: 'that production code imports',
};

type Reason = keyof typeof REASONS;

function isReason(value: string): value is Reason {
  return Object.hasOwn(REASONS, value);
}

function isAddedOrMoved(file: string, scope: PolicyScope): boolean {
  const basePath = scope.basePathOf(file);
  return basePath !== file || !scope.existsInBase(file);
}

function reasonFor(set: HidingSet, file: string, scope: PolicyScope): Reason | undefined {
  const hiders = set.baseHiders(scope.basePathOf(file));
  if (hiders.length === 0) {
    return 'unhidden';
  }
  if (set.establishedInBase?.(scope.basePathOf(file))) {
    return undefined;
  }
  if (!scope.baseCode.some((baseFile) => hiders.some((hides) => hides(baseFile)))) {
    return 'dormant';
  }
  return set.importable && scope.productionReach().has(file) ? 'imported' : undefined;
}

export function listed(entries: readonly string[], limit: number): string {
  const more = entries.length > limit ? `, and ${String(entries.length - limit)} more` : '';
  return `${entries.slice(0, limit).join(', ')}${more}`;
}

function loosening(
  { set, reason, files }: { set: HidingSet; reason: Reason; files: readonly string[] },
  scope: PolicyScope,
): Loosening {
  const entries =
    reason === 'imported'
      ? files.map((file) => `${file} (imported by ${String(scope.productionReach().get(file))})`)
      : files;
  function describe(limit: number): string {
    return `${set.label} hide code this change adds or moves ${REASONS[reason]}: ${listed(entries, limit)}`;
  }
  return { text: describe(LISTED_FILES), key: describe(entries.length), kind: set.kind, files };
}

export function hiddenCodeChanges(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): ChangePart {
  const changedCode = scope.code.filter((file) => isAddedOrMoved(file, scope)).toSorted();
  const loosened = hidingSets(baseConfig, headConfig, scope).flatMap((set) => {
    const byReason = Map.groupBy(
      changedCode.filter((file) => set.hidesInHead(file)),
      (file) => reasonFor(set, file, scope),
    );
    return Object.keys(REASONS)
      .filter(isReason)
      .filter((reason) => byReason.has(reason))
      .map((reason) => loosening({ set, reason, files: byReason.get(reason) ?? [] }, scope));
  });
  return { loosened, changed: [] };
}

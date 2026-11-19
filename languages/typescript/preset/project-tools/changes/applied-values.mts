import { isPlainObject } from '../../../../../shared/values/readers.mts';
import type { FileChange } from '../../../../../core/policy-changes/types/policy-types.mts';
import { shownValue } from '../config-values.mts';
import { configList as listOf } from '../typed/shared-views.mts';
import type { AppliedChange } from '../typed/tool-types.mts';

export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown): unknown =>
    isPlainObject(item)
      ? Object.fromEntries(
          Object.entries(item).toSorted(([left], [right]) => left.localeCompare(right)),
        )
      : item,
  );
}

export function sortedEntries(value: unknown): unknown[] {
  const entries = [
    ...new Map(
      listOf(value).map((entry): [string, unknown] => [canonical(entry), entry]),
    ).entries(),
  ];
  return entries.toSorted(([left], [right]) => left.localeCompare(right)).map(([, entry]) => entry);
}

export function addsEntries(base: unknown, head: unknown): boolean {
  const kept = new Set(listOf(base).map(canonical));
  return listOf(head).some((entry) => !kept.has(canonical(entry)));
}

export function loosenedChange(text: string, files: readonly string[] | undefined): FileChange {
  return { loosened: { text, kind: 'tool-config', ...(files === undefined ? {} : { files }) } };
}

export function keyChanges(
  { base, head, label, files }: AppliedChange,
  {
    applied,
    loosens,
  }: {
    readonly applied: (key: string, value: unknown) => unknown;
    readonly loosens: (key: string, before: unknown, after: unknown) => boolean;
  },
): FileChange[] {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].toSorted();
  return keys.flatMap((key) => {
    const before = applied(key, base[key]);
    const after = applied(key, head[key]);
    if (canonical(before) === canonical(after)) {
      return [];
    }
    const text = `${String(label)} ${key}: ${shownValue(before)} -> ${shownValue(after)}`;
    return [loosens(key, before, after) ? loosenedChange(text, files) : { changed: text }];
  });
}

import { asSentence, joinedWords, presetTitle } from './entry.mts';
import type { PresetValues } from './typed/entry-types.mts';

export const FIX_STATUS = {
  automatic: 'automatic',
  review: 'review',
  none: 'none',
};

export const FIX_RANK: string[] = [FIX_STATUS.none, FIX_STATUS.review, FIX_STATUS.automatic];

const STATUS_TEXTS: Readonly<Record<string, (id: string) => string>> = {
  [FIX_STATUS.automatic]: () => 'Automatic: `nitpicker --fix` removes the finding.',
  [FIX_STATUS.review]: (id) =>
    `With \`nitpicker --fix --rule ${id}\`: \`--fix\` alone skips the rewrite, because it needs a review.`,
  [FIX_STATUS.none]: () => 'None: fix it by hand.',
};

export function fixStatusIn(
  entry: { readonly fix?: PresetValues<string> },
  preset: string,
): string {
  return entry.fix?.[preset] ?? FIX_STATUS.none;
}

const SHORT_TEXTS: Readonly<Record<string, (id: string) => string>> = {
  [FIX_STATUS.automatic]: () => 'automatic',
  [FIX_STATUS.review]: (id) => `with \`nitpicker --fix --rule ${id}\``,
  [FIX_STATUS.none]: () => 'none',
};

export function fixText(
  entry: { readonly id: string; readonly fix?: PresetValues<string> },
  presets: readonly string[],
): string {
  const groups = [...Map.groupBy(presets, (preset) => fixStatusIn(entry, preset))];
  const [only] = groups;
  if (only !== undefined && groups.length === 1) {
    return STATUS_TEXTS[only[0]]?.(entry.id) ?? only[0];
  }
  const parts = groups.map(
    ([status, group]) =>
      `${SHORT_TEXTS[status]?.(entry.id) ?? status} in ${joinedWords(group.map(presetTitle))}`,
  );
  return asSentence(parts.join(', '));
}

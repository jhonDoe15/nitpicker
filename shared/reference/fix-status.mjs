import { asSentence, joinedWords, PRESET_TITLES } from './entry.mjs';

export const FIX_STATUS = {
  automatic: 'automatic',
  review: 'review',
  none: 'none',
};

export const FIX_RANK = [FIX_STATUS.none, FIX_STATUS.review, FIX_STATUS.automatic];

const STATUS_TEXTS = {
  [FIX_STATUS.automatic]: () => 'Automatic: `nitpicker --fix` removes the finding.',
  [FIX_STATUS.review]: (id) =>
    `With \`nitpicker --fix --rule ${id}\`: \`--fix\` alone skips the rewrite, because it needs a review.`,
  [FIX_STATUS.none]: () => 'None: fix it by hand.',
};

/** The fix status of the entry in `preset`: `automatic`, `review` or `none`. */
export function fixStatusIn(entry, preset) {
  return entry.fix?.[preset] ?? FIX_STATUS.none;
}

const SHORT_TEXTS = {
  [FIX_STATUS.automatic]: () => 'automatic',
  [FIX_STATUS.review]: (id) => `with \`nitpicker --fix --rule ${id}\``,
  [FIX_STATUS.none]: () => 'none',
};

/** The sentence that says whether `nitpicker --fix` removes the entry's finding, per preset when they differ. */
export function fixText(entry, presets) {
  const groups = [...Map.groupBy(presets, (preset) => fixStatusIn(entry, preset))];
  if (groups.length === 1) {
    return STATUS_TEXTS[groups[0][0]](entry.id);
  }
  const parts = groups.map(
    ([status, group]) =>
      `${SHORT_TEXTS[status](entry.id)} in ${joinedWords(group.map((preset) => PRESET_TITLES[preset]))}`,
  );
  return asSentence(parts.join(', '));
}

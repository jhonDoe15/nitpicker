import { pluralsOf } from '../../../../../../../shared/naming/plural-names.mjs';

export function pluralPairs(inputs) {
  return [...inputs].flatMap(([singular, { text }]) =>
    pluralsOf(singular).flatMap((plural) => {
      const entry = inputs.get(plural);
      return entry?.element !== undefined && entry.element === text
        ? [{ singular, plural, node: entry.node }]
        : [];
    }),
  );
}

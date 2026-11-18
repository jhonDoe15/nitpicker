import type { TSESTree } from '@typescript-eslint/utils';
import { pluralsOf as untypedPluralsOf } from '../../../../../../../shared/naming/plural-names.mjs';
import type { InputSet } from './type-members.mts';

export type PluralPair = {
  readonly singular: string;
  readonly plural: string;
  readonly node: TSESTree.Node;
};

const pluralsOf: (name: string) => string[] = untypedPluralsOf;

export function pluralPairs(inputs: InputSet): PluralPair[] {
  return [...inputs].flatMap(([singular, { text }]) =>
    pluralsOf(singular).flatMap((plural) => {
      const entry = inputs.get(plural);
      return entry?.element !== undefined && entry.element === text
        ? [{ singular, plural, node: entry.node }]
        : [];
    }),
  );
}

import type { Placed } from '../spotbugs-placed.mts';

const NOTE = 'note';

export const COMPARATOR_PATTERNS: readonly string[] = [
  'SE_COMPARATOR_SHOULD_BE_SERIALIZABLE',
  'CO_COMPARETO_INCORRECT_FLOATING',
  'CO_COMPARETO_RESULTS_MIN_VALUE',
  'EQ_CHECK_FOR_OPERAND_NOT_COMPATIBLE_WITH_THIS',
];

export const COMPARATOR_DETECTORS: Readonly<Record<string, readonly string[]>> = {
  ComparatorIdiom: ['SE_COMPARATOR_SHOULD_BE_SERIALIZABLE'],
  FindComparatorProblems: ['CO_COMPARETO_INCORRECT_FLOATING', 'CO_COMPARETO_RESULTS_MIN_VALUE'],
  EqualsOperandShouldHaveClassCompatibleWithThis: ['EQ_CHECK_FOR_OPERAND_NOT_COMPATIBLE_WITH_THIS'],
};

export const EQUALITY_PLACED: Readonly<Record<string, Placed>> = {
  EQ_COMPARETO_USE_OBJECT_EQUALS: {
    text: 'Class defines compareTo(...) and uses Object.equals()',
    levels: { 2: NOTE },
  },
  SE_COMPARATOR_SHOULD_BE_SERIALIZABLE: {
    text: "Comparator doesn't implement Serializable",
    levels: { 2: NOTE },
  },
  CO_COMPARETO_INCORRECT_FLOATING: {
    text: 'compareTo()/compare() incorrectly handles float or double value',
    levels: { 2: NOTE },
    placement: 'shown',
  },
  CO_COMPARETO_RESULTS_MIN_VALUE: {
    text: 'compareTo()/compare() returns Integer.MIN_VALUE',
    levels: { 2: NOTE },
  },
  EQ_CHECK_FOR_OPERAND_NOT_COMPATIBLE_WITH_THIS: {
    text: 'Equals checks for incompatible operand',
    levels: { 1: 'warning', 2: NOTE },
  },
};

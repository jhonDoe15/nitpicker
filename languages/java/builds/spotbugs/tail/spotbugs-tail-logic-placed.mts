import type { Placed } from '../spotbugs-placed.mts';

const ERROR = 'error';
const WARNING = 'warning';
const NOTE = 'note';
const SHOWN = 'shown';

export const FLOAT_PATTERNS: readonly string[] = [
  'FE_FLOATING_POINT_EQUALITY',
  'FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER',
];

export const CIRCUIT_PATTERNS: readonly string[] = [
  'NS_NON_SHORT_CIRCUIT',
  'NS_DANGEROUS_NON_SHORT_CIRCUIT',
];

export const CALENDAR_PATTERNS: readonly string[] = [
  'STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE',
  'STCAL_STATIC_CALENDAR_INSTANCE',
  'STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE',
  'STCAL_INVOKE_ON_STATIC_CALENDAR_INSTANCE',
];

export const ASSIGNMENT_PATTERNS: readonly string[] = [
  'SA_FIELD_SELF_ASSIGNMENT',
  'SA_LOCAL_DOUBLE_ASSIGNMENT',
];

export const LOGIC_PLACED: Readonly<Record<string, Placed>> = {
  FE_FLOATING_POINT_EQUALITY: {
    text: 'Test for floating point equality',
    levels: { 1: NOTE, 2: NOTE },
  },
  FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER: {
    text: 'Doomed test for equality to NaN',
    levels: { 1: ERROR },
  },
  NS_NON_SHORT_CIRCUIT: {
    text: 'Questionable use of non-short-circuit logic',
    levels: { 1: NOTE, 2: NOTE },
  },
  NS_DANGEROUS_NON_SHORT_CIRCUIT: {
    text: 'Potentially dangerous use of non-short-circuit logic',
    levels: { 1: NOTE },
  },
  SA_FIELD_SELF_ASSIGNMENT: {
    text: 'Self assignment of field',
    levels: { 1: ERROR, 2: ERROR },
    placement: SHOWN,
  },
  SA_LOCAL_DOUBLE_ASSIGNMENT: {
    text: 'Double assignment of local variable',
    levels: { 2: NOTE },
  },
  STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE: {
    text: 'Static DateFormat',
    levels: { 1: WARNING, 2: WARNING },
  },
  STCAL_STATIC_CALENDAR_INSTANCE: {
    text: 'Static Calendar field',
    levels: { 1: WARNING, 2: WARNING },
  },
  STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE: {
    text: 'Call to static DateFormat',
    levels: { 1: ERROR, 2: ERROR },
    placement: SHOWN,
  },
  STCAL_INVOKE_ON_STATIC_CALENDAR_INSTANCE: {
    text: 'Call to static Calendar',
    levels: { 1: WARNING, 2: WARNING },
    placement: SHOWN,
  },
};

import type { Placed } from '../spotbugs-placed.mts';
import {
  ASSIGNMENT_PATTERNS,
  CALENDAR_PATTERNS,
  CIRCUIT_PATTERNS,
  FLOAT_PATTERNS,
  LOGIC_PLACED,
  SELF_COMPARISON_PATTERNS,
  VALUE_NUMBER_PATTERNS,
} from './spotbugs-tail-logic-placed.mts';

const ERROR = 'error';
const WARNING = 'warning';
const NOTE = 'note';

export const DIVISION_PATTERNS: readonly string[] = [
  'ICAST_IDIV_CAST_TO_DOUBLE',
  'ICAST_INT_CAST_TO_DOUBLE_PASSED_TO_CEIL',
  'ICAST_INT_CAST_TO_FLOAT_PASSED_TO_ROUND',
];

export const WAIT_PATTERNS: readonly string[] = [
  'WA_NOT_IN_LOOP',
  'WA_AWAIT_NOT_IN_LOOP',
  'NO_NOTIFY_NOT_NOTIFYALL',
];

export const START_PATTERNS: readonly string[] = ['SC_START_IN_CTOR'];

export const ENUM_PATTERNS: readonly string[] = ['ME_ENUM_FIELD_SETTER', 'ME_MUTABLE_ENUM_FIELD'];

export const TAIL_DETECTORS: Readonly<Record<string, readonly string[]>> = {
  IDivResultCastToDouble: DIVISION_PATTERNS,
  WaitInLoop: WAIT_PATTERNS,
  StartInConstructor: START_PATTERNS,
  MutableEnum: ENUM_PATTERNS,
  FindFloatEquality: FLOAT_PATTERNS,
  FindNonShortCircuit: CIRCUIT_PATTERNS,
  StaticCalendarDetector: CALENDAR_PATTERNS,
  FindFieldSelfAssignment: ASSIGNMENT_PATTERNS,
  FindSelfComparison: SELF_COMPARISON_PATTERNS,
  FindSelfComparison2: VALUE_NUMBER_PATTERNS,
};

export const TAIL_PLACED: Readonly<Record<string, Placed>> = {
  ...LOGIC_PLACED,
  ICAST_IDIV_CAST_TO_DOUBLE: {
    text: 'Integral division result cast to double or float',
    levels: { 2: NOTE },
  },
  ICAST_INT_CAST_TO_DOUBLE_PASSED_TO_CEIL: {
    text: 'Integral value cast to double and then passed to Math.ceil',
    levels: { 1: ERROR },
  },
  ICAST_INT_CAST_TO_FLOAT_PASSED_TO_ROUND: {
    text: 'int value cast to float and then passed to Math.round',
    levels: { 2: ERROR },
  },
  WA_NOT_IN_LOOP: { text: 'Wait not in loop', levels: { 2: WARNING } },
  WA_AWAIT_NOT_IN_LOOP: { text: 'Condition.await() not in loop', levels: { 2: WARNING } },
  SC_START_IN_CTOR: {
    text: 'Constructor invokes Thread.start()',
    levels: { 1: WARNING, 2: WARNING },
    placement: 'shown',
  },
  ME_ENUM_FIELD_SETTER: {
    text: 'Public enum method unconditionally sets its field',
    levels: { 2: NOTE },
  },
  ME_MUTABLE_ENUM_FIELD: { text: 'Enum field is public and mutable', levels: { 2: NOTE } },
};

import type { Placed } from './spotbugs-placed.mts';

const ERROR = 'error';
const NOTE = 'note';
const RELATIVE = 'relative';
const SHOWN = 'shown';

export const URL_PATTERNS: readonly string[] = [
  'DMI_COLLECTION_OF_URLS',
  'DMI_BLOCKING_METHODS_ON_URL',
];

export const BOXING_PATTERNS: readonly string[] = [
  'DM_STRING_CTOR',
  'DM_STRING_VOID_CTOR',
  'DM_BOOLEAN_CTOR',
  'DM_BOXED_PRIMITIVE_FOR_PARSING',
  'DM_BOXED_PRIMITIVE_TOSTRING',
  'DM_BOXED_PRIMITIVE_FOR_COMPARE',
  'DM_NEW_FOR_GETCLASS',
  'DM_STRING_TOSTRING',
];

export const THREAD_PATTERNS: readonly string[] = [
  'DM_GC',
  'DM_EXIT',
  'DM_RUN_FINALIZERS_ON_EXIT',
  'DMI_THREAD_PASSED_WHERE_RUNNABLE_EXPECTED',
  'DMI_FUTILE_ATTEMPT_TO_CHANGE_MAXPOOL_SIZE_OF_SCHEDULED_THREAD_POOL_EXECUTOR',
  'DM_MONITOR_WAIT_ON_CONDITION',
  'DM_USELESS_THREAD',
  'DMI_SCHEDULED_THREAD_POOL_EXECUTOR_WITH_ZERO_CORE_THREADS',
];

export const NUMBER_PATTERNS: readonly string[] = [
  'BIT_IOR_OF_SIGNED_BYTE',
  'BIT_ADD_OF_SIGNED_BYTE',
  'INT_VACUOUS_BIT_OPERATION',
  'INT_BAD_REM_BY_1',
  'INT_VACUOUS_COMPARISON',
  'INT_BAD_COMPARISON_WITH_INT_VALUE',
  'INT_BAD_COMPARISON_WITH_SIGNED_BYTE',
  'INT_BAD_COMPARISON_WITH_NONNEGATIVE_VALUE',
];

export const CALL_PATTERNS: readonly string[] = [
  'RV_ABSOLUTE_VALUE_OF_HASHCODE',
  'RV_ABSOLUTE_VALUE_OF_RANDOM_INT',
  'RV_REM_OF_HASHCODE',
  'RV_REM_OF_RANDOM_INT',
  'DM_NEXTINT_VIA_NEXTDOUBLE',
  'RV_01_TO_INT',
  'DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE',
  'DMI_LONG_BITS_TO_DOUBLE_INVOKED_ON_INT',
  'DM_INVALID_MIN_MAX',
  'DM_CONVERT_CASE',
];

export const INVOCATION_PATTERNS: readonly string[] = [
  'DMI_CONSTANT_DB_PASSWORD',
  'DMI_EMPTY_DB_PASSWORD',
  'DMI_HARDCODED_ABSOLUTE_FILENAME',
  'DMI_USELESS_SUBSTRING',
  'DMI_MISLEADING_SUBSTRING',
];

export const BOUND_PATTERNS: readonly string[] = [
  'RANGE_ARRAY_INDEX',
  'RANGE_ARRAY_OFFSET',
  'RANGE_ARRAY_LENGTH',
  'RANGE_STRING_INDEX',
  'NP_IMMEDIATE_DEREFERENCE_OF_READLINE',
  'DMI_ANNOTATION_IS_NOT_VISIBLE_TO_REFLECTION',
  'DMI_ARGUMENTS_WRONG_ORDER',
  'DMI_CALLING_NEXT_FROM_HASNEXT',
  'DMI_DOH',
  'DMI_VACUOUS_CALL_TO_EASYMOCK_METHOD',
  'SW_SWING_METHODS_INVOKED_IN_SWING_THREAD',
];

const ERRORS = { 1: ERROR, 2: ERROR };
const ERROR_TWO = { 2: ERROR };

const BOUND_PLACED: Readonly<Record<string, Placed>> = {
  RANGE_ARRAY_INDEX: { text: 'Array index is out of bounds', levels: ERROR_TWO },
  RANGE_ARRAY_OFFSET: { text: 'Array offset is out of bounds', levels: ERROR_TWO, placement: SHOWN },
  RANGE_ARRAY_LENGTH: { text: 'Array length is out of bounds', levels: ERROR_TWO, placement: SHOWN },
  RANGE_STRING_INDEX: { text: 'String index is out of bounds', levels: ERROR_TWO, placement: SHOWN },
  NP_IMMEDIATE_DEREFERENCE_OF_READLINE: {
    text: 'Immediate dereference of the result of readLine()',
    levels: { 2: NOTE },
  },
  DMI_ANNOTATION_IS_NOT_VISIBLE_TO_REFLECTION: {
    text: 'Cannot use reflection to check for presence of annotation without runtime retention',
    levels: { 1: ERROR },
    placement: SHOWN,
  },
  DMI_ARGUMENTS_WRONG_ORDER: { text: 'Reversed method arguments', levels: ERROR_TWO, placement: SHOWN },
  DMI_CALLING_NEXT_FROM_HASNEXT: { text: 'hasNext method invokes next', levels: ERROR_TWO },
  DMI_DOH: { text: "D'oh! A nonsensical method invocation", levels: ERROR_TWO, placement: SHOWN },
  DMI_VACUOUS_CALL_TO_EASYMOCK_METHOD: {
    text: 'Useless/vacuous call to EasyMock method',
    levels: ERROR_TWO,
    placement: SHOWN,
  },
};

const NUMBER_PLACED: Readonly<Record<string, Placed>> = {
  BIT_IOR_OF_SIGNED_BYTE: { text: 'Bitwise OR of signed byte value', levels: ERRORS },
  BIT_ADD_OF_SIGNED_BYTE: { text: 'Bitwise add of signed byte value', levels: ERRORS },
  INT_VACUOUS_BIT_OPERATION: {
    text: 'Vacuous bit mask operation on integer value',
    levels: { 2: NOTE },
  },
  INT_BAD_REM_BY_1: { text: 'Integer remainder modulo 1', levels: { 1: ERROR } },
  INT_VACUOUS_COMPARISON: { text: 'Vacuous comparison of integer value', levels: { 2: NOTE } },
  INT_BAD_COMPARISON_WITH_INT_VALUE: {
    text: 'Bad comparison of int value with long constant',
    levels: ERRORS,
  },
  INT_BAD_COMPARISON_WITH_SIGNED_BYTE: {
    text: 'Bad comparison of signed byte',
    levels: ERRORS,
    placement: SHOWN,
  },
  INT_BAD_COMPARISON_WITH_NONNEGATIVE_VALUE: {
    text: 'Bad comparison of nonnegative value with negative constant or zero',
    levels: ERRORS,
    placement: SHOWN,
  },
};

const CALL_PLACED: Readonly<Record<string, Placed>> = {
  RV_ABSOLUTE_VALUE_OF_HASHCODE: {
    text: 'Bad attempt to compute absolute value of signed 32-bit hashcode',
    levels: { 1: ERROR },
  },
  RV_ABSOLUTE_VALUE_OF_RANDOM_INT: {
    text: 'Bad attempt to compute absolute value of signed random integer',
    levels: { 1: ERROR },
  },
  RV_REM_OF_HASHCODE: { text: 'Remainder of hashCode could be negative', levels: { 1: NOTE } },
  RV_REM_OF_RANDOM_INT: { text: 'Remainder of 32-bit signed random integer', levels: { 1: NOTE } },
  DM_NEXTINT_VIA_NEXTDOUBLE: {
    text: 'Use the nextInt method of Random rather than nextDouble to generate a random integer',
    levels: { 2: NOTE },
  },
  RV_01_TO_INT: {
    text: 'Random value from 0 to 1 is coerced to the integer 0',
    levels: { 1: ERROR },
  },
  DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE: {
    text: "BigDecimal constructed from double that isn't represented precisely",
    levels: { 2: ERROR },
    placement: SHOWN,
  },
  DMI_LONG_BITS_TO_DOUBLE_INVOKED_ON_INT: {
    text: 'Double.longBitsToDouble invoked on an int',
    levels: { 1: ERROR },
    placement: SHOWN,
  },
  DM_INVALID_MIN_MAX: { text: 'Incorrect combination of Math.max and Math.min', levels: { 1: ERROR } },
};

const INVOCATION_PLACED: Readonly<Record<string, Placed>> = {
  DMI_CONSTANT_DB_PASSWORD: { text: 'Hardcoded constant database password', levels: { 2: ERROR } },
  DMI_EMPTY_DB_PASSWORD: { text: 'Empty database password', levels: { 2: ERROR } },
  DMI_HARDCODED_ABSOLUTE_FILENAME: {
    text: 'Code contains a hard coded reference to an absolute pathname',
    levels: { 1: NOTE, 2: NOTE },
  },
  DMI_USELESS_SUBSTRING: {
    text: 'Invocation of substring(0), which returns the original value',
    levels: { 2: NOTE },
  },
  DMI_MISLEADING_SUBSTRING: {
    text: 'Invocation of substring(0), which returns the same as toString()',
    levels: { 2: NOTE },
  },
};

export const DUMB_PLACED: Readonly<Record<string, Placed>> = {
  SA_LOCAL_SELF_ASSIGNMENT: {
    text: 'Self assignment of local variable',
    levels: { 1: NOTE, 2: NOTE },
  },
  SA_LOCAL_SELF_ASSIGNMENT_INSTEAD_OF_FIELD: {
    text: 'Self assignment of local rather than assignment to field',
    levels: { 1: ERROR, 2: ERROR },
  },
  DMI_COLLECTION_OF_URLS: {
    text: 'Maps and sets of URLs can be performance hogs',
    levels: { 1: NOTE },
    placement: RELATIVE,
  },
  DMI_BLOCKING_METHODS_ON_URL: {
    text: 'The equals and hashCode methods of URL are blocking',
    levels: { 1: NOTE },
    placement: RELATIVE,
  },
  DM_STRING_CTOR: {
    text: 'Method invokes inefficient new String(String) constructor',
    levels: { 2: NOTE },
  },
  DM_STRING_VOID_CTOR: {
    text: 'Method invokes inefficient new String() constructor',
    levels: { 2: NOTE },
  },
  DM_BOOLEAN_CTOR: {
    text: 'Method invokes inefficient Boolean constructor; use Boolean.valueOf(...) instead',
    levels: { 2: NOTE },
  },
  DM_BOXED_PRIMITIVE_FOR_PARSING: {
    text: 'Boxing/unboxing to parse a primitive',
    levels: { 1: NOTE },
    placement: RELATIVE,
  },
  DM_BOXED_PRIMITIVE_TOSTRING: {
    text: 'Method allocates a boxed primitive just to call toString',
    levels: { 1: NOTE, 2: NOTE },
    placement: RELATIVE,
  },
  DM_BOXED_PRIMITIVE_FOR_COMPARE: {
    text: 'Boxing a primitive to compare',
    levels: { 1: NOTE, 2: NOTE },
    placement: RELATIVE,
  },
  DM_NEW_FOR_GETCLASS: {
    text: 'Method allocates an object, only to get the class object',
    levels: { 2: NOTE },
  },
  DM_GC: {
    text: 'Explicit garbage collection; extremely dubious except in benchmarking code',
    levels: { 1: NOTE },
  },
  DM_EXIT: { text: 'Method invokes System.exit(...)', levels: { 2: NOTE } },
  DM_RUN_FINALIZERS_ON_EXIT: {
    text: 'Method invokes dangerous method runFinalizersOnExit',
    levels: { 1: 'warning' },
  },
  DMI_THREAD_PASSED_WHERE_RUNNABLE_EXPECTED: {
    text: 'Thread passed where Runnable expected',
    levels: { 2: NOTE },
    placement: SHOWN,
  },
  DMI_FUTILE_ATTEMPT_TO_CHANGE_MAXPOOL_SIZE_OF_SCHEDULED_THREAD_POOL_EXECUTOR: {
    text: 'Futile attempt to change max pool size of ScheduledThreadPoolExecutor',
    levels: { 1: ERROR },
  },
  DM_MONITOR_WAIT_ON_CONDITION: {
    text: 'Monitor wait() called on Condition',
    levels: { 1: 'warning' },
  },
  ...NUMBER_PLACED,
  ...CALL_PLACED,
  ...INVOCATION_PLACED,
  ...BOUND_PLACED,
};

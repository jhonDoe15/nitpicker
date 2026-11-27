import type { Placed } from './spotbugs-placed.mts';

const ERROR = 'error';
const NOTE = 'note';
const RELATIVE = 'relative';

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
    placement: 'shown',
  },
  DMI_FUTILE_ATTEMPT_TO_CHANGE_MAXPOOL_SIZE_OF_SCHEDULED_THREAD_POOL_EXECUTOR: {
    text: 'Futile attempt to change max pool size of ScheduledThreadPoolExecutor',
    levels: { 1: 'error' },
  },
  DM_MONITOR_WAIT_ON_CONDITION: {
    text: 'Monitor wait() called on Condition',
    levels: { 1: 'warning' },
  },
};

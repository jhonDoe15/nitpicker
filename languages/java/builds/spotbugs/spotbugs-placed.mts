import { CAST_PLACED } from './casts/spotbugs-casts-placed.mts';
import { COOKIE_PLACED } from './cookies/spotbugs-cookies-placed.mts';
import { CRYPTO_PLACED } from './crypto/spotbugs-crypto-placed.mts';
import { DUMB_PLACED } from './spotbugs-dumb-placed.mts';
import { RESOURCE_PLACED } from './resources/spotbugs-resources-placed.mts';
import { TAIL_PLACED } from './tail/spotbugs-tail-placed.mts';
import { TLS_PLACED } from './tls/spotbugs-tls-placed.mts';
import { VALUES_PLACED } from './values/spotbugs-values-placed.mts';

export type Placed = {
  readonly text: string;
  readonly levels: Readonly<Record<number, string>>;
  readonly classNamed?: readonly number[];
  readonly placement?: 'arguments' | 'relative' | 'shown';
  readonly fieldsUnderMethod?: true;
};

const RELATIVE = 'relative';
const NAMED_PLACEMENT: Readonly<Record<NonNullable<Placed['placement']>, boolean>> = {
  arguments: false,
  relative: true,
  shown: true,
};

export function placesByName(placed: Placed): boolean {
  return placed.placement !== undefined && NAMED_PLACEMENT[placed.placement];
}

export function placesByArguments(placed: Placed): boolean {
  return placed.placement === 'arguments';
}

const ERROR = 'error';
const WARNING = 'warning';
const NOTE = 'note';
const INJECTION_LEVELS = { 1: WARNING, 2: WARNING };

export const INJECTIONS: readonly string[] = [
  'PATH_TRAVERSAL_IN',
  'PATH_TRAVERSAL_OUT',
  'SQL_INJECTION_JDBC',
  'SQL_INJECTION_SPRING_JDBC',
  'SQL_INJECTION_JPA',
  'COMMAND_INJECTION',
  'LDAP_INJECTION',
];

export const PLACED: Readonly<Record<string, Placed>> = {
  DCN_NULLPOINTER_EXCEPTION: { text: 'NullPointerException caught', levels: { 2: NOTE } },
  JLM_JSR166_LOCK_MONITORENTER: {
    text: 'Synchronization performed on Lock',
    levels: { 1: ERROR },
    fieldsUnderMethod: true,
  },
  JLM_JSR166_UTILCONCURRENT_MONITORENTER: {
    text: 'Synchronization performed on util.concurrent instance',
    levels: { 2: ERROR },
    fieldsUnderMethod: true,
  },
  NP_ALWAYS_NULL: {
    text: 'Null pointer dereference',
    levels: { 1: ERROR },
    fieldsUnderMethod: true,
  },
  PREDICTABLE_RANDOM: {
    text: 'Predictable pseudorandom number generator',
    levels: { 2: WARNING },
  },
  VO_VOLATILE_INCREMENT: {
    text: "An increment to a volatile field isn't atomic",
    levels: { 2: WARNING },
  },
  AT_STALE_THREAD_WRITE_OF_PRIMITIVE: {
    text: 'This write of this shared primitive variable may not be visible to other threads',
    levels: { 2: WARNING },
  },
  AT_NONATOMIC_64BIT_PRIMITIVE: {
    text: 'This write of this 64-bit primitive variable may not be atomic',
    levels: { 2: WARNING },
  },
  AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE: {
    text: 'Operation on shared variable is not atomic',
    levels: { 2: WARNING },
  },
  AT_OPERATION_SEQUENCE_ON_CONCURRENT_ABSTRACTION: {
    text: 'Sequence of calls to concurrent abstraction may not be atomic',
    levels: { 2: WARNING },
    placement: RELATIVE,
  },
  UG_SYNC_SET_UNSYNC_GET: {
    text: 'Unsynchronized get method, synchronized set method',
    levels: { 2: WARNING },
  },
  WMI_WRONG_MAP_ITERATOR: {
    text: 'Inefficient use of keySet iterator instead of entrySet iterator',
    levels: { 2: NOTE },
  },
  SF_SWITCH_FALLTHROUGH: {
    text: 'Switch statement found where one case falls through to the next case',
    levels: { 2: NOTE },
  },
  SF_SWITCH_NO_DEFAULT: {
    text: 'Switch statement found where default case is missing',
    levels: { 2: NOTE },
  },
  SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR: {
    text: 'Class using singleton design pattern has non-private constructor.',
    levels: { 2: ERROR },
  },
  SING_SINGLETON_IMPLEMENTS_SERIALIZABLE: {
    text: 'Class using singleton design pattern directly or indirectly implements Serializable interface.',
    levels: { 2: ERROR },
  },
  SING_SINGLETON_IMPLEMENTS_CLONEABLE: {
    text: 'Class using singleton design pattern directly implements Cloneable interface.',
    levels: { 2: ERROR },
  },
  SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE: {
    text: 'Class using singleton design pattern indirectly implements Cloneable interface.',
    levels: { 2: ERROR },
  },
  SING_SINGLETON_IMPLEMENTS_CLONE_METHOD: {
    text: 'Class using singleton design pattern implements clone() method without being an unconditional CloneNotSupportedException-thrower.',
    levels: { 2: ERROR },
  },
  SING_SINGLETON_GETTER_NOT_SYNCHRONIZED: {
    text: 'Instance-getter method of class using singleton design pattern is not synchronized.',
    levels: { 2: ERROR },
  },
  CN_IDIOM: {
    text: 'Class implements Cloneable but does not define or use clone method',
    levels: { 2: NOTE },
  },
  CN_IDIOM_NO_SUPER_CALL: {
    text: 'clone method does not call super.clone()',
    levels: { 1: WARNING, 2: NOTE },
    classNamed: [1],
  },
  CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE: {
    text: "Class defines clone() but doesn't implement Cloneable",
    levels: { 1: WARNING, 2: NOTE },
  },
  SE_BAD_FIELD: {
    text: 'Non-transient non-serializable instance field in serializable class',
    levels: { 1: 'warning', 2: 'note' },
  },
  SE_NO_SERIALVERSIONID: {
    text: "Class is Serializable, but doesn't define serialVersionUID",
    levels: { 2: NOTE },
  },
  EQ_DOESNT_OVERRIDE_EQUALS: {
    text: "Class doesn't override equals in superclass",
    levels: { 2: NOTE },
    placement: 'arguments',
  },
  EQ_COMPARETO_USE_OBJECT_EQUALS: {
    text: 'Class defines compareTo(...) and uses Object.equals()',
    levels: { 2: NOTE },
  },
  BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS: {
    text: 'Equals method should not assume anything about the type of its argument',
    levels: { 2: NOTE },
  },
  HSM_HIDING_METHOD: {
    text: 'Method hiding should be avoided.',
    levels: { 2: ERROR },
    placement: RELATIVE,
  },
  NN_NAKED_NOTIFY: { text: 'Naked notify', levels: { 2: WARNING } },
  IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD: {
    text: 'Potentially ambiguous invocation of either an inherited or outer method',
    levels: { 1: NOTE, 2: NOTE },
    classNamed: [1, 2],
  },
  IT_NO_SUCH_ELEMENT: {
    text: 'Iterator next() method cannot throw NoSuchElementException',
    levels: { 2: NOTE },
  },
  DM_DEFAULT_ENCODING: {
    text: 'Reliance on default encoding',
    levels: { 1: NOTE },
    placement: RELATIVE,
  },
  UCF_USELESS_CONTROL_FLOW: { text: 'Useless control flow', levels: { 2: NOTE } },
  UCF_USELESS_CONTROL_FLOW_NEXT_LINE: {
    text: 'Useless control flow to next line',
    levels: { 1: NOTE },
  },
  NP_BOOLEAN_RETURN_NULL: {
    text: 'Method with Boolean return type returns explicit null',
    levels: { 1: WARNING, 2: WARNING },
  },
  NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT: {
    text: 'equals() method does not check for null argument',
    levels: { 1: ERROR, 2: WARNING },
  },
  DLS_DEAD_LOCAL_STORE: { text: 'Dead store to local variable', levels: { 1: NOTE, 2: NOTE } },
  DLS_DEAD_LOCAL_STORE_SHADOWS_FIELD: {
    text: 'Dead store to local variable that shadows field',
    levels: { 1: ERROR, 2: WARNING },
  },
  DLS_DEAD_LOCAL_STORE_OF_NULL: {
    text: 'Dead store of null to local variable',
    levels: { 1: NOTE },
  },
  DLS_DEAD_STORE_OF_CLASS_LITERAL: { text: 'Dead store of class literal', levels: { 2: ERROR } },
  DLS_DEAD_LOCAL_INCREMENT_IN_RETURN: {
    text: 'Useless increment in return statement',
    levels: { 1: ERROR, 2: ERROR },
  },
  IP_PARAMETER_IS_DEAD_BUT_OVERWRITTEN: {
    text: 'A parameter is dead upon entry to a method but overwritten',
    levels: { 1: ERROR, 2: ERROR },
  },
  PA_PUBLIC_PRIMITIVE_ATTRIBUTE: {
    text: 'Primitive field is public',
    levels: { 2: NOTE },
  },
  MS_SHOULD_BE_FINAL: {
    text: "Field isn't final but should be",
    levels: { 1: NOTE, 2: NOTE },
  },
  MS_PKGPROTECT: {
    text: 'Field should be package protected',
    levels: { 2: NOTE },
  },
  SS_SHOULD_BE_STATIC: {
    text: 'Unread field: should this field be static?',
    levels: { 2: NOTE },
  },
  RC_REF_COMPARISON_BAD_PRACTICE_BOOLEAN: {
    text: 'Suspicious reference comparison of Boolean values',
    levels: { 2: NOTE },
    placement: 'shown',
  },
  PATH_TRAVERSAL_IN: { text: 'Potential Path Traversal (file read)', levels: INJECTION_LEVELS },
  PATH_TRAVERSAL_OUT: { text: 'Potential Path Traversal (file write)', levels: INJECTION_LEVELS },
  SQL_INJECTION_JDBC: { text: 'Potential JDBC Injection', levels: INJECTION_LEVELS },
  SQL_INJECTION_SPRING_JDBC: {
    text: 'Potential JDBC Injection (Spring JDBC)',
    levels: INJECTION_LEVELS,
  },
  SQL_INJECTION_JPA: { text: 'Potential SQL/JPQL Injection (JPA)', levels: INJECTION_LEVELS },
  COMMAND_INJECTION: { text: 'Potential Command Injection', levels: INJECTION_LEVELS },
  LDAP_INJECTION: { text: 'Potential LDAP Injection', levels: INJECTION_LEVELS },
  NM_METHOD_NAMING_CONVENTION: {
    text: 'Method names should start with a lower case letter',
    levels: { 2: NOTE },
  },
  NM_FIELD_NAMING_CONVENTION: {
    text: 'Non-final field names should start with a lower case letter, final fields should be uppercase with words separated by underscores',
    levels: { 2: NOTE },
  },
  NM_CLASS_NOT_EXCEPTION: {
    text: 'Class is not derived from an Exception, even though it is named as such',
    levels: { 2: NOTE },
  },
  NM_SAME_SIMPLE_NAME_AS_SUPERCLASS: {
    text: "Class names shouldn't shadow simple name of superclass",
    levels: { 1: WARNING },
  },
  NM_SAME_SIMPLE_NAME_AS_INTERFACE: {
    text: "Class names shouldn't shadow simple name of implemented interface",
    levels: { 2: NOTE },
  },
  DMI_RANDOM_USED_ONLY_ONCE: {
    text: 'Random object created and used only once',
    levels: { 1: WARNING },
    placement: 'relative',
  },
  IC_SUPERCLASS_USES_SUBCLASS_DURING_INITIALIZATION: {
    text: 'Superclass uses subclass during initialization',
    levels: { 1: WARNING, 2: NOTE },
    classNamed: [1, 2],
  },
  URF_UNREAD_FIELD: { text: 'Unread field', levels: { 2: NOTE } },
  URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD: {
    text: 'Unread public/protected field',
    levels: { 2: NOTE },
  },
  RV_RETURN_VALUE_IGNORED_BAD_PRACTICE: {
    text: 'Method ignores exceptional return value',
    levels: { 2: NOTE },
    placement: 'shown',
  },
  RV_RETURN_VALUE_IGNORED_NO_SIDE_EFFECT: {
    text: 'Return value of method without side effect is ignored',
    levels: { 1: NOTE, 2: NOTE },
    placement: 'shown',
  },
  BX_UNBOXING_IMMEDIATELY_REBOXED: {
    text: 'Boxed value is unboxed and then immediately reboxed',
    levels: { 2: NOTE },
    placement: 'shown',
  },
  REC_CATCH_EXCEPTION: {
    text: 'Exception is caught when Exception is not thrown',
    levels: { 1: NOTE, 2: NOTE },
  },
  ...DUMB_PLACED,
  ...RESOURCE_PLACED,
  ...CAST_PLACED,
  ...TAIL_PLACED,
  ...VALUES_PLACED,
  ...CRYPTO_PLACED,
  ...TLS_PLACED,
  ...COOKIE_PLACED,
};

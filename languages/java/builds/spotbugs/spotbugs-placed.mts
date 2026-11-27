export type Placed = {
  readonly text: string;
  readonly levels: Readonly<Record<number, string>>;
  readonly classNamed?: readonly number[];
  readonly placement?: 'arguments' | 'relative' | 'shown';
  readonly fieldsUnderMethod?: true;
};

export function placesByArguments(placed: Placed): boolean {
  return placed.placement === 'arguments';
}

const ERROR = 'error';
const WARNING = 'warning';
const NOTE = 'note';

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
    placement: 'relative',
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
    placement: 'relative',
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
    placement: 'relative',
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
};

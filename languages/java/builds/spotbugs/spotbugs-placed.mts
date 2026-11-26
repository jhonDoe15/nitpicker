export type Placed = {
  readonly text: string;
  readonly levels: Readonly<Record<number, string>>;
  readonly classNamed?: readonly number[];
};

const ERROR = 'error';
const WARNING = 'warning';
const NOTE = 'note';

export const PLACED: Readonly<Record<string, Placed>> = {
  DCN_NULLPOINTER_EXCEPTION: { text: 'NullPointerException caught', levels: { 2: NOTE } },
  JLM_JSR166_LOCK_MONITORENTER: {
    text: 'Synchronization performed on Lock',
    levels: { 1: ERROR },
  },
  JLM_JSR166_UTILCONCURRENT_MONITORENTER: {
    text: 'Synchronization performed on util.concurrent instance',
    levels: { 2: ERROR },
  },
  PREDICTABLE_RANDOM: {
    text: 'Predictable pseudorandom number generator',
    levels: { 2: WARNING },
  },
  VO_VOLATILE_INCREMENT: {
    text: "An increment to a volatile field isn't atomic",
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
};

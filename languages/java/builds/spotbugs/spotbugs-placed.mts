export type Placed = {
  readonly text: string;
  readonly levels: Readonly<Record<number, string>>;
};

export const PLACED: Readonly<Record<string, Placed>> = {
  DCN_NULLPOINTER_EXCEPTION: { text: 'NullPointerException caught', levels: { 2: 'note' } },
  JLM_JSR166_LOCK_MONITORENTER: {
    text: 'Synchronization performed on Lock',
    levels: { 1: 'error' },
  },
  JLM_JSR166_UTILCONCURRENT_MONITORENTER: {
    text: 'Synchronization performed on util.concurrent instance',
    levels: { 2: 'error' },
  },
  PREDICTABLE_RANDOM: {
    text: 'Predictable pseudorandom number generator',
    levels: { 2: 'warning' },
  },
  VO_VOLATILE_INCREMENT: {
    text: "An increment to a volatile field isn't atomic",
    levels: { 2: 'warning' },
  },
  WMI_WRONG_MAP_ITERATOR: {
    text: 'Inefficient use of keySet iterator instead of entrySet iterator',
    levels: { 2: 'note' },
  },
  SF_SWITCH_FALLTHROUGH: {
    text: 'Switch statement found where one case falls through to the next case',
    levels: { 2: 'note' },
  },
  SF_SWITCH_NO_DEFAULT: {
    text: 'Switch statement found where default case is missing',
    levels: { 2: 'note' },
  },
};

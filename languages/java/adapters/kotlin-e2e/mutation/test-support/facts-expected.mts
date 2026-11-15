const SINK = 'demo.Sink';
const FACTS_KT = 'demo.FactsKt';
const MEASURED = 'measured';
const REPEAT_ACTION = 'repeatAction';
const COLLECT = 'collect';
const COROUTINE_SCOPE = 'coroutineScope';

function property(fields: Readonly<Record<string, unknown>>) {
  return {
    constructor: false,
    getter: false,
    setter: false,
    delegated: false,
    ...fields,
  };
}

function declared(fields: Readonly<Record<string, unknown>>) {
  return {
    init: false,
    serializable: false,
    functions: [],
    properties: [],
    ...fields,
  };
}

function written(fields: Readonly<Record<string, unknown>>) {
  return {
    suspend: false,
    inline: false,
    returnsUnit: false,
    inlineCalls: [],
    ...fields,
  };
}

function lambda(fields: Readonly<Record<string, unknown>>) {
  return {
    returnLines: [],
    discarded: false,
    projectCallee: false,
    unitCallee: false,
    ...fields,
  };
}

export const FACTS_EXPECTED = {
  file: 'src/demo/Facts.kt',
  package: 'demo',
  lines: 151,
  classes: [
    declared({
      name: 'demo.Point',
      kind: 'data',
      start: 8,
      headerEnd: 8,
      properties: [
        property({ name: 'x', start: 8, end: 8, constructor: true }),
        property({ name: 'y', start: 8, end: 8, constructor: true }),
      ],
    }),
    declared({
      name: 'demo.Account',
      kind: 'class',
      start: 10,
      headerEnd: 10,
      init: true,
      functions: ['deposit'],
      properties: [
        property({ name: 'label', start: 11, end: 12, getter: true }),
        property({ name: 'tags', start: 14, end: 14, delegated: true }),
        property({ name: 'id', start: 10, end: 10, constructor: true }),
        property({ name: 'balance', start: 10, end: 10, constructor: true }),
      ],
    }),
    declared({
      name: 'demo.Animal',
      kind: 'interface',
      start: 23,
      headerEnd: 23,
      functions: ['sound'],
    }),
    declared({ name: 'demo.Fish', kind: 'class', start: 27, headerEnd: 27 }),
    declared({
      name: 'demo.Meters',
      kind: 'value',
      start: 29,
      headerEnd: 30,
      properties: [property({ name: 'value', start: 30, end: 30, constructor: true })],
    }),
    declared({ name: 'demo.Registry', kind: 'class', start: 47, headerEnd: 47 }),
    declared({
      name: 'demo.Registry$Companion',
      kind: 'object',
      start: 48,
      headerEnd: 48,
      functions: ['create'],
    }),
    declared({
      name: SINK,
      kind: 'class',
      start: 111,
      headerEnd: 111,
      functions: ['original'],
      properties: [property({ name: 'tripled', start: 118, end: 119, getter: true })],
    }),
    declared({
      name: 'demo.Percent',
      kind: 'value',
      init: true,
      start: 122,
      headerEnd: 123,
      properties: [property({ name: 'share', start: 123, end: 123, constructor: true })],
    }),
    declared({
      name: FACTS_KT,
      kind: 'facade',
      start: 0,
      headerEnd: 0,
      functions: [
        'twice',
        'fetch',
        'narrow',
        MEASURED,
        'runMeasured',
        'narrowMany',
        REPEAT_ACTION,
        'report',
        'combine',
        COLLECT,
        'viaCollect',
        'viaTry',
        'viaIf',
        'discarded',
        'word',
        'mixed',
        'statement',
        'either',
      ],
      properties: [property({ name: 'names', start: 45, end: 45 })],
    }),
  ],
  functions: [
    written({ name: 'deposit', class: 'demo.Account', start: 20, end: 20 }),
    written({ name: 'sound', class: 'demo.Animal', start: 24, end: 24 }),
    written({
      name: 'create',
      class: 'demo.Registry$Companion',
      start: 49,
      end: 52,
      staticIn: 'demo.Registry',
    }),
    written({
      name: 'original',
      jvmName: 'renamed',
      class: SINK,
      start: 112,
      end: 116,
      suspend: true,
      returnsUnit: true,
    }),
    written({ name: 'getTripled', class: SINK, start: 119, end: 119, inline: true }),
    written({ name: 'twice', class: FACTS_KT, start: 32, end: 32, inline: true }),
    written({ name: 'fetch', class: FACTS_KT, start: 34, end: 41, suspend: true }),
    written({ name: 'narrow', class: FACTS_KT, start: 43, end: 43 }),
    written({ name: MEASURED, class: FACTS_KT, start: 56, end: 56, inline: true }),
    written({
      name: 'runMeasured',
      class: FACTS_KT,
      start: 58,
      end: 63,
      inlineCalls: [MEASURED],
    }),
    written({ name: 'narrowMany', class: FACTS_KT, start: 65, end: 68 }),
    written({ name: REPEAT_ACTION, class: FACTS_KT, start: 70, end: 72, returnsUnit: true }),
    written({
      name: 'report',
      class: FACTS_KT,
      start: 74,
      end: 78,
      suspend: true,
      returnsUnit: true,
    }),
    written({ name: 'combine', class: FACTS_KT, start: 80, end: 86, suspend: true }),
    written({ name: COLLECT, class: FACTS_KT, start: 88, end: 88, suspend: true }),
    written({ name: 'viaCollect', class: FACTS_KT, start: 90, end: 90, suspend: true }),
    written({ name: 'viaTry', class: FACTS_KT, start: 92, end: 97, suspend: true }),
    written({ name: 'viaIf', class: FACTS_KT, start: 99, end: 104, suspend: true }),
    written({
      name: 'discarded',
      class: FACTS_KT,
      start: 106,
      end: 109,
      suspend: true,
      returnsUnit: true,
    }),
    written({ name: 'word', class: FACTS_KT, start: 127, end: 131 }),
    written({ name: 'mixed', class: FACTS_KT, start: 133, end: 137 }),
    written({
      name: 'statement',
      class: FACTS_KT,
      start: 139,
      end: 144,
      returnsUnit: true,
    }),
    written({ name: 'either', class: FACTS_KT, start: 146, end: 151 }),
  ],
  lambdas: [
    lambda({ start: 14, end: 14, valueLines: [14, 14], callee: 'lazy' }),
    lambda({ start: 36, end: 40, valueLines: [39, 39], callee: COROUTINE_SCOPE }),
    lambda({ start: 37, end: 37, valueLines: [37, 37], callee: 'async' }),
    lambda({ start: 38, end: 38, valueLines: [38, 38], callee: 'launch', discarded: true }),
    lambda({ start: 45, end: 45, valueLines: [45, 45], callee: 'map' }),
    lambda({
      start: 59,
      end: 63,
      valueLines: [60, 62],
      callee: MEASURED,
      projectCallee: true,
    }),
    lambda({
      start: 76,
      end: 76,
      valueLines: [76, 76],
      callee: REPEAT_ACTION,
      discarded: true,
      projectCallee: true,
      unitCallee: true,
    }),
    lambda({
      start: 80,
      end: 86,
      valueLines: [85, 85],
      returnLines: [82],
      callee: COROUTINE_SCOPE,
    }),
    lambda({ start: 81, end: 84, valueLines: [83, 83], returnLines: [82], callee: 'async' }),
    lambda({ start: 90, end: 90, valueLines: [90, 90], callee: COLLECT, projectCallee: true }),
    lambda({ start: 94, end: 94, valueLines: [94, 94], callee: COROUTINE_SCOPE }),
    lambda({ start: 101, end: 101, valueLines: [101, 101], callee: COROUTINE_SCOPE }),
    lambda({
      start: 107,
      end: 107,
      valueLines: [107, 107],
      callee: COROUTINE_SCOPE,
      discarded: true,
    }),
  ],
  branching: [
    17, 20, 43, 45, 51, 52, 59, 60, 61, 62, 67, 71, 82, 100, 128, 129, 130, 134, 135, 136, 140, 141,
    142, 147, 148, 149, 150,
  ],
  casts: [43, 66, 67],
  exhaustiveLastEntries: [130, 150],
};

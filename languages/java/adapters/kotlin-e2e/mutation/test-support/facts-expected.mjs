function property(fields) {
  return {
    constructor: false,
    getter: false,
    setter: false,
    delegated: false,
    ...fields,
  };
}

function declared(fields) {
  return {
    init: false,
    serializable: false,
    functions: [],
    properties: [],
    ...fields,
  };
}

function written(fields) {
  return {
    suspend: false,
    inline: false,
    returnsUnit: false,
    inlineCalls: [],
    ...fields,
  };
}

function lambda(fields) {
  return {
    returnLines: [],
    discarded: false,
    unitCallee: false,
    ...fields,
  };
}

export const FACTS_EXPECTED = {
  file: 'src/demo/Facts.kt',
  package: 'demo',
  lines: 87,
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
      name: 'demo.FactsKt',
      kind: 'facade',
      start: 0,
      headerEnd: 0,
      functions: [
        'twice',
        'fetch',
        'force',
        'measured',
        'runMeasured',
        'strict',
        'repeatAction',
        'report',
        'combine',
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
    written({ name: 'twice', class: 'demo.FactsKt', start: 32, end: 32, inline: true }),
    written({ name: 'fetch', class: 'demo.FactsKt', start: 34, end: 41, suspend: true }),
    written({ name: 'force', class: 'demo.FactsKt', start: 43, end: 43 }),
    written({ name: 'measured', class: 'demo.FactsKt', start: 56, end: 56, inline: true }),
    written({
      name: 'runMeasured',
      class: 'demo.FactsKt',
      start: 58,
      end: 63,
      inlineCalls: ['measured'],
    }),
    written({ name: 'strict', class: 'demo.FactsKt', start: 65, end: 68 }),
    written({ name: 'repeatAction', class: 'demo.FactsKt', start: 70, end: 72, returnsUnit: true }),
    written({
      name: 'report',
      class: 'demo.FactsKt',
      start: 74,
      end: 78,
      suspend: true,
      returnsUnit: true,
    }),
    written({ name: 'combine', class: 'demo.FactsKt', start: 80, end: 86, suspend: true }),
  ],
  lambdas: [
    lambda({ start: 14, end: 14, valueLines: [14, 14], callee: 'lazy' }),
    lambda({ start: 36, end: 40, valueLines: [39, 39], callee: 'coroutineScope' }),
    lambda({ start: 37, end: 37, valueLines: [37, 37], callee: 'async' }),
    lambda({ start: 38, end: 38, valueLines: [38, 38], callee: 'launch', discarded: true }),
    lambda({ start: 45, end: 45, valueLines: [45, 45], callee: 'map' }),
    lambda({ start: 59, end: 63, valueLines: [60, 62], callee: 'measured' }),
    lambda({
      start: 76,
      end: 76,
      valueLines: [76, 76],
      callee: 'repeatAction',
      discarded: true,
      unitCallee: true,
    }),
    lambda({
      start: 80,
      end: 86,
      valueLines: [85, 85],
      returnLines: [82],
      callee: 'coroutineScope',
    }),
    lambda({ start: 81, end: 84, valueLines: [83, 83], returnLines: [82], callee: 'async' }),
  ],
  branching: [17, 20, 43, 45, 51, 52, 59, 60, 61, 62, 67, 71, 82],
  bang: [43, 66, 67],
};

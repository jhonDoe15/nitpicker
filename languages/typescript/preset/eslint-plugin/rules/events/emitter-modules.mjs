function nodeModule(name) {
  return [name, `node:${name}`];
}

function source(modules, { factories = [], constructors = [], servers = [] }) {
  return {
    modules: new Set(modules),
    factories: new Set(factories),
    constructors: new Set(constructors),
    servers: new Set(servers),
  };
}

export const EMITTER_SOURCES = [
  source(nodeModule('fs'), { factories: ['createReadStream', 'createWriteStream'] }),
  source(nodeModule('net'), {
    factories: ['connect', 'createConnection'],
    constructors: ['Socket'],
    servers: ['createServer', 'Server'],
  }),
  source(nodeModule('tls'), {
    factories: ['connect'],
    constructors: ['TLSSocket'],
    servers: ['createServer', 'Server'],
  }),
  source(nodeModule('dgram'), { factories: ['createSocket'] }),
  source([...nodeModule('http'), ...nodeModule('https')], {
    factories: ['request', 'get'],
    constructors: ['ClientRequest'],
  }),
  source(nodeModule('http2'), { factories: ['connect'] }),
  source(nodeModule('child_process'), { factories: ['spawn', 'fork'] }),
  source(nodeModule('zlib'), {
    factories: [
      'createGzip',
      'createGunzip',
      'createDeflate',
      'createInflate',
      'createDeflateRaw',
      'createInflateRaw',
      'createUnzip',
      'createBrotliCompress',
      'createBrotliDecompress',
    ],
  }),
  source(nodeModule('worker_threads'), { constructors: ['Worker'] }),
  source(['redis', '@redis/client'], { factories: ['createClient', 'createCluster'] }),
  source(['pg'], { constructors: ['Client', 'Pool'] }),
  source(['ws'], { constructors: ['WebSocket', 'default'] }),
  source(['imapflow'], { constructors: ['ImapFlow'] }),
];

const EMITTER_TYPES = new Map([
  [
    'node',
    new Set([
      'ReadStream',
      'WriteStream',
      'ClientRequest',
      'ChildProcess',
      'Worker',
      'Socket',
      'Http2Session',
    ]),
  ],
  ['imapflow', new Set(['ImapFlow'])],
  ['pg', new Set(['Client', 'Pool'])],
  ['ws', new Set(['WebSocket'])],
]);

const CONNECTION_EVENTS = new Set(['connection', 'secureConnection']);

const LISTEN_METHODS = new Set([
  'on',
  'once',
  'addListener',
  'prependListener',
  'prependOnceListener',
]);

const CHAINABLE_METHODS = new Set([
  ...LISTEN_METHODS,
  'setEncoding',
  'setTimeout',
  'setKeepAlive',
  'setNoDelay',
  'setMaxListeners',
  'pause',
  'resume',
  'ref',
  'unref',
  'cork',
  'uncork',
]);

const CONSUMING_METHODS = new Set(['toArray', 'forEach', 'reduce', 'some', 'every', 'find']);

function handler(modules, names, { owner, first = false } = {}) {
  return { modules: new Set(modules), names: new Set(names), owner, first };
}

const STREAM_WAITERS = new Set(['pipeline', 'finished']);

export const HANDLING_CALLS = [
  handler([...nodeModule('stream'), ...nodeModule('stream/promises')], [...STREAM_WAITERS]),
  handler(nodeModule('events'), ['once', 'on'], { first: true }),
  handler(nodeModule('stream/consumers'), ['text', 'json', 'buffer', 'arrayBuffer', 'blob'], {
    first: true,
  }),
  handler(['@nestjs/common'], ['StreamableFile'], { first: true }),
];

export const INPUT_READERS = [
  handler([...nodeModule('readline'), ...nodeModule('readline/promises')], ['createInterface']),
];

export const HANDLING_STATICS = [
  handler(nodeModule('events'), ['once', 'on'], { owner: 'EventEmitter', first: true }),
  handler(nodeModule('stream'), [...STREAM_WAITERS], { owner: 'promises' }),
  handler(nodeModule('stream'), ['from', 'toWeb'], { owner: 'Readable', first: true }),
  handler(nodeModule('stream'), ['toWeb'], { owner: 'Duplex', first: true }),
];

const HANDLING_LIBRARIES = new Set(['fastify', '@nestjs/common']);

const HELPER_HANDLING_NAMES = new Set([...STREAM_WAITERS, 'once', 'on']);

export function isEmitterType(module, name) {
  return EMITTER_TYPES.get(module)?.has(name) === true;
}

export function isConnectionEvent(name) {
  return CONNECTION_EVENTS.has(name);
}

export function isListenMethod(name) {
  return LISTEN_METHODS.has(name);
}

export function isChainableMethod(name) {
  return CHAINABLE_METHODS.has(name);
}

export function isConsumingMethod(name) {
  return CONSUMING_METHODS.has(name);
}

export function isStreamWaiter(name) {
  return STREAM_WAITERS.has(name);
}

export function isHandlingLibrary(name) {
  return HANDLING_LIBRARIES.has(name);
}

export function isHelperHandlingName(name) {
  return HELPER_HANDLING_NAMES.has(name);
}

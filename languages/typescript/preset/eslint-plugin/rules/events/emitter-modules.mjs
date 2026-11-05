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
  source(nodeModule('stream'), {
    constructors: ['Readable', 'Writable', 'Duplex', 'Transform', 'PassThrough'],
  }),
  source(nodeModule('worker_threads'), { constructors: ['Worker'] }),
  source(['redis', '@redis/client'], { factories: ['createClient', 'createCluster'] }),
  source(['pg'], { constructors: ['Client', 'Pool'] }),
  source(['ws'], { constructors: ['WebSocket', 'default'] }),
  source(['imapflow'], { constructors: ['ImapFlow'] }),
];

export const EMITTER_TYPES = new Map([
  [
    'node',
    new Set([
      'Readable',
      'Writable',
      'Duplex',
      'Transform',
      'PassThrough',
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

export const CONNECTION_EVENTS = new Set(['connection', 'secureConnection']);

export const LISTEN_METHODS = new Set([
  'on',
  'once',
  'addListener',
  'prependListener',
  'prependOnceListener',
]);

export const CHAINABLE_METHODS = new Set([
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

export const CONSUMING_METHODS = new Set(['toArray', 'forEach', 'reduce', 'some', 'every', 'find']);

function handler(modules, names, owner) {
  return { modules: new Set(modules), names: new Set(names), owner };
}

export const STREAM_WAITERS = new Set(['pipeline', 'finished']);

export const HANDLING_CALLS = [
  handler([...nodeModule('stream'), ...nodeModule('stream/promises')], [...STREAM_WAITERS]),
  handler(nodeModule('events'), ['once', 'on']),
  handler(nodeModule('stream/consumers'), ['text', 'json', 'buffer', 'arrayBuffer', 'blob']),
  handler([...nodeModule('readline'), ...nodeModule('readline/promises')], ['createInterface']),
  handler(['@nestjs/common'], ['StreamableFile']),
];

export const HANDLING_STATICS = [
  handler(nodeModule('events'), ['once', 'on'], 'EventEmitter'),
  handler(nodeModule('stream'), [...STREAM_WAITERS], 'promises'),
];

export const HANDLING_LIBRARIES = new Set(['fastify', '@nestjs/common']);

export const HELPER_HANDLING_NAMES = new Set([...STREAM_WAITERS, 'once', 'on']);

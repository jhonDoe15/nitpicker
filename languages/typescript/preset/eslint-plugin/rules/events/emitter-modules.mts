import { nodeModule } from '../analysis/node/node-sync-modules.mts';

export type EmitterSource = {
  readonly modules: ReadonlySet<string>;
  readonly factories: ReadonlySet<string>;
  readonly constructors: ReadonlySet<string>;
  readonly servers: ReadonlySet<string>;
};
export type Handler = {
  readonly modules: ReadonlySet<string>;
  readonly names: ReadonlySet<string>;
  readonly owner: string | undefined;
  readonly first: boolean;
};
type SourceNames = {
  readonly factories?: readonly string[];
  readonly constructors?: readonly string[];
  readonly servers?: readonly string[];
};
type HandlerOptions = { readonly owner?: string; readonly first?: true };

function source(
  modules: readonly string[],
  { factories = [], constructors = [], servers = [] }: SourceNames,
): EmitterSource {
  return {
    modules: new Set(modules),
    factories: new Set(factories),
    constructors: new Set(constructors),
    servers: new Set(servers),
  };
}

const CONNECT = 'connect';
const STREAM = 'stream';

export const EMITTER_SOURCES: readonly EmitterSource[] = [
  source(nodeModule('fs'), { factories: ['createReadStream', 'createWriteStream'] }),
  source(nodeModule('net'), {
    factories: [CONNECT, 'createConnection'],
    constructors: ['Socket'],
    servers: ['createServer', 'Server'],
  }),
  source(nodeModule('tls'), {
    factories: [CONNECT],
    constructors: ['TLSSocket'],
    servers: ['createServer', 'Server'],
  }),
  source(nodeModule('dgram'), { factories: ['createSocket'] }),
  source([...nodeModule('http'), ...nodeModule('https')], {
    factories: ['request', 'get'],
    constructors: ['ClientRequest'],
  }),
  source(nodeModule('http2'), { factories: [CONNECT] }),
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

const EMITTER_TYPES = new Map<string, ReadonlySet<string>>([
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

const CONNECTION_EVENTS = new Set<string>(['connection', 'secureConnection']);

const LISTEN_METHODS = new Set<string>([
  'on',
  'once',
  'addListener',
  'prependListener',
  'prependOnceListener',
]);

const CHAINABLE_METHODS = new Set<string>([
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

const CONSUMING_METHODS = new Set<string>([
  'toArray',
  'forEach',
  'reduce',
  'some',
  'every',
  'find',
]);

function handler(
  modules: readonly string[],
  names: readonly string[],
  { owner, first }: HandlerOptions = {},
): Handler {
  return { modules: new Set(modules), names: new Set(names), owner, first: first === true };
}

const STREAM_WAITERS = new Set<string>(['pipeline', 'finished']);

export const HANDLING_CALLS: readonly Handler[] = [
  handler([...nodeModule(STREAM), ...nodeModule('stream/promises')], [...STREAM_WAITERS]),
  handler(nodeModule('events'), ['once', 'on'], { first: true }),
  handler(nodeModule('stream/consumers'), ['text', 'json', 'buffer', 'arrayBuffer', 'blob'], {
    first: true,
  }),
  handler(['@nestjs/common'], ['StreamableFile'], { first: true }),
];

export const INPUT_READERS: readonly Handler[] = [
  handler([...nodeModule('readline'), ...nodeModule('readline/promises')], ['createInterface']),
];

export const HANDLING_STATICS: readonly Handler[] = [
  handler(nodeModule('events'), ['once', 'on'], { owner: 'EventEmitter', first: true }),
  handler(nodeModule(STREAM), [...STREAM_WAITERS], { owner: 'promises' }),
  handler(nodeModule(STREAM), ['from', 'toWeb'], { owner: 'Readable', first: true }),
  handler(nodeModule(STREAM), ['toWeb'], { owner: 'Duplex', first: true }),
];

const HANDLING_LIBRARIES = new Set<string>(['fastify', '@nestjs/common']);

const HELPER_HANDLING_NAMES = new Set<string>([...STREAM_WAITERS, 'once', 'on']);

export function isEmitterType(module: string | undefined, name: string): boolean {
  return module !== undefined && EMITTER_TYPES.get(module)?.has(name) === true;
}

export function isConnectionEvent(name: string | undefined): boolean {
  return name !== undefined && CONNECTION_EVENTS.has(name);
}

export function isListenMethod(name: string | undefined): boolean {
  return name !== undefined && LISTEN_METHODS.has(name);
}

export function isChainableMethod(name: string | undefined): boolean {
  return name !== undefined && CHAINABLE_METHODS.has(name);
}

export function isConsumingMethod(name: string | undefined): boolean {
  return name !== undefined && CONSUMING_METHODS.has(name);
}

export function isStreamWaiter(name: string | undefined): boolean {
  return name !== undefined && STREAM_WAITERS.has(name);
}

export function isHandlingLibrary(name: string | undefined): boolean {
  return name !== undefined && HANDLING_LIBRARIES.has(name);
}

export function isHelperHandlingName(name: string | undefined): boolean {
  return name !== undefined && HELPER_HANDLING_NAMES.has(name);
}

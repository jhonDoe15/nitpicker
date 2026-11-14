import { type Server, type Socket, createServer } from 'node:net';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createDirectoryStore,
  createHttpStore,
  createLayeredStore,
  resolveCacheStore,
} from './cache-stores.mts';
import { cacheKey, createFindingsCache } from './findings-cache.mts';
import {
  type TestHttpServer,
  resetTestHttpServer,
  startTestHttpServer,
} from './test-support/test-http-server.mts';
import { fieldOf, listOf, textOf } from '../../../shared/values/readers.mts';
import { linkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

const sharedServers = new Map<string, TestHttpServer>();

async function server(options: { readonly token?: string } = {}): Promise<TestHttpServer> {
  const key = JSON.stringify(options);
  const started = sharedServers.get(key);
  if (started === undefined) {
    throw new Error(`No shared test server for ${key}`);
  }
  await resetTestHttpServer(started.url);
  return started;
}

afterAll(async () => {
  for (const started of sharedServers.values()) {
    await started.close();
  }
  sharedServers.clear();
  for (const cleanup of serverCleanups) await cleanup();
});

function memoryRemote() {
  const objects = new Map<string, string>();
  return {
    objects,
    get: (key: string) => objects.get(key),
    put: (key: string, text: string) => {
      objects.set(key, text);
      return true;
    },
  };
}

function portOf(listening: Server): number {
  const address = listening.address();
  return typeof address === 'object' && address !== null ? address.port : 0;
}

async function closedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => {
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = portOf(probe);
  await new Promise<void>((resolve) =>
    probe.close(() => {
      resolve();
    }),
  );
  return port;
}

async function silentServer(): Promise<string> {
  const sockets: Socket[] = [];
  const silent = createServer((socket) => sockets.push(socket));
  await new Promise<void>((resolve) => {
    silent.listen(0, '127.0.0.1', resolve);
  });
  serverCleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) =>
      silent.close(() => {
        resolve();
      }),
    );
  });
  return `http://127.0.0.1:${String(portOf(silent))}`;
}

function temporaryDirectory(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cache-stores-'));
  cleanups.push(() => {
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

const analyzer = { name: 'a', version: '1', configurationHash: 'h' };
const finding = {
  tool: 'a',
  rule: 'r',
  path: 'x.ts',
  identity: 'i',
  message: 'm',
  classification: 'enforceable',
};
const cacheOptions = { mergeBaseSha: 'abc', projectRelativePath: '.', directory: undefined };

describe('http store', () => {
  it('stores and returns text under <base>/<key>.json, and treats an unknown key as a miss', async () => {
    const remote = await server();
    const store = createHttpStore({ baseUrl: `${remote.url}/cache/` });

    expect(store.get('k1')).toBeUndefined();
    expect(store.put('k1', '{"a":1}\n')).toBe(true);
    expect(store.get('k1')).toBe('{"a":1}\n');
    expect(await remote.keys()).toEqual(['/cache/k1.json']);
  });

  it('sends the configured auth header and misses without it', async () => {
    const remote = await server({ token: 'secret' });
    const authorized = createHttpStore({
      baseUrl: remote.url,
      authHeader: 'Authorization: Bearer secret',
    });
    const anonymous = createHttpStore({ baseUrl: remote.url });

    expect(authorized.put('k', 'v')).toBe(true);
    expect(authorized.get('k')).toBe('v');
    expect(anonymous.get('k')).toBeUndefined();
    expect(anonymous.put('k2', 'v')).toBe(false);
    expect(
      listOf(await remote.requests()).filter(
        (request) => fieldOf(request, 'authorization') !== undefined,
      ),
    ).toHaveLength(2);
  });

  it('degrades to a miss on server errors and stops calling a broken server', async () => {
    const remote = await server();
    await remote.failWith(500);
    const store = createHttpStore({ baseUrl: remote.url });

    expect(store.get('k')).toBeUndefined();
    expect(store.get('k')).toBeUndefined();
    expect(store.put('k', 'v')).toBe(false);
    expect(listOf(await remote.requests())).toHaveLength(1);
  });

  it('degrades to a miss when nothing listens or the server is too slow', () => {
    const unreachable = createHttpStore({
      baseUrl: `http://127.0.0.1:${String(connectionFixtures.closedPort)}`,
      timeoutMs: 500,
    });
    expect(unreachable.get('k')).toBeUndefined();
    expect(unreachable.put('k', 'v')).toBe(false);

    const slow = createHttpStore({ baseUrl: connectionFixtures.silentUrl, timeoutMs: 100 });
    expect(slow.get('k')).toBeUndefined();
    expect(slow.put('k', 'v')).toBe(false);
  });
});

describe('layered store', () => {
  it('prefers local, falls back to remote, and writes remote only when asked', () => {
    const remoteStore = memoryRemote();
    const local = createDirectoryStore(temporaryDirectory());
    remoteStore.put('only-remote', 'r');
    local.put('both', 'local');
    remoteStore.put('both', 'remote');

    const readOnly = createLayeredStore({ local, remote: remoteStore, writeRemote: false });
    expect(readOnly.get('both')).toBe('local');
    expect(readOnly.get('only-remote')).toBe('r');
    expect(local.get('only-remote')).toBeUndefined();
    readOnly.keep?.('only-remote', 'r');
    expect(local.get('only-remote')).toBe('r');

    readOnly.put('written', 'w');
    expect(local.get('written')).toBe('w');
    expect(remoteStore.objects.has('written')).toBe(false);

    createLayeredStore({ local, remote: remoteStore, writeRemote: true }).put('published', 'p');
    expect(remoteStore.objects.get('published')).toBe('p');
  });
});

describe('findings cache over a remote store', () => {
  it('serves a published entry, and keeps it locally', async () => {
    const remote = await server();
    const remoteStore = createHttpStore({ baseUrl: remote.url });
    const publisher = createFindingsCache({ store: remoteStore, ...cacheOptions });
    expect(publisher.write(analyzer, { findings: [finding] })).toBe(true);

    const directory = temporaryDirectory();
    const consumer = createFindingsCache({
      store: createLayeredStore({
        local: createDirectoryStore(directory),
        remote: remoteStore,
        writeRemote: false,
      }),
      ...cacheOptions,
    });
    expect(consumer.read(analyzer)).toEqual({ findings: [finding] });
    expect(readdirSync(directory)).toHaveLength(1);
    const requestsAfterFirstRead = listOf(await remote.requests()).length;
    expect(consumer.read(analyzer)).toEqual({ findings: [finding] });
    expect(listOf(await remote.requests()).length).toBe(requestsAfterFirstRead);
  });

  it('rejects corrupt, schema-invalid and mis-keyed remote entries without keeping them', () => {
    const remoteStore = memoryRemote();
    const key = cacheKey({ ...cacheOptions, analyzer });
    const directory = temporaryDirectory();
    const cache = createFindingsCache({
      store: createLayeredStore({
        local: createDirectoryStore(directory),
        remote: remoteStore,
        writeRemote: false,
      }),
      ...cacheOptions,
    });

    const bodies = [
      '{not json',
      JSON.stringify({ key, findings: [{ tool: 'a' }] }),
      JSON.stringify({ key: 'another-key', findings: [] }),
      JSON.stringify({ findings: [] }),
    ];
    const reads = bodies.map((body) => {
      remoteStore.put(key, body);
      return cache.read(analyzer);
    });
    expect(reads).toEqual(bodies.map(() => undefined));
    expect(readdirSync(directory)).toHaveLength(0);
  });

  it('never throws when the remote store is down', async () => {
    const remote = await server();
    await remote.failWith(503);
    const cache = createFindingsCache({
      store: createLayeredStore({
        local: createDirectoryStore(temporaryDirectory()),
        remote: createHttpStore({ baseUrl: remote.url }),
        writeRemote: true,
      }),
      ...cacheOptions,
    });
    expect(cache.read(analyzer)).toBeUndefined();
    expect(cache.write(analyzer, { findings: [] })).toBe(true);
  });
});

const noCacheWarning =
  'no writable findings cache, so the base side runs on every comparison; ' +
  'set NITPICKER_CACHE_DIR to a writable folder to reuse it.';

describe('resolveCacheStore', () => {
  it('has no store without a directory or a URL, and warns about unusable settings', () => {
    const projectRoot = temporaryDirectory();
    expect(resolveCacheStore({ projectRoot, environment: {} })).toEqual({
      store: undefined,
      remote: undefined,
      warnings: [noCacheWarning],
    });
    const bad = resolveCacheStore({
      projectRoot,
      environment: { NITPICKER_CACHE_URL: 'ftp://example.com' },
    });
    expect(bad.store).toBeUndefined();
    expect(bad.warnings).toEqual([
      `NITPICKER_CACHE_URL ignored: it must be an http(s) URL. ${textOf(linkSentence('staleCache'))}`,
      noCacheWarning,
    ]);
    const header = resolveCacheStore({
      projectRoot,
      environment: {
        NITPICKER_CACHE_URL: 'https://cache.example.com/p',
        NITPICKER_CACHE_AUTH_HEADER: 'nope',
      },
    });
    expect(header.remote).toBeDefined();
    expect(header.warnings).toEqual([
      `NITPICKER_CACHE_AUTH_HEADER ignored: expected "Name: value". ${textOf(linkSentence('staleCache'))}`,
    ]);
  });
});

const serverCleanups: (() => Promise<void>)[] = [];
const connectionFixtures = { closedPort: 0, silentUrl: '' };
beforeAll(async () => {
  for (const options of [{}, { token: 'secret' }]) {
    sharedServers.set(JSON.stringify(options), await startTestHttpServer(options));
  }
  connectionFixtures.closedPort = await closedPort();
  connectionFixtures.silentUrl = await silentServer();
});

import { createServer } from 'node:net';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  createDirectoryStore,
  createHttpStore,
  createLayeredStore,
  resolveCacheStore,
} from './cache-stores.mjs';
import { cacheKey, createFindingsCache } from './findings-cache.mjs';
import { resetTestHttpServer, startTestHttpServer } from './test-http-server.mjs';

const cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

// One server per configuration serves the whole file. Starting a worker thread and its first
// request costs ~200 ms, so each test resets the server instead; the requests under test still
// go through the real HTTP store and its subprocess.
const sharedServers = new Map();

async function server(options = {}) {
  const key = JSON.stringify(options);
  if (!sharedServers.has(key)) {
    sharedServers.set(key, await startTestHttpServer(options));
  }
  const started = sharedServers.get(key);
  await resetTestHttpServer(started.url);
  return started;
}

afterAll(async () => {
  for (const started of sharedServers.values()) {
    await started.close();
  }
  sharedServers.clear();
});

/**
 * A remote store kept in memory. The layered store and the findings cache only see the
 * `get`/`put` contract here; the HTTP transport has its own tests above.
 */
function memoryRemote() {
  const objects = new Map();
  return {
    objects,
    get: (key) => objects.get(key),
    put: (key, text) => {
      objects.set(key, text);
      return true;
    },
  };
}

/** A TCP port that was free a moment ago: nothing listens on it. */
async function closedPort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** Accepts connections and never answers, so every request runs into its timeout. */
async function silentServer() {
  const sockets = [];
  const silent = createServer((socket) => sockets.push(socket));
  await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => silent.close(resolve));
  });
  return `http://127.0.0.1:${String(silent.address().port)}`;
}

function temporaryDirectory() {
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
const cacheOptions = { mergeBaseSha: 'abc', projectRelativePath: '.' };

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
    expect((await remote.requests()).filter(({ authorization }) => authorization)).toHaveLength(2);
  });

  it('degrades to a miss on server errors and stops calling a broken server', async () => {
    const remote = await server();
    await remote.failWith(500);
    const store = createHttpStore({ baseUrl: remote.url });

    expect(store.get('k')).toBeUndefined();
    expect(store.get('k')).toBeUndefined();
    expect(store.put('k', 'v')).toBe(false);
    expect(await remote.requests()).toHaveLength(1);
  });

  it('degrades to a miss when nothing listens or the server is too slow', async () => {
    const unreachable = createHttpStore({
      baseUrl: `http://127.0.0.1:${String(await closedPort())}`,
      timeoutMs: 500,
    });
    expect(unreachable.get('k')).toBeUndefined();
    expect(unreachable.put('k', 'v')).toBe(false);

    const slow = createHttpStore({ baseUrl: await silentServer(), timeoutMs: 100 });
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

    const readOnly = createLayeredStore({ local, remote: remoteStore });
    expect(readOnly.get('both')).toBe('local');
    expect(readOnly.get('only-remote')).toBe('r');
    expect(local.get('only-remote')).toBeUndefined();
    readOnly.keep('only-remote', 'r');
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
      store: createLayeredStore({ local: createDirectoryStore(directory), remote: remoteStore }),
      ...cacheOptions,
    });
    expect(consumer.read(analyzer)).toEqual({ findings: [finding] });
    expect(readdirSync(directory)).toHaveLength(1);
    const requestsAfterFirstRead = (await remote.requests()).length;
    expect(consumer.read(analyzer)).toEqual({ findings: [finding] });
    expect((await remote.requests()).length).toBe(requestsAfterFirstRead);
  });

  it('rejects corrupt, schema-invalid and mis-keyed remote entries without keeping them', () => {
    const remoteStore = memoryRemote();
    const key = cacheKey({ ...cacheOptions, analyzer });
    const directory = temporaryDirectory();
    const cache = createFindingsCache({
      store: createLayeredStore({ local: createDirectoryStore(directory), remote: remoteStore }),
      ...cacheOptions,
    });

    for (const body of [
      '{not json',
      JSON.stringify({ key, findings: [{ tool: 'a' }] }),
      JSON.stringify({ key: 'another-key', findings: [] }),
      JSON.stringify({ findings: [] }),
    ]) {
      remoteStore.put(key, body);
      expect(cache.read(analyzer)).toBeUndefined();
    }
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

describe('resolveCacheStore', () => {
  it('has no store without a directory or a URL, and warns about unusable settings', () => {
    const projectRoot = temporaryDirectory();
    expect(resolveCacheStore({ projectRoot, environment: {} })).toEqual({
      store: undefined,
      remote: undefined,
      warnings: [],
    });
    const bad = resolveCacheStore({
      projectRoot,
      environment: { NITPICKER_CACHE_URL: 'ftp://example.com' },
    });
    expect(bad.store).toBeUndefined();
    expect(bad.warnings).toEqual(['NITPICKER_CACHE_URL ignored: it must be an http(s) URL.']);
    const header = resolveCacheStore({
      projectRoot,
      environment: {
        NITPICKER_CACHE_URL: 'https://cache.example.com/p',
        NITPICKER_CACHE_AUTH_HEADER: 'nope',
      },
    });
    expect(header.remote).toBeDefined();
    expect(header.warnings).toEqual([
      'NITPICKER_CACHE_AUTH_HEADER ignored: expected "Name: value".',
    ]);
  });
});

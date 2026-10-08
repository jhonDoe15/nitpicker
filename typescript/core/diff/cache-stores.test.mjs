import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDirectoryStore,
  createHttpStore,
  createLayeredStore,
  resolveCacheStore,
} from './cache-stores.mjs';
import { cacheKey, createFindingsCache } from './findings-cache.mjs';
import { startTestHttpServer } from './test-http-server.mjs';

const cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

async function server(options) {
  const started = await startTestHttpServer(options);
  cleanups.push(() => started.close());
  return started;
}

function temporaryDirectory() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cache-stores-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
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
    const remote = await server();
    const unreachable = createHttpStore({ baseUrl: remote.url, timeoutMs: 500 });
    remote.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(unreachable.get('k')).toBeUndefined();
    expect(unreachable.put('k', 'v')).toBe(false);
  });
});

describe('layered store', () => {
  it('prefers local, falls back to remote, and writes remote only when asked', async () => {
    const remote = await server();
    const remoteStore = createHttpStore({ baseUrl: remote.url });
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
    expect(await remote.keys()).not.toContain('/written.json');

    createLayeredStore({ local, remote: remoteStore, writeRemote: true }).put('published', 'p');
    expect(await remote.keys()).toContain('/published.json');
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

  it('rejects corrupt, schema-invalid and mis-keyed remote entries without keeping them', async () => {
    const remote = await server();
    const remoteStore = createHttpStore({ baseUrl: remote.url });
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

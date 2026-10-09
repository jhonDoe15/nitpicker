import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A cache store keeps opaque text under a hex key. It is synchronous and never throws:
 * `get` returns undefined on any miss or failure, `put` returns whether the value was stored.
 */

const WORKER = path.join(import.meta.dirname, 'http-cache-worker.mjs');
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;

/**
 * Where findings are cached locally: `NITPICKER_CACHE_DIR` when set, else
 * `node_modules/.cache/nitpicker` of the project when it has a `node_modules` folder.
 */
export function resolveCacheDirectory({ projectRoot, environment = process.env }) {
  const configured = environment.NITPICKER_CACHE_DIR;
  if (typeof configured === 'string' && configured.length > 0) {
    return path.resolve(projectRoot, configured);
  }
  return existsSync(path.join(projectRoot, 'node_modules'))
    ? path.join(projectRoot, 'node_modules/.cache/nitpicker')
    : undefined;
}

export function createDirectoryStore(directory) {
  function fileFor(key) {
    return path.join(directory, `${key}.json`);
  }
  return {
    get(key) {
      try {
        return readFileSync(fileFor(key), 'utf8');
      } catch (error) {
        void error;
        return undefined;
      }
    },
    put(key, text) {
      try {
        mkdirSync(directory, { recursive: true });
        const target = fileFor(key);
        const temporary = `${target}.${String(process.pid)}.tmp`;
        writeFileSync(temporary, text);
        renameSync(temporary, target);
        return true;
      } catch (error) {
        void error;
        return false;
      }
    },
  };
}

/**
 * Plain HTTP store: `GET`/`PUT` of `<baseUrl>/<key>.json`, with an optional auth header
 * (`Name: value`). It works with any object store or CDN that accepts that, including S3 buckets
 * behind a public prefix or a signing proxy. After the first failure (other than a clean miss) the
 * store stays off for the rest of the run, so an unreachable server costs one timeout.
 */
export function createHttpStore({ baseUrl, authHeader, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const root = baseUrl.replace(/\/+$/u, '');
  let broken = false;
  function request(method, key, input) {
    if (broken) {
      return { status: 1 };
    }
    const result = spawnSync(
      process.execPath,
      [WORKER, method, `${root}/${key}.json`, String(timeoutMs)],
      {
        input,
        env: { ...process.env, NITPICKER_CACHE_AUTH_HEADER_VALUE: authHeader ?? '' },
        maxBuffer: MAX_ENTRY_BYTES,
        timeout: timeoutMs + 3000,
      },
    );
    const status = result.error === undefined && result.status !== null ? result.status : 1;
    if (status !== 0 && status !== 3) {
      broken = true;
    }
    return { status, stdout: result.stdout };
  }
  return {
    get(key) {
      const { status, stdout } = request('GET', key);
      return status === 0 ? stdout.toString('utf8') : undefined;
    },
    put(key, text) {
      return request('PUT', key, text).status === 0;
    },
  };
}

/**
 * Reads the local store first, then the remote one (copying a remote hit into the local store).
 * Writes go to the local store, and to the remote store only when `writeRemote` is set.
 */
export function createLayeredStore({ local, remote, writeRemote = false }) {
  return {
    get(key) {
      const localText = local?.get(key);
      if (localText !== undefined) {
        return localText;
      }
      return remote?.get(key);
    },
    /** Called by the cache once an entry from `get` passed validation. */
    keep(key, text) {
      if (local?.get(key) === undefined) {
        local?.put(key, text);
      }
    },
    put(key, text) {
      const stored = local?.put(key, text) ?? false;
      const published = writeRemote && remote !== undefined ? remote.put(key, text) : false;
      return stored || published;
    },
  };
}

/**
 * Builds the store the environment asks for. `NITPICKER_CACHE_URL` adds a remote store behind the
 * local directory (read-only unless `writeRemote`); `NITPICKER_CACHE_AUTH_HEADER` is sent as a
 * header (`Name: value`) and `NITPICKER_CACHE_TIMEOUT_MS` bounds each request. `store` is undefined
 * when neither a directory nor a URL is configured.
 */
export function resolveCacheStore({ projectRoot, environment = process.env, writeRemote = false }) {
  const warnings = [];
  const directory = resolveCacheDirectory({ projectRoot, environment });
  const local = directory === undefined ? undefined : createDirectoryStore(directory);
  let remote;
  const url = environment.NITPICKER_CACHE_URL;
  if (typeof url === 'string' && url.length > 0) {
    if (/^https?:\/\/[^\s/]/u.test(url)) {
      const timeout = Number(environment.NITPICKER_CACHE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
      const header = environment.NITPICKER_CACHE_AUTH_HEADER;
      const validHeader = typeof header === 'string' && header.includes(':');
      if (header && !validHeader) {
        warnings.push('NITPICKER_CACHE_AUTH_HEADER ignored: expected "Name: value".');
      }
      remote = createHttpStore({
        baseUrl: url,
        authHeader: validHeader ? header : undefined,
        timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
      });
    } else {
      warnings.push('NITPICKER_CACHE_URL ignored: it must be an http(s) URL.');
    }
  }
  const store =
    local === undefined && remote === undefined
      ? undefined
      : createLayeredStore({ local, remote, writeRemote });
  return { store, remote, warnings };
}

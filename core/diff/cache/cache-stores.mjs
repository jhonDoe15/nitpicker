import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const WORKER = new URL('./http-cache-worker.mjs', import.meta.url).pathname;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;

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
      } catch {
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
      } catch {
        return false;
      }
    },
  };
}

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

export function createLayeredStore({ local, remote, writeRemote = false }) {
  return {
    get(key) {
      const localText = local?.get(key);
      if (localText !== undefined) {
        return localText;
      }
      return remote?.get(key);
    },
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

export function resolveCacheStore({ projectRoot, environment = process.env, writeRemote = false }) {
  const warnings = [];
  const directory = resolveCacheDirectory({ projectRoot, environment });
  const local = directory === undefined ? undefined : createDirectoryStore(directory);
  const remote = resolveRemoteStore(environment, warnings);
  const store =
    local === undefined && remote === undefined
      ? undefined
      : createLayeredStore({ local, remote, writeRemote });
  return { store, remote, warnings };
}

function resolveRemoteStore(environment, warnings) {
  const url = environment.NITPICKER_CACHE_URL;
  if (typeof url !== 'string' || url.length === 0) return undefined;
  if (!/^https?:\/\/[^\s/]/u.test(url)) {
    warnings.push('NITPICKER_CACHE_URL ignored: it must be an http(s) URL.');
    return undefined;
  }
  const timeout = Number(environment.NITPICKER_CACHE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const header = environment.NITPICKER_CACHE_AUTH_HEADER;
  const validHeader = typeof header === 'string' && header.includes(':');
  if (header && !validHeader)
    warnings.push('NITPICKER_CACHE_AUTH_HEADER ignored: expected "Name: value".');
  return createHttpStore({
    baseUrl: url,
    authHeader: validHeader ? header : undefined,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  });
}

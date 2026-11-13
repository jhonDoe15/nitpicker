import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../shared/messages/troubleshooting.mjs';
import { runGit } from '../git/repository/command.mjs';
import { checkoutModuleUrl } from '../../../shared/paths/checkout-module.mjs';
import { textOf } from '../../../shared/values/readers.mts';

export type CacheStore = {
  readonly get: (key: string) => string | undefined;
  readonly put: (key: string, text: string) => boolean;
  readonly keep?: (key: string, text: string) => void;
  readonly directory?: string | undefined;
};

type Located =
  | { readonly kind: 'writable'; readonly directory: string }
  | { readonly kind: 'unavailable'; readonly error: unknown };

type StoredFile =
  | { readonly kind: 'read'; readonly text: string }
  | { readonly kind: 'unreadable'; readonly error: unknown };

type CacheLocation = {
  readonly projectRoot: string;
  readonly environment?: NodeJS.ProcessEnv | undefined;
};

const gitOutput: (repositoryRoot: string, args: readonly string[]) => string = runGit;

const WORKER = fileURLToPath(
  checkoutModuleUrl(new URL('./http-cache-worker.mjs', import.meta.url)),
);
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const NO_CACHE_WARNING =
  'no writable findings cache, so the base side runs on every comparison; ' +
  'set NITPICKER_CACHE_DIR to a writable folder to reuse it.';

export function resolveCacheDirectory({
  projectRoot,
  environment = process.env,
}: CacheLocation): string | undefined {
  const configured = environment['NITPICKER_CACHE_DIR'];
  if (typeof configured === 'string' && configured.length > 0) {
    return path.resolve(projectRoot, configured);
  }
  return existsSync(path.join(projectRoot, 'node_modules'))
    ? path.join(projectRoot, 'node_modules/.cache/nitpicker')
    : gitCacheDirectory(projectRoot);
}

function gitCacheDirectory(projectRoot: string): string | undefined {
  const located = locateGitCommonDirectory(projectRoot);
  return located.kind === 'writable' ? path.join(located.directory, 'nitpicker/cache') : undefined;
}

function locateGitCommonDirectory(projectRoot: string): Located {
  try {
    const query = ['rev-parse', '--path-format=absolute', '--git-common-dir'];
    const directory = gitOutput(projectRoot, query).trim();
    accessSync(directory, constants.W_OK);
    return { kind: 'writable', directory };
  } catch (error) {
    return { kind: 'unavailable', error };
  }
}

function readStoredFile(file: string): StoredFile {
  try {
    return { kind: 'read', text: readFileSync(file, 'utf8') };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}

function writeStoredFile({
  directory,
  target,
  text,
}: {
  readonly directory: string;
  readonly target: string;
  readonly text: string;
}): { readonly kind: 'written' } | { readonly kind: 'unwritable'; readonly error: unknown } {
  try {
    mkdirSync(directory, { recursive: true });
    const temporary = `${target}.${String(process.pid)}.tmp`;
    writeFileSync(temporary, text);
    renameSync(temporary, target);
    return { kind: 'written' };
  } catch (error) {
    return { kind: 'unwritable', error };
  }
}

export function createDirectoryStore(directory: string): CacheStore {
  function fileFor(key: string): string {
    return path.join(directory, `${key}.json`);
  }
  return {
    get(key: string): string | undefined {
      const result = readStoredFile(fileFor(key));
      return result.kind === 'read' ? result.text : undefined;
    },
    put(key: string, text: string): boolean {
      return writeStoredFile({ directory, target: fileFor(key), text }).kind === 'written';
    },
  };
}

export function createHttpStore({
  baseUrl,
  authHeader,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  readonly baseUrl: string;
  readonly authHeader?: string | undefined;
  readonly timeoutMs?: number;
}): CacheStore {
  const root = baseUrl.replace(/\/+$/u, '');
  let broken = false;
  function request(
    method: string,
    key: string,
    input?: string,
  ): { readonly status: number; readonly stdout?: Buffer } {
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
    get(key: string): string | undefined {
      const { status, stdout } = request('GET', key);
      return status === 0 ? stdout?.toString('utf8') : undefined;
    },
    put(key: string, text: string): boolean {
      return request('PUT', key, text).status === 0;
    },
  };
}

export function createLayeredStore({
  local,
  remote,
  writeRemote,
}: {
  readonly local: CacheStore | undefined;
  readonly remote: CacheStore | undefined;
  readonly writeRemote: boolean;
}): CacheStore {
  return {
    get(key: string): string | undefined {
      const localText = local?.get(key);
      if (localText !== undefined) {
        return localText;
      }
      return remote?.get(key);
    },
    keep(key: string, text: string): void {
      if (local?.get(key) === undefined) {
        local?.put(key, text);
      }
    },
    put(key: string, text: string): boolean {
      const stored = local?.put(key, text) ?? false;
      const published = writeRemote && remote !== undefined ? remote.put(key, text) : false;
      return stored || published;
    },
  };
}

export function resolveCacheStore({
  projectRoot,
  environment,
}: {
  readonly projectRoot: string;
  readonly environment: NodeJS.ProcessEnv;
}): {
  readonly store: CacheStore | undefined;
  readonly remote: CacheStore | undefined;
  readonly warnings: string[];
} {
  const warnings: string[] = [];
  const directory = resolveCacheDirectory({ projectRoot, environment });
  const local = directory === undefined ? undefined : createDirectoryStore(directory);
  const remote = resolveRemoteStore(environment, warnings);
  if (local === undefined && remote === undefined) {
    warnings.push(NO_CACHE_WARNING);
    return { store: undefined, remote, warnings };
  }
  const store = { ...createLayeredStore({ local, remote, writeRemote: false }), directory };
  return { store, remote, warnings };
}

function resolveRemoteStore(
  environment: NodeJS.ProcessEnv,
  warnings: string[],
): CacheStore | undefined {
  const url = environment['NITPICKER_CACHE_URL'];
  if (typeof url !== 'string' || url.length === 0) {
    return undefined;
  }
  if (!/^https?:\/\/[^\s/]/u.test(url)) {
    warnings.push(
      textOf(
        withTroubleshooting(
          'NITPICKER_CACHE_URL ignored: it must be an http(s) URL.',
          TROUBLESHOOTING_ANCHORS.staleCache,
        ),
      ),
    );
    return undefined;
  }
  const timeout = Number(environment['NITPICKER_CACHE_TIMEOUT_MS'] ?? DEFAULT_TIMEOUT_MS);
  const header = environment['NITPICKER_CACHE_AUTH_HEADER'];
  const validHeader = typeof header === 'string' && header.includes(':');
  if (header !== undefined && header !== '' && !validHeader) {
    warnings.push(
      textOf(
        withTroubleshooting(
          'NITPICKER_CACHE_AUTH_HEADER ignored: expected "Name: value".',
          TROUBLESHOOTING_ANCHORS.staleCache,
        ),
      ),
    );
  }
  return createHttpStore({
    baseUrl: url,
    authHeader: validHeader ? header : undefined,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  });
}

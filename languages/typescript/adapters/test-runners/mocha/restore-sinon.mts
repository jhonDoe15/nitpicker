import { readFileSync } from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RESTORE = 'restore';

type Sinon = Record<string, unknown>;
type Sandbox = Record<string, unknown> | undefined;
type State = { sandbox: Sandbox; mark: { fakes: unknown[]; length: number } | undefined };
type Hook = { beforeEach(): void; afterEach(): void };

function isRecord(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function isCallable(value: unknown): value is (...parameters: unknown[]) => unknown {
  return typeof value === 'function';
}

function invoke(owner: unknown, name: string, ...parameters: unknown[]): unknown {
  const method = isRecord(owner) ? owner[name] : undefined;
  return isCallable(method) ? Reflect.apply(method, owner, parameters) : undefined;
}

function errorCode(error: unknown): unknown {
  return isRecord(error) ? error['code'] : undefined;
}

const SINON = 'sinon';
const IMPORT_CONDITIONS = ['import', 'node', 'default'];

function sinonManifest(projectManifest: string): { file?: string | undefined; missing?: unknown } {
  try {
    return { file: findPackageJSON(SINON, pathToFileURL(projectManifest).href) };
  } catch (error) {
    if (errorCode(error) !== 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`Could not look up sinon for ${projectManifest}`, { cause: error });
    }
    return { missing: errorCode(error) };
  }
}

function importEntry(manifestFile: string): string | undefined {
  const manifest: unknown = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const exported = isRecord(manifest) ? manifest['exports'] : undefined;
  const root = (isRecord(exported) ? exported['.'] : undefined) ?? exported;
  const conditions: Record<string, unknown> = isRecord(root) ? root : {};
  const entry = IMPORT_CONDITIONS.map((name) => conditions[name]).find(
    (value): value is string => typeof value === 'string',
  );
  const directory = path.dirname(manifestFile);
  const file = entry === undefined ? undefined : path.resolve(directory, entry);
  return file?.startsWith(`${directory}${path.sep}`) ? file : undefined;
}

async function importedSinon(manifestFile: string): Promise<unknown> {
  const file = importEntry(manifestFile);
  if (file === undefined) {
    return undefined;
  }
  const loaded: unknown = await import(pathToFileURL(file).href);
  return (isRecord(loaded) ? loaded['default'] : undefined) ?? loaded;
}

const REPLACERS = ['replace', 'define', 'replaceGetter', 'replaceSetter'];

function fakesOf(sinon: Sinon): unknown[] {
  const fakes = invoke(sinon, 'getFakes');
  return isCallable(sinon['getFakes']) && Array.isArray(fakes) ? fakes : [];
}

function restoreFakes(fakes: readonly unknown[]): void {
  for (const fake of fakes.toReversed()) {
    if (isRecord(fake) && isCallable(fake[RESTORE])) {
      invoke(fake, RESTORE);
    }
  }
}

function createdSince(mark: State['mark'], fakes: readonly unknown[]): number {
  if (mark === undefined) {
    return fakes.length;
  }
  return mark.fakes === fakes ? mark.length : 0;
}

function replacerFor(
  sinon: Sinon,
  state: State,
  name: string,
): ((...replaced: unknown[]) => unknown) & { usingAccessor?: (...replaced: unknown[]) => unknown } {
  const original = sinon[name];
  function current(): unknown {
    return state.sandbox === undefined ? original : state.sandbox[name];
  }
  function replacer(...replaced: unknown[]): unknown {
    const target = current();
    return isCallable(target) ? Reflect.apply(target, undefined, replaced) : undefined;
  }
  if (isRecord(original) && isCallable(original['usingAccessor'])) {
    replacer.usingAccessor = (...replaced: unknown[]) =>
      invoke(current(), 'usingAccessor', ...replaced);
  }
  return replacer;
}

function sandboxHooks(sinon: Sinon): Hook {
  const state: State = { sandbox: undefined, mark: undefined };
  for (const name of REPLACERS.filter((replacer) => typeof sinon[replacer] === 'function')) {
    sinon[name] = replacerFor(sinon, state, name);
  }
  const restoreDefault = sinon[RESTORE];
  sinon[RESTORE] = () => {
    invoke(state.sandbox, RESTORE);
    if (isCallable(restoreDefault)) {
      restoreDefault();
    }
  };
  return {
    beforeEach() {
      const fakes = fakesOf(sinon);
      state.mark = { fakes, length: fakes.length };
      const sandbox = invoke(sinon, 'createSandbox');
      state.sandbox = isRecord(sandbox) ? sandbox : undefined;
    },
    afterEach() {
      const fakes = fakesOf(sinon);
      restoreFakes(fakes.splice(createdSince(state.mark, fakes)));
      invoke(state.sandbox, RESTORE);
      state.sandbox = undefined;
    },
  };
}

function testDoubleHooks(sandboxes: readonly Sinon[]): Hook {
  const hooks = sandboxes.map(sandboxHooks);
  return {
    beforeEach() {
      for (const hook of hooks) {
        hook.beforeEach();
      }
    },
    afterEach() {
      for (const hook of hooks) {
        hook.afterEach();
      }
    },
  };
}

async function sinonRestoreHooks(projectRoot: string): Promise<Partial<Hook>> {
  const projectManifest = path.join(projectRoot, 'package.json');
  const { file } = sinonManifest(projectManifest);
  if (file === undefined) {
    return {};
  }
  const required: unknown = createRequire(projectManifest)(SINON);
  const instances = new Set([required, await importedSinon(file)]);
  return testDoubleHooks(
    [...instances].filter(
      (sinon): sinon is Sinon => isRecord(sinon) && typeof sinon['createSandbox'] === 'function',
    ),
  );
}

export async function mochaHooks(): Promise<Partial<Hook>> {
  return sinonRestoreHooks(process.cwd());
}

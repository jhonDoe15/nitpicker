import { readFileSync } from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SINON = 'sinon';
const IMPORT_CONDITIONS = ['import', 'node', 'default'];

function sinonManifest(projectManifest) {
  try {
    return { file: findPackageJSON(SINON, pathToFileURL(projectManifest).href) };
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`Could not look up sinon for ${projectManifest}`, { cause: error });
    }
    return { missing: error.code };
  }
}

function importEntry(manifestFile) {
  const { exports: exported } = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const root = exported?.['.'] ?? exported;
  const conditions = typeof root === 'object' && root !== null ? root : {};
  const entry = IMPORT_CONDITIONS.map((name) => conditions[name]).find(
    (value) => typeof value === 'string',
  );
  const directory = path.dirname(manifestFile);
  const file = entry === undefined ? undefined : path.resolve(directory, entry);
  return file?.startsWith(`${directory}${path.sep}`) ? file : undefined;
}

async function importedSinon(manifestFile) {
  const file = importEntry(manifestFile);
  if (file === undefined) {
    return undefined;
  }
  const loaded = await import(pathToFileURL(file).href);
  return loaded.default ?? loaded;
}

const REPLACERS = ['replace', 'define', 'replaceGetter', 'replaceSetter'];

function fakesOf(sinon) {
  return typeof sinon.getFakes === 'function' ? sinon.getFakes() : [];
}

function restoreFakes(fakes) {
  for (const fake of fakes.toReversed()) {
    if (typeof fake?.restore === 'function') {
      fake.restore();
    }
  }
}

function createdSince(mark, fakes) {
  if (mark === undefined) {
    return fakes.length;
  }
  return mark.fakes === fakes ? mark.length : 0;
}

function replacerFor(sinon, state, name) {
  const original = sinon[name];
  function current() {
    return state.sandbox === undefined ? original : state.sandbox[name];
  }
  function replacer(...replaced) {
    return current()(...replaced);
  }
  if (typeof original.usingAccessor === 'function') {
    replacer.usingAccessor = (...replaced) => current().usingAccessor(...replaced);
  }
  return replacer;
}

function sandboxHooks(sinon) {
  const state = { sandbox: undefined, mark: undefined };
  for (const name of REPLACERS.filter((replacer) => typeof sinon[replacer] === 'function')) {
    sinon[name] = replacerFor(sinon, state, name);
  }
  const restoreDefault = sinon.restore;
  sinon.restore = () => {
    state.sandbox?.restore();
    restoreDefault();
  };
  return {
    beforeEach() {
      const fakes = fakesOf(sinon);
      state.mark = { fakes, length: fakes.length };
      state.sandbox = sinon.createSandbox();
    },
    afterEach() {
      const fakes = fakesOf(sinon);
      restoreFakes(fakes.splice(createdSince(state.mark, fakes)));
      state.sandbox?.restore();
      state.sandbox = undefined;
    },
  };
}

function testDoubleHooks(sandboxes) {
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

async function sinonRestoreHooks(projectRoot) {
  const projectManifest = path.join(projectRoot, 'package.json');
  const { file } = sinonManifest(projectManifest);
  if (file === undefined) {
    return {};
  }
  const instances = new Set([createRequire(projectManifest)(SINON), await importedSinon(file)]);
  return testDoubleHooks(
    [...instances].filter((sinon) => typeof sinon?.createSandbox === 'function'),
  );
}

export async function mochaHooks() {
  return sinonRestoreHooks(process.cwd());
}

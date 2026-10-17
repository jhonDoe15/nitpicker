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

async function sinonRestoreHooks(projectRoot) {
  const projectManifest = path.join(projectRoot, 'package.json');
  const { file } = sinonManifest(projectManifest);
  if (file === undefined) {
    return {};
  }
  const instances = new Set([createRequire(projectManifest)(SINON), await importedSinon(file)]);
  const sandboxes = [...instances].filter((sinon) => typeof sinon?.restore === 'function');
  return {
    afterEach() {
      for (const sinon of sandboxes) {
        sinon.restore();
      }
    },
  };
}

export function mochaHooks() {
  return sinonRestoreHooks(process.cwd());
}

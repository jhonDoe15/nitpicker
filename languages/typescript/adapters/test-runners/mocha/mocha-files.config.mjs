import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadMochaClass(script) {
  const entry = createRequire(path.resolve(script)).resolve('mocha');
  const { default: mochaClass } = await import(pathToFileURL(entry).href);
  return mochaClass;
}

export function runEachFileOnce(mochaClass) {
  const { run } = mochaClass.prototype;
  mochaClass.prototype.run = function runOnce(...values) {
    this.files = [...new Set(this.files)];
    return Reflect.apply(run, this, values);
  };
}

async function keepFilesUnique(script) {
  try {
    runEachFileOnce(await loadMochaClass(script));
    return { unique: true };
  } catch (error) {
    return { unavailable: error };
  }
}

export async function mochaHooks() {
  await keepFilesUnique(process.argv[1] ?? '');
  return {};
}

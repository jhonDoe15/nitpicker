import { loadMochaClass, runEachFileOnce } from './mocha-class.mts';

async function keepFilesUnique(script: string) {
  try {
    runEachFileOnce(await loadMochaClass(script));
    return { unique: true };
  } catch (error) {
    return { unavailable: error };
  }
}

export async function mochaHooks(): Promise<object> {
  await keepFilesUnique(process.argv[1] ?? '');
  return {};
}

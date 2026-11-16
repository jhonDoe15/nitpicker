import path from 'node:path';
import type { JsonNull, PythonModule } from '../analysis/typed/python-graph-types.mts';
import type { Resolver } from './typed/facts-types.mts';

const INIT_FILE = '__init__.py';

function stemOf(file: string): string {
  return file.endsWith(`/${INIT_FILE}`) || file === INIT_FILE
    ? path.posix.dirname(file).replace(/^\.$/, '')
    : file.replace(/\.py$/, '');
}

export function createResolver(
  modules: readonly PythonModule[],
  files: readonly string[],
): Resolver {
  const stemToFile = new Map(files.map((file): [string, string] => [stemOf(file), file]));
  const moduleToStem = new Map(
    modules.map(({ file, module }): [string, string] => [module, stemOf(file)]),
  );
  function moduleStem(name: string): string | undefined {
    if (moduleToStem.has(name)) {
      return moduleToStem.get(name);
    }
    const child = [...moduleToStem.keys()].find((module) => module.startsWith(`${name}.`));
    if (child === undefined) {
      return undefined;
    }
    const extra = child.split('.').length - name.split('.').length;
    return moduleToStem.get(child)?.split('/').slice(0, -extra).join('/');
  }
  function baseStem(
    file: string,
    { level, module }: { level: number; module: string | JsonNull },
  ): string | undefined {
    if (level === 0) {
      return module === null ? undefined : moduleStem(module);
    }
    const directory = Array.from({ length: level - 1 }).reduce<string>(
      (current) => path.posix.dirname(current),
      path.posix.dirname(file),
    );
    const prefix = directory === '.' ? '' : directory;
    return module === null ? prefix : [prefix, ...module.split('.')].filter(Boolean).join('/');
  }
  function filesUnder(stem: string): string[] {
    return files.filter((file) => file.startsWith(`${stem}/`));
  }
  return {
    fileOf: (stem) => (stem === undefined ? undefined : stemToFile.get(stem)),
    moduleStem,
    baseStem,
    filesUnder,
  };
}

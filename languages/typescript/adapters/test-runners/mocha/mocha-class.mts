import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type MochaRunner = { files: string[]; run: (...values: unknown[]) => unknown };
type RunnableClass = { readonly prototype: MochaRunner };
type MochaClass = RunnableClass & { readonly Runner: { readonly prototype: object } };

function isMochaClass(value: unknown): value is MochaClass {
  return (
    typeof value === 'function' &&
    typeof Reflect.get(value, 'prototype') === 'object' &&
    typeof Reflect.get(value, 'Runner') === 'function'
  );
}

export async function loadMochaClass(script: string): Promise<MochaClass> {
  const entry = createRequire(path.resolve(script)).resolve('mocha');
  const loaded: unknown = await import(pathToFileURL(entry).href);
  const mochaClass: unknown = Reflect.get(Object(loaded), 'default');
  if (!isMochaClass(mochaClass)) {
    throw new TypeError('mocha does not export a class');
  }
  return mochaClass;
}

export function runEachFileOnce(mochaClass: RunnableClass): void {
  const { run } = mochaClass.prototype;
  Reflect.set(
    mochaClass.prototype,
    'run',
    function runOnce(this: MochaRunner, ...values: unknown[]) {
      this.files = [...new Set(this.files)];
      return Reflect.apply(run, this, values);
    },
  );
}

import type TypeScript from 'typescript';
import { lazyTypeScriptApi as untypedLazyTypeScriptApi } from '../../typescript-api/lazy-typescript-api.mjs';
import { isTypeScriptApi } from '../../adapters/typed/typescript-program.mts';

export function lazyTypeScriptApi(): typeof TypeScript {
  const api: unknown = untypedLazyTypeScriptApi();
  if (!isTypeScriptApi(api)) {
    throw new TypeError('The selected TypeScript API does not load');
  }
  return api;
}

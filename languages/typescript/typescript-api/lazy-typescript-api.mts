import { createRequire } from 'node:module';
import type TypeScript from 'typescript';
import { cachedValue } from '../../../shared/values/caching/cached-value.mts';
import { selectTypeScriptApi } from './api-selection.mts';

const loaded = new Map<'api', typeof TypeScript>();

export function lazyTypeScriptApi(): typeof TypeScript {
  return cachedValue(loaded, 'api', () => {
    const load: (file: string) => typeof TypeScript = createRequire(import.meta.url);
    return load(selectTypeScriptApi().file);
  });
}

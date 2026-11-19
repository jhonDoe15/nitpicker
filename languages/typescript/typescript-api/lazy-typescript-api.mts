import { createRequire } from 'node:module';
import type TypeScript from 'typescript';
import { selectTypeScriptApi } from './api-selection.mts';

export function lazyTypeScriptApi(): typeof TypeScript {
  const load: (file: string) => typeof TypeScript = createRequire(import.meta.url);
  return load(selectTypeScriptApi().file);
}

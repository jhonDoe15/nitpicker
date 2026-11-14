import { createRequire } from 'node:module';
import { selectTypeScriptApi } from './api-selection.mjs';

export function lazyTypeScriptApi() {
  return createRequire(import.meta.url)(selectTypeScriptApi().file);
}

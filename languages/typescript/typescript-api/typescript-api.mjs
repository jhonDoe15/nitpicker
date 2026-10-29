import { createRequire } from 'node:module';
import { typeScriptApi } from './api-selection.mjs';

export const ts = createRequire(import.meta.url)(typeScriptApi().file);

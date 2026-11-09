import { createRequire } from 'node:module';
import { selectTypeScriptApi } from './api-selection.mjs';

export const ts = createRequire(import.meta.url)(selectTypeScriptApi().file);

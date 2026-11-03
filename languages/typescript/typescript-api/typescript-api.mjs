import { createRequire } from 'node:module';
import { TYPESCRIPT_API } from './api-selection.mjs';

export const ts = createRequire(import.meta.url)(TYPESCRIPT_API.file);

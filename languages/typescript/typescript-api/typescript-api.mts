import type TypeScript from 'typescript';
import { lazyTypeScriptApi } from './lazy-typescript-api.mts';

export const ts: typeof TypeScript = lazyTypeScriptApi();

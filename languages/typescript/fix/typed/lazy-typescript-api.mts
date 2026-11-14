import type TypeScript from 'typescript';
import { lazyTypeScriptApi as untypedLazyTypeScriptApi } from '../../typescript-api/lazy-typescript-api.mjs';

export const lazyTypeScriptApi: () => typeof TypeScript = untypedLazyTypeScriptApi;

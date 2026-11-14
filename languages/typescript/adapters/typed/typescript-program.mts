import type TypeScript from 'typescript';
import { ts as untypedTs } from '../../typescript-api/typescript-api.mjs';
import { chainOf as untypedChainOf } from '../../../../shared/traversal.mjs';
import { isTypeScriptApi } from '../../../../shared/values/typescript-guard.mts';

export function typescriptApi(): typeof TypeScript {
  const api: unknown = untypedTs;
  if (!isTypeScriptApi(api)) {
    throw new TypeError('The selected TypeScript API does not load');
  }
  return api;
}

export function parentOf(node: TypeScript.Node): TypeScript.Node | undefined {
  return node.parent;
}

export const chainOf: <T>(start: T, next: (current: T) => T | undefined) => T[] = untypedChainOf;

export { isTypeScriptApi };

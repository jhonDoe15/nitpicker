import type TypeScript from 'typescript';
import { ts as untypedTs } from '../../typescript-api/typescript-api.mts';
import { chainOf } from '../../../../shared/traversal.mts';
import { isTypeScriptApi } from '../../../../shared/values/boundaries/typescript-guard.mts';

export { isTypeScriptApi };

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

export { chainOf };

export function childrenOf(node: TypeScript.Node): TypeScript.Node[] {
  const children: TypeScript.Node[] = [];
  typescriptApi().forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

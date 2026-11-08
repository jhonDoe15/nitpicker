import { findVariable, resolveConstant } from '../../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../security-values.mjs';

export const FETCH_MODULES = ['cross-fetch', 'isomorphic-fetch', 'isomorphic-unfetch'];
export const NODE_FETCH_MODULES = ['node-fetch'];
export const OFETCH_MODULES = ['ofetch'];
export const UNDICI_MODULES = ['undici'];
export const AXIOS_MODULES = ['axios'];
export const GOT_MODULES = ['got'];
export const HTTP_MODULES = ['http', 'node:http', 'https', 'node:https'];
export const HTTP_MODULE_FUNCTIONS = ['request', 'get'];
export const GOT_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'stream'];
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);

export function isGlobalFetch(context, callee) {
  const target = unwrapped(resolveConstant(context, unwrapped(callee)));
  if (target.type === 'MemberExpression') {
    const owner = unwrapped(target.object);
    return (
      owner.type === 'Identifier' &&
      GLOBAL_OBJECTS.has(owner.name) &&
      memberName(target) === 'fetch'
    );
  }
  if (target.type !== 'Identifier' || target.name !== 'fetch') {
    return false;
  }
  return (findVariable(context, target, 'fetch')?.defs.length ?? 0) === 0;
}

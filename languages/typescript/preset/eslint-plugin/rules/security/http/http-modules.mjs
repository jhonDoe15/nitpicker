import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { findVariable, resolveConstant } from "../../analysis/constant-resolution.mjs";
import { memberName, unwrapped } from "../security-values.mjs";
export const FETCH_MODULES = ['cross-fetch', 'isomorphic-fetch', 'isomorphic-unfetch'];
export const NODE_FETCH_MODULES = ['node-fetch'];
export const OFETCH_MODULES = ['ofetch'];
export const UNDICI_MODULES = ['undici'];
export const AXIOS_MODULES = ['axios'];
export const GOT_MODULES = ['got'];
export const HTTP_MODULES = ['http', 'node:http', 'https', 'node:https'];
export const HTTP_MODULE_FUNCTIONS = ['request', 'get'];
export const GOT_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'stream'];
const FETCH = 'fetch';
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);
export function isGlobalFetch(context, callee) {
    const target = unwrapped(resolveConstant(context, unwrapped(callee)));
    if (target?.type === AST_NODE_TYPES.MemberExpression) {
        const owner = unwrapped(target.object);
        return (owner.type === AST_NODE_TYPES.Identifier &&
            GLOBAL_OBJECTS.has(owner.name) &&
            memberName(target) === FETCH);
    }
    if (target?.type !== AST_NODE_TYPES.Identifier || target.name !== FETCH) {
        return false;
    }
    return (findVariable(context, target, FETCH)?.defs.length ?? 0) === 0;
}

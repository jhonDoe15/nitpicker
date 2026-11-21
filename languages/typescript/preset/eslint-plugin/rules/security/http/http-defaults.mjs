import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { findVariable, resolveConstant } from "../../analysis/constant-resolution.mjs";
import { importedFunction } from "../imported-names.mjs";
import { memberName, staticKey, unwrapped } from "../security-values.mjs";
import { configState, isAbsent } from "./http-config.mjs";
const DISPATCHER_TIMEOUTS = new Set([
    'headersTimeout',
    'bodyTimeout',
    'connectTimeout',
]);
const AXIOS_CALL_POSITIONS = new Map([
    ['request', 0],
    ['get', 1],
    ['delete', 1],
    ['head', 1],
    ['options', 1],
    ['post', 2],
    ['put', 2],
    ['patch', 2],
    ['postForm', 2],
    ['putForm', 2],
    ['patchForm', 2],
]);
export function axiosPosition(method) {
    return method === undefined ? undefined : AXIOS_CALL_POSITIONS.get(method);
}
function memberObject(node, name) {
    const target = unwrapped(node);
    return target?.type === AST_NODE_TYPES.MemberExpression && memberName(target) === name
        ? unwrapped(target.object)
        : undefined;
}
export function defaultsTimeoutOwner(context, assignment) {
    const instance = memberObject(memberObject(assignment.left, 'timeout'), 'defaults');
    return instance?.type === AST_NODE_TYPES.Identifier && !isAbsent(context, assignment.right)
        ? instance.name
        : undefined;
}
function hasDispatcherTimeout(context, node) {
    const created = unwrapped(resolveConstant(context, unwrapped(node)));
    const options = created?.type === AST_NODE_TYPES.NewExpression ? unwrapped(created.arguments[0]) : undefined;
    const entries = options?.type === AST_NODE_TYPES.ObjectExpression ? options.properties : [];
    return entries.some((entry) => entry.type === AST_NODE_TYPES.Property &&
        DISPATCHER_TIMEOUTS.has(staticKey(entry)) &&
        !isAbsent(context, entry.value));
}
export function setsGlobalDispatcherTimeout(context, call, undici) {
    return (importedFunction(context, call.callee, undici) === 'setGlobalDispatcher' &&
        hasDispatcherTimeout(context, call.arguments[0]));
}
export function createdInstance(call) {
    const holder = call.parent;
    return holder.type === AST_NODE_TYPES.VariableDeclarator &&
        holder.init === call &&
        holder.id.type === AST_NODE_TYPES.Identifier
        ? holder.id
        : undefined;
}
function timedInstanceCall(context, reference) {
    const member = reference.identifier.parent;
    const call = member.parent;
    if (member.type !== AST_NODE_TYPES.MemberExpression ||
        member.object !== reference.identifier ||
        call?.type !== AST_NODE_TYPES.CallExpression ||
        call.callee !== member) {
        return false;
    }
    const position = axiosPosition(memberName(member));
    return (position !== undefined &&
        ['set', 'unknown'].includes(configState(context, call.arguments[position], ['timeout', 'signal'])));
}
export function everyInstanceCallTimed(context, call) {
    const instance = createdInstance(call);
    const variable = instance === undefined ? undefined : findVariable(context, instance, instance.name);
    const reads = (variable?.references ?? []).filter((reference) => !reference.init);
    return reads.length > 0 && reads.every((reference) => timedInstanceCall(context, reference));
}

import { AST_NODE_TYPES, TSESLint, } from '@typescript-eslint/utils';
import { chainOf, isNode } from "../typed/node-views.mjs";
import { findVariable, resolveConstant, stringValue } from "../analysis/constant-resolution.mjs";
import { TYPE_WRAPPERS, unwrapOf } from "../typed/syntax-views.mjs";
import { declaredMemberValue } from "./member-values.mjs";
import { appendAll } from "../../../../../../shared/lists/lists.mjs";
const MAX_DEPTH = 8;
export const DEPTHS = Array.from({ length: MAX_DEPTH }, (_, index) => index);
const TEXT_PRESERVING_METHODS = new Set(['toLowerCase', 'toUpperCase', 'trim', 'toString']);
export function isLiteral(node, value) {
    return node?.type === AST_NODE_TYPES.Literal && node.value === value;
}
export function isTypeWrapper(node) {
    return node !== undefined && TYPE_WRAPPERS.includes(node.type);
}
export function hasProgram(services) {
    return services?.program !== undefined && services.program !== null;
}
export function typeServices(context) {
    const services = context.sourceCode.parserServices;
    return hasProgram(services) ? services : undefined;
}
export function callName(call) {
    const callee = unwrapped(call.callee);
    if (callee.type === AST_NODE_TYPES.Identifier) {
        return callee.name;
    }
    return callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
}
export function unwrapped(node) {
    return unwrapOf(node, TYPE_WRAPPERS);
}
export function staticKey(property) {
    if (property.type !== AST_NODE_TYPES.Property &&
        property.type !== AST_NODE_TYPES.PropertyDefinition) {
        return undefined;
    }
    if (!property.computed && property.key.type === AST_NODE_TYPES.Identifier) {
        return property.key.name;
    }
    return (stringValue(property.key) ??
        (property.key.type === AST_NODE_TYPES.Literal ? String(property.key.value) : undefined));
}
function isFreeze(node) {
    const callee = node?.type === AST_NODE_TYPES.CallExpression ? node.callee : undefined;
    return (callee?.type === AST_NODE_TYPES.MemberExpression &&
        callee.object.type === AST_NODE_TYPES.Identifier &&
        callee.object.name === 'Object' &&
        memberName(callee) === 'freeze');
}
function constantValue(context, node) {
    return unwrapped(resolveConstant(context, unwrapped(node)));
}
export function resolvedValue(context, node) {
    const start = constantValue(context, node);
    return chainOf(start, (value) => isFreeze(value) ? constantValue(context, value.arguments[0]) : undefined).at(-1);
}
function isProperty(node) {
    return node.type === AST_NODE_TYPES.Property;
}
function objectProperties(context, node) {
    const object = resolvedValue(context, node);
    return object?.type === AST_NODE_TYPES.ObjectExpression ? object.properties : undefined;
}
function expandSpreads(context, entries) {
    return entries.flatMap((entry) => (entry.type === AST_NODE_TYPES.SpreadElement
        ? objectProperties(context, entry.argument)
        : undefined) ?? [entry]);
}
function flattenedProperties(context, node) {
    const initial = objectProperties(context, node) ?? [];
    return DEPTHS.reduce((entries) => expandSpreads(context, entries), initial);
}
export function propertyNamed(context, node, name) {
    const found = flattenedProperties(context, node)
        .filter(isProperty)
        .findLast((entry) => staticKey(entry) === name);
    return found?.value;
}
export function memberName(member) {
    if (!member.computed && member.property.type === AST_NODE_TYPES.Identifier) {
        return member.property.name;
    }
    return member.computed ? stringValue(member.property) : undefined;
}
function writtenValues(context, identifier) {
    const variable = findVariable(context, identifier, identifier.name);
    if (variable === undefined) {
        return [];
    }
    const defaults = variable.defs.flatMap((definition) => {
        const { parent } = definition.name;
        return parent.type === AST_NODE_TYPES.AssignmentPattern ? [parent.right] : [];
    });
    const writes = variable.references
        .filter((reference) => reference.isWrite())
        .map((reference) => reference.writeExpr)
        .filter(isNode);
    return [...new Set([...defaults, ...writes])];
}
function lookupValues(context, object) {
    const resolved = resolvedValue(context, object);
    if (resolved?.type === AST_NODE_TYPES.ArrayExpression) {
        const { elements } = resolved;
        const values = elements.flatMap((element) => element === null || element.type === AST_NODE_TYPES.SpreadElement ? [] : [element]);
        return values.length === elements.length ? values : undefined;
    }
    const entries = resolved?.type === AST_NODE_TYPES.ObjectExpression ? flattenedProperties(context, object) : [];
    const properties = entries.filter(isProperty);
    const plain = entries.length > 0 && properties.length === entries.length;
    return plain ? properties.map((entry) => entry.value) : undefined;
}
function declaredExpansion(context, resolved, name) {
    const declared = declaredMemberValue(context, resolved, name);
    if (declared === undefined) {
        return { leaves: [resolved], next: [] };
    }
    return { leaves: declared.fixed ? [] : [resolved], next: [declared.value] };
}
function memberExpansion(context, resolved) {
    const name = memberName(resolved);
    const target = name === undefined ? undefined : propertyNamed(context, resolved.object, name);
    if (target !== undefined) {
        return { leaves: [], next: [target] };
    }
    const values = resolved.computed && name === undefined ? lookupValues(context, resolved.object) : undefined;
    if (values !== undefined) {
        return { leaves: [], next: values };
    }
    return name === undefined
        ? { leaves: [resolved], next: [] }
        : declaredExpansion(context, resolved, name);
}
function forOfElements(context, identifier) {
    const definition = findVariable(context, identifier, identifier.name)?.defs[0];
    const declaration = definition?.type === TSESLint.Scope.DefinitionType.Variable ? definition.parent : undefined;
    const loop = declaration?.parent;
    const direct = definition?.type === TSESLint.Scope.DefinitionType.Variable &&
        definition.node.id.type === AST_NODE_TYPES.Identifier;
    if (loop?.type !== AST_NODE_TYPES.ForOfStatement ||
        loop.left !== declaration ||
        !direct ||
        declaration.kind !== 'const') {
        return undefined;
    }
    return lookupValues(context, loop.right);
}
function identifierExpansion(context, resolved) {
    const elements = forOfElements(context, resolved);
    return elements === undefined
        ? { leaves: [resolved], next: writtenValues(context, resolved) }
        : { leaves: [], next: elements };
}
function callExpansion(resolved) {
    const { callee } = resolved;
    const preserving = callee.type === AST_NODE_TYPES.MemberExpression &&
        TEXT_PRESERVING_METHODS.has(memberName(callee) ?? '');
    return preserving ? { leaves: [], next: [callee.object] } : { leaves: [resolved], next: [] };
}
function expansionOf(context, resolved) {
    if (resolved.type === AST_NODE_TYPES.ConditionalExpression) {
        return { leaves: [], next: [resolved.consequent, resolved.alternate] };
    }
    if (resolved.type === AST_NODE_TYPES.LogicalExpression) {
        return { leaves: [], next: [resolved.left, resolved.right] };
    }
    if (resolved.type === AST_NODE_TYPES.Identifier) {
        return identifierExpansion(context, resolved);
    }
    if (resolved.type === AST_NODE_TYPES.MemberExpression) {
        return memberExpansion(context, resolved);
    }
    if (resolved.type === AST_NODE_TYPES.CallExpression) {
        return callExpansion(resolved);
    }
    return { leaves: [resolved], next: [] };
}
export function leafValues(context, node) {
    const leaves = [];
    const expanded = new Set();
    const pending = [{ node, depth: 0 }];
    for (const item of pending) {
        const resolved = unwrapped(resolveConstant(context, unwrapped(item.node)));
        if (resolved === undefined || item.depth > MAX_DEPTH || expanded.has(resolved)) {
            continue;
        }
        expanded.add(resolved);
        const expansion = expansionOf(context, resolved);
        appendAll(leaves, expansion.leaves);
        appendAll(pending, expansion.next.map((child) => ({ node: child, depth: item.depth + 1 })));
    }
    return leaves;
}

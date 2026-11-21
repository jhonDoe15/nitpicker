import { AST_NODE_TYPES, TSESLint } from '@typescript-eslint/utils';
import { findVariable, resolveConstant, stringValue } from "../analysis/constant-resolution.mjs";
import { importedCalleeName, moduleBindings } from "../analysis/subprocess-calls.mjs";
import { cachedValue } from "../../../../../../shared/values/caching/cached-value.mjs";
import { chainOf, nameOf } from "../typed/node-views.mjs";
import { DEPTHS, memberName, staticKey, unwrapped } from "./security-values.mjs";
const programBindings = new WeakMap();
const DEFAULT = 'default';
function includes(modules, name) {
    return name !== undefined && modules.has(name);
}
function loadedModuleCall(node) {
    const target = unwrapped(node);
    if (target?.type === AST_NODE_TYPES.ImportExpression) {
        return stringValue(target.source);
    }
    const isRequire = target?.type === AST_NODE_TYPES.CallExpression &&
        target.callee.type === AST_NODE_TYPES.Identifier &&
        target.callee.name === 'require';
    return isRequire ? stringValue(target.arguments[0]) : undefined;
}
function moduleStep(node) {
    const target = unwrapped(node);
    if (target.type === AST_NODE_TYPES.AwaitExpression) {
        return target.argument;
    }
    return target.type === AST_NODE_TYPES.MemberExpression && memberName(target) === DEFAULT
        ? target.object
        : undefined;
}
export function loadedModule(node) {
    return loadedModuleCall(chainOf(node, moduleStep).at(-1));
}
function importEqualsModule(statement) {
    return statement.type === AST_NODE_TYPES.TSImportEqualsDeclaration &&
        statement.moduleReference.type === AST_NODE_TYPES.TSExternalModuleReference
        ? stringValue(statement.moduleReference.expression)
        : undefined;
}
function addPatternBindings(pattern, bindings) {
    for (const property of pattern.properties) {
        const key = staticKey(property);
        if (key !== undefined &&
            property.type === AST_NODE_TYPES.Property &&
            property.value.type === AST_NODE_TYPES.Identifier) {
            bindings.named.set(property.value.name, key);
        }
    }
}
function addDeclaratorBindings(declarator, modules, bindings) {
    if (!includes(modules, loadedModule(declarator.init ?? undefined))) {
        return;
    }
    if (declarator.id.type === AST_NODE_TYPES.Identifier) {
        bindings.namespaces.add(declarator.id.name);
    }
    if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
        addPatternBindings(declarator.id, bindings);
    }
}
function addLoadedBindings(statement, modules, bindings) {
    if (statement.type === AST_NODE_TYPES.TSImportEqualsDeclaration &&
        includes(modules, importEqualsModule(statement))) {
        bindings.namespaces.add(statement.id.name);
    }
    const declarations = statement.type === AST_NODE_TYPES.VariableDeclaration ? statement.declarations : [];
    for (const declarator of declarations) {
        addDeclaratorBindings(declarator, modules, bindings);
    }
}
export function bindingsOf(program, modules) {
    const base = moduleBindings(program, modules);
    const bindings = {
        named: new Map(),
        namespaces: new Set(base.namespaces),
        modules,
    };
    for (const [local, imported] of base.named) {
        if (imported === DEFAULT) {
            bindings.namespaces.add(local);
        }
        else {
            bindings.named.set(local, imported);
        }
    }
    for (const statement of program.body) {
        addLoadedBindings(statement, modules, bindings);
    }
    return bindings;
}
function statementModules(statement) {
    if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
        return statement.importKind === 'type' ? [] : [statement.source.value];
    }
    const declarations = statement.type === AST_NODE_TYPES.VariableDeclaration ? statement.declarations : [];
    return [
        importEqualsModule(statement),
        ...declarations.map(({ init }) => loadedModule(init ?? undefined)),
    ];
}
function collectedBindings(program) {
    const modules = new Set(program.body.flatMap(statementModules));
    const found = new Map();
    for (const module of [...modules].filter((each) => typeof each === 'string')) {
        const bindings = bindingsOf(program, new Set([module]));
        for (const local of bindings.namespaces) {
            found.set(local, { module, name: DEFAULT });
        }
        for (const [local, name] of bindings.named) {
            found.set(local, { module, name });
        }
    }
    return found;
}
export function importedBindings(program) {
    return cachedValue(programBindings, program, collectedBindings);
}
export function isBindCall(node) {
    return (node?.type === AST_NODE_TYPES.CallExpression &&
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        memberName(node.callee) === 'bind');
}
function unaliased(context, node) {
    return unwrapped(resolveConstant(context, unwrapped(node))) ?? node;
}
function aliasTarget(context, callee) {
    const start = unaliased(context, callee);
    return DEPTHS.reduce((current) => (isBindCall(current) ? unaliased(context, current.callee.object) : current), start);
}
export function isModuleValue(context, node, bindings) {
    const target = node === undefined ? undefined : unaliased(context, node);
    if (target?.type === AST_NODE_TYPES.Identifier) {
        return bindings.namespaces.has(target.name);
    }
    return includes(bindings.modules, loadedModule(target));
}
function destructuredName(context, node, bindings) {
    if (node.type !== AST_NODE_TYPES.Identifier) {
        return undefined;
    }
    const definition = findVariable(context, node, node.name)?.defs[0];
    if (definition?.type !== TSESLint.Scope.DefinitionType.Variable) {
        return undefined;
    }
    const { id: pattern, init } = definition.node;
    if (pattern.type !== AST_NODE_TYPES.ObjectPattern ||
        !isModuleValue(context, init ?? undefined, bindings)) {
        return undefined;
    }
    const property = pattern.properties.find((entry) => entry.type === AST_NODE_TYPES.Property &&
        (nameOf(entry.value) === node.name ||
            (entry.value.type === AST_NODE_TYPES.AssignmentPattern &&
                nameOf(entry.value.left) === node.name)));
    return property === undefined ? undefined : staticKey(property);
}
function moduleMemberName(context, target, bindings) {
    const isMember = target.type === AST_NODE_TYPES.MemberExpression && !target.computed;
    return isMember && isModuleValue(context, target.object, bindings)
        ? memberName(target)
        : undefined;
}
export function importedFunction(context, callee, bindings) {
    const target = unwrapped(aliasTarget(context, callee));
    return (importedCalleeName(target, bindings) ??
        destructuredName(context, target, bindings) ??
        moduleMemberName(context, target, bindings));
}

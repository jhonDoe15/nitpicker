import { AST_NODE_TYPES, TSESLint } from '@typescript-eslint/utils';
import { findVariable } from "../analysis/constant-resolution.mjs";
import { ancestorsOf, nameOf } from "../typed/node-views.mjs";
function keyName(key, computed) {
    if (!computed && key?.type === AST_NODE_TYPES.Identifier) {
        return key.name;
    }
    return key?.type === AST_NODE_TYPES.Literal ? String(key.value) : undefined;
}
function enumValue(declaration, name) {
    const { members } = declaration.body;
    const member = members.find((entry) => keyName(entry.id, false) === name);
    return member?.initializer === undefined ? undefined : { fixed: true, value: member.initializer };
}
function fieldValue(classNode, name, isStatic) {
    const field = classNode.body.body
        .filter((element) => element.type === AST_NODE_TYPES.PropertyDefinition)
        .find((element) => element.static === isStatic &&
        element.value !== null &&
        keyName(element.key, element.computed) === name);
    return field === undefined || field.value === null
        ? undefined
        : { fixed: field.readonly, value: field.value };
}
function parameterDefault(classNode, name) {
    const constructor = classNode.body.body
        .filter((element) => element.type === AST_NODE_TYPES.MethodDefinition)
        .find((element) => element.kind === 'constructor');
    const property = constructor?.value.params
        .filter((parameter) => parameter.type === AST_NODE_TYPES.TSParameterProperty)
        .map(({ parameter }) => parameter)
        .filter((parameter) => parameter.type === AST_NODE_TYPES.AssignmentPattern)
        .find((parameter) => nameOf(parameter.left) === name);
    return property === undefined ? undefined : { fixed: false, value: property.right };
}
function isClass(node) {
    return (node?.type === AST_NODE_TYPES.ClassDeclaration || node?.type === AST_NODE_TYPES.ClassExpression);
}
function enclosingClass(node) {
    for (const owner of ancestorsOf(node)) {
        if ((owner.type === AST_NODE_TYPES.FunctionExpression ||
            owner.type === AST_NODE_TYPES.FunctionDeclaration) &&
            owner.parent.type !== AST_NODE_TYPES.MethodDefinition) {
            return undefined;
        }
        if (owner.type === AST_NODE_TYPES.ClassBody) {
            return owner.parent;
        }
    }
    return undefined;
}
function declaredOwner(context, object) {
    const variable = findVariable(context, object, object.name);
    const definition = variable?.defs.find((entry) => entry.type === TSESLint.Scope.DefinitionType.TSEnumName ||
        entry.type === TSESLint.Scope.DefinitionType.ClassName);
    return definition?.node;
}
export function declaredMemberValue(context, member, name) {
    const { object } = member;
    if (object.type === AST_NODE_TYPES.ThisExpression) {
        const owner = enclosingClass(member);
        return isClass(owner)
            ? (fieldValue(owner, name, false) ?? parameterDefault(owner, name))
            : undefined;
    }
    const owner = object.type === AST_NODE_TYPES.Identifier ? declaredOwner(context, object) : undefined;
    if (owner?.type === AST_NODE_TYPES.TSEnumDeclaration) {
        return enumValue(owner, name);
    }
    return isClass(owner) ? fieldValue(owner, name, true) : undefined;
}

import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';

const FUNCTION_TYPES = new Set(['FunctionExpression', 'FunctionDeclaration']);

function keyName(key, computed) {
  if (!computed && key?.type === 'Identifier') {
    return key.name;
  }
  return key?.type === 'Literal' ? String(key.value) : undefined;
}

function enumValue(declaration, name) {
  const members = declaration.body?.members ?? declaration.members ?? [];
  const member = members.find((entry) => keyName(entry.id, false) === name);
  return member?.initializer === undefined ? undefined : { fixed: true, value: member.initializer };
}

function fieldValue(classNode, name, isStatic) {
  const field = classNode.body.body.find(
    (element) =>
      element.type === 'PropertyDefinition' &&
      element.static === isStatic &&
      element.value !== null &&
      keyName(element.key, element.computed) === name,
  );
  return field === undefined ? undefined : { fixed: field.readonly === true, value: field.value };
}

function parameterDefault(classNode, name) {
  const constructor = classNode.body.body.find(
    (element) => element.type === 'MethodDefinition' && element.kind === 'constructor',
  );
  const property = constructor?.value.params.find(
    (parameter) =>
      parameter.type === 'TSParameterProperty' &&
      parameter.parameter.type === 'AssignmentPattern' &&
      parameter.parameter.left.name === name,
  );
  return property === undefined ? undefined : { fixed: false, value: property.parameter.right };
}

function enclosingClass(node) {
  for (const owner of ancestorsOf(node)) {
    if (FUNCTION_TYPES.has(owner.type) && owner.parent?.type !== 'MethodDefinition') {
      return undefined;
    }
    if (owner.type === 'ClassBody') {
      return owner.parent;
    }
  }
  return undefined;
}

function declaredOwner(context, object) {
  const variable = findVariable(context, object, object.name);
  const definition = variable?.defs.find((entry) =>
    ['TSEnumName', 'ClassName'].includes(entry.type),
  );
  return definition?.node;
}

export function declaredMemberValue(context, member, name) {
  const object = member.object;
  if (object.type === 'ThisExpression') {
    const owner = enclosingClass(member);
    return owner === undefined
      ? undefined
      : (fieldValue(owner, name, false) ?? parameterDefault(owner, name));
  }
  const owner = object.type === 'Identifier' ? declaredOwner(context, object) : undefined;
  if (owner?.type === 'TSEnumDeclaration') {
    return enumValue(owner, name);
  }
  return owner === undefined ? undefined : fieldValue(owner, name, true);
}

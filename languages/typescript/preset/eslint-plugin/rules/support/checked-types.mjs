const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);

function typeServices(context) {
  const services = context.sourceCode.parserServices;
  return services?.program ? services : undefined;
}

function comparedType(node, services) {
  const { parent } = node;
  if (parent.type !== 'BinaryExpression' || !EQUALITY_OPERATORS.has(parent.operator)) {
    return undefined;
  }
  return services.getTypeAtLocation(parent.left === node ? parent.right : parent.left);
}

export function hasLiteralUnionType(context, node) {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type =
    comparedType(node, services) ??
    checker.getContextualType(services.esTreeNodeToTSNodeMap.get(node));
  if (type === undefined) {
    return false;
  }
  const defined = checker.getNonNullableType(type);
  const members = defined.isUnion() ? defined.types : [defined];
  return members.every((member) => member.isStringLiteral());
}

export function hasBoundedKeys(context, node) {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  return type.getProperties().length > 0 && checker.getIndexInfosOfType(type).length === 0;
}

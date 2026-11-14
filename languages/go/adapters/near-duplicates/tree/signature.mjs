import {
  NONE,
  at,
  codeChildren,
  expression,
  field,
  fields,
  namedType,
  typeNode,
  typeText,
} from './nodes.mjs';

const PARAMETER_KIND = 'parameter';

function blankName(source) {
  return { ...at('name', source), kind: 'name', binding: 'bound', value: '_', text: '_' };
}

function declaredNames(declaration, context) {
  const names = fields(declaration, 'name');
  return names.length === 0 ? [blankName(declaration)] : names.map((name) => context.get(name));
}

function parameterOf(declaration, name) {
  const type = field(declaration, 'type');
  if (declaration.type === 'variadic_parameter_declaration') {
    const spread = namedType(`...${typeText(type)}`, type);
    return at(PARAMETER_KIND, declaration, [spread, expression('rest', declaration, [name])]);
  }
  return at(PARAMETER_KIND, declaration, [typeNode(type), name]);
}

function listParameters(list, context) {
  return codeChildren(list).flatMap((declaration) =>
    declaredNames(declaration, context).map((name) => parameterOf(declaration, name)),
  );
}

export function parametersOf(source, context) {
  const receiver = field(source, 'receiver');
  const list = field(source, 'parameters');
  return at('parameters', list ?? source, [
    ...(receiver === undefined ? [] : listParameters(receiver, context)),
    ...(list === undefined ? [] : listParameters(list, context)),
  ]);
}

export function resultOf(source) {
  const result = field(source, 'result');
  if (result === undefined) {
    return NONE;
  }
  if (result.type !== 'parameter_list') {
    return typeNode(result);
  }
  const types = codeChildren(result).flatMap((declaration) => {
    const count = Math.max(fields(declaration, 'name').length, 1);
    return Array.from({ length: count }, () => typeText(field(declaration, 'type')));
  });
  return namedType(types.join(','), result);
}

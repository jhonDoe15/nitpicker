import { memberName, unwrapped } from '../../security/security-values.mjs';

function returnedValue(callback) {
  const { body } = callback;
  const single =
    body.type === 'BlockStatement' && body.body.length === 1 ? body.body[0] : undefined;
  const value = single?.type === 'ReturnStatement' ? single.argument : body;
  return value === null || value === undefined || value.type === 'BlockStatement'
    ? undefined
    : unwrapped(value);
}

export function soleField(callback) {
  const [param] = callback.params;
  const value = returnedValue(callback);
  if (param?.type === 'Identifier') {
    const member = value?.type === 'MemberExpression' && !value.computed ? value : undefined;
    return member !== undefined && unwrapped(member.object).name === param.name
      ? memberName(member)
      : undefined;
  }
  const [only, ...rest] = param?.type === 'ObjectPattern' ? param.properties : [];
  const bound = only?.type === 'Property' && only.value.type === 'Identifier' && !only.computed;
  return rest.length === 0 &&
    bound &&
    value?.type === 'Identifier' &&
    value.name === only.value.name
    ? only.key.name
    : undefined;
}

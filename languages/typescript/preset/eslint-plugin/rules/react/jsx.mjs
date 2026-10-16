export const fieldElements = new Set(['input', 'textarea', 'select']);
export const buttonLikeInputTypes = new Set(['button', 'hidden', 'image', 'reset', 'submit']);
export const fixedValueInputTypes = new Set([...buttonLikeInputTypes, 'checkbox', 'radio']);

export function elementName(opening) {
  return opening.name.type === 'JSXIdentifier' ? opening.name.name : undefined;
}

export function attributeNamed(opening, name) {
  return opening.attributes.find(
    (attribute) =>
      attribute.type === 'JSXAttribute' &&
      attribute.name.type === 'JSXIdentifier' &&
      attribute.name.name === name,
  );
}

export function hasSpread(opening) {
  return opening.attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute');
}

export function literalValueOf(attribute) {
  const value = attribute?.value;
  if (value?.type === 'Literal') {
    return value.value;
  }
  const expression = value?.type === 'JSXExpressionContainer' ? value.expression : undefined;
  return expression?.type === 'Literal' ? expression.value : undefined;
}

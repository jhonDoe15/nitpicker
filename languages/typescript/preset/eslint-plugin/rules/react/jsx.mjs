import { ancestorsOf } from '../analysis/ancestry.mjs';

const fieldElements = new Set(['input', 'textarea', 'select']);
const buttonLikeInputTypes = new Set(['button', 'hidden', 'image', 'reset', 'submit']);
const fixedValueInputTypes = new Set([...buttonLikeInputTypes, 'checkbox', 'radio']);

export function isFieldElement(name) {
  return fieldElements.has(name);
}

export function isButtonLikeInputType(type) {
  return buttonLikeInputTypes.has(type);
}

export function isFixedValueInputType(type) {
  return fixedValueInputTypes.has(type);
}

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

export function inKeyAttribute(node) {
  const owner = ancestorsOf(node).find(({ type }) => type === 'JSXAttribute');
  return owner !== undefined && attributeNamed(owner.parent, 'key') === owner;
}

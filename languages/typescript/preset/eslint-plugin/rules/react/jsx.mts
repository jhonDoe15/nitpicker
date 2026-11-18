import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../typed/node-views.mts';

const fieldElements = new Set<string | undefined>(['input', 'textarea', 'select']);
const buttonLikeInputTypes = new Set<unknown>(['button', 'hidden', 'image', 'reset', 'submit']);
const fixedValueInputTypes = new Set<unknown>([...buttonLikeInputTypes, 'checkbox', 'radio']);

export function isFieldElement(name: string | undefined): boolean {
  return fieldElements.has(name);
}

export function isButtonLikeInputType(type: unknown): boolean {
  return buttonLikeInputTypes.has(type);
}

export function isFixedValueInputType(type: unknown): boolean {
  return fixedValueInputTypes.has(type);
}

export function elementName(opening: TSESTree.JSXOpeningElement): string | undefined {
  return opening.name.type === AST_NODE_TYPES.JSXIdentifier ? opening.name.name : undefined;
}

export function attributeNamed(
  opening: TSESTree.JSXOpeningElement,
  name: string,
): TSESTree.JSXAttribute | undefined {
  return opening.attributes.find(
    (attribute): attribute is TSESTree.JSXAttribute =>
      attribute.type === AST_NODE_TYPES.JSXAttribute &&
      attribute.name.type === AST_NODE_TYPES.JSXIdentifier &&
      attribute.name.name === name,
  );
}

export function hasSpread(opening: TSESTree.JSXOpeningElement): boolean {
  return opening.attributes.some(
    (attribute) => attribute.type === AST_NODE_TYPES.JSXSpreadAttribute,
  );
}

export function literalValueOf(
  attribute: TSESTree.JSXAttribute | undefined,
): TSESTree.Literal['value'] | undefined {
  const value = attribute?.value;
  if (value?.type === AST_NODE_TYPES.Literal) {
    return value.value;
  }
  const expression =
    value?.type === AST_NODE_TYPES.JSXExpressionContainer ? value.expression : undefined;
  return expression?.type === AST_NODE_TYPES.Literal ? expression.value : undefined;
}

export function inKeyAttribute(node: TSESTree.Node): boolean {
  const owner = ancestorsOf(node).find(
    (ancestor): ancestor is TSESTree.JSXAttribute => ancestor.type === AST_NODE_TYPES.JSXAttribute,
  );
  return owner !== undefined && attributeNamed(owner.parent, 'key') === owner;
}

import {
  attributeNamed,
  elementName,
  isFieldElement,
  isFixedValueInputType,
  hasSpread,
  literalValueOf,
} from '../jsx.mjs';

const changeAttributes = ['onChange', 'readOnly', 'disabled'];

function valueNeedsHandler(opening) {
  const isInput = elementName(opening) === 'input';
  const type = literalValueOf(attributeNamed(opening, 'type'));
  return (
    attributeNamed(opening, 'value') !== undefined && !(isInput && isFixedValueInputType(type))
  );
}

function checkedNeedsHandler(opening) {
  return elementName(opening) === 'input' && attributeNamed(opening, 'checked') !== undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow form fields that are both controlled and uncontrolled, or read-only by accident',
    },
    schema: [],
    messages: {
      bothValues:
        'Pass either `value` (controlled, with `onChange`) or `defaultValue` (uncontrolled), not both. An exception fits only when a form library needs both on this field.',
      noHandler:
        'A field with `value` or `checked` and no `onChange` cannot be edited. Add `onChange`, use `defaultValue`, or mark it `readOnly`. An exception fits only when a form library handles the change events.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (!isFieldElement(elementName(node)) || hasSpread(node)) {
          return;
        }
        if (
          attributeNamed(node, 'value') !== undefined &&
          attributeNamed(node, 'defaultValue') !== undefined
        ) {
          context.report({ node, messageId: 'bothValues' });
        } else if (
          (valueNeedsHandler(node) || checkedNeedsHandler(node)) &&
          changeAttributes.every((name) => attributeNamed(node, name) === undefined)
        ) {
          context.report({ node, messageId: 'noHandler' });
        }
      },
    };
  },
};

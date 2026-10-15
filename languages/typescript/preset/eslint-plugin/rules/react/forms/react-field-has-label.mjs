import { ancestorsOf } from '../../ancestry.mjs';
import { attributeNamed, elementName, hasSpread, literalValueOf } from '../jsx.mjs';

const fields = new Set(['input', 'textarea', 'select']);
const buttonLikeTypes = new Set(['hidden', 'submit', 'reset', 'button', 'image']);
const labellingAttributes = ['aria-label', 'aria-labelledby', 'id'];

function isButtonLike(opening) {
  return (
    elementName(opening) === 'input' &&
    buttonLikeTypes.has(literalValueOf(attributeNamed(opening, 'type')))
  );
}

function isInsideLabel(opening) {
  return ancestorsOf(opening).some(
    (ancestor) =>
      ancestor.type === 'JSXElement' && elementName(ancestor.openingElement) === 'label',
  );
}

function isLabelled(opening) {
  return (
    hasSpread(opening) ||
    isButtonLike(opening) ||
    labellingAttributes.some((name) => attributeNamed(opening, name) !== undefined) ||
    isInsideLabel(opening)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a label for form fields',
    },
    schema: [],
    messages: {
      unlabelled:
        'Label this field: wrap it in `<label>`, give it an `id` that a `<label htmlFor>` points to, or set `aria-label`. If a wrapper labels it elsewhere, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (fields.has(elementName(node)) && !isLabelled(node)) {
          context.report({ node, messageId: 'unlabelled' });
        }
      },
    };
  },
};

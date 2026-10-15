import { ancestorsOf } from '../../ancestry.mjs';
import { attributeNamed, elementName, hasSpread, literalValueOf } from '../jsx.mjs';

const fields = new Set(['input', 'textarea', 'select']);
const buttonLikeTypes = new Set(['hidden', 'submit', 'reset', 'button', 'image']);
const ariaLabels = ['aria-label', 'aria-labelledby'];

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

function idPointedTo(opening, labelTargets) {
  const id = attributeNamed(opening, 'id');
  if (id === undefined) {
    return false;
  }
  const value = literalValueOf(id);
  return typeof value !== 'string' || labelTargets.dynamic || labelTargets.ids.has(value);
}

function isLabelled(opening, labelTargets) {
  return (
    hasSpread(opening) ||
    isButtonLike(opening) ||
    ariaLabels.some((name) => attributeNamed(opening, name) !== undefined) ||
    idPointedTo(opening, labelTargets) ||
    isInsideLabel(opening)
  );
}

function recordLabelTarget(opening, labelTargets) {
  const htmlFor = attributeNamed(opening, 'htmlFor');
  if (htmlFor === undefined) {
    return;
  }
  const value = literalValueOf(htmlFor);
  if (typeof value === 'string') {
    labelTargets.ids.add(value);
  } else {
    labelTargets.dynamic = true;
  }
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
    const fieldsToCheck = [];
    const labelTargets = { ids: new Set(), dynamic: false };
    return {
      JSXOpeningElement(node) {
        if (elementName(node) === 'label') {
          recordLabelTarget(node, labelTargets);
        } else if (fields.has(elementName(node))) {
          fieldsToCheck.push(node);
        }
      },
      'Program:exit'() {
        for (const node of fieldsToCheck.filter((field) => !isLabelled(field, labelTargets))) {
          context.report({ node, messageId: 'unlabelled' });
        }
      },
    };
  },
};

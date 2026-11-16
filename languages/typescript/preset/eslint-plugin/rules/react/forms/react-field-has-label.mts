import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../../typed/node-views.mts';
import {
  attributeNamed,
  isButtonLikeInputType,
  elementName,
  isFieldElement,
  hasSpread,
  literalValueOf,
} from '../jsx.mts';

type LabelTargets = { readonly ids: Set<string>; dynamic: boolean };

const ariaLabels = ['aria-label', 'aria-labelledby'];

function isButtonLike(opening: TSESTree.JSXOpeningElement): boolean {
  return (
    elementName(opening) === 'input' &&
    isButtonLikeInputType(literalValueOf(attributeNamed(opening, 'type')))
  );
}

const labelComponent = /^[A-Z]\w*Label$|^Label$/u;

function isLabelElement(opening: TSESTree.JSXOpeningElement): boolean {
  const { name } = opening;
  const lastName =
    name.type === AST_NODE_TYPES.JSXMemberExpression ? name.property.name : elementName(opening);
  return lastName === 'label' || (lastName !== undefined && labelComponent.test(lastName));
}

function isInsideLabel(opening: TSESTree.JSXOpeningElement): boolean {
  return ancestorsOf(opening).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.JSXElement && isLabelElement(ancestor.openingElement),
  );
}

function idPointedTo(opening: TSESTree.JSXOpeningElement, labelTargets: LabelTargets): boolean {
  const id = attributeNamed(opening, 'id');
  if (id === undefined) {
    return false;
  }
  const value = literalValueOf(id);
  return typeof value !== 'string' || labelTargets.dynamic || labelTargets.ids.has(value);
}

function isLabelled(opening: TSESTree.JSXOpeningElement, labelTargets: LabelTargets): boolean {
  return (
    hasSpread(opening) ||
    isButtonLike(opening) ||
    ariaLabels.some((name) => attributeNamed(opening, name) !== undefined) ||
    idPointedTo(opening, labelTargets) ||
    isInsideLabel(opening)
  );
}

function recordLabelTarget(opening: TSESTree.JSXOpeningElement, labelTargets: LabelTargets): void {
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

export const rule: TSESLint.RuleModule<'unlabelled'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a label for form fields',
    },
    schema: [],
    messages: {
      unlabelled:
        'Label this field: wrap it in `<label>`, give it an `id` that a `<label htmlFor>` points to, or set `aria-label`. An exception fits only when a wrapper labels it elsewhere.',
    },
  },
  create(context) {
    const fieldsToCheck: TSESTree.JSXOpeningElement[] = [];
    const labelTargets: LabelTargets = { ids: new Set(), dynamic: false };
    return {
      JSXOpeningElement(node: TSESTree.JSXOpeningElement) {
        recordLabelTarget(node, labelTargets);
        if (isFieldElement(elementName(node))) {
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

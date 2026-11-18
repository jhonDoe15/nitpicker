import { type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { typeServices, unwrapped } from '../../security/security-values.mts';
import {
  fragmentOf,
  isDiagnosticText,
  isFragmentTop,
  isMarkup,
  isPlacedInMarkup,
} from './html-parts.mts';
import { isSafeValue, type TypeOf } from './safe-values.mts';

type Context = TSESLint.RuleContext<'unescapedValue', readonly unknown[]>;

function check(
  context: Context,
  typeOf: TypeOf,
  node: TSESTree.TemplateLiteral | TSESTree.BinaryExpression,
) {
  const fragment = fragmentOf(node);
  if (
    fragment === undefined ||
    !isFragmentTop(node) ||
    !isMarkup(fragment.texts) ||
    isDiagnosticText(node)
  ) {
    return;
  }
  for (const value of fragment.values) {
    if (isPlacedInMarkup(fragment, value) && !isSafeValue(context, typeOf, value)) {
      context.report({
        node: value,
        messageId: 'unescapedValue',
        data: { value: context.sourceCode.getText(unwrapped(value)) },
      });
    }
  }
}

export const rule: TSESLint.RuleModule<'unescapedValue', []> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow interpolating an unescaped value into an HTML string',
    },
    schema: [],
    messages: {
      unescapedValue:
        'Escape `{{ value }}` before it goes into this HTML string: a quote, `<` or `&` in it breaks the markup or injects script. Wrap it in an escaping helper (`escapeHtml({{ value }})`), build the markup with a template engine that escapes by default, or set it with DOM APIs (`textContent`, `setAttribute`). A value that is always an id or an enum can take an exception.',
    },
  },
  create(context) {
    const services = typeServices(context);
    const typeOf: TypeOf =
      services === undefined ? undefined : (node) => services.getTypeAtLocation(node);
    return {
      TemplateLiteral(node) {
        check(context, typeOf, node);
      },
      BinaryExpression(node) {
        check(context, typeOf, node);
      },
    };
  },
};

import { variableNamed } from '../analysis/ancestry.mjs';

const approaches = {
  'class-names': {
    allowed: '`className` with CSS Modules or utility classes',
    banned: { inlineStyle: true, cssInJs: true },
  },
  'css-in-js': {
    allowed: 'styled components (styled-components or Emotion)',
    banned: { inlineStyle: true, stylesheet: true },
  },
  'inline-style': {
    allowed: 'inline `style` objects',
    banned: { stylesheet: true, cssInJs: true },
  },
};

export const stylingApproaches = Object.keys(approaches);

const customPropertyExample = "style={{ '--progress': percent }}";
const customPropertyTyping =
  "declare module 'csstype' { interface Properties { '--progress'?: number } }";

const found = {
  inlineStyle: 'an inline `style` object',
  stylesheet: 'a stylesheet import',
  cssInJs: 'a CSS-in-JS library',
};

const stylesheetSource = /\.(?:css|scss|sass|less|styl|pcss)$/u;
export const cssInJsSource =
  /^(?:styled-components$|@emotion\/|@stitches\/react$|goober$|@linaria\/)/u;

function isCustomPropertyProperty(property) {
  return (
    property.type === 'Property' &&
    property.key.type === 'Literal' &&
    typeof property.key.value === 'string' &&
    property.key.value.startsWith('--')
  );
}

const wrappedExpressionTypes = new Set([
  'TSSatisfiesExpression',
  'TSAsExpression',
  'TSNonNullExpression',
]);

function initializersOf(sourceCode, identifier) {
  const definitions = variableNamed(sourceCode, identifier)?.defs ?? [];
  const [definition] = definitions;
  const declarator = definition?.node;
  return definitions.length === 1 &&
    declarator.type === 'VariableDeclarator' &&
    declarator.id.type === 'Identifier' &&
    declarator.init
    ? [declarator.init]
    : [];
}

function innerExpressions(sourceCode, expression) {
  if (wrappedExpressionTypes.has(expression.type)) {
    return [expression.expression];
  }
  if (expression.type === 'ConditionalExpression') {
    return [expression.consequent, expression.alternate];
  }
  if (expression.type === 'LogicalExpression') {
    return [expression.left, expression.right];
  }
  return expression.type === 'Identifier' ? initializersOf(sourceCode, expression) : [];
}

function objectLiteralsIn(sourceCode, start) {
  const pending = [start];
  const seen = new Set();
  const objects = [];
  for (const expression of pending) {
    if (seen.has(expression)) {
      continue;
    }
    seen.add(expression);
    if (expression.type === 'ObjectExpression') {
      objects.push(expression);
    } else {
      pending.push(...innerExpressions(sourceCode, expression));
    }
  }
  return objects;
}

function isInlineStyleObject(sourceCode, attribute) {
  const value = attribute.value;
  return (
    attribute.name.name === 'style' &&
    value?.type === 'JSXExpressionContainer' &&
    objectLiteralsIn(sourceCode, value.expression).some(
      (object) => !object.properties.every(isCustomPropertyProperty),
    )
  );
}

function importKind(source) {
  if (stylesheetSource.test(source)) {
    return 'stylesheet';
  }
  return cssInJsSource.test(source) ? 'cssInJs' : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Allow one styling approach per project',
    },
    schema: [
      {
        type: 'object',
        properties: { approach: { enum: stylingApproaches } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ approach: 'class-names' }],
    messages: {
      inlineStyle:
        'Style with {{allowed}}, not an inline `style` object. Pass a runtime value as a CSS custom property, `{{example}}`, typed once with `{{typing}}`. For a one-off, add an exception for this rule in nitpicker.config.json.',
      otherApproach:
        'This project styles with {{allowed}}, not with {{found}}. To change the approach set "styling" under "react" in nitpicker.config.json; for a one-off, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const { allowed, banned } = approaches[context.options[0].approach];

    function report(node, kind) {
      if (banned[kind]) {
        context.report({
          node,
          messageId: kind === 'inlineStyle' ? 'inlineStyle' : 'otherApproach',
          data: {
            allowed,
            found: found[kind],
            example: customPropertyExample,
            typing: customPropertyTyping,
          },
        });
      }
    }

    return {
      JSXAttribute(node) {
        if (isInlineStyleObject(context.sourceCode, node)) {
          report(node, 'inlineStyle');
        }
      },
      ImportDeclaration(node) {
        const kind = importKind(node.source.value);
        if (kind !== undefined) {
          report(node, kind);
        }
      },
    };
  },
};

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

const found = {
  inlineStyle: 'an inline `style` object',
  stylesheet: 'a stylesheet import',
  cssInJs: 'a CSS-in-JS library',
};

const stylesheetSource = /\.(?:css|scss|sass|less|styl|pcss)$/u;
const cssInJsSource = /^(?:styled-components$|@emotion\/|@stitches\/react$|goober$|@linaria\/)/u;

function isCustomPropertyProperty(property) {
  return (
    property.type === 'Property' &&
    property.key.type === 'Literal' &&
    typeof property.key.value === 'string' &&
    property.key.value.startsWith('--')
  );
}

function isInlineStyleObject(attribute) {
  const value = attribute.value;
  return (
    attribute.name.name === 'style' &&
    value?.type === 'JSXExpressionContainer' &&
    value.expression.type === 'ObjectExpression' &&
    !value.expression.properties.every(isCustomPropertyProperty)
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
        'Do not style with an inline `style` object: this project styles with {{allowed}}. A value known only at runtime goes in a CSS custom property that the stylesheet reads: `{{example}}`. To change the approach set "styling" under "react" in nitpicker.config.json; for a one-off, add an exception for this rule in nitpicker.config.json.',
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
          data: { allowed, found: found[kind], example: customPropertyExample },
        });
      }
    }

    return {
      JSXAttribute(node) {
        if (isInlineStyleObject(node)) {
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

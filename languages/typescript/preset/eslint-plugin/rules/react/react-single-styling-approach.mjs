import { stylesheetSpecifier } from '../../../layout.mjs';
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
  'style-sheet': {
    allowed: 'React Native `StyleSheet.create` styles',
    banned: { inlineStyle: true, stylesheet: true, cssInJs: true },
    inlineMessage: 'inlineStyleSheet',
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

export const cssInJsSource =
  /^(?:styled-components(?:\/|$)|@emotion\/|@stitches\/react$|goober$|@linaria\/)/u;

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

function staticKey(node, computed) {
  if (node.type === 'Literal') {
    return String(node.value);
  }
  return node.type === 'Identifier' && !computed ? node.name : undefined;
}

function memberValues(sourceCode, member) {
  const key = staticKey(member.property, member.computed);
  if (key === undefined || member.object.type !== 'Identifier') {
    return [];
  }
  return initializersOf(sourceCode, member.object)
    .flatMap((initializer) => objectLiteralsIn(sourceCode, initializer))
    .flatMap((object) => object.properties)
    .filter(
      (property) =>
        property.type === 'Property' && staticKey(property.key, property.computed) === key,
    )
    .map((property) => property.value);
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
  if (expression.type === 'MemberExpression') {
    return memberValues(sourceCode, expression);
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
  if (stylesheetSpecifier.test(source)) {
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
        'Style with {{allowed}}, not an inline `style` object. Pass a runtime value as a CSS custom property, `{{example}}`, typed once in a `.d.ts` file under src/ with `{{typing}}`. For a one-off, add an exception for this rule in nitpicker.config.json.',
      inlineStyleSheet:
        'Style with {{allowed}}, not an inline `style` object: declare `const styles = StyleSheet.create({ title: { fontSize: 18 } })` at module level and pass `style={styles.title}`; add a runtime value next to it, `style={[styles.bar, { width }]}`. For a one-off, add an exception for this rule in nitpicker.config.json.',
      otherApproach:
        'This project styles with {{allowed}}, not with {{found}}. To change the approach set "styling" under "react" in nitpicker.config.json; for a one-off, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const {
      allowed,
      banned,
      inlineMessage = 'inlineStyle',
    } = approaches[context.options[0].approach];

    function report(node, kind) {
      if (banned[kind]) {
        context.report({
          node,
          messageId: kind === 'inlineStyle' ? inlineMessage : 'otherApproach',
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

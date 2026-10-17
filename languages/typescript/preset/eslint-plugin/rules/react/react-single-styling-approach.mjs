import { cssInJsSource, stylesheetSpecifier } from '../../../layout.mjs';
import { variableNamed } from '../analysis/ancestry.mjs';

const approaches = {
  'class-names': {
    allowed: '`className` with CSS Modules or utility classes',
    form: 'put them in a class and pass `className={styles.title}`',
    banned: { inlineStyle: true, cssInJs: true },
  },
  'css-in-js': {
    allowed: 'styled components (styled-components or Emotion)',
    form: 'put them in a styled component, `const Title = styled.h1({ fontSize: 18 })`',
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

const found = {
  inlineStyle: 'an inline `style` object',
  stylesheet: 'a stylesheet import',
  cssInJs: 'a CSS-in-JS library',
};

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

function propertyValues(object, key) {
  return object.properties
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
  return expression.type === 'Identifier' ? initializersOf(sourceCode, expression) : [];
}

function nextLookups(sourceCode, { expression, keys }) {
  if (expression.type === 'ObjectExpression') {
    return propertyValues(expression, keys.at(-1)).map((value) => ({
      expression: value,
      keys: keys.slice(0, -1),
    }));
  }
  if (expression.type === 'MemberExpression') {
    const key = staticKey(expression.property, expression.computed);
    return key === undefined ? [] : [{ expression: expression.object, keys: [...keys, key] }];
  }
  return innerExpressions(sourceCode, expression).map((inner) => ({ expression: inner, keys }));
}

function objectLiteralsIn(sourceCode, start) {
  const pending = [{ expression: start, keys: [] }];
  const seen = new Map();
  const objects = [];
  for (const lookup of pending) {
    const path = lookup.keys.join('.');
    const paths = seen.get(lookup.expression) ?? new Set();
    if (paths.has(path)) {
      continue;
    }
    seen.set(lookup.expression, paths.add(path));
    if (lookup.expression.type === 'ObjectExpression' && lookup.keys.length === 0) {
      objects.push(lookup.expression);
    } else {
      pending.push(...nextLookups(sourceCode, lookup));
    }
  }
  return objects;
}

function plainPropertyValues(object) {
  const isPlain = object.properties.every(
    (property) => property.type === 'Property' && !property.computed,
  );
  return isPlain ? object.properties.map((property) => property.value) : undefined;
}

function staticChildren(node) {
  switch (node.type) {
    case 'Literal':
      return [];
    case 'TemplateLiteral':
      return node.expressions.length === 0 ? [] : undefined;
    case 'UnaryExpression':
      return node.argument.type === 'Literal' ? [] : undefined;
    case 'ArrayExpression':
      return node.elements.every((element) => element !== null) ? node.elements : undefined;
    case 'ObjectExpression':
      return plainPropertyValues(node);
    default:
      return undefined;
  }
}

function isStaticValue(root) {
  const pending = [root];
  for (const node of pending) {
    const children = staticChildren(node);
    if (children === undefined) {
      return false;
    }
    pending.push(...children);
  }
  return true;
}

function isInlineStyleObject(sourceCode, attribute) {
  const value = attribute.value;
  return (
    attribute.name.name === 'style' &&
    value?.type === 'JSXExpressionContainer' &&
    objectLiteralsIn(sourceCode, value.expression).some(
      (object) => !object.properties.every(isCustomPropertyProperty) && isStaticValue(object),
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
        'Style with {{allowed}}, not an inline `style` object of fixed values: {{form}}. A `style` object stays for values computed at runtime, such as `{ width: progress }`. For a one-off, add an exception for this rule in nitpicker.config.json.',
      inlineStyleSheet:
        'Style with {{allowed}}, not an inline `style` object of fixed values: declare `const styles = StyleSheet.create({ title: { fontSize: 18 } })` at module level and pass `style={styles.title}`. A `style` object stays for values computed at runtime, such as `{ opacity: fade }`. For a one-off, add an exception for this rule in nitpicker.config.json.',
      otherApproach:
        'This project styles with {{allowed}}, not with {{found}}. To change the approach set "styling" under "react" in nitpicker.config.json; for a one-off, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const {
      allowed,
      form,
      banned,
      inlineMessage = 'inlineStyle',
    } = approaches[context.options[0].approach];

    function report(node, kind) {
      if (banned[kind]) {
        context.report({
          node,
          messageId: kind === 'inlineStyle' ? inlineMessage : 'otherApproach',
          data: { allowed, form, found: found[kind] },
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

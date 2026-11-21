import { cssInJsSource, stylesheetSpecifier } from '../../../layout.mts';
import { variableNamed } from '../analysis/ancestry.mts';
import { expandsFully as untypedExpandsFully } from '../../../../../../shared/traversal.mts';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type {
  ApproachName,
  Approach,
  Kind,
  Lookup,
  MessageIds,
  Options,
} from './typed/styling-types.mts';
import type { SourceCode } from '../typed/node-views.mts';
import { hasKind } from '../../../syntax/kinds/node-kinds.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const expandsFully: <T>(root: T, children: (node: T) => readonly T[] | undefined) => boolean =
  untypedExpandsFully;

const IDENTIFIER = 'Identifier';
const PROPERTY = 'Property';
const LITERAL = 'Literal';
const OBJECT_EXPRESSION = 'ObjectExpression';
const INLINE_STYLE = 'inlineStyle';

const approaches: Readonly<Record<ApproachName, Approach>> = {
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

const found: Readonly<Record<Kind, string>> = {
  inlineStyle: 'an inline `style` object',
  stylesheet: 'a stylesheet import',
  cssInJs: 'a CSS-in-JS library',
};

function isCustomPropertyProperty(property: TSESTree.ObjectLiteralElement): boolean {
  return (
    hasKind(property, PROPERTY) &&
    hasKind(property.key, LITERAL) &&
    typeof property.key.value === 'string' &&
    property.key.value.startsWith('--')
  );
}

function initializersOf(sourceCode: SourceCode, identifier: TSESTree.Identifier): TSESTree.Node[] {
  const definitions = variableNamed(sourceCode, identifier)?.defs ?? [];
  const [definition] = definitions;
  const declarator = definition?.node;
  return definitions.length === 1 &&
    hasKind(declarator, 'VariableDeclarator') &&
    hasKind(declarator.id, IDENTIFIER) &&
    declarator.init
    ? [declarator.init]
    : [];
}

function staticKey(node: TSESTree.Node, computed: boolean): string | undefined {
  if (hasKind(node, LITERAL)) {
    return String(node.value);
  }
  return hasKind(node, IDENTIFIER) && !computed ? node.name : undefined;
}

function propertyValues(
  object: TSESTree.ObjectExpression,
  key: string | undefined,
): TSESTree.Node[] {
  return object.properties.flatMap((property) =>
    hasKind(property, PROPERTY) && staticKey(property.key, property.computed) === key
      ? [property.value]
      : [],
  );
}

function innerExpressions(sourceCode: SourceCode, expression: TSESTree.Node): TSESTree.Node[] {
  if (
    hasKind(expression, 'TSSatisfiesExpression') ||
    hasKind(expression, 'TSAsExpression') ||
    hasKind(expression, 'TSNonNullExpression')
  ) {
    return [expression.expression];
  }
  if (hasKind(expression, 'ConditionalExpression')) {
    return [expression.consequent, expression.alternate];
  }
  if (hasKind(expression, 'LogicalExpression')) {
    return [expression.left, expression.right];
  }
  return hasKind(expression, IDENTIFIER) ? initializersOf(sourceCode, expression) : [];
}

function nextLookups(sourceCode: SourceCode, { expression, keys }: Lookup): Lookup[] {
  if (hasKind(expression, OBJECT_EXPRESSION)) {
    return propertyValues(expression, keys.at(-1)).map((value) => ({
      expression: value,
      keys: keys.slice(0, -1),
    }));
  }
  if (hasKind(expression, 'MemberExpression')) {
    const key = staticKey(expression.property, expression.computed);
    return key === undefined ? [] : [{ expression: expression.object, keys: [...keys, key] }];
  }
  return innerExpressions(sourceCode, expression).map((inner) => ({ expression: inner, keys }));
}

function objectLiteralsIn(
  sourceCode: SourceCode,
  start: TSESTree.Node,
): TSESTree.ObjectExpression[] {
  const pending: Lookup[] = [{ expression: start, keys: [] }];
  const seen = new Map<TSESTree.Node, Set<string>>();
  const objects: TSESTree.ObjectExpression[] = [];
  for (const lookup of pending) {
    const path = lookup.keys.join('.');
    const paths = seen.get(lookup.expression) ?? new Set<string>();
    if (paths.has(path)) {
      continue;
    }
    seen.set(lookup.expression, paths.add(path));
    if (hasKind(lookup.expression, OBJECT_EXPRESSION) && lookup.keys.length === 0) {
      objects.push(lookup.expression);
    } else {
      appendAll(pending, nextLookups(sourceCode, lookup));
    }
  }
  return objects;
}

function plainPropertyValues(object: TSESTree.ObjectExpression): TSESTree.Node[] | undefined {
  const values: TSESTree.Node[] = [];
  for (const property of object.properties) {
    if (!hasKind(property, PROPERTY) || property.computed) {
      return undefined;
    }
    values.push(property.value);
  }
  return values;
}

function staticChildren(node: TSESTree.Node): readonly TSESTree.Node[] | undefined {
  if (hasKind(node, LITERAL)) {
    return [];
  }
  if (hasKind(node, 'TemplateLiteral')) {
    return node.expressions.length === 0 ? [] : undefined;
  }
  if (hasKind(node, 'UnaryExpression')) {
    return hasKind(node.argument, LITERAL) ? [] : undefined;
  }
  if (hasKind(node, 'ArrayExpression')) {
    return node.elements.every(
      (element): element is TSESTree.Expression | TSESTree.SpreadElement => element !== null,
    )
      ? node.elements
      : undefined;
  }
  return hasKind(node, OBJECT_EXPRESSION) ? plainPropertyValues(node) : undefined;
}

function isStaticValue(root: TSESTree.Node): boolean {
  return expandsFully(root, staticChildren);
}

function isInlineStyleObject(sourceCode: SourceCode, attribute: TSESTree.JSXAttribute): boolean {
  const value = attribute.value;
  return (
    attribute.name.name === 'style' &&
    hasKind(value, 'JSXExpressionContainer') &&
    objectLiteralsIn(sourceCode, value.expression).some(
      (object) => !object.properties.every(isCustomPropertyProperty) && isStaticValue(object),
    )
  );
}

function importKind(source: string): Kind | undefined {
  if (stylesheetSpecifier.test(source)) {
    return 'stylesheet';
  }
  return cssInJsSource.test(source) ? 'cssInJs' : undefined;
}

export const rule: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Allow one styling approach per project',
    },
    schema: [
      {
        type: 'object',
        properties: { approach: { type: 'string', enum: stylingApproaches } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ approach: 'class-names' }],
    messages: {
      inlineStyle:
        'Style with {{allowed}}, not an inline `style` object of fixed values: {{form}}. A `style` object stays for values computed at runtime, such as `{ width: progress }`. An exception fits only for a one-off.',
      inlineStyleSheet:
        'Style with {{allowed}}, not an inline `style` object of fixed values: declare `const styles = StyleSheet.create({ title: { fontSize: 18 } })` at module level and pass `style={styles.title}`. A `style` object stays for values computed at runtime, such as `{ opacity: fade }`. An exception fits only for a one-off.',
      otherApproach:
        'This project styles with {{allowed}}, not with {{found}}. To change the approach set "styling" under "react" in nitpicker.config.json.',
    },
  },
  create(context) {
    const {
      allowed,
      form,
      banned,
      inlineMessage = INLINE_STYLE,
    } = approaches[context.options[0].approach];

    function report(node: TSESTree.Node, kind: Kind): void {
      if (banned[kind]) {
        context.report({
          node,
          messageId: kind === INLINE_STYLE ? inlineMessage : 'otherApproach',
          data: { allowed, form, found: found[kind] },
        });
      }
    }

    return {
      JSXAttribute(node) {
        if (isInlineStyleObject(context.sourceCode, node)) {
          report(node, INLINE_STYLE);
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

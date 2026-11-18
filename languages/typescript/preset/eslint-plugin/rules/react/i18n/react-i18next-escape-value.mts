import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { attributeNamed } from '../jsx.mts';
import { packageDependsOn, projectSourceMatches } from '../support/package-facts.mts';

const reservedOptions = new Set([
  'count',
  'context',
  'defaultValue',
  'ns',
  'lng',
  'lngs',
  'fallbackLng',
  'replace',
  'interpolation',
  'returnObjects',
  'returnDetails',
  'joinArrays',
  'postProcess',
  'keySeparator',
  'nsSeparator',
  'skipInterpolation',
  'ordinal',
  'defaultValue_one',
  'defaultValue_other',
]);
const unescapedSetting = /escapeValue\s*:\s*false/u;
const safeMethods = new Set([
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'toFixed',
  'toPrecision',
  'toISOString',
]);
const formatterName = /format|intl|number|date|time|currency/iu;
const arithmetic = new Set(['-', '*', '/', '%', '**']);
const wrapperKinds = new Set<string>([
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.TemplateLiteral,
]);

function importSource(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): string | undefined {
  const [definition] = variableNamed(sourceCode, identifier)?.defs ?? [];
  return definition?.type === TSESLint.Scope.DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration
    ? String(definition.parent.source.value)
    : undefined;
}

function isTranslateFunction(sourceCode: SourceCode, callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return (
      !callee.computed &&
      nameOf(callee.property) === 't' &&
      callee.object.type === AST_NODE_TYPES.Identifier &&
      (importSource(sourceCode, callee.object) === 'i18next' ||
        isFromTranslationHook(sourceCode, callee.object, 'i18n'))
    );
  }
  return (
    callee.type === AST_NODE_TYPES.Identifier &&
    (importSource(sourceCode, callee) === 'i18next' ||
      isFromTranslationHook(sourceCode, callee, 't'))
  );
}

function isFromTranslationHook(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
  key: string,
): boolean {
  const [definition] = variableNamed(sourceCode, identifier)?.defs ?? [];
  if (definition?.type !== TSESLint.Scope.DefinitionType.Variable) {
    return false;
  }
  const { id, init } = definition.node;
  const hook = init?.type === AST_NODE_TYPES.CallExpression ? nameOf(init.callee) : undefined;
  if (hook !== 'useTranslation') {
    return false;
  }
  if (id.type === AST_NODE_TYPES.ArrayPattern) {
    return key === 't' && id.elements[0] === definition.name;
  }
  return (
    id.type === AST_NODE_TYPES.ObjectPattern &&
    id.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        nameOf(property.key) === key &&
        property.value === definition.name,
    )
  );
}

function isFormattedCall(node: TSESTree.CallExpression): boolean {
  const callee = unwrapped(node.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'Number' || formatterName.test(callee.name);
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const method = nameOf(callee.property) ?? '';
  return (
    safeMethods.has(method) ||
    (callee.object.type === AST_NODE_TYPES.Identifier &&
      (callee.object.name === 'Math' ||
        (method === 'format' && formatterName.test(callee.object.name))))
  );
}

function isPlainValue(value: TSESTree.Node): boolean {
  const node = unwrapped(value);
  switch (node.type) {
    case AST_NODE_TYPES.Literal:
      return true;
    case AST_NODE_TYPES.TemplateLiteral:
      return node.expressions.length === 0;
    case AST_NODE_TYPES.BinaryExpression:
      return arithmetic.has(node.operator);
    case AST_NODE_TYPES.CallExpression:
      return isFormattedCall(node);
    default:
      return false;
  }
}

function interpolatesValues(options: TSESTree.ObjectExpression): boolean {
  const keys = options.properties.filter(
    (property): property is TSESTree.Property => property.type === AST_NODE_TYPES.Property,
  );
  return (
    !keys.some((property) => nameOf(property.key) === 'interpolation') &&
    keys.some(
      (property) =>
        !property.computed &&
        !reservedOptions.has(nameOf(property.key) ?? '') &&
        !isPlainValue(property.value),
    )
  );
}

function optionsOf(call: TSESTree.CallExpression): TSESTree.ObjectExpression | undefined {
  const objects = call.arguments
    .slice(1)
    .filter(
      (argument): argument is TSESTree.ObjectExpression =>
        argument.type === AST_NODE_TYPES.ObjectExpression,
    );
  return objects.at(-1);
}

function renderedByJsx(node: TSESTree.Node): boolean {
  let container: TSESTree.Node | undefined = node.parent;
  while (container !== undefined && wrapperKinds.has(container.type)) {
    container = container.parent;
  }
  if (container?.type !== AST_NODE_TYPES.JSXExpressionContainer) {
    return false;
  }
  const owner = container.parent;
  return (
    owner.type === AST_NODE_TYPES.JSXElement ||
    owner.type === AST_NODE_TYPES.JSXFragment ||
    (owner.type === AST_NODE_TYPES.JSXAttribute && nameOf(owner.name) !== 'dangerouslySetInnerHTML')
  );
}

function resultRendered(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const declarator =
    call.parent.type === AST_NODE_TYPES.ChainExpression ? call.parent.parent : call.parent;
  if (
    declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.Identifier
  ) {
    const variable = sourceCode.getDeclaredVariables(declarator)[0];
    return (
      variable?.references.some(
        ({ identifier, init }) => init !== true && renderedByJsx(identifier),
      ) ?? false
    );
  }
  return renderedByJsx(call);
}

function transValues(opening: TSESTree.JSXOpeningElement): TSESTree.ObjectExpression | undefined {
  const value = attributeNamed(opening, 'values')?.value;
  const expression =
    value?.type === AST_NODE_TYPES.JSXExpressionContainer ? value.expression : undefined;
  return expression?.type === AST_NODE_TYPES.ObjectExpression ? expression : undefined;
}

export const rule: TSESLint.RuleModule<'doubleEscaped'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow i18next interpolation values that React escapes a second time' },
    schema: [],
    messages: {
      doubleEscaped:
        'i18next escapes interpolation values and React escapes the rendered text again, so `&`, ' +
        '`<` and quotes in a value show as `&amp;` and `&#39;`. Set `interpolation: { escapeValue: ' +
        'false }` once where i18next is initialised (react-i18next escapes through React) or in this ' +
        'call; keep escaping for `dangerouslySetInnerHTML`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    let applies: boolean | undefined;

    function active(): boolean {
      applies ??=
        packageDependsOn(context.filename, ['react-i18next']) &&
        !projectSourceMatches(context.filename, unescapedSetting);
      return applies;
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const options = optionsOf(node);
        if (
          options !== undefined &&
          interpolatesValues(options) &&
          isTranslateFunction(sourceCode, node.callee) &&
          resultRendered(sourceCode, node) &&
          active()
        ) {
          context.report({ node, messageId: 'doubleEscaped' });
        }
      },
      JSXOpeningElement(node: TSESTree.JSXOpeningElement) {
        const values = transValues(node);
        const isTrans =
          node.name.type === AST_NODE_TYPES.JSXIdentifier &&
          node.name.name === 'Trans' &&
          importSource(sourceCode, node.name) === 'react-i18next' &&
          attributeNamed(node, 'shouldUnescape') === undefined &&
          attributeNamed(node, 'tOptions') === undefined;
        if (isTrans && values !== undefined && interpolatesValues(values) && active()) {
          context.report({ node, messageId: 'doubleEscaped' });
        }
      },
    };
  },
};

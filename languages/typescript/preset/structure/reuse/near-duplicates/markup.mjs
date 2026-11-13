import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { NONE, at, optional, textOf } from './tree-nodes.mjs';

const STRING_KIND = 'string';

const KIND = ts.SyntaxKind;

function grouped(value, source, children) {
  return at({ kind: 'expression', value }, source, children);
}

function keyOf(name) {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  return ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : undefined;
}

function member(prefix) {
  return (source, context) => {
    const key = keyOf(source.name);
    const body = prefix === 'property' ? context.get(source.initializer) : context.lambda(source);
    return key === undefined
      ? grouped(`${prefix}-computed`, source, [context.get(source.name.expression), body])
      : grouped(`${prefix}:${key}`, source, [body]);
  };
}

function templateOf(source, context) {
  const head = at(
    { kind: 'literal', literal: STRING_KIND, value: JSON.stringify(source.head.text) },
    source.head,
  );
  const spans = source.templateSpans.flatMap((span) => [
    context.get(span.expression),
    at(
      { kind: 'literal', literal: STRING_KIND, value: JSON.stringify(span.literal.text) },
      span.literal,
    ),
  ]);
  return grouped('template', source, [head, ...spans]);
}

function attributeValue(attribute, context) {
  const { initializer } = attribute;
  if (initializer === undefined) {
    return at({ kind: 'literal', literal: 'boolean', value: 'true' }, attribute);
  }
  return ts.isJsxExpression(initializer)
    ? optional(initializer.expression, context)
    : context.get(initializer);
}

function attributesOf(attributes, context) {
  return attributes.properties.map((attribute) =>
    ts.isJsxSpreadAttribute(attribute)
      ? grouped('spread', attribute, [context.get(attribute.expression)])
      : grouped(`attribute:${textOf(attribute.name, context)}`, attribute, [
          attributeValue(attribute, context),
        ]),
  );
}

function jsxText(source) {
  const text = source.text.replaceAll(/\s+/gu, ' ').trim();
  return text === ''
    ? []
    : [at({ kind: 'literal', literal: STRING_KIND, value: JSON.stringify(text) }, source)];
}

function childrenOf(children, context) {
  return children.flatMap((child) => {
    if (ts.isJsxText(child)) {
      return jsxText(child);
    }
    return ts.isJsxExpression(child) && child.expression === undefined ? [] : [context.get(child)];
  });
}

function elementOf({ element, opening, children }, context) {
  return grouped(`jsx:${textOf(opening.tagName, context)}`, element, [
    ...attributesOf(opening.attributes, context),
    ...childrenOf(children, context),
  ]);
}

function bindingElementOf(source, context) {
  const key = source.propertyName === undefined ? '' : (keyOf(source.propertyName) ?? '[]');
  const rest = source.dotDotDotToken === undefined ? '' : '...';
  return grouped(`binding:${rest}${key}`, source, [
    context.get(source.name),
    optional(source.initializer, context),
  ]);
}

function parameterOf(source, context) {
  const name = context.get(source.name);
  const target =
    source.initializer === undefined
      ? name
      : grouped('default', source, [name, context.get(source.initializer)]);
  const spread = source.dotDotDotToken === undefined ? target : grouped('rest', source, [target]);
  return at('parameter', source, [context.typeOf(source.type), spread]);
}

export const MARKUP = {
  [KIND.ObjectLiteralExpression]: (source, context) =>
    grouped('object', source, source.properties.map(context.get)),
  [KIND.PropertyAssignment]: member('property'),
  [KIND.MethodDeclaration]: member('method'),
  [KIND.GetAccessor]: member('get'),
  [KIND.SetAccessor]: member('set'),
  [KIND.ShorthandPropertyAssignment]: (source, context) =>
    grouped(`property:${source.name.text}`, source, [context.name(source.name.text, source.name)]),
  [KIND.ArrayLiteralExpression]: (source, context) =>
    grouped('array', source, source.elements.map(context.get)),
  [KIND.TemplateExpression]: templateOf,
  [KIND.TaggedTemplateExpression]: (source, context) =>
    grouped('tagged', source, [context.get(source.tag), context.get(source.template)]),
  [KIND.JsxElement]: (source, context) =>
    elementOf(
      { element: source, opening: source.openingElement, children: source.children },
      context,
    ),
  [KIND.JsxSelfClosingElement]: (source, context) =>
    elementOf({ element: source, opening: source, children: [] }, context),
  [KIND.JsxFragment]: (source, context) =>
    grouped('jsx:', source, childrenOf(source.children, context)),
  [KIND.JsxExpression]: (source, context) => optional(source.expression, context),
  [KIND.ObjectBindingPattern]: (source, context) =>
    grouped('object-pattern', source, source.elements.map(context.get)),
  [KIND.ArrayBindingPattern]: (source, context) =>
    grouped('array-pattern', source, source.elements.map(context.get)),
  [KIND.BindingElement]: bindingElementOf,
  [KIND.Parameter]: parameterOf,
  [KIND.OmittedExpression]: () => NONE,
};

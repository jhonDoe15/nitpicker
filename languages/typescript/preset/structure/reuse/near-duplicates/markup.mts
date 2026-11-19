import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import { NONE, at, on, optional, textOf } from './tree-nodes.mts';
import type {
  Converted,
  Converter,
  ConverterTable,
  LambdaSource,
  TreeContext,
  TreeNode,
} from './typed/tree-types.mts';

const ts = typescriptApi();

const STRING_KIND = 'string';

const KIND = ts.SyntaxKind;

function grouped(value: string, source: TypeScript.Node, children: readonly Converted[]): TreeNode {
  return at({ kind: 'expression', value }, source, children);
}

function keyOf(name: TypeScript.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  return ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : undefined;
}

function lambdaOf(source: LambdaSource, context: TreeContext): TreeNode {
  return context.lambda(source);
}

function member<Source extends TypeScript.Node & { readonly name: TypeScript.PropertyName }>(
  guard: (node: TypeScript.Node) => node is Source,
  prefix: string,
  bodyOf: (source: Source, context: TreeContext) => Converted,
): Converter {
  return on(guard, (source, context) => {
    const key = keyOf(source.name);
    const body = bodyOf(source, context);
    return key === undefined && ts.isComputedPropertyName(source.name)
      ? grouped(`${prefix}-computed`, source, [context.get(source.name.expression), body])
      : grouped(`${prefix}:${String(key)}`, source, [body]);
  });
}

function templateOf(source: TypeScript.TemplateExpression, context: TreeContext): TreeNode {
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

function attributeValue(attribute: TypeScript.JsxAttribute, context: TreeContext): Converted {
  const { initializer } = attribute;
  if (initializer === undefined) {
    return at({ kind: 'literal', literal: 'boolean', value: 'true' }, attribute);
  }
  return ts.isJsxExpression(initializer)
    ? optional(initializer.expression, context)
    : context.get(initializer);
}

function attributesOf(attributes: TypeScript.JsxAttributes, context: TreeContext): TreeNode[] {
  return attributes.properties.map((attribute) =>
    ts.isJsxSpreadAttribute(attribute)
      ? grouped('spread', attribute, [context.get(attribute.expression)])
      : grouped(`attribute:${textOf(attribute.name, context)}`, attribute, [
          attributeValue(attribute, context),
        ]),
  );
}

function jsxText(source: TypeScript.JsxText): TreeNode[] {
  const text = source.text.replaceAll(/\s+/gu, ' ').trim();
  return text === ''
    ? []
    : [at({ kind: 'literal', literal: STRING_KIND, value: JSON.stringify(text) }, source)];
}

function childrenOf(children: readonly TypeScript.JsxChild[], context: TreeContext): Converted[] {
  return children.flatMap((child) => {
    if (ts.isJsxText(child)) {
      return jsxText(child);
    }
    return ts.isJsxExpression(child) && child.expression === undefined ? [] : [context.get(child)];
  });
}

function elementOf(
  {
    element,
    opening,
    children,
  }: {
    readonly element: TypeScript.Node;
    readonly opening: TypeScript.JsxOpeningLikeElement;
    readonly children: readonly TypeScript.JsxChild[];
  },
  context: TreeContext,
): TreeNode {
  return grouped(`jsx:${textOf(opening.tagName, context)}`, element, [
    ...attributesOf(opening.attributes, context),
    ...childrenOf(children, context),
  ]);
}

function bindingElementOf(source: TypeScript.BindingElement, context: TreeContext): TreeNode {
  const key = source.propertyName === undefined ? '' : (keyOf(source.propertyName) ?? '[]');
  const rest = source.dotDotDotToken === undefined ? '' : '...';
  return grouped(`binding:${rest}${key}`, source, [
    context.get(source.name),
    optional(source.initializer, context),
  ]);
}

function parameterOf(source: TypeScript.ParameterDeclaration, context: TreeContext): TreeNode {
  const name = context.get(source.name);
  const target =
    source.initializer === undefined
      ? name
      : grouped('default', source, [name, context.get(source.initializer)]);
  const spread = source.dotDotDotToken === undefined ? target : grouped('rest', source, [target]);
  return at('parameter', source, [context.typeOf(source.type), spread]);
}

export const MARKUP: ConverterTable = {
  [KIND.ObjectLiteralExpression]: on(ts.isObjectLiteralExpression, (source, context) =>
    grouped('object', source, source.properties.map(context.get)),
  ),
  [KIND.PropertyAssignment]: member(ts.isPropertyAssignment, 'property', (source, context) =>
    context.get(source.initializer),
  ),
  [KIND.MethodDeclaration]: member(ts.isMethodDeclaration, 'method', lambdaOf),
  [KIND.GetAccessor]: member(ts.isGetAccessorDeclaration, 'get', lambdaOf),
  [KIND.SetAccessor]: member(ts.isSetAccessorDeclaration, 'set', lambdaOf),
  [KIND.ShorthandPropertyAssignment]: on(ts.isShorthandPropertyAssignment, (source, context) =>
    grouped(`property:${source.name.text}`, source, [context.name(source.name.text, source.name)]),
  ),
  [KIND.ArrayLiteralExpression]: on(ts.isArrayLiteralExpression, (source, context) =>
    grouped('array', source, source.elements.map(context.get)),
  ),
  [KIND.TemplateExpression]: on(ts.isTemplateExpression, templateOf),
  [KIND.TaggedTemplateExpression]: on(ts.isTaggedTemplateExpression, (source, context) =>
    grouped('tagged', source, [context.get(source.tag), context.get(source.template)]),
  ),
  [KIND.JsxElement]: on(ts.isJsxElement, (source, context) =>
    elementOf(
      { element: source, opening: source.openingElement, children: source.children },
      context,
    ),
  ),
  [KIND.JsxSelfClosingElement]: on(ts.isJsxSelfClosingElement, (source, context) =>
    elementOf({ element: source, opening: source, children: [] }, context),
  ),
  [KIND.JsxFragment]: on(ts.isJsxFragment, (source, context) =>
    grouped('jsx:', source, childrenOf(source.children, context)),
  ),
  [KIND.JsxExpression]: on(ts.isJsxExpression, (source, context) =>
    optional(source.expression, context),
  ),
  [KIND.ObjectBindingPattern]: on(ts.isObjectBindingPattern, (source, context) =>
    grouped('object-pattern', source, source.elements.map(context.get)),
  ),
  [KIND.ArrayBindingPattern]: on(ts.isArrayBindingPattern, (source, context) =>
    grouped('array-pattern', source, source.elements.map(context.get)),
  ),
  [KIND.BindingElement]: on(ts.isBindingElement, bindingElementOf),
  [KIND.Parameter]: on(ts.isParameter, parameterOf),
  [KIND.OmittedExpression]: () => NONE,
};

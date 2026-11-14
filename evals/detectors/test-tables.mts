import type typescript from 'typescript';
import { lineOf, type Node, type SourceFile, ts } from './typescript.mts';

type Expression = typescript.Expression;
type Callback = typescript.ArrowFunction | typescript.FunctionExpression;

export type Table =
  | { kind: 'array'; node: Expression | undefined }
  | { kind: 'template'; node: typescript.TemplateLiteral };

export type Row = {
  line: number;
  text: string;
  args: Expression[];
  fields?: Map<string, Expression>;
};

export type Bound = { node: Expression; name?: string };

const LITERAL_KEYWORDS = new Set<typescript.SyntaxKind>([
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
]);

function isEachAccess(node: Node): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === 'each';
}

export function tableOf(testCall: typescript.CallExpression): Table | undefined {
  const inner = testCall.expression;
  if (ts.isCallExpression(inner) && isEachAccess(inner.expression)) {
    return { kind: 'array', node: inner.arguments[0] };
  }
  if (ts.isTaggedTemplateExpression(inner) && isEachAccess(inner.tag)) {
    return { kind: 'template', node: inner.template };
  }
  return undefined;
}

function unwrap(node: Expression): Expression {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function arrayLiteralOf(
  node: Expression | undefined,
): typescript.ArrayLiteralExpression | undefined {
  const value = node === undefined ? undefined : unwrap(node);
  return value !== undefined && ts.isArrayLiteralExpression(value) ? value : undefined;
}

function resolveArray(
  node: Expression | undefined,
  sourceFile: SourceFile,
): typescript.ArrayLiteralExpression | undefined {
  const value = node === undefined ? undefined : unwrap(node);
  if (value !== undefined && ts.isArrayLiteralExpression(value)) {
    return value;
  }
  if (value === undefined || !ts.isIdentifier(value)) {
    return undefined;
  }
  const wanted = value.text;
  let found: typescript.ArrayLiteralExpression | undefined;
  function visit(child: Node): void {
    if (
      found === undefined &&
      ts.isVariableDeclaration(child) &&
      ts.isIdentifier(child.name) &&
      child.name.text === wanted
    ) {
      found = arrayLiteralOf(child.initializer);
    }
    ts.forEachChild(child, visit);
  }
  visit(sourceFile);
  return found;
}

function objectFields(object: typescript.ObjectLiteralExpression): Map<string, Expression> {
  const fields = new Map<string, Expression>();
  for (const property of object.properties) {
    const name = property.name;
    const key =
      name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
        ? name.text
        : undefined;
    if (key !== undefined && ts.isPropertyAssignment(property)) {
      fields.set(key, property.initializer);
    } else if (key !== undefined && ts.isShorthandPropertyAssignment(property)) {
      fields.set(key, property.name);
    }
  }
  return fields;
}

function arrayRow(element: Expression, sourceFile: SourceFile): Row {
  const value = unwrap(element);
  const row = {
    line: lineOf(sourceFile, element),
    text: element.getText(sourceFile).replace(/\s+/g, ' '),
  };
  if (ts.isArrayLiteralExpression(value) && !value.elements.some(ts.isSpreadElement)) {
    return { ...row, args: [...value.elements] };
  }
  if (ts.isObjectLiteralExpression(value)) {
    return { ...row, args: [value], fields: objectFields(value) };
  }
  return { ...row, args: [value] };
}

function templateRows(template: typescript.TemplateLiteral, sourceFile: SourceFile): Row[] {
  if (!ts.isTemplateExpression(template)) {
    return [];
  }
  const headers = template.head.text
    .trim()
    .split('|')
    .map((header) => header.trim());
  const cells = template.templateSpans.map((span) => span.expression);
  const rows: Row[] = [];
  for (let start = 0; start + headers.length <= cells.length; start += headers.length) {
    const values = cells.slice(start, start + headers.length);
    const [first] = values;
    if (first === undefined) {
      break;
    }
    rows.push({
      line: lineOf(sourceFile, first),
      text: values.map((value) => value.getText(sourceFile)).join(' | '),
      args: [],
      fields: new Map(
        headers.flatMap((header, index): [string, Expression][] => {
          const value = values[index];
          return value === undefined ? [] : [[header, value]];
        }),
      ),
    });
  }
  return rows;
}

export function rowsOf(table: Table, sourceFile: SourceFile): Row[] | undefined {
  if (table.kind === 'template') {
    return templateRows(table.node, sourceFile);
  }
  const array = resolveArray(table.node, sourceFile);
  if (array === undefined || array.elements.some(ts.isSpreadElement)) {
    return undefined;
  }
  return array.elements.map((element) => arrayRow(element, sourceFile));
}

export function literalOf(node: Node): string | undefined {
  if (ts.isStringLiteralLike(node)) {
    return JSON.stringify(node.text);
  }
  if (ts.isNumericLiteral(node)) {
    return String(Number(node.text));
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return String(-Number(node.operand.text));
  }
  if (LITERAL_KEYWORDS.has(node.kind)) {
    return node.getText();
  }
  if (ts.isIdentifier(node) && node.text === 'undefined') {
    return 'undefined';
  }
  return undefined;
}

function display(node: Node): string {
  const literal = literalOf(node);
  if (literal === undefined) {
    return node.getText();
  }
  return ts.isStringLiteralLike(node) ? node.text : literal;
}

export function formatTitle(title: string, row: Row, index: number): string {
  const fields = row.fields;
  if (fields !== undefined) {
    return title.replace(/\$(#|[A-Za-z_]\w*)/g, (match: string, name: string) => {
      if (name === '#') {
        return String(index);
      }
      const value = fields.get(name);
      return value === undefined ? match : display(value);
    });
  }
  const args = [...row.args];
  return title.replace(/%[sdifjoOc#$%]/g, (match: string) => {
    if (match === '%%') {
      return '%';
    }
    if (match === '%#') {
      return String(index);
    }
    if (match === '%$') {
      return String(index + 1);
    }
    const value = args.shift();
    return value === undefined ? match : display(value);
  });
}

export function literalsIn(node: Node): string[] {
  const literals: string[] = [];
  function visit(child: Node): void {
    const literal = literalOf(child);
    if (literal === undefined) {
      ts.forEachChild(child, visit);
    } else {
      literals.push(literal);
    }
  }
  visit(node);
  return literals;
}

function isReferenced(body: Node, name: string): boolean {
  let found = false;
  function visit(child: Node): void {
    if (ts.isIdentifier(child) && child.text === name) {
      found = true;
    }
    if (!found) {
      ts.forEachChild(child, visit);
    }
  }
  visit(body);
  return found;
}

export function boundValues(row: Row, callback: Callback): Bound[] {
  const [first] = callback.parameters;
  const fields = row.fields;
  if (fields !== undefined) {
    if (first === undefined) {
      return [];
    }
    if (!ts.isObjectBindingPattern(first.name)) {
      return [...fields.values()].map((node) => ({ node }));
    }
    return first.name.elements.flatMap((element): Bound[] => {
      const key = (element.propertyName ?? element.name).getText();
      const node = fields.get(key);
      const name = ts.isIdentifier(element.name) ? element.name.text : undefined;
      if (node === undefined || (name !== undefined && !isReferenced(callback.body, name))) {
        return [];
      }
      return name === undefined ? [{ node }] : [{ node, name }];
    });
  }
  return row.args.flatMap((node, index): Bound[] => {
    const parameter = callback.parameters[index];
    if (parameter === undefined) {
      return [];
    }
    if (!ts.isIdentifier(parameter.name)) {
      return [{ node }];
    }
    return isReferenced(callback.body, parameter.name.text)
      ? [{ node, name: parameter.name.text }]
      : [];
  });
}

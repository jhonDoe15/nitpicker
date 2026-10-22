import { lineOf, ts } from './typescript.mjs';

export function tableOf(testCall) {
  const inner = testCall.expression;
  if (ts.isCallExpression(inner) && isEachAccess(inner.expression)) {
    return { kind: 'array', node: inner.arguments[0] };
  }
  if (ts.isTaggedTemplateExpression(inner) && isEachAccess(inner.tag)) {
    return { kind: 'template', node: inner.template };
  }
  return undefined;
}

function isEachAccess(node) {
  return ts.isPropertyAccessExpression(node) && node.name.text === 'each';
}

export function rowsOf(table, sourceFile) {
  if (table.kind === 'template') {
    return templateRows(table.node, sourceFile);
  }
  const array = resolveArray(table.node, sourceFile);
  if (array === undefined || array.elements.some(ts.isSpreadElement)) {
    return undefined;
  }
  return array.elements.map((element) => arrayRow(element, sourceFile));
}

function unwrap(node) {
  let current = node;
  while (
    current !== undefined &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function resolveArray(node, sourceFile) {
  const value = unwrap(node);
  if (value !== undefined && ts.isArrayLiteralExpression(value)) {
    return value;
  }
  if (value === undefined || !ts.isIdentifier(value)) {
    return undefined;
  }
  let found;
  const visit = (child) => {
    if (
      found === undefined &&
      ts.isVariableDeclaration(child) &&
      ts.isIdentifier(child.name) &&
      child.name.text === value.text
    ) {
      const initializer = unwrap(child.initializer);
      found =
        initializer !== undefined && ts.isArrayLiteralExpression(initializer)
          ? initializer
          : undefined;
    }
    ts.forEachChild(child, visit);
  };
  visit(sourceFile);
  return found;
}

function arrayRow(element, sourceFile) {
  const value = unwrap(element);
  const row = {
    line: lineOf(sourceFile, element),
    text: element.getText(sourceFile).replace(/\s+/g, ' '),
  };
  if (ts.isArrayLiteralExpression(value) && !value.elements.some(ts.isSpreadElement)) {
    return { ...row, args: [...value.elements] };
  }
  if (ts.isObjectLiteralExpression(value)) {
    return { ...row, args: [value], fields: fieldsOf(value) };
  }
  return { ...row, args: [value] };
}

function fieldsOf(object) {
  const fields = new Map();
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

function templateRows(template, sourceFile) {
  if (!ts.isTemplateExpression(template)) {
    return [];
  }
  const headers = template.head.text
    .trim()
    .split('|')
    .map((header) => header.trim());
  const cells = template.templateSpans.map((span) => span.expression);
  const rows = [];
  for (let start = 0; start + headers.length <= cells.length; start += headers.length) {
    const values = cells.slice(start, start + headers.length);
    rows.push({
      line: lineOf(sourceFile, values[0]),
      text: values.map((value) => value.getText(sourceFile)).join(' | '),
      args: [],
      fields: new Map(headers.map((header, index) => [header, values[index]])),
    });
  }
  return rows;
}

export function formatTitle(title, row, index) {
  if (row.fields !== undefined) {
    return title.replace(/\$(#|[A-Za-z_]\w*)/g, (match, name) => {
      if (name === '#') {
        return String(index);
      }
      const value = row.fields.get(name);
      return value === undefined ? match : display(value);
    });
  }
  const args = [...row.args];
  return title.replace(/%[sdifjoOc#$%]/g, (match) => {
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

function display(node) {
  const literal = literalOf(node);
  if (literal === undefined) {
    return node.getText();
  }
  return ts.isStringLiteralLike(node) ? node.text : literal;
}

export function literalOf(node) {
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
  if (
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
      node.kind,
    )
  ) {
    return node.getText();
  }
  if (ts.isIdentifier(node) && node.text === 'undefined') {
    return 'undefined';
  }
  return undefined;
}

export function literalsIn(node) {
  const literals = [];
  const visit = (child) => {
    const literal = literalOf(child);
    if (literal === undefined) {
      ts.forEachChild(child, visit);
    } else {
      literals.push(literal);
    }
  };
  visit(node);
  return literals;
}

function isReferenced(body, name) {
  let found = false;
  const visit = (child) => {
    if (ts.isIdentifier(child) && child.text === name) {
      found = true;
    }
    if (!found) {
      ts.forEachChild(child, visit);
    }
  };
  visit(body);
  return found;
}

export function boundValues(row, callback) {
  const [first] = callback.parameters;
  if (row.fields !== undefined) {
    if (first === undefined) {
      return [];
    }
    if (!ts.isObjectBindingPattern(first.name)) {
      return [...row.fields.values()].map((node) => ({ node }));
    }
    return first.name.elements.flatMap((element) => {
      const key = (element.propertyName ?? element.name).getText();
      const node = row.fields.get(key);
      const name = ts.isIdentifier(element.name) ? element.name.text : undefined;
      if (node === undefined || (name !== undefined && !isReferenced(callback.body, name))) {
        return [];
      }
      return [{ node, name }];
    });
  }
  return row.args.flatMap((node, index) => {
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

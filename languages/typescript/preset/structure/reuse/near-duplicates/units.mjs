import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { EXPRESSIONS } from './expressions.mjs';
import { MARKUP } from './markup.mjs';
import { uniqueNames, withSnippet } from '../../../../../../shared/near-duplicates/unit-parts.mjs';
import { syntaxChildren } from '../../../syntax/children.mjs';
import { boundNames, importedNames, nameNode } from './names.mjs';
import { STATEMENTS } from './statements.mjs';
import { NONE, at, isStatementNode, opaque, textOf } from './tree-nodes.mjs';

const CONVERTERS = { ...STATEMENTS, ...EXPRESSIONS, ...MARKUP };

const UNIT_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
]);

const ACCESSOR_PREFIX = {
  [ts.SyntaxKind.GetAccessor]: 'get ',
  [ts.SyntaxKind.SetAccessor]: 'set ',
};

function joined(parent, part) {
  return parent === '' ? part : `${parent}.${part}`;
}

function keyText(name, sourceFile) {
  return ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteralLike(name)
    ? name.text
    : name.getText(sourceFile);
}

function callLabel(node, sourceFile) {
  const [first] = node.arguments;
  const argument =
    first !== undefined && ts.isStringLiteralLike(first) ? JSON.stringify(first.text) : '';
  const callee = node.expression.getText(sourceFile).replaceAll(/\s+/gu, '');
  return `${/^[\w$.#]+$/u.test(callee) ? callee : 'call'}(${argument})`;
}

function labelOf(node, parent, sourceFile) {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
    return node.name?.text ?? 'default';
  }
  if (ts.isVariableDeclaration(node)) {
    return node.name.getText(sourceFile);
  }
  if (ts.isConstructorDeclaration(node)) {
    return joined(parent, 'constructor');
  }
  if (ts.isCallExpression(node)) {
    return joined(parent, callLabel(node, sourceFile));
  }
  const named =
    ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node) || ts.isMethodDeclaration(node);
  const accessor = ACCESSOR_PREFIX[node.kind];
  if (named || accessor !== undefined) {
    return joined(parent, `${accessor ?? ''}${keyText(node.name, sourceFile)}`);
  }
  return parent;
}

function unitRoots(sourceFile) {
  const pending = [{ node: sourceFile, label: '' }];
  const roots = [];
  for (const { node, label } of pending) {
    const own = labelOf(node, label, sourceFile);
    if (UNIT_KINDS.has(node.kind) && node.body !== undefined) {
      roots.push({ node, label: own === '' ? '<anonymous>' : own });
    } else {
      pending.push(...syntaxChildren(node).map((child) => ({ node: child, label: own })));
    }
  }
  return roots.toSorted((left, right) => left.node.pos - right.node.pos);
}

function convertedTree(root, context) {
  const converted = new Map();
  const full = {
    ...context,
    get: (source) =>
      converted.get(source) ??
      opaque(isStatementNode(source) ? 'statement' : 'expression', source, context),
    lambda: (source) => lambdaNode(source, full),
  };
  for (const source of [...depthFirst(root, syntaxChildren)].toReversed()) {
    const convert = CONVERTERS[source.kind];
    if (convert !== undefined) {
      converted.set(source, withSnippet(convert(source, full), textOf(source, context)));
    }
  }
  return full;
}

function lambdaParts(source, context) {
  const parameters = at(
    'parameters',
    source,
    source.parameters.map((parameter) => context.get(parameter)),
  );
  const body = ts.isBlock(source.body)
    ? context.get(source.body)
    : at('block', source.body, [at('return', source.body, [context.get(source.body)])]);
  return [parameters, body];
}

function modifiersOf(source) {
  const isAsync = (ts.getModifiers(source) ?? []).some(
    ({ kind }) => kind === ts.SyntaxKind.AsyncKeyword,
  );
  return `${isAsync ? 'async' : ''}${source.asteriskToken === undefined ? '' : '*'}`;
}

function withModifiers(source) {
  const modifiers = modifiersOf(source);
  return modifiers === '' ? {} : { value: modifiers };
}

function lambdaNode(source, context) {
  return at({ kind: 'lambda', ...withModifiers(source) }, source, lambdaParts(source, context));
}

function unitContext(root, shared) {
  const names = { bound: boundNames(root), imported: shared.imported };
  return {
    ...shared,
    name: (text, source) => ({ ...at('name', source), ...nameNode(text, names) }),
    typeOf: (type) =>
      type === undefined ? NONE : at({ kind: 'type', value: textOf(type, shared) }, type),
  };
}

function isConstant(declaration) {
  return (
    ts.isVariableDeclaration(declaration) &&
    (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0
  );
}

function isFinal(node) {
  if (ts.isFunctionDeclaration(node)) {
    return true;
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return isConstant(node.parent);
  }
  const isPrivate = (ts.getModifiers(node) ?? []).some(
    ({ kind }) => kind === ts.SyntaxKind.PrivateKeyword,
  );
  return ts.isMethodDeclaration(node) && (isPrivate || ts.isPrivateIdentifier(node.name));
}

function unitOf({ node, label }, shared) {
  const context = convertedTree(node, unitContext(node, shared));
  const parts = [context.typeOf(node.type), ...lambdaParts(node, context)];
  const tree = at({ kind: 'function', ...withModifiers(node) }, node, parts);
  const tokens = tokenCount(node, shared.sourceFile);
  return { name: label, start: tree.start, end: tree.end, tokens, final: isFinal(node), tree };
}

const TOKEN = /[\w$]+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\S/gu;

function tokenCount(node, sourceFile) {
  return node.getText(sourceFile).match(TOKEN)?.length ?? 0;
}

export function nearDuplicateUnits(sourceFile, file, { moduleOf = (specifier) => specifier } = {}) {
  if (sourceFile.isDeclarationFile) {
    return [];
  }
  const shared = { sourceFile, imported: importedNames(sourceFile, moduleOf) };
  return uniqueNames(unitRoots(sourceFile).map((root) => unitOf(root, shared))).map((unit) => ({
    id: `${file}#${unit.name}`,
    file,
    ...unit,
  }));
}

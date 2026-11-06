import { createHash } from 'node:crypto';
import ts from 'typescript';
import { chainOf } from '../../../../shared/traversal.mjs';
export function commentAt(text, position, endPosition) {
  const isLine = text.startsWith('//', position);
  if (!isLine && !text.startsWith('/*', position)) {
    return undefined;
  }
  if (endPosition !== undefined && endPosition > position) {
    return text.slice(position, endPosition);
  }
  if (isLine) {
    const lineEnd = text.indexOf('\n', position);
    return text.slice(position, lineEnd === -1 ? text.length : lineEnd);
  }
  const close = text.indexOf('*/', position + 2);
  return text.slice(position, close === -1 ? text.length : close + 2);
}

export function commentFingerprint(comment) {
  return createHash('sha256').update(normalizeMessageText(comment)).digest('hex').slice(0, 24);
}

export function findStartedNode(sourceFile, position) {
  let deepest = sourceFile;
  function visit(node) {
    if (node.getStart(sourceFile) <= position && position < node.end) {
      deepest = node;
      ts.forEachChild(node, visit);
    }
  }
  ts.forEachChild(sourceFile, visit);
  return deepest;
}

export function findReportedNode(sourceFile, position, endPosition) {
  const containingNodes = [];
  function visit(node) {
    if (node.pos <= position && position < node.end) {
      containingNodes.push(node);
      ts.forEachChild(node, visit);
    }
  }
  visit(sourceFile);

  if (endPosition !== undefined) {
    const exactNode = containingNodes
      .slice()
      .reverse()
      .find((node) => node.getStart(sourceFile) === position && node.end === endPosition);
    if (exactNode !== undefined) {
      return exactNode;
    }
  }
  return containingNodes.at(-1) ?? sourceFile;
}

export function eslintNodeType(node) {
  if (ts.isSourceFile(node)) {
    return 'Program';
  }
  if (ts.isVariableDeclaration(node)) {
    return 'VariableDeclarator';
  }
  if (ts.isPropertyDeclaration(node)) {
    return 'PropertyDefinition';
  }
  if (ts.isClassStaticBlockDeclaration(node)) {
    return 'StaticBlock';
  }
  return ts.SyntaxKind[node.kind];
}

export function stableSyntaxAnchor(node) {
  if (
    node.kind === ts.SyntaxKind.EqualsGreaterThanToken &&
    node.parent !== undefined &&
    ts.isArrowFunction(node.parent)
  ) {
    return node.parent;
  }
  return node;
}

export function nodeChain(node) {
  return chainOf(node, (current) => current.parent);
}

export function enclosingSymbol(node) {
  const names = [];
  for (const current of nodeChain(node)) {
    const name = declarationName(current);
    if (name !== undefined && names.at(-1) !== name) {
      names.push(name);
    }
  }
  return names.length === 0 ? undefined : names.reverse().join('.');
}

function declarationName(node) {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isVariableDeclaration(node)
  ) {
    return node.name?.getText();
  }
  if (ts.isConstructorDeclaration(node)) {
    return 'constructor';
  }
  return ts.isPropertyAssignment(node) && namesMember(node.initializer)
    ? node.name.getText()
    : undefined;
}

function namesMember(initializer) {
  return (
    ts.isArrowFunction(initializer) ||
    ts.isFunctionExpression(initializer) ||
    ts.isObjectLiteralExpression(initializer) ||
    ts.isClassExpression(initializer)
  );
}

function fingerprintText(node) {
  if (ts.isFunctionLike(node) && node.body !== undefined) {
    return node.getSourceFile().text.slice(node.getStart(), node.body.getStart());
  }
  return node.getText();
}

export function syntaxFingerprint(node, nodeType) {
  if (nodeType === 'Program') {
    return 'program';
  }

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    fingerprintText(node),
  );
  const tokens = [...scannedTokens(scanner)];
  const semanticTokens = tokens
    .filter(
      (token, index) =>
        token.kind !== ts.SyntaxKind.CommaToken || !isClosingToken(tokens[index + 1]?.kind),
    )
    .map((token) => `${String(token.kind)}:${token.text}`);
  return createHash('sha256').update(semanticTokens.join('\0')).digest('hex').slice(0, 24);
}

function isClosingToken(kind) {
  return (
    kind === ts.SyntaxKind.CloseBraceToken ||
    kind === ts.SyntaxKind.CloseBracketToken ||
    kind === ts.SyntaxKind.CloseParenToken
  );
}

export function normalizeMessageText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

export function scriptKind(filePath) {
  if (filePath.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function scannedTokens(scanner) {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      const kind = scanner.scan();
      return kind === ts.SyntaxKind.EndOfFileToken
        ? { done: true }
        : {
            done: false,
            value: { kind, text: scanner.getTokenText() },
          };
    },
  };
}

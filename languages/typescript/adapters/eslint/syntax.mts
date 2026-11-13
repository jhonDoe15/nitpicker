import { createHash } from 'node:crypto';
import type TypeScript from 'typescript';
import {
  formatAgnosticTokens as untypedFormatAgnosticTokens,
  sourceLanguage as untypedSourceLanguage,
} from '../../../../shared/source-text/format-tokens.mjs';
import { chainOf, parentOf, typescriptApi } from '../typed/typescript-program.mts';
import { nameFreeHash as untypedNameFreeHash } from '../../../../shared/rules/finding-helpers.mjs';

type Node = TypeScript.Node;
type SourceFile = TypeScript.SourceFile;

const formatAgnosticTokens: (
  text: string,
  language: unknown,
  options: { readonly comments: boolean },
) => readonly { readonly text: string }[] = untypedFormatAgnosticTokens;
const sourceLanguage: (filePath: string) => unknown = untypedSourceLanguage;
const nameFreeHash: (text: string, name: string) => string = untypedNameFreeHash;

const ts = typescriptApi();

export function commentAt(
  text: string,
  position: number,
  endPosition: number | undefined,
): string | undefined {
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

export function commentFingerprint(comment: string): string {
  return createHash('sha256').update(normalizeMessageText(comment)).digest('hex').slice(0, 24);
}

export function findStartedNode(sourceFile: SourceFile, position: number): Node {
  let deepest: Node = sourceFile;
  function visit(node: Node): void {
    if (node.getStart(sourceFile) <= position && position < node.end) {
      deepest = node;
      ts.forEachChild(node, visit);
    }
  }
  ts.forEachChild(sourceFile, visit);
  return deepest;
}

export function findReportedNode(
  sourceFile: SourceFile,
  position: number,
  endPosition: number | undefined,
): Node {
  const containingNodes: Node[] = [];
  function visit(node: Node): void {
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

export function eslintNodeType(node: Node): string {
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

export function stableSyntaxAnchor(node: Node): Node {
  const parent = parentOf(node);
  if (
    node.kind === ts.SyntaxKind.EqualsGreaterThanToken &&
    parent !== undefined &&
    ts.isArrowFunction(parent)
  ) {
    return parent;
  }
  return node;
}

export function nodeChain(node: Node): Node[] {
  return chainOf(node, parentOf);
}

export function enclosingFunctionHash(node: Node, symbol: string | undefined): string | undefined {
  const owner = nodeChain(node).find(
    (current) => ts.isFunctionLike(current) && 'body' in current && current.body !== undefined,
  );
  if (owner === undefined || symbol === undefined) {
    return undefined;
  }
  const lines = owner.getText().split(/\r?\n/u);
  return nameFreeHash(lines.map((line) => line.trim()).join('\n'), symbol);
}

export function enclosingSymbol(node: Node): string | undefined {
  const names: string[] = [];
  for (const current of nodeChain(node)) {
    const name = declarationName(current);
    if (name !== undefined && names.at(-1) !== name) {
      names.push(name);
    }
  }
  return names.length === 0 ? undefined : names.reverse().join('.');
}

function declarationName(node: Node): string | undefined {
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
  return undefined;
}

function fingerprintText(node: Node): string {
  if (ts.isFunctionLike(node) && 'body' in node && node.body !== undefined) {
    return node.getSourceFile().text.slice(node.getStart(), node.body.getStart());
  }
  return node.getText();
}

const SCRIPT = sourceLanguage('script.ts');
const FINGERPRINT_LENGTH = 24;

export function syntaxFingerprint(node: Node, nodeType: string): string {
  if (nodeType === 'Program') {
    return 'program';
  }
  const semanticTokens = formatAgnosticTokens(fingerprintText(node), SCRIPT, { comments: false });
  return createHash('sha256')
    .update(semanticTokens.map(({ text }) => text).join('\0'))
    .digest('hex')
    .slice(0, FINGERPRINT_LENGTH);
}

export function normalizeMessageText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function scriptKind(filePath: string): TypeScript.ScriptKind {
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

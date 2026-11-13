import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { untypedChildren } from './type-syntax.mjs';

const TEXT_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);
const CLOSERS = new Set([')', ']', '}', '>']);

function tokenText(node, sourceFile) {
  if (TEXT_KINDS.has(node.kind)) {
    return `${String(node.kind)}:${node.text}`;
  }
  const text = node.getText(sourceFile);
  return node.kind === ts.SyntaxKind.JsxText ? text.trim().replaceAll(/\s+/gu, ' ') : text;
}

export function leafTexts(nodes, sourceFile, { untyped = false } = {}) {
  const leaves = [];
  const pending = [...nodes];
  for (const node of pending) {
    const all = node.getChildren(sourceFile).filter((child) => !ts.isJSDoc(child));
    if (all.length === 0) leaves.push(node);
    pending.push(...(untyped ? untypedChildren(node, all) : all));
  }
  return leaves
    .toSorted((left, right) => left.pos - right.pos)
    .map((leaf) => tokenText(leaf, sourceFile))
    .filter((text) => text !== '');
}

export function normalizedTexts(texts) {
  const kept = texts.filter((text) => text !== ';');
  return kept.filter((text, index) => !(text === ',' && CLOSERS.has(kept[index + 1])));
}

import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import { untypedChildren } from './type-syntax.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const ts = typescriptApi();
const CLOSERS = new Set<string | undefined>([')', ']', '}', '>']);

function tokenText(node: TypeScript.Node, sourceFile: TypeScript.SourceFile): string {
  if (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)) {
    return `${String(node.kind)}:${node.text}`;
  }
  const text = node.getText(sourceFile);
  return node.kind === ts.SyntaxKind.JsxText ? text.trim().replaceAll(/\s+/gu, ' ') : text;
}

export function leafTexts(
  nodes: readonly TypeScript.Node[],
  sourceFile: TypeScript.SourceFile,
  { untyped }: { readonly untyped?: true } = {},
): string[] {
  const leaves: TypeScript.Node[] = [];
  const pending = [...nodes];
  for (const node of pending) {
    const all = node.getChildren(sourceFile).filter((child) => !ts.isJSDoc(child));
    if (all.length === 0) {
      leaves.push(node);
    }
    appendAll(pending, untyped === true ? untypedChildren(node, all) : all);
  }
  return leaves
    .toSorted((left, right) => left.pos - right.pos)
    .map((leaf) => tokenText(leaf, sourceFile))
    .filter((text) => text !== '');
}

export function normalizedTexts(texts: readonly string[]): string[] {
  const kept = texts.filter((text) => text !== ';');
  return kept.filter((text, index) => !(text === ',' && CLOSERS.has(kept[index + 1])));
}

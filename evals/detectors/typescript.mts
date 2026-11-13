import type typescript from 'typescript';
import { ts as runtimeApi } from '../../languages/typescript/typescript-api/typescript-api.mjs';
import type { SourceComment } from './languages/masking/lines.mts';

export const ts: typeof typescript = runtimeApi;

export type Node = typescript.Node;
export type SourceFile = typescript.SourceFile;

const SCRIPT_KINDS = new Map<string, typescript.ScriptKind>([
  ['.ts', ts.ScriptKind.TS],
  ['.mts', ts.ScriptKind.TS],
  ['.cts', ts.ScriptKind.TS],
  ['.tsx', ts.ScriptKind.TSX],
  ['.js', ts.ScriptKind.JS],
  ['.mjs', ts.ScriptKind.JS],
  ['.cjs', ts.ScriptKind.JS],
  ['.jsx', ts.ScriptKind.JSX],
]);

export function isSourcePath(filePath: string): boolean {
  return SCRIPT_KINDS.has(extensionOf(filePath));
}

export function isTestPath(filePath: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath) || /(^|\/)__tests__\//.test(filePath);
}

export function parseSource(filePath: string, text: string): SourceFile {
  return ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    SCRIPT_KINDS.get(extensionOf(filePath)) ?? ts.ScriptKind.TS,
  );
}

export function commentsOf(sourceFile: SourceFile): SourceComment[] {
  const fullText = sourceFile.getFullText();
  const seen = new Set<number>();
  const comments: SourceComment[] = [];
  function visit(node: Node): void {
    const children = node.getChildren(sourceFile);
    if (children.length > 0) {
      for (const child of children) {
        visit(child);
      }
      return;
    }
    if (node.kind === ts.SyntaxKind.JsxText) {
      return;
    }
    for (const range of ts.getLeadingCommentRanges(fullText, node.pos) ?? []) {
      if (seen.has(range.pos)) {
        continue;
      }
      seen.add(range.pos);
      const block = range.kind === ts.SyntaxKind.MultiLineCommentTrivia;
      comments.push({
        text: fullText.slice(range.pos + 2, block ? range.end - 2 : range.end),
        line: sourceFile.getLineAndCharacterOfPosition(range.pos).line + 1,
        block,
      });
    }
  }
  visit(sourceFile);
  return comments;
}

export function lineOf(sourceFile: SourceFile, node: Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function extensionOf(filePath: string): string {
  const match = /\.[^./]+$/.exec(filePath);
  return match === null ? '' : match[0];
}

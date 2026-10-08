import ts from '../../typescript/node_modules/typescript/lib/typescript.js';

export { ts };

const SCRIPT_KINDS = new Map([
  ['.ts', ts.ScriptKind.TS],
  ['.mts', ts.ScriptKind.TS],
  ['.cts', ts.ScriptKind.TS],
  ['.tsx', ts.ScriptKind.TSX],
  ['.js', ts.ScriptKind.JS],
  ['.mjs', ts.ScriptKind.JS],
  ['.cjs', ts.ScriptKind.JS],
  ['.jsx', ts.ScriptKind.JSX],
]);

export function isSourcePath(filePath) {
  return SCRIPT_KINDS.has(extensionOf(filePath));
}

export function isTestPath(filePath) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath) || /(^|\/)__tests__\//.test(filePath);
}

export function parseSource(filePath, text) {
  return ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    SCRIPT_KINDS.get(extensionOf(filePath)) ?? ts.ScriptKind.TS,
  );
}

/**
 * Every comment in the file, found by walking the real token stream, so text that only looks like
 * a comment (inside strings, templates, regular expressions, JSX text) is never reported.
 * Returns `{ text, line, block }` with the comment delimiters removed.
 */
export function commentsOf(sourceFile) {
  const fullText = sourceFile.getFullText();
  const seen = new Set();
  const comments = [];
  const visit = (node) => {
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
  };
  visit(sourceFile);
  return comments;
}

export function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function extensionOf(filePath) {
  const match = /\.[^./]+$/.exec(filePath);
  return match === null ? '' : match[0];
}

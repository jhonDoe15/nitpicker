import { lstatSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const LINE_DIRECTIVE =
  /^(?<space>\s*)(?<keyword>(?:eslint|oxlint)-(?:disable|enable)(?:-line|-next-line)?)(?:\s|$)/u;
const BLOCK_DIRECTIVE =
  /^(?<space>\s*)(?<keyword>(?:eslint|oxlint)-(?:disable|enable)(?:-line|-next-line)?|eslint|eslint-env|globals?|exported)(?:\s|$)/u;

export function directiveComments(text, fileName) {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  return commentRanges(sourceFile)
    .map((range) => directiveAt(sourceFile, range))
    .filter((directive) => directive !== undefined);
}

function commentRanges(sourceFile) {
  const ranges = new Map();
  const text = sourceFile.text;
  const nodes = [sourceFile];
  for (const node of nodes) {
    addRanges(ranges, ts.getLeadingCommentRanges(text, node.getFullStart()));
    addRanges(ranges, ts.getTrailingCommentRanges(text, node.getEnd()));
    nodes.push(...node.getChildren(sourceFile));
  }
  return [...ranges.values()].sort((left, right) => left.pos - right.pos);
}

function addRanges(ranges, found) {
  for (const range of found ?? []) ranges.set(range.pos, range);
}

function directiveAt(sourceFile, range) {
  const comment = sourceFile.text.slice(range.pos, range.end);
  const isLine = range.kind === ts.SyntaxKind.SingleLineCommentTrivia;
  const body = isLine ? comment.slice(2) : comment.slice(2, -2);
  const match = (isLine ? LINE_DIRECTIVE : BLOCK_DIRECTIVE).exec(body);
  if (match === null) return undefined;
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(range.pos);
  return {
    comment,
    keywordStart: range.pos + 2 + match.groups.space.length,
    isEslint: !match.groups.keyword.startsWith('oxlint'),
    line: line + 1,
    column: character + 1,
  };
}

export function inlineConfigMessages(directives) {
  return directives
    .filter((directive) => directive.isEslint)
    .map((directive) => ({
      ruleId: undefined,
      severity: 1,
      message: `'${directive.comment.trim()}' has no effect because you have 'noInlineConfig' setting in your config.`,
      line: directive.line,
      column: directive.column,
    }));
}

export function withoutDirectives(text, directives) {
  let result = text;
  for (const { keywordStart } of directives) {
    result = `${result.slice(0, keywordStart)}_${result.slice(keywordStart + 1)}`;
  }
  return result;
}

export function overlayFile({ stage, projectRoot, relativePath, content }) {
  const segments = relativePath.split('/');
  let stagePath = stage;
  let projectPath = projectRoot;
  for (const segment of segments.slice(0, -1)) {
    stagePath = path.join(stagePath, segment);
    projectPath = path.join(projectPath, segment);
    if (lstatSync(stagePath).isSymbolicLink()) materializeDirectory(stagePath, projectPath);
  }
  const filePath = path.join(stagePath, segments.at(-1));
  unlinkSync(filePath);
  writeFileSync(filePath, content);
}

function materializeDirectory(stagePath, projectPath) {
  unlinkSync(stagePath);
  mkdirSync(stagePath);
  for (const entry of readdirSync(projectPath)) {
    symlinkSync(path.join(projectPath, entry), path.join(stagePath, entry));
  }
}

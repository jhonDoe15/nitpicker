import { lstatSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';

const TOGGLE_KEYWORD = String.raw`(?:eslint|oxlint)-(?:disable|enable)(?:-line|-next-line)?`;
const LINE_DIRECTIVE = directivePattern(TOGGLE_KEYWORD);
const INVISIBLE_TO_OXLINT = '\uFEFF';
const RULE_TOKEN = /[\w@/-]+/gu;
const BLOCK_DIRECTIVE = directivePattern(`${TOGGLE_KEYWORD}|eslint|eslint-env|globals?|exported`);

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
    if (node.kind !== ts.SyntaxKind.JsxText) {
      addRanges(ranges, ts.getLeadingCommentRanges(text, node.getFullStart()));
    }
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
  const keywordStart = range.pos + 2 + match.groups.space.length;
  const hasSpace = match.groups.space.length > 0;
  const neutralizedAt = hasSpace ? keywordStart - 1 : keywordStart;
  const neutralized = sourceFile.getLineAndCharacterOfPosition(neutralizedAt);
  return {
    comment,
    start: range.pos,
    keywordEnd: keywordStart + match.groups.keyword.length,
    neutralizedAt,
    neutralizer: hasSpace ? INVISIBLE_TO_OXLINT : '_',
    neutralizedLocation: `${String(neutralized.line + 1)}:${String(neutralized.character + 1)}`,
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
  for (const { neutralizedAt, neutralizer } of directives) {
    result = `${result.slice(0, neutralizedAt)}${neutralizer}${result.slice(neutralizedAt + 1)}`;
  }
  return result;
}

export function withRenamedRules(text, directives, renames) {
  let result = text;
  for (const directive of directives.filter(({ isEslint }) => isEslint).reverse()) {
    const keywordEnd = directive.keywordEnd - directive.start;
    const renamed = `${directive.comment.slice(0, keywordEnd)}${directive.comment
      .slice(keywordEnd)
      .replaceAll(RULE_TOKEN, (token) => renames.get(token) ?? token)}`;
    result = `${result.slice(0, directive.start)}${renamed}${result.slice(directive.start + directive.comment.length)}`;
  }
  return result;
}

export function overlayFile({ stage, projectRoot, relativePath, content }) {
  const filePath = path.join(
    materializedDirectory({ stage, projectRoot, relativeDirectory: path.dirname(relativePath) }),
    path.basename(relativePath),
  );
  unlinkSync(filePath);
  writeFileSync(filePath, content);
}

export function materializedDirectory({ stage, projectRoot, relativeDirectory }) {
  const segments = relativeDirectory.split('/').filter((segment) => segment !== '.');
  let stagePath = stage;
  let projectPath = projectRoot;
  for (const segment of segments) {
    stagePath = path.join(stagePath, segment);
    projectPath = path.join(projectPath, segment);
    if (lstatSync(stagePath).isSymbolicLink()) materializeDirectory(stagePath, projectPath);
  }
  return stagePath;
}

function materializeDirectory(stagePath, projectPath) {
  unlinkSync(stagePath);
  mkdirSync(stagePath);
  for (const entry of readdirSync(projectPath)) {
    symlinkSync(path.join(projectPath, entry), path.join(stagePath, entry));
  }
}

function directivePattern(keywords) {
  return new RegExp(String.raw`^(?<space>\s*)(?<keyword>${keywords})(?:\s|$)`, 'u');
}

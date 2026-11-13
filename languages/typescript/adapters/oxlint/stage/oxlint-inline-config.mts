import { lstatSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../typed/typescript-program.mts';
import type { LintMessage } from '../plan/oxlint-shapes.mts';

export type Directive = {
  readonly comment: string;
  readonly start: number;
  readonly keywordEnd: number;
  readonly neutralizedAt: number;
  readonly neutralizer: string;
  readonly neutralizedLocation: string;
  readonly isEslint: boolean;
  readonly line: number;
  readonly column: number;
};

type StagedFile = { readonly stage: string; readonly projectRoot: string };

const ts = typescriptApi();

const TOGGLE_KEYWORD = /(?:eslint|oxlint)-(?:disable|enable)(?:-line|-next-line)?/u;
const LINE_DIRECTIVE = directivePattern(TOGGLE_KEYWORD);
const INVISIBLE_TO_OXLINT = '\uFEFF';
const RULE_TOKEN = /[\w@/-]+/gu;
const BLOCK_DIRECTIVE = directivePattern(
  new RegExp(`${TOGGLE_KEYWORD.source}|eslint|eslint-env|globals?|exported`, 'u'),
);

const DIRECTIVE_KEYWORD = /eslint|oxlint|global|exported/u;

export function directiveComments(text: string, fileName: string): Directive[] {
  if (!DIRECTIVE_KEYWORD.test(text)) {
    return [];
  }
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  return commentRanges(sourceFile)
    .map((range) => directiveAt(sourceFile, range))
    .filter((directive) => directive !== undefined);
}

function commentRanges(sourceFile: TypeScript.SourceFile): TypeScript.CommentRange[] {
  const ranges = new Map<number, TypeScript.CommentRange>();
  const text = sourceFile.text;
  const nodes: TypeScript.Node[] = [sourceFile];
  for (const node of nodes) {
    if (node.kind !== ts.SyntaxKind.JsxText) {
      addRanges(ranges, ts.getLeadingCommentRanges(text, node.getFullStart()));
    }
    addRanges(ranges, ts.getTrailingCommentRanges(text, node.getEnd()));
    nodes.push(...node.getChildren(sourceFile));
  }
  return [...ranges.values()].sort((left, right) => left.pos - right.pos);
}

function addRanges(
  ranges: Map<number, TypeScript.CommentRange>,
  found: readonly TypeScript.CommentRange[] | undefined,
): void {
  for (const range of found ?? []) ranges.set(range.pos, range);
}

function directiveAt(
  sourceFile: TypeScript.SourceFile,
  range: TypeScript.CommentRange,
): Directive | undefined {
  const comment = sourceFile.text.slice(range.pos, range.end);
  const isLine = range.kind === ts.SyntaxKind.SingleLineCommentTrivia;
  const body = isLine ? comment.slice(2) : comment.slice(2, -2);
  const match = (isLine ? LINE_DIRECTIVE : BLOCK_DIRECTIVE).exec(body);
  if (match === null) return undefined;
  const space = match.groups?.['space'] ?? '';
  const keyword = match.groups?.['keyword'] ?? '';
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(range.pos);
  const keywordStart = range.pos + 2 + space.length;
  const hasSpace = space.length > 0;
  const neutralizedAt = hasSpace ? keywordStart - 1 : keywordStart;
  const neutralized = sourceFile.getLineAndCharacterOfPosition(neutralizedAt);
  return {
    comment,
    start: range.pos,
    keywordEnd: keywordStart + keyword.length,
    neutralizedAt,
    neutralizer: hasSpace ? INVISIBLE_TO_OXLINT : '_',
    neutralizedLocation: `${String(neutralized.line + 1)}:${String(neutralized.character + 1)}`,
    isEslint: !keyword.startsWith('oxlint'),
    line: line + 1,
    column: character + 1,
  };
}

export function inlineConfigMessages(directives: readonly Directive[]): LintMessage[] {
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

export function withoutDirectives(text: string, directives: readonly Directive[]): string {
  let result = text;
  for (const { neutralizedAt, neutralizer } of directives) {
    result = `${result.slice(0, neutralizedAt)}${neutralizer}${result.slice(neutralizedAt + 1)}`;
  }
  return result;
}

export function withRenamedRules(
  text: string,
  directives: readonly Directive[],
  renames: ReadonlyMap<string, string>,
): string {
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

export function overlayFile({
  stage,
  projectRoot,
  relativePath,
  content,
}: StagedFile & { readonly relativePath: string; readonly content: string }): void {
  const filePath = path.join(
    materializedDirectory({ stage, projectRoot, relativeDirectory: path.dirname(relativePath) }),
    path.basename(relativePath),
  );
  unlinkSync(filePath);
  writeFileSync(filePath, content);
}

export function materializedDirectory({
  stage,
  projectRoot,
  relativeDirectory,
}: StagedFile & { readonly relativeDirectory: string }): string {
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

function materializeDirectory(stagePath: string, projectPath: string): void {
  unlinkSync(stagePath);
  mkdirSync(stagePath);
  for (const entry of readdirSync(projectPath)) {
    symlinkSync(path.join(projectPath, entry), path.join(stagePath, entry));
  }
}

function directivePattern(keywords: RegExp): RegExp {
  return new RegExp(String.raw`^(?<space>\s*)(?<keyword>${keywords.source})(?:\s|$)`, 'u');
}

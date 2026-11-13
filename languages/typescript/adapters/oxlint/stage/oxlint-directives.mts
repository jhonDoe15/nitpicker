import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  directiveComments,
  inlineConfigMessages,
  overlayFile,
  withoutDirectives,
  withRenamedRules,
} from './oxlint-inline-config.mts';
import type { Directive } from './oxlint-inline-config.mts';
import type { LintResult } from '../plan/oxlint-shapes.mts';

export type DirectiveFile = {
  readonly file: string;
  readonly text: string;
  readonly directives: readonly Directive[];
};

export function neutralizeInlineConfig(
  stage: string,
  projectRoot: string,
  files: readonly string[],
): { readonly results: LintResult[]; readonly neutralized: Map<string, Set<string>> } {
  const neutralized = new Map<string, Set<string>>();
  const results = files.flatMap((file) => {
    const text = readFileSync(path.join(projectRoot, file), 'utf8');
    const directives = directiveComments(text, file);
    if (directives.length === 0) return [];
    overlayFile({
      stage,
      projectRoot,
      relativePath: file,
      content: withoutDirectives(text, directives),
    });
    neutralized.set(
      file,
      new Set(directives.map(({ neutralizedLocation }) => neutralizedLocation)),
    );
    const messages = inlineConfigMessages(directives);
    return messages.length === 0 ? [] : [{ filePath: file, messages }];
  });
  return { results, neutralized };
}

export function directiveFilesOf(
  projectRoot: string,
  files: readonly string[],
  noInlineConfig: readonly string[],
): DirectiveFile[] {
  const locked = new Set(noInlineConfig);
  return files
    .filter((file) => !locked.has(file))
    .map((file) => ({ file, text: readFileSync(path.join(projectRoot, file), 'utf8') }))
    .filter(({ text }) => text.includes('eslint-') || text.includes('oxlint-'))
    .map(({ file, text }) => ({ file, text, directives: directiveComments(text, file) }))
    .filter(({ directives }) => directives.length > 0);
}

function oxlintDirectives(directives: readonly Directive[]): Directive[] {
  return directives.filter(({ isEslint }) => !isEslint);
}

export function oxlintDirectiveLocations(
  directiveFiles: readonly DirectiveFile[],
): [string, Set<string>][] {
  return directiveFiles
    .map(({ file, directives }): [string, Set<string>] => [
      file,
      new Set(oxlintDirectives(directives).map(({ neutralizedLocation }) => neutralizedLocation)),
    ])
    .filter(([, locations]) => locations.size > 0);
}

export function rewriteDirectiveComments({
  stage,
  projectRoot,
  directiveFiles,
  ruleNames,
}: {
  readonly stage: string;
  readonly projectRoot: string;
  readonly directiveFiles: readonly DirectiveFile[];
  readonly ruleNames: ReadonlyMap<string, string>;
}): void {
  const renames = new Map(
    [...ruleNames]
      .filter(([oxlintName]) => oxlintName.startsWith('js-'))
      .map(([oxlintName, ruleId]): [string, string] => [ruleId, oxlintName]),
  );
  for (const { file, text, directives } of directiveFiles) {
    const content = withRenamedRules(
      withoutDirectives(text, oxlintDirectives(directives)),
      directives,
      renames,
    );
    if (content !== text) overlayFile({ stage, projectRoot, relativePath: file, content });
  }
}

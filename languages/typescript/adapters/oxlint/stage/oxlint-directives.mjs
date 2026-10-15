import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  directiveComments,
  inlineConfigMessages,
  overlayFile,
  withoutDirectives,
  withRenamedRules,
} from './oxlint-inline-config.mjs';

export function neutralizeInlineConfig(stage, projectRoot, files) {
  const neutralized = new Map();
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

export function directiveFilesOf(projectRoot, files, noInlineConfig) {
  const locked = new Set(noInlineConfig);
  return files
    .filter((file) => !locked.has(file))
    .map((file) => ({ file, text: readFileSync(path.join(projectRoot, file), 'utf8') }))
    .filter(({ text }) => text.includes('eslint-') || text.includes('oxlint-'))
    .map(({ file, text }) => ({ file, text, directives: directiveComments(text, file) }))
    .filter(({ directives }) => directives.length > 0);
}

function oxlintDirectives(directives) {
  return directives.filter(({ isEslint }) => !isEslint);
}

export function oxlintDirectiveLocations(directiveFiles) {
  return directiveFiles
    .map(({ file, directives }) => [
      file,
      new Set(oxlintDirectives(directives).map(({ neutralizedLocation }) => neutralizedLocation)),
    ])
    .filter(([, locations]) => locations.size > 0);
}

export function rewriteDirectiveComments({ stage, projectRoot, directiveFiles, ruleNames }) {
  const renames = new Map(
    [...ruleNames]
      .filter(([oxlintName]) => oxlintName.startsWith('js-'))
      .map(([oxlintName, ruleId]) => [ruleId, oxlintName]),
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

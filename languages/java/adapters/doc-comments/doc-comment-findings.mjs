import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { javaDocComments } from './java-doc-comments.mjs';
import { kotlinDocComments } from './kotlin-doc-comments.mjs';

const DOC_COMMENT_TOOL = 'facts';

const READERS = { '.java': javaDocComments, '.kt': kotlinDocComments };

function sourceFilesUnder(directory, extensions) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.includes(path.extname(entry.name)))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function mainSourceFiles(projectRoot, { manifest, kotlin }) {
  const roots = [
    ...(manifest.sourceRoots ?? []),
    ...(kotlin ? (manifest.kotlinSourceRoots ?? []) : []),
  ];
  const extensions = kotlin ? ['.java', '.kt'] : ['.java'];
  const files = roots.flatMap((root) => {
    const directory = pathInside(projectRoot, root);
    return directory === undefined ? [] : sourceFilesUnder(directory, extensions);
  });
  return [...new Set(files)].sort();
}

export function readDocCommentFindings({ projectRoot, manifest, kotlin }) {
  const docComments = mainSourceFiles(projectRoot, { manifest, kotlin }).flatMap((absolute) => {
    const file = path.relative(projectRoot, absolute).replaceAll('\\', '/');
    return READERS[path.extname(absolute)](readFileSync(absolute, 'utf8')).map((comment) => ({
      file,
      ...comment,
    }));
  });
  return sharedFactFindings(
    { docComments },
    {
      language: kotlin ? 'kotlin' : 'java',
      analyzerName: DOC_COMMENT_TOOL,
      rules: [RULE_IDS.docCommentContent],
    },
  );
}

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { javaDocComments } from './java-doc-comments.mjs';
import { kotlinDocComments } from './kotlin-doc-comments.mjs';
import { callUntyped } from '../typed/java-values.mts';
import { fieldOf, fieldsOf, listOf, textsOf } from '../../../../shared/values/readers.mts';

type DocCommentRequest = {
  readonly projectRoot: string;
  readonly manifest: unknown;
  readonly kotlin: boolean;
};

export const DOC_COMMENT_TOOL = 'facts';

function sourceFilesUnder(directory: string, extensions: readonly string[]): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.includes(path.extname(entry.name)))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function mainSourceFiles({ projectRoot, manifest, kotlin }: DocCommentRequest): string[] {
  const roots = [
    ...textsOf(fieldOf(manifest, 'sourceRoots')),
    ...(kotlin ? textsOf(fieldOf(manifest, 'kotlinSourceRoots')) : []),
  ];
  const extensions = kotlin ? ['.java', '.kt'] : ['.java'];
  const files = roots.flatMap((root) => {
    const directory: unknown = pathInside(projectRoot, root);
    return typeof directory === 'string' ? sourceFilesUnder(directory, extensions) : [];
  });
  return [...new Set(files)].sort();
}

function docCommentsIn(absolute: string): unknown {
  const text = readFileSync(absolute, 'utf8');
  return path.extname(absolute) === '.kt' ? kotlinDocComments(text) : javaDocComments(text);
}

export function readDocCommentFindings(request: DocCommentRequest): unknown {
  const { projectRoot, kotlin } = request;
  const docComments = mainSourceFiles(request).flatMap((absolute) => {
    const file = path.relative(projectRoot, absolute).replaceAll('\\', '/');
    return listOf(docCommentsIn(absolute)).map((comment) => ({ file, ...fieldsOf(comment) }));
  });
  return callUntyped(
    sharedFactFindings,
    { docComments },
    {
      language: kotlin ? 'kotlin' : 'java',
      analyzerName: DOC_COMMENT_TOOL,
      rules: [fieldOf(RULE_IDS, 'docCommentContent')],
    },
  );
}

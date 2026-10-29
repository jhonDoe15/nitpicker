import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const fullVersionTag = /^[\w.-]+\/[\w./-]+@v\d+\.\d+\.\d+$/u;
const yamlFence =
  /^ {0,3}(`{3,}|~{3,})(?:yaml|yml)[^\S\r\n]*\r?\n([\s\S]*?)^ {0,3}\1[^\S\r\n]*$/gmu;

function references(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'uses' ? [child] : references(child),
  );
}

function unpinnedActions(text) {
  return references(parse(text)).filter(
    (reference) =>
      typeof reference !== 'string' ||
      (!reference.startsWith('./') && !fullVersionTag.test(reference)),
  );
}

function yamlDocuments(file, text) {
  return file.endsWith('.md') ? [...text.matchAll(yamlFence)].map((match) => match[2]) : [text];
}

export function actionPinProblems(root) {
  const files = [
    ...new Set(
      globSync(['**/*.{yml,yaml,md}', '.github/**/*.{yml,yaml,md}'], {
        cwd: root,
        exclude: ['**/node_modules/**', '.git/**', 'reports/**'],
      }),
    ),
  ].sort();

  return files.flatMap((file) => {
    const text = readFileSync(path.join(root, file), 'utf8');
    return yamlDocuments(file, text)
      .flatMap(unpinnedActions)
      .map((reference) => `${file}: pin ${String(reference)} to a full version tag (vX.Y.Z)`);
  });
}

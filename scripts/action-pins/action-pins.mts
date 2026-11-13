import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { fieldsOf, listOf } from '../json/fields.mts';

const fullVersionTag = /^[\w.-]+\/[\w./-]+@v\d+\.\d+\.\d+$/u;
const fullCommitSha = /^[\w.-]+\/[\w./-]+@[\da-f]{40}$/u;
const ownReleaseLine = /^jhonDoe15\/nitpicker@v\d+\.\d+$/u;
const pinned = [fullVersionTag, fullCommitSha, ownReleaseLine];
const yamlFence =
  /^ {0,3}(`{3,}|~{3,})(?:yaml|yml)[^\S\r\n]*\r?\n([\s\S]*?)^ {0,3}\1[^\S\r\n]*$/gmu;

function references(value: unknown): unknown[] {
  const found: unknown[] = [];
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  for (const node of pending) {
    if (typeof node !== 'object' || node === null || seen.has(node)) {
      continue;
    }
    seen.add(node);
    const fields = fieldsOf(node);
    if (fields !== undefined && Object.hasOwn(fields, 'uses')) {
      found.push(fields['uses']);
    }
    pending.push(...(fields === undefined ? listOf(node) : Object.values(fields)));
  }
  return found;
}

export function unpinnedActions(text: string): unknown[] {
  const parsed: unknown = parse(text);
  return references(parsed).filter(
    (reference) =>
      typeof reference !== 'string' ||
      (!reference.startsWith('./') && !pinned.some((pattern) => pattern.test(reference))),
  );
}

function yamlDocuments(file: string, text: string): string[] {
  return file.endsWith('.md')
    ? [...text.matchAll(yamlFence)].map((match) => match[2] ?? '')
    : [text];
}

export function actionPinProblems(root: string): string[] {
  const base = path.resolve(root);
  const files = [
    ...new Set(
      globSync(['**/*.{yml,yaml,md}', '.github/**/*.{yml,yaml,md}'], {
        cwd: root,
        exclude: ['**/node_modules/**', '.git/**', 'reports/**', 'core/init/templates/**'],
      }),
    ),
  ].sort();

  return files.flatMap((file) => {
    const full = path.resolve(base, file);
    if (!full.startsWith(base + path.sep)) {
      throw new Error(`Action pin source is outside the repository: ${file}`);
    }
    const text = readFileSync(full, 'utf8');
    return yamlDocuments(file, text)
      .flatMap(unpinnedActions)
      .map((reference) => `${file}: pin ${String(reference)} to a full version tag (vX.Y.Z)`);
  });
}

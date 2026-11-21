import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type ts from 'typescript';
import { TROUBLESHOOTING_FILE } from '../troubleshooting.mts';

export const root = path.resolve(import.meta.dirname, '../../..');
const SOURCE_FOLDERS = ['core', 'shared', 'languages'];
const SKIPPED_FOLDERS = new Set(['node_modules', 'fixtures', 'test-support', '__tests__']);
const ANCHOR_LINK = /troubleshooting\.md#([a-z0-9-]+)/gu;

function inRepository(relative: string): string {
  const full = path.resolve(root, relative);
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`${relative} is outside ${root}`);
  }
  return full;
}

export function read(relative: string): string {
  return readFileSync(inRepository(relative), 'utf8');
}

export function files(directory: string, accepts: (name: string) => boolean): string[] {
  const found: string[] = [];
  const pending = [directory];
  for (const folder of pending) {
    for (const entry of readdirSync(inRepository(folder), { withFileTypes: true })) {
      const relative = `${folder}/${entry.name}`;
      if (entry.isDirectory()) {
        pending.push(...(SKIPPED_FOLDERS.has(entry.name) ? [] : [relative]));
      } else if (accepts(entry.name)) {
        found.push(relative);
      }
    }
  }
  return found.toSorted();
}

export function productionSources(): string[] {
  return SOURCE_FOLDERS.flatMap((folder) =>
    files(folder, (name: string) => /\.m[jt]s$/u.test(name) && !/\.test\.m[jt]s$/u.test(name)),
  );
}

function slugOf(heading: string): string {
  return heading
    .replaceAll('`', '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N} _-]/gu, '')
    .replaceAll(' ', '-');
}

function unfencedLines(markdown: string): string[] {
  const lines = markdown.split('\n');
  const fenceCounts = lines.map(
    (_line: string, index: number) =>
      lines.slice(0, index + 1).filter((line: string) => line.startsWith('```')).length,
  );
  return lines.filter(
    (line: string, index: number) => (fenceCounts[index] ?? 0) % 2 === 0 && !line.startsWith('```'),
  );
}

export function headingsOf(markdown: string): { level: number; text: string; slug: string }[] {
  return unfencedLines(markdown).flatMap((line: string) => {
    const match = /^(#{1,6}) (.+)$/u.exec(line);
    const [, hashes = '', text = ''] = match ?? [];
    return match === null ? [] : [{ level: hashes.length, text, slug: slugOf(text) }];
  });
}

export function plainText(text: string): string {
  return text.replaceAll('\\', '').replaceAll('`', '').replaceAll(/\s+/gu, ' ').trim();
}

export function pageEntries(): {
  section: string;
  slug: string;
  text: string;
  symptom: string;
  rawSymptom: string;
}[] {
  const sections = read(TROUBLESHOOTING_FILE).split(/^## /mu).slice(1);
  return sections.flatMap((section) => {
    const [sectionTitle = '', ...entries] = section.split(/^### /mu);
    return entries.map((entry: string) => {
      const title = entry.split('\n')[0] ?? '';
      const symptom = /\*\*Symptom\.\*\*([\s\S]*?)\*\*Cause\.\*\*/u.exec(entry)?.[1] ?? '';
      return {
        section: sectionTitle.split('\n')[0] ?? '',
        slug: slugOf(title),
        text: entry,
        symptom: plainText(symptom),
        rawSymptom: symptom,
      };
    });
  });
}

export function anchorsLinkedFrom(
  documents: readonly string[],
): { file: string; anchor: string }[] {
  return documents.flatMap((file) =>
    [...read(file).matchAll(ANCHOR_LINK)].map((match) => ({ file, anchor: match[1] ?? '' })),
  );
}

export function stringConstants(typescript: typeof ts, source: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>();
  for (const statement of source.statements) {
    const declarations = typescript.isVariableStatement(statement)
      ? statement.declarationList.declarations
      : [];
    for (const { name, initializer } of declarations) {
      if (
        typescript.isIdentifier(name) &&
        initializer !== undefined &&
        typescript.isStringLiteralLike(initializer)
      ) {
        constants.set(name.text, initializer.text);
      }
    }
  }
  return constants;
}

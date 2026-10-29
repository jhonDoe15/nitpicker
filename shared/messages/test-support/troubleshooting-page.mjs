import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { TROUBLESHOOTING_FILE } from '../troubleshooting.mjs';

export const root = path.resolve(import.meta.dirname, '../../..');
const SOURCE_FOLDERS = ['core', 'shared', 'languages'];
const SKIPPED_FOLDERS = new Set(['node_modules', 'fixtures', 'test-support', '__tests__']);
const ANCHOR_LINK = /troubleshooting\.md#([a-z0-9-]+)/gu;

export function read(relative) {
  return readFileSync(path.join(root, relative), 'utf8');
}

export function files(directory, accepts) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return SKIPPED_FOLDERS.has(entry.name) ? [] : files(relative, accepts);
    }
    return accepts(entry.name) ? [relative] : [];
  });
}

export function productionSources() {
  return SOURCE_FOLDERS.flatMap((folder) =>
    files(folder, (name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs')),
  );
}

export function slugOf(heading) {
  return heading
    .replaceAll('`', '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N} _-]/gu, '')
    .replaceAll(' ', '-');
}

function unfencedLines(markdown) {
  const lines = markdown.split('\n');
  const fenceCounts = lines.map(
    (_line, index) => lines.slice(0, index + 1).filter((line) => line.startsWith('```')).length,
  );
  return lines.filter((line, index) => fenceCounts[index] % 2 === 0 && !line.startsWith('```'));
}

export function headingsOf(markdown) {
  return unfencedLines(markdown).flatMap((line) => {
    const match = /^(#{1,6}) (.+)$/u.exec(line);
    return match === null
      ? []
      : [{ level: match[1].length, text: match[2], slug: slugOf(match[2]) }];
  });
}

export function plainText(text) {
  return text.replaceAll('\\', '').replaceAll('`', '').replaceAll(/\s+/gu, ' ').trim();
}

export function pageEntries() {
  const sections = read(TROUBLESHOOTING_FILE).split(/^## /mu).slice(1);
  return sections.flatMap((section) => {
    const [sectionTitle, ...entries] = section.split(/^### /mu);
    return entries.map((entry) => {
      const title = entry.split('\n')[0];
      const symptom = /\*\*Symptom\.\*\*([\s\S]*?)\*\*Cause\.\*\*/u.exec(entry)?.[1] ?? '';
      return {
        section: sectionTitle.split('\n')[0],
        slug: slugOf(title),
        text: entry,
        symptom: plainText(symptom),
      };
    });
  });
}

export function anchorsLinkedFrom(documents) {
  return documents.flatMap((file) =>
    [...read(file).matchAll(ANCHOR_LINK)].map((match) => ({ file, anchor: match[1] })),
  );
}

export function sectionOf(markdown, heading) {
  return markdown.split(new RegExp(`^${heading}$`, 'mu'))[1]?.split(/^## /mu)[0] ?? '';
}

import type { GitignoreEdit } from './typed/hygiene-types.mts';

const GITIGNORE = '.gitignore';
const SPECIAL = /[*?[\]\\]/gu;
const LEADING_MARK = /^[#!]/u;

export const GITIGNORE_PATH = GITIGNORE;

export function ignoreEntry(name: string, { directory }: { readonly directory: boolean }): string {
  const escaped = name
    .replaceAll(SPECIAL, (match) => `\\${match}`)
    .replace(LEADING_MARK, (match) => `\\${match}`);
  return `/${escaped}${directory ? '/' : ''}`;
}

function alreadyIgnored(text: string, entry: string): boolean {
  const bare = entry.slice(1);
  const accepted = new Set([entry, bare, entry.replace(/\/$/u, ''), bare.replace(/\/$/u, '')]);
  return text.split(/\r?\n/u).some((line) => accepted.has(line.trim()));
}

export function gitignoreEdit(text: string | undefined, entry: string): GitignoreEdit | undefined {
  if (text === undefined || text === '') {
    return { type: 'write', path: GITIGNORE, text: `${entry}\n` };
  }
  if (alreadyIgnored(text, entry)) {
    return undefined;
  }
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  const lead = text.endsWith('\n') ? '' : lineEnding;
  return {
    type: 'replace',
    path: GITIGNORE,
    start: text.length,
    end: text.length,
    text: `${lead}${entry}${lineEnding}`,
  };
}

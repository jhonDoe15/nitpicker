const GITIGNORE = '.gitignore';
const SPECIAL = /[*?[\]\\]/gu;
const LEADING_MARK = /^[#!]/u;

export const GITIGNORE_PATH = GITIGNORE;

export function ignoreEntry(name, { directory }) {
  const escaped = name.replaceAll(SPECIAL, String.raw`\$&`).replace(LEADING_MARK, String.raw`\$&`);
  return `/${escaped}${directory ? '/' : ''}`;
}

function alreadyIgnored(text, entry) {
  const bare = entry.slice(1);
  const accepted = new Set([entry, bare, entry.replace(/\/$/u, ''), bare.replace(/\/$/u, '')]);
  return text.split(/\r?\n/u).some((line) => accepted.has(line.trim()));
}

export function gitignoreEdit(text, entry) {
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

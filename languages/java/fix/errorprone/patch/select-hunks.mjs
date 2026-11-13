import { changedLines, hunkLines } from './hunk-edits.mjs';

const IMPORT_LINE = /^\s*import\s+(?:static\s+)?([\w.$]+?)(?:\.(\*|[\w$]+))?\s*;\s*$/u;
const BLANK = /^\s*$/u;

function changedTexts(hunk) {
  return hunk.lines.filter(({ kind }) => kind !== ' ').map(({ text }) => text);
}

function isImportOnly(hunk) {
  const texts = changedTexts(hunk);
  return (
    texts.length > 0 &&
    texts.every((text) => IMPORT_LINE.test(text) || BLANK.test(text)) &&
    texts.some((text) => IMPORT_LINE.test(text))
  );
}

function touches(hunk, touched) {
  return touched === 'all' || changedLines(hunk).some((line) => touched.has(line));
}

function importedName(text) {
  const match = IMPORT_LINE.exec(text);
  return match === null ? undefined : (match[2] ?? match[1].split('.').at(-1));
}

function usedIn(name, texts) {
  const pattern = new RegExp(`(?<![\\w$])${name.replaceAll('$', String.raw`\$`)}(?![\\w$])`, 'u');
  return texts.some((text) => pattern.test(text));
}

function keptAdditions(hunk, keptTexts) {
  const lines = hunk.lines
    .filter(({ kind, text }) => {
      const name = importedName(text);
      return kind !== '+' || (name !== undefined && (name === '*' || usedIn(name, keptTexts)));
    })
    .map((line) => (line.kind === '-' ? { ...line, kind: ' ' } : line));
  return lines.some(({ kind }) => kind === '+') ? { ...hunk, lines } : undefined;
}

export function selectHunks(entries, touched) {
  const importOnly = entries.filter(({ hunk }) => isImportOnly(hunk));
  const body = entries.filter((entry) => !importOnly.includes(entry));
  const keptBody = body.filter(({ hunk }) => touches(hunk, touched));
  const keptTexts = keptBody.flatMap(({ hunk }) => hunkLines(hunk).after);
  const imports = importOnly.flatMap((entry) => {
    const removes = entry.hunk.lines.some(({ kind }) => kind === '-');
    if (removes && touches(entry.hunk, touched)) {
      return [entry];
    }
    const hunk = touched === 'all' ? entry.hunk : keptAdditions(entry.hunk, keptTexts);
    return hunk === undefined ? [] : [{ ...entry, hunk }];
  });
  return [...imports, ...keptBody];
}

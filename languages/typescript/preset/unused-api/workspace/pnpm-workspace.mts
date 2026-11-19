const PACKAGES_KEY = /^packages\s*:(.*)$/u;
const TOP_LEVEL_KEY = /^[^\s#-]/u;
const LIST_ITEM = /^\s*-(.*)$/u;
const COMMENT = /(?:^|\s)#.*$/u;

function withoutComment(line: string): string {
  return line.replace(COMMENT, '').trimEnd();
}

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/u, '$2');
}

function flowText(lines: readonly string[], first: string): string {
  if (first.includes(']')) return first;
  const closing = lines.findIndex((line) => line.includes(']'));
  return [first, ...lines.slice(0, closing + 1)].join(' ');
}

function flowItems(lines: readonly string[], first: string): string[] {
  const text = flowText(lines, first);
  return text
    .slice(text.indexOf('[') + 1, text.lastIndexOf(']'))
    .split(',')
    .map(unquote)
    .filter((item) => item !== '');
}

function blockItems(lines: readonly string[]): string[] {
  const end = lines.findIndex((line) => TOP_LEVEL_KEY.test(line));
  return lines
    .slice(0, end === -1 ? undefined : end)
    .map((line) => LIST_ITEM.exec(line)?.[1])
    .filter((item) => item !== undefined)
    .map(unquote);
}

export function pnpmPackagePatterns(text: string): string[] {
  const lines = text.split(/\r?\n/u).map(withoutComment);
  const start = lines.findIndex((line) => PACKAGES_KEY.test(line));
  if (start === -1) return [];
  const inline = (PACKAGES_KEY.exec(lines[start] ?? '')?.[1] ?? '').trimStart();
  const rest = lines.slice(start + 1);
  return inline.startsWith('[') ? flowItems(rest, inline) : blockItems(rest);
}

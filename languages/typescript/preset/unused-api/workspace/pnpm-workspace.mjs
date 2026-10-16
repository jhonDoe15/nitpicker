const PACKAGES_KEY = /^packages\s*:\s*(.*)$/u;
const TOP_LEVEL_KEY = /^[^\s#-]/u;
const LIST_ITEM = /^\s*-\s*(.*)$/u;
const COMMENT = /(?:^|\s)#.*$/u;

function withoutComment(line) {
  return line.replace(COMMENT, '').trimEnd();
}

function unquote(value) {
  return value.trim().replace(/^(['"])(.*)\1$/u, '$2');
}

function flowText(lines, first) {
  if (first.includes(']')) return first;
  const closing = lines.findIndex((line) => line.includes(']'));
  return [first, ...lines.slice(0, closing + 1)].join(' ');
}

function flowItems(lines, first) {
  const text = flowText(lines, first);
  return text
    .slice(text.indexOf('[') + 1, text.lastIndexOf(']'))
    .split(',')
    .map(unquote)
    .filter((item) => item !== '');
}

function blockItems(lines) {
  const end = lines.findIndex((line) => TOP_LEVEL_KEY.test(line));
  return lines
    .slice(0, end === -1 ? undefined : end)
    .map((line) => LIST_ITEM.exec(line)?.[1])
    .filter((item) => item !== undefined)
    .map(unquote);
}

/**
 * The `packages:` globs of a `pnpm-workspace.yaml`, as a block list (at any indent) or a flow
 * array; the other keys (`catalog:`, `onlyBuiltDependencies:`) are skipped.
 */
export function pnpmPackagePatterns(text) {
  const lines = text.split(/\r?\n/u).map(withoutComment);
  const start = lines.findIndex((line) => PACKAGES_KEY.test(line));
  if (start === -1) return [];
  const inline = PACKAGES_KEY.exec(lines[start])[1];
  const rest = lines.slice(start + 1);
  return inline.startsWith('[') ? flowItems(rest, inline) : blockItems(rest);
}

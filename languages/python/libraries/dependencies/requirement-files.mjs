import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { readProjectText } from '../project-files.mjs';
import { isDevelopmentGroup } from './requirement-names.mjs';

const REQUIREMENT_FILE = /^requirements.*\.(?:txt|in)$|^.*-requirements\.(?:txt|in)$/u;
const REQUIREMENT_DIRECTORY = 'requirements';
const CONSTRAINTS = /constraint/iu;
const INCLUDE = /^(?:-r\s*|--requirement[\s=]+)(\S+)/u;
const COMPILED_HEADER = /^#.*\b(?:pip-compile|uv pip compile)\b/mu;
const VIA = /#\s*via\b/u;
const DIRECT = /(?:^|\s)-r\s*\S/u;

function isFile(file) {
  return statSync(file, { throwIfNoEntry: false })?.isFile() === true;
}

function listed(directory, pattern) {
  return readdirSync(directory)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => path.join(directory, name));
}

function discovered(root) {
  const directory = path.join(root, REQUIREMENT_DIRECTORY);
  const nested = existsSync(directory) && statSync(directory).isDirectory();
  const files = [
    ...listed(root, REQUIREMENT_FILE),
    ...(nested ? listed(directory, /\.(?:txt|in)$/u) : []),
  ];
  return files.filter((file) => !CONSTRAINTS.test(path.basename(file)) && isFile(file));
}

function sourceFor(file) {
  const sibling = file.replace(/\.txt$/u, '.in');
  return sibling !== file && isFile(sibling) ? sibling : file;
}

function logicalLines(text) {
  return text.replaceAll(/\\\r?\n/gu, ' ').split(/\r?\n/u);
}

function appendComment(entry, comment) {
  if (entry !== undefined) {
    entry.via += ` ${comment.slice(1)}`;
  }
}

function entriesOf(text) {
  const entries = [];
  for (const line of logicalLines(text)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      appendComment(entries.at(-1), trimmed);
    } else if (trimmed !== '') {
      entries.push({ line: trimmed, via: /\s#(.*)$/u.exec(trimmed)?.[1] ?? '' });
    }
  }
  return entries;
}

function directLines(text) {
  const compiled = COMPILED_HEADER.test(text) || VIA.test(text);
  return entriesOf(text)
    .filter((entry) => !compiled || entry.via.trim() === '' || DIRECT.test(entry.via))
    .map((entry) => entry.line);
}

function includesOf(text) {
  return logicalLines(text)
    .map((line) => INCLUDE.exec(line.replace(/\s+#.*$/u, '').trim())?.[1])
    .filter((target) => target !== undefined);
}

function stemOf(file) {
  return path.basename(file, path.extname(file));
}

function includedFiles(root, { source, text, development }) {
  return includesOf(text)
    .map((include) => path.resolve(path.dirname(source), include))
    .filter((target) => target.startsWith(root + path.sep) && isFile(target))
    .map((file) => ({ file, development: development || isDevelopmentGroup(stemOf(file)) }));
}

function readTree(root, start) {
  const seen = new Set();
  const found = [];
  const pending = [{ file: start, development: isDevelopmentGroup(stemOf(start)) }];
  for (const { file, development } of pending) {
    const source = sourceFor(file);
    if (seen.has(source)) {
      continue;
    }
    seen.add(source);
    const text = readProjectText(source);
    found.push({
      file: path.relative(root, file).split(path.sep).join('/'),
      group: development ? 'dev' : 'production',
      lines: directLines(text),
    });
    pending.push(...includedFiles(root, { source, text, development }));
  }
  return found;
}

export function requirementFiles(projectRoot) {
  const root = path.resolve(projectRoot);
  return discovered(root).flatMap((file) => readTree(root, file));
}

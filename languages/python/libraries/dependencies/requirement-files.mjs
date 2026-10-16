import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { groupKind, isDevelopmentGroup, requirementName } from './dependency-names.mjs';
import { readText } from './dependency-text.mjs';

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

function discovered(root) {
  const directory = path.join(root, REQUIREMENT_DIRECTORY);
  const nested = existsSync(directory) && statSync(directory).isDirectory() ? directory : undefined;
  const listed = [
    ...readdirSync(root)
      .filter((name) => REQUIREMENT_FILE.test(name))
      .sort()
      .map((name) => path.join(root, name)),
    ...(nested === undefined
      ? []
      : readdirSync(nested)
          .filter((name) => /\.(?:txt|in)$/u.test(name))
          .sort()
          .map((name) => path.join(nested, name))),
  ];
  return listed.filter((file) => !CONSTRAINTS.test(path.basename(file)) && isFile(file));
}

function sourceFor(file) {
  const sibling = file.replace(/\.txt$/u, '.in');
  return sibling !== file && isFile(sibling) ? sibling : file;
}

function logicalLines(text) {
  return text.replaceAll(/\\\r?\n/gu, ' ').split(/\r?\n/u);
}

function annotate(entries, comment) {
  const last = entries.at(-1);
  if (last !== undefined) {
    last.via += ` ${comment}`;
  }
}

function entriesOf(text) {
  const entries = [];
  for (const line of logicalLines(text)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      annotate(entries, trimmed.slice(1));
    } else if (trimmed !== '') {
      entries.push({ line: trimmed, via: /\s#(.*)$/u.exec(trimmed)?.[1] ?? '' });
    }
  }
  return entries;
}

function namesOfText(text) {
  const compiled = COMPILED_HEADER.test(text) || VIA.test(text);
  return entriesOf(text)
    .filter((entry) => !compiled || entry.via.trim() === '' || DIRECT.test(entry.via))
    .map((entry) => requirementName(entry.line))
    .filter((name) => name !== undefined);
}

function includesOf(text) {
  return logicalLines(text)
    .map((line) => INCLUDE.exec(line.replace(/\s+#.*$/u, '').trim())?.[1])
    .filter((target) => target !== undefined);
}

function stemOf(file) {
  return path.basename(file, path.extname(file));
}

function inside(root, target) {
  return target.startsWith(root + path.sep) && isFile(target);
}

function includedFiles(root, { source, text, kind }) {
  return includesOf(text)
    .map((include) => path.resolve(path.dirname(source), include))
    .filter((target) => inside(root, target))
    .map((file) => ({
      file,
      kind: kind === 'development' || isDevelopmentGroup(stemOf(file)) ? 'development' : 'runtime',
    }));
}

function readTree(root, start) {
  const seen = new Set();
  const groups = [];
  const pending = [{ file: start, kind: groupKind(stemOf(start)) }];
  for (const { file, kind } of pending) {
    const source = sourceFor(file);
    if (seen.has(source)) {
      continue;
    }
    seen.add(source);
    const text = readText(source);
    groups.push({ kind, names: namesOfText(text) });
    pending.push(...includedFiles(root, { source, text, kind }));
  }
  return groups;
}

export function requirementGroups(projectRoot) {
  const root = path.resolve(projectRoot);
  return discovered(root).flatMap((file) => readTree(root, file));
}

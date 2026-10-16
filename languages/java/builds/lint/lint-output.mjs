import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const WARNING = /^(.+\.java):\d+: warning: \[/u;
const SOURCE_HEADER = /^.+?\.java(?=:\d+: )/gmu;
const WARNING_COUNT = /^\d+ warnings?$/mu;
const LINT_DIAGNOSTIC = /^.+\.java:\d+: [^:]+: \[\w+\]/u;
const PRINTED_WARNING = /^(?:.+\.java:\d+: )?warning: /mu;
const BLOCK_END = /^\d+ warnings?$|^Note: /u;
const ANNOTATION = /^@\s*([\w.]+)/u;
const LOMBOK_IMPORT = /^\s*import\s+(lombok(?:\.\w+)*)\.(\w+|\*)\s*;/gmu;
const OTHER_IMPORT = /^\s*import\s+(?!lombok\.)[\w.]+\.(\w+)\s*;/gmu;
const LOMBOK_PACKAGE = 'lombok.';

function blocks(log) {
  return log.split(/(?<=\n)/u).reduce((found, line) => {
    const isStart = WARNING.test(line) || BLOCK_END.test(line.trimEnd());
    if (isStart || found.length === 0) {
      return [...found, [line]];
    }
    found.at(-1).push(line);
    return found;
  }, []);
}

function importedNames(text) {
  const lombok = [...text.matchAll(LOMBOK_IMPORT)].map(([, , name]) => name);
  const other = new Set([...text.matchAll(OTHER_IMPORT)].map(([, name]) => name));
  return { explicit: new Set(lombok), wildcard: lombok.includes('*'), other };
}

function isLombokName(name, imports) {
  if (name.startsWith(LOMBOK_PACKAGE)) {
    return true;
  }
  const simple = name.split('.')[0];
  return imports.explicit.has(simple) || (imports.wildcard && !imports.other.has(simple));
}

function lombokAnnotationAt(block, importsOf) {
  const [header, source = '', caret = ''] = block;
  const column = caret.indexOf('^');
  const annotation = column < 0 ? undefined : ANNOTATION.exec(source.slice(column));
  return (
    annotation?.[1] !== undefined && isLombokName(annotation[1], importsOf(WARNING.exec(header)[1]))
  );
}

function importReader() {
  const known = new Map();
  return (file) => {
    if (!known.has(file)) {
      known.set(file, importedNames(existsSync(file) ? readFileSync(file, 'latin1') : ''));
    }
    return known.get(file);
  };
}

function posixPath(file) {
  return file.replaceAll('\\', '/');
}

export function relocated(log, { staged, from, to }) {
  const fromPrefix = `${posixPath(path.join(staged, from))}/`;
  const target = to === '' ? '' : `${to}/`;
  return log
    .replaceAll(SOURCE_HEADER, (file) => {
      const posix = posixPath(file);
      return posix.startsWith(fromPrefix) ? target + posix.slice(fromPrefix.length) : file;
    })
    .replaceAll(path.join(staged, from) + path.sep, target);
}

export function lintedWarnings(log, context) {
  const importsOf = importReader();
  const stagedPrefix = `${posixPath(context.staged)}/`;
  const kept = blocks(log).filter((block) => {
    const warning = WARNING.exec(block[0]);
    return (
      warning === null ||
      (posixPath(warning[1]).startsWith(stagedPrefix) && !lombokAnnotationAt(block, importsOf))
    );
  });
  return relocated(kept.flat().join(''), context);
}

export function hasUnreadWarnings(log) {
  return (
    (WARNING_COUNT.test(log) && !PRINTED_WARNING.test(log)) ||
    log.split(/\r?\n/u).some((line) => LINT_DIAGNOSTIC.test(line) && !WARNING.test(line))
  );
}

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLineIdentity, projectFile } from '../../../shared/ingest/common.mjs';
import { placeDeclarations } from './forbidden/declarations.mjs';
import { blanked } from '../ingest/source-text.mjs';

const FORBIDDEN_APIS_TOOL = 'forbiddenapis';
const FORBIDDEN_REPORT = 'forbidden-apis.txt';
const VIOLATION = /^ERROR: Forbidden [\w/ ]+: (.+?) \[([a-z-]+): (.+)\]$/;
const LOCATION = /^ERROR:\s+in (\S+) \((\S+?):(\d+)\)$/;
const DECLARATION =
  /^ERROR:\s+in (\S+) \((\S+?), (?:(class) declaration|(field|method|record component) declaration of '(.+)')\)$/;
const LEGACY_DATE = 'java.util.Date';

function shortName(signature) {
  const method = /^([\w.$]+)#(<init>|\w+)/.exec(signature);
  if (method === null) {
    return signature.split('.').at(-1);
  }
  const owner = method[1].split('.').at(-1).replaceAll('$', '.');
  return method[2] === '<init>' ? `new ${owner}` : `${owner}.${method[2]}`;
}

export function parseForbiddenApiUses(text) {
  const uses = [];
  let pending;
  for (const line of text.split(/\r?\n/)) {
    const violation = VIOLATION.exec(line);
    if (violation !== null) {
      pending = { signature: violation[1], rule: violation[2], text: violation[3] };
      continue;
    }
    const location = LOCATION.exec(line);
    const declaration = DECLARATION.exec(line);
    if (pending !== undefined && (location !== null || declaration !== null)) {
      uses.push(
        location === null
          ? {
              ...pending,
              className: declaration[1],
              fileName: declaration[2],
              declaration: { kind: declaration[3] ?? declaration[4], member: declaration[5] ?? '' },
            }
          : {
              ...pending,
              className: location[1],
              fileName: location[2],
              line: Number(location[3]),
            },
      );
      pending = undefined;
    }
  }
  return uses;
}

function useFinding(use, file, identity) {
  const declared =
    use.declaration === undefined ? [] : [use.declaration.kind, use.declaration.member];
  const owner = use.className.split('.').at(-1);
  return {
    tool: FORBIDDEN_APIS_TOOL,
    rule: use.rule,
    path: file,
    identity: identity({
      file,
      line: use.line,
      parts: [use.rule, owner, use.signature, ...declared],
    }),
    message: `${use.text} Found: ${shortName(use.signature)}.`,
    classification: 'enforceable',
    ...(use.line === undefined ? {} : { location: { line: use.line } }),
  };
}

function continued(before = '', after = '') {
  return /\)\s*$/.test(before) && /^\s*\.toInstant\(\)/.test(after);
}

function countOf(pattern, text) {
  return (text.match(pattern) ?? []).length;
}

function conversionsOn(lines, line, reported) {
  const text = lines[line - 1] ?? '';
  return (
    countOf(/\)\s*\.toInstant\(\)/g, text) +
    2 * countOf(/\bDate::toInstant\b/g, text) +
    countOf(/::\w+\)\s*\.map\(\s*(?:java\.util\.)?Date::toInstant\)/g, text) +
    (continued(lines[line - 2], text) ? 1 : 0) +
    (continued(text, lines[line]) && !reported.has(line + 1) ? 1 : 0)
  );
}

function isLegacyDateUse(use) {
  return use.signature === LEGACY_DATE && use.declaration === undefined;
}

function withoutConvertedDates(uses, source) {
  const left = new Map();
  return uses.filter((use) => {
    const text = isLegacyDateUse(use) ? source(use.file) : undefined;
    if (text === undefined) {
      return true;
    }
    const key = `${use.file}\0${String(use.line)}`;
    if (!left.has(key)) {
      const reported = new Set(
        uses
          .filter((other) => other.file === use.file && isLegacyDateUse(other))
          .map((other) => other.line),
      );
      left.set(key, conversionsOn(text.split('\n'), use.line, reported));
    }
    left.set(key, left.get(key) - 1);
    return left.get(key) < 0;
  });
}

function sourceReader(projectRoot) {
  const sources = new Map();
  return (file) => {
    if (!sources.has(file)) {
      const absolute = projectFile(projectRoot, file);
      const exists = absolute !== undefined && existsSync(absolute);
      sources.set(file, exists ? blanked(readFileSync(absolute, 'utf8')) : undefined);
    }
    return sources.get(file);
  };
}

function lineOf(use, member = '') {
  return [use.rule, use.file, use.signature, use.line, member].join('\0');
}

function withoutRepeatedDeclarations(uses) {
  const usedLines = new Set(
    uses.filter((use) => use.declaration === undefined).map((use) => lineOf(use)),
  );
  const declared = new Set();
  return uses.filter((use) => {
    if (use.declaration === undefined || use.line === undefined) {
      return true;
    }
    const key = lineOf(use, use.declaration.member);
    const free = !usedLines.has(lineOf(use)) && !declared.has(key);
    declared.add(key);
    return free;
  });
}

export function readForbiddenApiFindings(reportRoot, { locate, projectRoot }) {
  const report = path.join(reportRoot, FORBIDDEN_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const identity = createLineIdentity('forbidden', projectRoot);
  const source = sourceReader(projectRoot);
  const located = parseForbiddenApiUses(readFileSync(report, 'utf8')).flatMap((use) => {
    const packageDirectory = use.className.split('.').slice(0, -1).join('/');
    const file = locate(packageDirectory, use.fileName);
    return file === undefined ? [] : [{ ...use, file }];
  });
  const kept = withoutConvertedDates(located, source);
  return withoutRepeatedDeclarations(placeDeclarations(kept, source)).map((use) =>
    useFinding(use, use.file, identity),
  );
}

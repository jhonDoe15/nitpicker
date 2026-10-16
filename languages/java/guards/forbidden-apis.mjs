import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLineIdentity } from '../ingest/common.mjs';
import { exceptionRoute } from './advice/exception-route.mjs';
import { blanked, placeDeclarations } from './forbidden/declarations.mjs';

const FORBIDDEN_APIS_TOOL = 'forbiddenapis';
const FORBIDDEN_REPORT = 'forbidden-apis.txt';
const VIOLATION = /^ERROR: Forbidden [\w/ ]+: (.+?) \[([a-z-]+): (.+)\]$/;
const LOCATION = /^ERROR:\s+in (\S+) \((\S+?):(\d+)\)$/;
const DECLARATION =
  /^ERROR:\s+in (\S+) \((\S+?), (?:(class) declaration|(field|method|record component) declaration of '(.+)')\)$/;
const LEGACY_DATE = 'java.util.Date';
const CONVERTED_RIGHT_AWAY = /\)\s*\.toInstant\(\)|\bDate::toInstant\b/;

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
    message: `${use.text} Found: ${shortName(use.signature)}. ${exceptionRoute(FORBIDDEN_APIS_TOOL, use.rule)}`,
    classification: 'enforceable',
    ...(use.line === undefined ? {} : { location: { line: use.line } }),
  };
}

function continued(before = '', after = '') {
  return /\)\s*$/.test(before) && /^\s*\.toInstant\(\)/.test(after);
}

function convertsDateRightAway(use, text) {
  if (use.signature !== LEGACY_DATE || use.declaration !== undefined || text === undefined) {
    return false;
  }
  const lines = text.split('\n');
  const line = lines[use.line - 1] ?? '';
  return (
    !/\bDate\b/.test(line.replaceAll('Date::toInstant', '')) &&
    (CONVERTED_RIGHT_AWAY.test(line) ||
      continued(line, lines[use.line]) ||
      continued(lines[use.line - 2], line))
  );
}

function sourceReader(projectRoot) {
  const sources = new Map();
  return (file) => {
    if (!sources.has(file)) {
      const absolute = path.join(projectRoot, file);
      sources.set(file, existsSync(absolute) ? blanked(readFileSync(absolute, 'utf8')) : undefined);
    }
    return sources.get(file);
  };
}

function lineOf(use) {
  return [use.rule, use.file, use.signature, use.line].join('\0');
}

function withoutRepeatedDeclarations(uses) {
  const taken = new Set(uses.filter((use) => use.declaration === undefined).map(lineOf));
  return uses.filter((use) => {
    if (use.declaration === undefined || use.line === undefined) {
      return true;
    }
    const free = !taken.has(lineOf(use));
    taken.add(lineOf(use));
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
    return file === undefined || convertsDateRightAway(use, source(file)) ? [] : [{ ...use, file }];
  });
  return withoutRepeatedDeclarations(placeDeclarations(located, source)).map((use) =>
    useFinding(use, use.file, identity),
  );
}

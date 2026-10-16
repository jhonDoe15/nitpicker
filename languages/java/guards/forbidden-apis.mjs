import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter, hashIdentity } from '../ingest/common.mjs';
import { exceptionRoute } from './advice/exception-route.mjs';

const FORBIDDEN_APIS_TOOL = 'forbiddenapis';
const FORBIDDEN_REPORT = 'forbidden-apis.txt';
const VIOLATION = /^ERROR: Forbidden [\w/ ]+: (.+?) \[([a-z-]+): (.+)\]$/;
const LOCATION = /^ERROR:\s+in (\S+) \((\S+?):(\d+)\)$/;
const DECLARATION =
  /^ERROR:\s+in (\S+) \((\S+?), (?:(class) declaration|(field|method|record component) declaration of '(.+)')\)$/;
const DECLARATION_LINES = 5;
const LEGACY_DATE = 'java.util.Date';
const STATEMENT_LINES = 5;

function shortName(signature) {
  const method = /^([\w.$]+)#(<init>|\w+)/.exec(signature);
  if (method === null) {
    return signature.split('.').at(-1);
  }
  const owner = method[1].split('.').at(-1);
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

function escaped(text) {
  return text.replaceAll(/[$.]/g, String.raw`\$&`);
}

function simpleName(qualified) {
  return qualified.split(/[.$]/).at(-1);
}

function declarationPattern({ kind, member }, className, type) {
  if (kind === 'class') {
    return new RegExp(
      String.raw`\b(?:class|interface|enum|record)\s+${escaped(simpleName(className))}\b`,
    );
  }
  if (kind === 'method') {
    const name = member.split('(')[0];
    const declared = name === '<init>' ? simpleName(className) : name;
    return new RegExp(
      String.raw`(?:^\s*|[\w>\]]\s+)(?<!\b(?:return|new|throw)\s+)${escaped(declared)}\s*\(`,
    );
  }
  return new RegExp(String.raw`\b${type}\b[\w\s<>[\],.?]*\b${escaped(member)}\b(?!\s*\()`);
}

function declarationLine(use, source) {
  const type = escaped(simpleName(use.signature));
  const pattern = declarationPattern(use.declaration, use.className, type);
  const naming = new RegExp(String.raw`\b${type}\b`);
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((line, at) => {
    const head = lines
      .slice(at, at + DECLARATION_LINES)
      .join('\n')
      .split(/[{;]/)[0];
    return pattern.test(line) && naming.test(head);
  });
  return index === -1 ? undefined : index + 1;
}

function located(use, source) {
  if (use.declaration === undefined) {
    return use;
  }
  const line = source === undefined ? undefined : declarationLine(use, source);
  if (line === undefined) {
    return use.declaration.kind === 'method' ? undefined : use;
  }
  return { ...use, line };
}

function useFinding(use, file, unique) {
  const declared =
    use.declaration === undefined ? [] : [use.declaration.kind, use.declaration.member];
  return {
    tool: FORBIDDEN_APIS_TOOL,
    rule: use.rule,
    path: file,
    identity: unique(
      hashIdentity('forbidden', [use.rule, file, use.className, use.signature, ...declared]),
    ),
    message: `${use.text} Found: ${shortName(use.signature)}. ${exceptionRoute(FORBIDDEN_APIS_TOOL, use.rule)}`,
    classification: 'enforceable',
    ...(use.line === undefined ? {} : { location: { line: use.line } }),
  };
}

function convertsDateRightAway(use, source) {
  if (use.signature !== LEGACY_DATE || use.declaration !== undefined || source === undefined) {
    return false;
  }
  const [statement] = source
    .split(/\r?\n/)
    .slice(use.line - 1, use.line - 1 + STATEMENT_LINES)
    .join('\n')
    .split(';');
  return /\.toInstant\(\)/.test(statement) && !/\bDate\b/.test(statement);
}

function sourceReader(projectRoot) {
  const sources = new Map();
  return (file) => {
    if (!sources.has(file)) {
      const absolute = path.join(projectRoot, file);
      sources.set(file, existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined);
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
  const unique = createIdentityCounter();
  const source = sourceReader(projectRoot);
  const uses = parseForbiddenApiUses(readFileSync(report, 'utf8')).flatMap((use) => {
    const packageDirectory = use.className.split('.').slice(0, -1).join('/');
    const file = locate(packageDirectory, use.fileName);
    const placed = file === undefined ? undefined : located(use, source(file));
    return placed === undefined || convertsDateRightAway(placed, source(file))
      ? []
      : [{ ...placed, file }];
  });
  return withoutRepeatedDeclarations(uses).map((use) => useFinding(use, use.file, unique));
}

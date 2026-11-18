import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLineIdentity, projectFile } from '../../../shared/ingest/common.mjs';
import { placeDeclarations } from './forbidden/declarations.mts';
import { blanked } from '../ingest/source-text.mts';
import { textOf } from '../../../shared/values/readers.mts';
import type { ForbiddenUse } from './forbidden/forbidden-types.mts';

type Pending = Pick<ForbiddenUse, 'signature' | 'rule' | 'text'>;
type ParsedUse = Omit<ForbiddenUse, 'file'>;
type Identity = (parts: {
  readonly file: string;
  readonly line: number | undefined;
  readonly parts: readonly string[];
}) => string;
type FindingsOptions = {
  readonly locate: (directory: string, fileName: string) => string | undefined;
  readonly projectRoot: string;
};
type Finding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
  readonly location?: { readonly line: number };
};

const lineIdentity: (prefix: string, projectRoot: string) => Identity = createLineIdentity;
const projectFileOf: (root: string, file: string) => string | undefined = projectFile;
const sourceBlanked: (source: string) => string = blanked;

const FORBIDDEN_APIS_TOOL = 'forbiddenapis';
const FORBIDDEN_REPORT = 'forbidden-apis.txt';
const VIOLATION = /^ERROR: Forbidden [\w/ ]+: (.+?) \[([a-z-]+): (.+)\]$/;
const LOCATION = /^ERROR:\s+in (\S+) \((\S+?):(\d+)\)$/;
const DECLARATION =
  /^ERROR:\s+in (\S+) \((\S+?), (?:(class) declaration|(field|method|record component) declaration of '(.+)')\)$/;
const LEGACY_DATE = 'java.util.Date';

function shortName(signature: string): string {
  const method = /^([\w.$]+)#(<init>|\w+)/.exec(signature);
  if (method === null) {
    return textOf(signature.split('.').at(-1));
  }
  const owner = textOf(textOf(method[1]).split('.').at(-1)).replaceAll('$', '.');
  return method[2] === '<init>' ? `new ${owner}` : `${owner}.${textOf(method[2])}`;
}

export function parseForbiddenApiUses(text: string): ParsedUse[] {
  const uses: ParsedUse[] = [];
  let pending: Pending | undefined;
  for (const line of text.split(/\r?\n/)) {
    const violation = VIOLATION.exec(line);
    if (violation !== null) {
      pending = {
        signature: textOf(violation[1]),
        rule: textOf(violation[2]),
        text: textOf(violation[3]),
      };
      continue;
    }
    const location = LOCATION.exec(line);
    const declaration = DECLARATION.exec(line);
    if (pending !== undefined && (location !== null || declaration !== null)) {
      uses.push(
        location === null
          ? {
              ...pending,
              className: textOf(declaration?.[1]),
              fileName: textOf(declaration?.[2]),
              declaration: {
                kind: textOf(declaration?.[3] ?? declaration?.[4]),
                member: declaration?.[5] ?? '',
              },
            }
          : {
              ...pending,
              className: textOf(location[1]),
              fileName: textOf(location[2]),
              line: Number(location[3]),
            },
      );
      pending = undefined;
    }
  }
  return uses;
}

function useFinding(use: ForbiddenUse, file: string, identity: Identity): Finding {
  const declared: string[] =
    use.declaration === undefined ? [] : [use.declaration.kind, use.declaration.member];
  const owner = textOf(use.className.split('.').at(-1));
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

function continued(before = '', after = ''): boolean {
  return /\)\s*$/.test(before) && /^\s*\.toInstant\(\)/.test(after);
}

function countOf(pattern: RegExp, text: string): number {
  return (text.match(pattern) ?? []).length;
}

function conversionsOn(
  lines: readonly string[],
  line: number,
  reported: ReadonlySet<number | undefined>,
): number {
  const text = lines[line - 1] ?? '';
  return (
    countOf(/\)\s*\.toInstant\(\)/g, text) +
    2 * countOf(/\bDate::toInstant\b/g, text) +
    countOf(/::\w+\)\s*\.map\(\s*(?:java\.util\.)?Date::toInstant\)/g, text) +
    (continued(lines[line - 2], text) ? 1 : 0) +
    (continued(text, lines[line]) && !reported.has(line + 1) ? 1 : 0)
  );
}

function keptConstructions(lines: readonly string[], line: number): number {
  const text = lines[line - 1] ?? '';
  return (
    countOf(/\bnew\s+(?:java\.util\.)?Date\s*\(/g, text) -
    countOf(/\bnew\s+(?:java\.util\.)?Date\s*\([^()]*\)\s*\.toInstant\(\)/g, text)
  );
}

function isLegacyDateUse(use: ForbiddenUse): boolean {
  return use.signature === LEGACY_DATE && use.declaration === undefined;
}

function withoutConvertedDates(
  uses: readonly ForbiddenUse[],
  source: (file: string) => string | undefined,
): ForbiddenUse[] {
  const left = new Map<string, number>();
  return uses.filter((use) => {
    const text = isLegacyDateUse(use) ? source(use.file) : undefined;
    if (text === undefined) {
      return true;
    }
    const key = `${use.file}\0${String(use.line)}`;
    if (!left.has(key)) {
      const onFile = uses.filter((other) => other.file === use.file && isLegacyDateUse(other));
      const reported = new Set(onFile.map((other) => other.line));
      const lines = text.split('\n');
      const onLine = onFile.filter((other) => other.line === use.line).length;
      const at = use.line ?? Number.NaN;
      const cancellable = Math.max(0, onLine - keptConstructions(lines, at));
      left.set(key, Math.min(conversionsOn(lines, at, reported), cancellable));
    }
    const remaining = (left.get(key) ?? 0) - 1;
    left.set(key, remaining);
    return remaining < 0;
  });
}

function sourceReader(projectRoot: string): (file: string) => string | undefined {
  const sources = new Map<string, string | undefined>();
  return (file) => {
    if (!sources.has(file)) {
      const absolute = projectFileOf(projectRoot, file);
      const exists = absolute !== undefined && existsSync(absolute);
      sources.set(file, exists ? sourceBlanked(readFileSync(absolute, 'utf8')) : undefined);
    }
    return sources.get(file);
  };
}

function lineOf(use: ForbiddenUse, member = ''): string {
  return [use.rule, use.file, use.signature, use.line, member].join('\0');
}

function withoutRepeatedDeclarations(uses: readonly ForbiddenUse[]): ForbiddenUse[] {
  const usedLines = new Set(
    uses.filter((use) => use.declaration === undefined).map((use) => lineOf(use)),
  );
  const declared = new Set<string>();
  return uses.filter((use) => {
    if (use.declaration === undefined || use.line === undefined) {
      return true;
    }
    const key = lineOf(use, use.declaration.member);
    const free = !(usedLines.has(lineOf(use)) || declared.has(key));
    declared.add(key);
    return free;
  });
}

export function readForbiddenApiFindings(
  reportRoot: string,
  { locate, projectRoot }: FindingsOptions,
): Finding[] {
  const report = path.join(reportRoot, FORBIDDEN_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const identity = lineIdentity('forbidden', projectRoot);
  const source = sourceReader(projectRoot);
  const located: ForbiddenUse[] = parseForbiddenApiUses(readFileSync(report, 'utf8')).flatMap(
    (use) => {
      const packageDirectory = use.className.split('.').slice(0, -1).join('/');
      const file = locate(packageDirectory, use.fileName);
      return file === undefined ? [] : [{ ...use, file }];
    },
  );
  const kept = withoutConvertedDates(located, source);
  return withoutRepeatedDeclarations(placeDeclarations(kept, source)).map((use) =>
    useFinding(use, use.file, identity),
  );
}

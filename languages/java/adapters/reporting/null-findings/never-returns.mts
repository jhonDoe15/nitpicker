import {
  closing,
  lastCode,
  lineText,
  methodAt,
  offsetOfLine,
  type JavaSource,
  type Member,
} from '../source-facts/java-model.mts';
import {
  PARENTHESES as PARENTHESES_UNTYPED,
  balancedEnd as balancedEndUntyped,
  depthChange as depthChangeUntyped,
} from '../../../../../shared/source-text/brackets/balanced.mjs';
import { escapeRegExp as escapeRegExpUntyped } from '../../../../../shared/paths/glob.mjs';
import { sourceIndex, type IndexRoots, type SourceIndex } from '../source-facts/source-index.mts';
import { viewOf, type Finding } from '../source-facts/finding-view.mts';

const PARENTHESES: readonly string[] = PARENTHESES_UNTYPED;
const balancedEnd: (text: string, open: number, brackets: readonly string[]) => number =
  balancedEndUntyped;
const depthChange: (character: string, left: string, right: string) => number = depthChangeUntyped;
const escapeRegExp: (value: string) => string = escapeRegExpUntyped;

const NULL_RULES = new Set([
  'NP_NULL_ON_SOME_PATH',
  'NP_NULL_ON_SOME_PATH_EXCEPTION',
  'NP_NULL_PARAM_DEREF',
]);
const PLAY_CONTROLLER = /\bplay\s*\.\s*mvc\s*\.\s*Controller\b/u;
const PLAY_RESULT = /\bResults?\b/u;
const PLAY_ENDING_CALLS = new Set([
  'badRequest',
  'error',
  'forbidden',
  'notFound',
  'notModified',
  'ok',
  'redirect',
  'redirectToStatic',
  'render',
  'renderBinary',
  'renderHtml',
  'renderJSON',
  'renderJson',
  'renderTemplate',
  'renderText',
  'renderXml',
  'todo',
  'unauthorized',
]);
const IF_KEYWORD = /\bif\s*\(/gu;
const NULL_TERM = /^\(*\s*(?:([\w$.]+)\s*==\s*null|null\s*==\s*([\w$.]+))\s*\)*$/u;
const CALL_STATEMENT = /^(?:([A-Za-z_$][\w$]*)\s*\.\s*)?([A-Za-z_$][\w$]*)\s*\(/u;

type Ending = {
  readonly declared: ReadonlyMap<string, ReadonlySet<string>>;
  readonly builtin: ReadonlySet<string>;
};

function bodyOf(clean: string, member: Member): string {
  return clean.slice(member.bodyStart + 1, member.end);
}

function topLevel(text: string): string {
  let depth = 0;
  return text
    .split('')
    .map((character) => {
      const shown = depth === 0 || character === '{' || character === '}' ? character : ' ';
      depth += depthChange(character, '{', '}');
      return shown;
    })
    .join('');
}

function leavesBlock(text: string): boolean {
  let depth = 0;
  for (const character of text) {
    depth += depthChange(character, '{', '}');
    if (depth < 0) {
      return true;
    }
  }
  return false;
}

function alwaysThrows(clean: string, member: Member): boolean {
  const body = bodyOf(clean, member);
  if (/\breturn\b/u.test(body)) {
    return false;
  }
  const statements = topLevel(body)
    .split(/[;}]/u)
    .map((statement) => statement.trim())
    .filter(Boolean);
  return /^throw\b/u.test(statements.at(-1) ?? '');
}

type Tally = { outcomes: Map<string, boolean[]>; owners: Map<string, Set<string>> };

function tally(into: Tally, source: JavaSource): void {
  for (const found of source.classes) {
    for (const method of found.members.filter((member) => member.kind === 'method')) {
      const { name } = method;
      into.owners.set(name, new Set([...(into.owners.get(name) ?? []), found.name]));
      into.outcomes.set(name, [
        ...(into.outcomes.get(name) ?? []),
        alwaysThrows(source.clean, method),
      ]);
    }
  }
}

function neverReturning(index: SourceIndex): Map<string, Set<string>> {
  const found: Tally = { outcomes: new Map(), owners: new Map() };
  for (const file of index.files()) {
    const source = index.source(file);
    if (source !== undefined) {
      tally(found, source);
    }
  }
  return new Map(
    [...found.outcomes]
      .filter(([, all]) => all.every(Boolean))
      .map(([name]) => [name, found.owners.get(name) ?? new Set<string>()]),
  );
}

function branchEnds(clean: string, from: number): { text: string; end: number } {
  const start = clean.slice(from).search(/\S/u) + from;
  if (clean[start] === '{') {
    const end = closing(clean, start);
    return { text: clean.slice(start + 1, end), end };
  }
  const end = clean.indexOf(';', start);
  return { text: clean.slice(start, end), end };
}

function conditionEnd(clean: string, open: number): number {
  return balancedEnd(clean, open, PARENTHESES);
}

function checkedNames(condition: string): string[] {
  return condition
    .split('||')
    .map((term) => NULL_TERM.exec(term.trim()))
    .flatMap((match) => (match === null ? [] : [match[1] ?? match[2] ?? '']));
}

function endsRequest(statement: string, ending: Ending): boolean {
  const call = CALL_STATEMENT.exec(statement.trim());
  const receiver = call?.[1];
  const name = call?.[2] ?? '';
  const own = receiver === undefined || receiver === 'this';
  return (
    (own && ending.builtin.has(name)) ||
    (ending.declared.has(name) && (own || ending.declared.get(name)?.has(receiver) === true))
  );
}

function callsEnding(text: string, ending: Ending): boolean {
  return topLevel(text)
    .split(/[;{}]/u)
    .some((statement) => endsRequest(statement, ending));
}

function guardedBefore(
  source: JavaSource,
  member: Member,
  location: { line: number; ending: Ending; variable: string | undefined },
): boolean {
  const { clean } = source;
  const lineStart = offsetOfLine(clean, location.line);
  const used = lineText(clean, location.line);
  const body = bodyOf(clean, member);
  const base = member.bodyStart + 1;
  return [...body.matchAll(IF_KEYWORD)].some((match) => {
    const open = base + match.index + match[0].length - 1;
    const close = conditionEnd(clean, open);
    const branch = branchEnds(clean, close + 1);
    const names = checkedNames(clean.slice(open + 1, close));
    return (
      branch.end < lineStart &&
      !leavesBlock(clean.slice(branch.end + 1, lineStart)) &&
      callsEnding(branch.text, location.ending) &&
      names.some(
        (name) =>
          (location.variable === undefined
            ? used.includes(name)
            : name.split('.').at(-1) === location.variable.split('.').at(-1)) &&
          !new RegExp(`(?<![\\w$.])${escapeRegExp(name)}\\s*=(?!=)`, 'u').test(
            clean.slice(branch.end, lineStart),
          ),
      )
    );
  });
}

function isGuarded(finding: Finding, index: SourceIndex, ending: Ending): boolean {
  const line = finding.location?.line;
  const source = typeof finding.path === 'string' ? index.source(finding.path) : undefined;
  if (source === undefined || typeof line !== 'number') {
    return false;
  }
  const method = methodAt(source, lastCode(source.clean, line));
  return (
    method !== undefined &&
    guardedBefore(source, method, { line, ending, variable: finding.variable })
  );
}

function isNullFinding(finding: Finding): boolean {
  return finding.tool === 'spotbugs' && NULL_RULES.has(String(finding.rule));
}

export function withoutNeverReturningNulls(
  findings: readonly unknown[],
  roots: IndexRoots,
): unknown[] {
  const candidates = findings.filter((finding) => isNullFinding(viewOf(finding)));
  if (candidates.length === 0) {
    return [...findings];
  }
  const index = sourceIndex(roots);
  const own = neverReturning(index);
  const declared = new Set(
    index
      .files()
      .flatMap((file) =>
        (index.source(file)?.classes ?? []).flatMap((found) =>
          found.members.filter((member) => member.kind === 'method').map((member) => member.name),
        ),
      ),
  );
  const play = new Set([...PLAY_ENDING_CALLS].filter((name) => !declared.has(name)));
  return findings.filter((finding) => {
    if (!candidates.includes(finding)) {
      return true;
    }
    const view = viewOf(finding);
    const source = typeof view.path === 'string' ? index.source(view.path) : undefined;
    const inPlay =
      source !== undefined && PLAY_CONTROLLER.test(source.clean) && !PLAY_RESULT.test(source.clean);
    return !isGuarded(view, index, { declared: own, builtin: inPlay ? play : new Set() });
  });
}

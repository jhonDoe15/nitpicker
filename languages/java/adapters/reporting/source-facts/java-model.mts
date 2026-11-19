import { blanked as blankedUntyped } from '../sarif/crypto-keys/java-scopes.mts';
import {
  BRACES as BRACES_UNTYPED,
  balancedEnd as balancedEndUntyped,
  depthChange as depthChangeUntyped,
} from '../../../../../shared/source-text/brackets/balanced.mjs';

export type Member = {
  readonly kind: 'field' | 'method';
  readonly name: string;
  readonly header: string;
  readonly start: number;
  readonly end: number;
  readonly bodyStart: number;
};
export type JavaClass = {
  readonly name: string;
  readonly parent: string | undefined;
  readonly start: number;
  readonly open: number;
  readonly end: number;
  readonly members: readonly Member[];
};
export type JavaSource = {
  readonly clean: string;
  readonly classes: readonly JavaClass[];
};

const blanked: (source: string) => string = blankedUntyped;
const BRACES: readonly string[] = BRACES_UNTYPED;
const balancedEnd: (text: string, open: number, brackets: readonly string[]) => number =
  balancedEndUntyped;
const depthChange: (character: string, left: string, right: string) => number = depthChangeUntyped;

const CLASS_HEADER = /\b(?:class|record)\s+([A-Za-z_$][\w$]*)(?=[\s<({])[^;{}=]*\{/gu;
const EXTENDS = /\bextends\s+([\w$.]+)/u;
const ANNOTATION = /@\s*[\w$.]+(?:\s*\([^)]*\))?/gu;
const CALL_NAME = /([A-Za-z_$][\w$]*)\s*\(/u;
const IDENTIFIER_END = /([A-Za-z_$][\w$]*)\s*$/u;

function closing(clean: string, open: number): number {
  return Math.min(balancedEnd(clean, open, BRACES), clean.length - 1);
}

function outsideParens(text: string): string {
  let depth = 0;
  return text
    .split('')
    .map((character) => {
      depth += depthChange(character, '(', ')');
      return depth > 0 || character === ')' ? ' ' : character;
    })
    .join('');
}

function memberOf(header: string, range: { start: number; end: number; bodyStart: number }) {
  const plain = header.replaceAll(ANNOTATION, ' ');
  const method = CALL_NAME.exec(outsideParens(plain).includes('=') ? '' : plain);
  if (method !== null) {
    return { kind: 'method' as const, name: method[1] ?? '', header: plain, ...range };
  }
  const declared = outsideParens(plain).split('=')[0] ?? '';
  const name = IDENTIFIER_END.exec(declared)?.[1];
  return name === undefined
    ? undefined
    : { kind: 'field' as const, name, header: declared, ...range };
}

function skipInitializer(clean: string, index: number): number {
  return clean.indexOf(';', closing(clean, index)) - 1;
}

function bodyMember(
  clean: string,
  index: number,
  start: number,
): { member: Member | undefined; next: number } {
  const bodyEnd = closing(clean, index);
  const member = memberOf(clean.slice(start, index), { start, end: bodyEnd, bodyStart: index });
  return { member: member?.kind === 'method' ? member : undefined, next: bodyEnd };
}

function fieldMember(clean: string, index: number, start: number): Member | undefined {
  const member = memberOf(clean.slice(start, index), { start, end: index, bodyStart: -1 });
  return member?.kind === 'field' ? member : undefined;
}

type Step = {
  readonly member: Member | undefined;
  readonly next: number;
  readonly restart: boolean;
};

function stepAt(clean: string, index: number, start: number): Step {
  const brace = clean[index] === '{';
  if (brace && outsideParens(clean.slice(start, index)).includes('=')) {
    return { member: undefined, next: skipInitializer(clean, index), restart: false };
  }
  const found = brace
    ? bodyMember(clean, index, start)
    : { member: fieldMember(clean, index, start), next: index };
  return { ...found, restart: true };
}

function membersOf(clean: string, open: number, end: number): Member[] {
  const members: Member[] = [];
  let start = open + 1;
  let skipUntil = open;
  for (const [offset, character] of clean
    .slice(open + 1, end)
    .split('')
    .entries()) {
    const index = open + 1 + offset;
    if (index <= skipUntil || (character !== ';' && character !== '{')) {
      continue;
    }
    const step = stepAt(clean, index, start);
    if (step.next < 0) {
      break;
    }
    members.push(...(step.member === undefined ? [] : [step.member]));
    start = step.restart ? step.next + 1 : start;
    skipUntil = step.next;
  }
  return members;
}

export function parseJava(text: string): JavaSource {
  const clean = blanked(text);
  const classes = [...clean.matchAll(CLASS_HEADER)].map((match) => {
    const open = match.index + match[0].length - 1;
    const end = closing(clean, open);
    return {
      name: match[1] ?? '',
      parent: EXTENDS.exec(match[0])?.[1]?.split('.').at(-1),
      start: match.index,
      open,
      end,
      members: membersOf(clean, open, end),
    };
  });
  return { clean, classes };
}

export function offsetOfLine(clean: string, line: number): number {
  const lines = clean.split('\n');
  if (line - 1 >= lines.length) {
    return clean.length;
  }
  return lines.slice(0, Math.max(0, line - 1)).reduce((sum, text) => sum + text.length + 1, 0);
}

export function lineText(clean: string, line: number): string {
  const start = offsetOfLine(clean, line);
  const end = clean.indexOf('\n', start);
  return clean.slice(start, end === -1 ? clean.length : end);
}

export function classAt(source: JavaSource, offset: number): JavaClass | undefined {
  return source.classes
    .filter((candidate) => candidate.start <= offset && offset <= candidate.end)
    .reduce<JavaClass | undefined>(
      (best, candidate) => (best === undefined || candidate.start > best.start ? candidate : best),
      undefined,
    );
}

export function methodAt(source: JavaSource, offset: number): Member | undefined {
  return classAt(source, offset)?.members.find(
    (member) => member.kind === 'method' && member.bodyStart <= offset && offset <= member.end,
  );
}

export function lastCode(clean: string, line: number): number {
  const text = lineText(clean, line).trimEnd();
  return offsetOfLine(clean, line) + Math.max(text.length - 1, 0);
}

export { closing };

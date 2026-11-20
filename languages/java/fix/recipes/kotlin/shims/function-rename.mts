import { braceDepths, closingIndex, splitArguments } from '../shared/kotlin-scan.mts';
import {
  declarationSpan,
  declaresName,
  importLine,
  isQualifiedBy,
  mentionedInJava,
  packageOf,
  renameUses,
  usesOf,
  wordPattern,
} from './source-index.mts';
import type { PathEdit, Source, Use } from './source-index.mts';

const NAMED_ARGUMENT = /^\w+\s*=(?!=)/u;
const TARGET_HEAD = /^((?:(?:public|internal|private)\s+)?)fun\s+(\w+)\s*\(/gmu;
const CALL = /^(\w+)\s*\(([^()]*)\)$/u;
const SUBTYPE_HEADER = /\b(?:class|object|interface)\s+\w[^{=\n]*:\s*\w/u;
const BODY_START = /[={]/u;

export type Forwarded = {
  readonly name: string;
  readonly replacement: string;
  readonly start: number;
  readonly end: number;
  readonly parameters: readonly string[];
  readonly returnType?: string | undefined;
  readonly visibility?: string;
};

export type Shape = {
  readonly target: string;
  readonly argumentText: string;
  readonly names: readonly string[];
  readonly types: readonly string[];
  readonly returnType: string | undefined;
  readonly end: number;
  readonly block: boolean;
  readonly returned: boolean;
};

type Target = {
  readonly source: Source;
  readonly parameters: readonly string[];
  readonly returnType?: string;
  readonly hidden: boolean;
};

type RenameInput = {
  readonly sources: readonly Source[];
  readonly source: Source;
  readonly forwarded: Forwarded;
  readonly mode: 'count' | 'types';
};

export function squashed(text: string): string {
  return text.replaceAll(/\s+/gu, '');
}

function parameterType(text: string): string {
  return squashed(text.slice(text.indexOf(':') + 1));
}

function parameterName(text: string): string | undefined {
  const colon = text.indexOf(':');
  const name = text.slice(0, colon).trim();
  const plain = !text.includes('=') && text.slice(colon + 1).trim() !== '';
  return colon > 0 && plain && /^\w+$/u.test(name) ? name : undefined;
}

function returnTypeAfter(code: string, close: number): { type?: string; at: number } {
  const rest = code.slice(close + 1);
  const offset = rest.length - rest.trimStart().length;
  if (rest.charAt(offset) !== ':') {
    return { at: close + 1 + offset };
  }
  const stop = rest.slice(offset).search(BODY_START);
  const at = stop === -1 ? code.length : close + 1 + offset + stop;
  return { type: squashed(code.slice(close + 2 + offset, at)), at };
}

function bodyOf(code: string, at: number): { text: string; end: number; block: boolean } {
  const block = code.charAt(at) === '{';
  const lineEnd = code.indexOf('\n', at);
  const expressionEnd = lineEnd === -1 ? code.length : lineEnd;
  const end = block ? closingIndex(code, at) + 1 : expressionEnd;
  return { text: code.slice(at + 1, block ? end - 1 : end).trim(), end, block };
}

export function shapeOf(code: string, open: number): Shape | undefined {
  const { close, parts } = splitArguments(code, open);
  const texts = parts.map(({ start, end }) => code.slice(start, end).trim());
  const names = texts.map(parameterName);
  const signature = returnTypeAfter(code, close);
  if (
    parts.length === 0 ||
    names.includes(undefined) ||
    !BODY_START.test(code.charAt(signature.at))
  ) {
    return undefined;
  }
  const body = bodyOf(code, signature.at);
  const returned = /^return\b/u.test(body.text);
  const call = CALL.exec(body.text.replace(/^return\s+/u, ''));
  return call === null
    ? undefined
    : {
        target: call[1] ?? '',
        argumentText: call[2] ?? '',
        names: names.map(String),
        types: texts.map(parameterType),
        returnType: signature.type,
        end: body.end,
        block: body.block,
        returned,
      };
}

function targetsOf(sources: readonly Source[], owner: string, name: string): Target[] {
  return sources
    .filter((other) => other.kotlin && packageOf(other) === owner)
    .flatMap((other) => {
      const { scanned } = other;
      return [...scanned.code.matchAll(TARGET_HEAD)]
        .filter((match) => match[2] === name)
        .map((match) => {
          const { close, parts } = splitArguments(scanned.code, match.index + match[0].length - 1);
          const returned = returnTypeAfter(scanned.code, close).type;
          return {
            source: other,
            parameters: parts.map(({ start, end }) =>
              parameterType(scanned.code.slice(start, end)),
            ),
            ...(returned === undefined ? {} : { returnType: returned }),
            hidden: match[1]?.startsWith('private') === true,
          };
        });
    });
}

function opensCall({ source, offset }: Use, name: string): number {
  const open = /^\s*\(/u.exec(source.scanned.code.slice(offset + name.length));
  return open === null ? -1 : offset + name.length + open[0].length - 1;
}

function callsWithNames(uses: readonly Use[], name: string): boolean {
  return uses.some((use) => {
    const open = opensCall(use, name);
    const { code } = use.source.scanned;
    return (
      open !== -1 &&
      splitArguments(code, open).parts.some(({ start, end }) =>
        NAMED_ARGUMENT.test(code.slice(start, end).trim()),
      )
    );
  });
}

function reachable(input: {
  readonly targets: readonly Target[];
  readonly forwarded: Forwarded;
  readonly strict: boolean;
  readonly uses: readonly Use[];
}): boolean {
  const { targets, forwarded, strict, uses } = input;
  return targets.some(
    (target) =>
      target.parameters.length === forwarded.parameters.length &&
      (!strict ||
        (target.parameters.every((type, index) => type === forwarded.parameters[index]) &&
          (forwarded.returnType === undefined || target.returnType === forwarded.returnType))) &&
      (!target.hidden || uses.every(({ source }) => source === target.source)),
  );
}

function insideSubtype({ source, offset }: Use): boolean {
  const { code } = source.scanned;
  return braceDepths(code)[offset] !== 0 && SUBTYPE_HEADER.test(code);
}

function moduleOf(file: string): string {
  const at = file.lastIndexOf('/src/');
  return at === -1 ? '' : file.slice(0, at);
}

function withinVisibility(source: Source, forwarded: Forwarded, uses: readonly Use[]): boolean {
  const { visibility } = forwarded;
  if (visibility === undefined) {
    return true;
  }
  return uses.every(({ source: user }) =>
    visibility === 'private'
      ? user === source
      : visibility === 'internal' && moduleOf(user.path) === moduleOf(source.path),
  );
}

function qualifiedUse({ source, offset }: Use, owner: string): boolean {
  return (
    source.scanned.code.charAt(offset - 1) !== '.' ||
    isQualifiedBy(source.scanned.code, offset, owner)
  );
}

function safeUses(input: RenameInput, accepted: readonly Use[]): boolean {
  const { sources, source, forwarded, mode } = input;
  const { name, replacement } = forwarded;
  const unusual = accepted.some(
    (use) => importLine(use.source, use.offset) === undefined && opensCall(use, name) === -1,
  );
  const targets = targetsOf(sources, packageOf(source), replacement);
  return (
    declaresName(sources, name) === 1 &&
    declaresName(sources, replacement) === 1 &&
    !unusual &&
    withinVisibility(source, forwarded, accepted) &&
    !accepted.some((use) => insideSubtype(use)) &&
    !mentionedInJava(sources, wordPattern(name, 'u', /\s*\(/u)) &&
    reachable({ targets, forwarded, strict: mode === 'types', uses: accepted }) &&
    !callsWithNames(accepted, name)
  );
}

export function renamePlan(input: RenameInput): readonly PathEdit[] | undefined {
  const { sources, source, forwarded } = input;
  const { name, replacement, start, end } = forwarded;
  const owner = packageOf(source);
  const uses = usesOf(sources, name).filter(
    ({ source: user, offset }) => !(user === source && offset >= start && offset < end),
  );
  const accepted = uses.filter((use) => qualifiedUse(use, owner));
  const removal = declarationSpan(source, start, end);
  if (removal === undefined || accepted.length !== uses.length || !safeUses(input, accepted)) {
    return undefined;
  }
  const qualified = owner === '' ? replacement : `${owner}.${replacement}`;
  return [
    ...renameUses(accepted, { from: name, to: replacement, qualified }),
    { ...removal, text: '', path: source.path },
  ];
}

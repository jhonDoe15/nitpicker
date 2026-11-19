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
} from './source-index.mts';
import type { PathEdit, Source, Use } from './source-index.mts';

const REPLACE_WITH = /ReplaceWith\s*\(\s*(?:expression\s*=\s*)?"([^"\\]*)"\s*\)/u;
const FUNCTION = /^\s*(?:(?:public|internal|inline)\s+)*fun\s+(\w+)\s*\(/u;
const PARAMETER = /^(\w+)\s*:/u;
const CALL = /^(\w+)\s*\(([^()]*)\)$/u;
const NAMED_ARGUMENT = /^\w+\s*=(?!=)/u;

type Shim = { readonly name: string; readonly replacement: string; readonly end: number };

function squashed(text: string): string {
  return text.replaceAll(/\s+/gu, '');
}

function declared(source: Source, offset: number): Shim | undefined {
  const { code } = source.scanned;
  const open = code.indexOf('(', offset);
  const close = open === -1 ? -1 : closingIndex(code, open);
  const annotation = REPLACE_WITH.exec(source.text.slice(offset, close + 1));
  const head = FUNCTION.exec(code.slice(close + 1));
  const name = head?.[1];
  const expression = annotation?.[1];
  if (annotation === null || head === null || name === undefined || expression === undefined) {
    return undefined;
  }
  const opened = close + 1 + head[0].length - 1;
  const { close: paramsEnd, parts } = splitArguments(code, opened);
  const names = parts.map(({ start, end }) => PARAMETER.exec(code.slice(start, end).trim())?.[1]);
  const call = CALL.exec(expression.trim());
  const [, target, argumentList] = call ?? [];
  const forwarded = (argumentList ?? '').split(',').map((entry) => entry.trim());
  const plain = parts.every(({ start, end }) => !code.slice(start, end).includes('='));
  if (target === undefined || target === name || !plain || names.includes(undefined)) {
    return undefined;
  }
  if (squashed(forwarded.join(',')) !== squashed(names.join(','))) {
    return undefined;
  }
  const after = code.slice(paramsEnd + 1);
  const bodyAt = /^\s*(?::\s*[\w.<>?, ]+)?\s*(\{|=)/u.exec(after);
  if (bodyAt === null) {
    return undefined;
  }
  const start = paramsEnd + 1 + bodyAt[0].length - 1;
  const lineEnd = code.indexOf('\n', start);
  const end =
    bodyAt[1] === '{' ? closingIndex(code, start) + 1 : lineEnd === -1 ? code.length : lineEnd;
  const body = code
    .slice(start + 1, bodyAt[1] === '{' ? end - 1 : end)
    .replace(/^\s*return\b/u, '');
  return squashed(body) === squashed(expression) ? { name, replacement: target, end } : undefined;
}

function siblingTarget(
  sources: readonly Source[],
  source: Source,
  shim: Shim,
  count: number,
): boolean {
  const owner = packageOf(source);
  const pattern = new RegExp(String.raw`^fun\s+${shim.replacement}\s*\(`, 'gmu');
  return sources
    .filter((other) => other.kotlin && packageOf(other) === owner)
    .some(({ scanned }) =>
      [...scanned.code.matchAll(pattern)].some((match) => {
        const { parts } = splitArguments(scanned.code, match.index + match[0].length - 1);
        return parts.length === count;
      }),
    );
}

function opensCall({ source, offset }: Use, name: string): number {
  const after = source.scanned.code.slice(offset + name.length);
  const open = /^\s*\(/u.exec(after);
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

export function deprecatedFunctionPlan(
  sources: readonly Source[],
  source: Source,
  offset: number,
): readonly PathEdit[] | undefined {
  const { code } = source.scanned;
  const shim = braceDepths(code)[offset] === 0 ? declared(source, offset) : undefined;
  if (shim === undefined) {
    return undefined;
  }
  const count = splitArguments(code, code.indexOf('(', code.indexOf('fun', offset))).parts.length;
  const owner = packageOf(source);
  const uses = usesOf(sources, shim.name).filter(
    ({ source: user, offset: at }) => !(user === source && at >= offset && at < shim.end),
  );
  const outside = uses.some(
    ({ source: user, offset: at }) =>
      user.scanned.code.charAt(at - 1) === '.' && !isQualifiedBy(user.scanned.code, at, owner),
  );
  const accepted = uses.filter(
    ({ source: user, offset: at }) =>
      user.scanned.code.charAt(at - 1) !== '.' || isQualifiedBy(user.scanned.code, at, owner),
  );
  const unusual = accepted.some(
    (use) => importLine(use.source, use.offset) === undefined && opensCall(use, shim.name) === -1,
  );
  const removal = declarationSpan(source, offset, shim.end);
  const javaCall = mentionedInJava(sources, new RegExp(String.raw`\b${shim.name}\s*\(`, 'u'));
  if (
    removal === undefined ||
    outside ||
    unusual ||
    javaCall ||
    declaresName(sources, shim.name) !== 1 ||
    !siblingTarget(sources, source, shim, count) ||
    callsWithNames(accepted, shim.name)
  ) {
    return undefined;
  }
  const qualified = owner === '' ? shim.replacement : `${owner}.${shim.replacement}`;
  return [
    ...renameUses(accepted, { from: shim.name, to: shim.replacement, qualified }),
    { ...removal, text: '', path: source.path },
  ];
}

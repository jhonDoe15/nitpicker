import type { TestScanned } from '../../typed/discovery-types.mts';
import { groupOf } from '../../typed/indexing.mts';

type Pending = { offset: number; depth: number; suffix: string };
import { literalAt } from '../../../../scan/kotlin-source.mts';
import {
  matchingOpen,
  remembered,
  skipSpace,
  trimmedEnd,
  wordBefore,
} from '../../discovery/text-scan.mts';
import { appendAll } from '../../../../../../../../shared/lists/lists.mts';

const LOOPBACK =
  /^(?:localhost|[^.]+\.localhost|127(?:\.\d+){3}|\[::1\]|\[(?:0:){7}1\]|0\.0\.0\.0|host\.docker\.internal)$/iu;
const URL_HEAD = /^(?:https?|wss?):\/\/(?:[^/@?#\s]*@)?(\[[\da-f:.]+\]|[^/:?#\s$]+)/iu;
const HOST_NAME = /^[a-z\d][\w.-]*$/iu;
const BINDING = /(?<![\w.`])(?:val|var)\s+(\w+)\s*(?::\s*[\w.<>?]+\s*)?=(?!=)/gu;
const WRAPPER = /^(?:java\s*\.\s*net\s*\.\s*)?(?:URL|URI)\s*(?:\.\s*create\s*)?\(/u;
const REFERENCE = /^(?:[A-Za-z_]\w*\s*\.\s*)*([A-Za-z_]\w*)(?![\w(])/u;
const TEMPLATE_HEAD = /^\$\{?(\w+)\}?/u;
const URI_CREATE = /URI\s*\.\s*$/u;
const MAX_DEPTH = 4;
const WRAPPER_WINDOW = 40;
const REFERENCE_WINDOW = 120;
const CREATE_WINDOW = 12;

export function isRemoteUrl(text: string): boolean {
  const host = URL_HEAD.exec(text)?.[1];
  return host !== undefined && !LOOPBACK.test(host);
}

export function isRemoteHost(text: string): boolean {
  return HOST_NAME.test(text) && !LOOPBACK.test(text);
}

function bindingsOf(scanned: TestScanned): Map<string, number[]> {
  return remembered(scanned, 'url-bindings', () => {
    const bindings = new Map<string, number[]>();
    for (const match of scanned.code.matchAll(BINDING)) {
      const start = match.index + match[0].length;
      const name = groupOf(match, 1);
      bindings.set(name, [...(bindings.get(name) ?? []), start]);
    }
    return bindings;
  });
}

function bindingLiteral(scanned: TestScanned, name: string): string | undefined {
  const starts = bindingsOf(scanned).get(name) ?? [];
  return starts.map((start) => literalFrom(scanned, start)).find(Boolean);
}

function nextStarts(scanned: TestScanned, at: number): number[] {
  const { code } = scanned;
  const wrapper = WRAPPER.exec(code.slice(at, at + WRAPPER_WINDOW));
  if (wrapper !== null) {
    return [at + wrapper[0].length];
  }
  const reference = REFERENCE.exec(code.slice(at, at + REFERENCE_WINDOW));
  return reference === null ? [] : (bindingsOf(scanned).get(groupOf(reference, 1)) ?? []);
}

function extended(item: Pending, starts: number[], suffix: string): Pending[] {
  return starts.map((start) => ({ offset: start, depth: item.depth + 1, suffix }));
}

export function literalFrom(scanned: TestScanned, offset: number): string | undefined {
  const pending: Pending[] = [{ offset, depth: 0, suffix: '' }];
  for (const item of pending) {
    const at = skipSpace(scanned.code, item.offset);
    if (item.depth > MAX_DEPTH) {
      continue;
    }
    if (scanned.code[at] !== '"') {
      appendAll(pending, extended(item, nextStarts(scanned, at), item.suffix));
      continue;
    }
    const text = literalAt(scanned, at)?.text ?? '';
    const reference = TEMPLATE_HEAD.exec(text);
    if (reference === null) {
      return text + item.suffix;
    }
    const rest = text.slice(reference[0].length) + item.suffix;
    appendAll(pending, extended(item, bindingsOf(scanned).get(groupOf(reference, 1)) ?? [], rest));
  }
  return undefined;
}

function receiverStep(
  scanned: TestScanned,
  dot: number,
): { literal: string | undefined; next: number[] } {
  const { code } = scanned;
  const stop = trimmedEnd(scanned, dot);
  if (code[stop - 1] === '"') {
    return { literal: scanned.literals.find(({ end }) => end === stop)?.text, next: [] };
  }
  if (code[stop - 1] !== ')') {
    const name = wordBefore(scanned, stop).word;
    return { literal: name === '' ? undefined : bindingLiteral(scanned, name), next: [] };
  }
  const open = matchingOpen(scanned, stop - 1);
  const callee = wordBefore(scanned, open);
  const before = code.slice(Math.max(0, callee.start - CREATE_WINDOW), callee.start);
  if (callee.word === 'URL' || callee.word === 'URI' || URI_CREATE.test(before)) {
    return { literal: literalFrom(scanned, open + 1), next: [] };
  }
  const dotBefore = trimmedEnd(scanned, callee.start) - 1;
  const converts = callee.word === 'toURL' || callee.word === 'toUri';
  return { literal: undefined, next: converts && code[dotBefore] === '.' ? [dotBefore] : [] };
}

export function receiverLiteral(scanned: TestScanned, dot: number): string | undefined {
  const pending: number[] = [dot];
  for (const position of pending) {
    const step = receiverStep(scanned, position);
    if (step.literal !== undefined) {
      return step.literal;
    }
    appendAll(pending, step.next);
  }
  return undefined;
}

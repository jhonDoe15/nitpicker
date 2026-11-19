import { balancedEnd } from '../../../../../shared/source-text/brackets/balanced.mjs';

type StepCall = { name: string; argument: string };
export type FormatterStep = { name: string; version: string; chain: StepCall[] };
type Brackets = readonly [string, string];

const balancedEndOf: (text: string, open: number, brackets: Brackets) => number = balancedEnd;

const SPOTLESS = /\bspotless\s*\{/gu;
const JAVA_BLOCK = /\bjava\s*\{/gu;
const STEP = /\b(palantirJavaFormat|googleJavaFormat)\s*\(/giu;
const CHAIN_CALL = /^\s*\.\s*(\w+)\s*\(/u;

function closing(text: string, open: number, brackets: Brackets): number {
  return Math.min(balancedEndOf(text, open, brackets), text.length - 1);
}

function blocksAfter(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => {
    const open = match.index + match[0].length - 1;
    return text.slice(open + 1, closing(text, open, ['{', '}']));
  });
}

export function spotlessJavaBlocks(code: string): string[] | undefined {
  const spotless = blocksAfter(code, SPOTLESS);
  return spotless.length === 0
    ? undefined
    : spotless.flatMap((body) => blocksAfter(body, JAVA_BLOCK));
}

export function outsideSpotless(code: string): string {
  let rest = code;
  for (const match of [...code.matchAll(SPOTLESS)].toReversed()) {
    const open = match.index + match[0].length - 1;
    rest = rest.slice(0, open) + rest.slice(closing(code, open, ['{', '}']) + 1);
  }
  return rest;
}

function callAt(text: string, open: number): { argument: string; end: number } {
  const end = closing(text, open, ['(', ')']);
  return { argument: text.slice(open + 1, end), end };
}

function chainAfter(text: string, from: number): StepCall[] {
  const chain: StepCall[] = [];
  const starts = [from];
  for (const start of starts) {
    const match = CHAIN_CALL.exec(text.slice(start));
    if (match !== null) {
      const { argument, end } = callAt(text, start + match[0].length - 1);
      chain.push({ name: (match[1] ?? '').toLowerCase(), argument });
      starts.push(end + 1);
    }
  }
  return chain;
}

export function formatterSteps(block: string): FormatterStep[] {
  return [...block.matchAll(STEP)].map((match) => {
    const open = match.index + match[0].length - 1;
    const { argument, end } = callAt(block, open);
    return {
      name: (match[1] ?? '').toLowerCase(),
      version: argument,
      chain: chainAfter(block, end + 1),
    };
  });
}

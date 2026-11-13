import { maskCLike } from '../../masking/c-like.mts';
import { GRADLE_DECLARATION, type GateLine, TEST_BLOCK, TEST_SETTINGS, TOOLS } from './tools.mts';

function openedHeads(line: string): string[] {
  const heads: string[] = [];
  let start = 0;
  for (const [index, character] of line.split('').entries()) {
    if (character === '{') {
      heads.push(line.slice(start, index).trim());
      start = index + 1;
    }
  }
  return heads;
}

function closedBlocks(line: string): number {
  return [...line].filter((character) => character === '}').length;
}

function isToolHead(head: string): boolean {
  return TOOLS.test(head) || TEST_BLOCK.test(head);
}

function gateEntry({ line, scope }: { line: string; scope: readonly string[] }): GateLine[] {
  const inTest = scope.some((head) => TEST_BLOCK.test(head));
  const gate =
    TOOLS.test(line) ||
    scope.some((head) => TOOLS.test(head)) ||
    (inTest && TEST_SETTINGS.test(line));
  const group = scope.find(isToolHead)?.replaceAll(/\s+/gu, ' ');
  return gate ? [{ text: line, group, declaration: GRADLE_DECLARATION.test(line) }] : [];
}

export function gradleGateLines(file: string, text: string): GateLine[] {
  const { masked } = maskCLike(text, { kotlin: /\.kts?$/u.test(file), keepStrings: true });
  const stack: string[] = [];
  const gate: GateLine[] = [];
  for (const line of masked.split('\n').map((candidate) => candidate.trim())) {
    const opened = openedHeads(line);
    if (line !== '') gate.push(...gateEntry({ line, scope: [...stack, ...opened] }));
    stack.length = Math.max(0, stack.length - closedBlocks(line));
    stack.push(...opened);
  }
  return gate;
}

import { maskCLike } from '../../masking/c-like.mjs';
import { GRADLE_DECLARATION, TEST_BLOCK, TEST_SETTINGS, TOOLS } from './tools.mjs';

function openedHeads(line) {
  const heads = [];
  let start = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '{') {
      heads.push(line.slice(start, index).trim());
      start = index + 1;
    }
  }
  return heads;
}

const closedBlocks = (line) => [...line].filter((character) => character === '}').length;
const isToolHead = (head) => TOOLS.test(head) || TEST_BLOCK.test(head);

function gateEntry({ line, scope }) {
  const inTest = scope.some((head) => TEST_BLOCK.test(head));
  const gate =
    TOOLS.test(line) ||
    scope.some((head) => TOOLS.test(head)) ||
    (inTest && TEST_SETTINGS.test(line));
  const group = scope.find(isToolHead)?.replaceAll(/\s+/gu, ' ');
  return gate ? [{ text: line, group, declaration: GRADLE_DECLARATION.test(line) }] : [];
}

/**
 * The gate lines of a Gradle script (or of a `buildSrc` source): `{ text, group, declaration }` for
 * each line that names a tool or setting, sits in a block of one, or sits in a block that
 * configures the test task and chooses which tests run. `group` is the outermost such block's head;
 * `declaration` marks a line that only declares a plugin or a dependency.
 */
export function gradleGateLines(file, text) {
  const { masked } = maskCLike(text, { kotlin: /\.kts?$/u.test(file), keepStrings: true });
  const stack = [];
  const gate = [];
  for (const line of masked.split('\n').map((candidate) => candidate.trim())) {
    const opened = openedHeads(line);
    if (line !== '') gate.push(...gateEntry({ line, scope: [...stack, ...opened] }));
    stack.length = Math.max(0, stack.length - closedBlocks(line));
    stack.push(...opened);
  }
  return gate;
}

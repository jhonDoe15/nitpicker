import { MAVEN_STRUCTURE, TOOLS } from './tools.mjs';

const trimmedLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

const entries = (text, extra) => trimmedLines(text).map((line) => ({ text: line, ...extra(line) }));

function takeBlocks(rest, tag, wanted) {
  let remaining = rest;
  const blocks = [];
  for (const [block] of rest.matchAll(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'gu'))) {
    if (wanted(block)) {
      blocks.push(block);
      remaining = remaining.replace(block, '');
    }
  }
  return { blocks, remaining };
}

const artifactOf = (block) => /<artifactId>([^<]*)</u.exec(block)?.[1] ?? '';

/**
 * The gate lines of a pom.xml: `{ text, group, declaration }` for every line of a plugin of a
 * test, coverage or analysis tool (`group` is the plugin; its coordinates are the `declaration`
 * lines), every line of a dependency on one (all declarations) and every other line naming one.
 */
export function mavenGateLines(text) {
  const uncommented = text.replaceAll(/<!--[\s\S]*?-->/gu, '');
  const plugins = takeBlocks(uncommented, 'plugin', (block) => TOOLS.test(artifactOf(block)));
  const dependencies = takeBlocks(plugins.remaining, 'dependency', (block) => TOOLS.test(block));
  return [
    ...plugins.blocks.flatMap((block) =>
      entries(block, (line) => ({
        group: `plugin:${artifactOf(block)}`,
        declaration: MAVEN_STRUCTURE.test(line),
      })),
    ),
    ...dependencies.blocks.flatMap((block) => entries(block, () => ({ declaration: true }))),
    ...entries(dependencies.remaining, () => ({ declaration: false })).filter((entry) =>
      TOOLS.test(entry.text),
    ),
  ];
}

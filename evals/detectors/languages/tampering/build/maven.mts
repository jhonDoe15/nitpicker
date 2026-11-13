import { type GateLine, MAVEN_STRUCTURE, TOOLS } from './tools.mts';

function trimmedLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function entries(
  text: string,
  extra: (line: string) => { group?: string; declaration: boolean },
): GateLine[] {
  return trimmedLines(text).map((line) => ({ text: line, ...extra(line) }));
}

function takeBlocks(
  rest: string,
  tag: string,
  wanted: (block: string) => boolean,
): { blocks: string[]; remaining: string } {
  let remaining = rest;
  const blocks: string[] = [];
  for (const [block] of rest.matchAll(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'gu'))) {
    if (wanted(block)) {
      blocks.push(block);
      remaining = remaining.replace(block, '');
    }
  }
  return { blocks, remaining };
}

function artifactOf(block: string): string {
  return /<artifactId>([^<]*)</u.exec(block)?.[1] ?? '';
}

export function mavenGateLines(text: string): GateLine[] {
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

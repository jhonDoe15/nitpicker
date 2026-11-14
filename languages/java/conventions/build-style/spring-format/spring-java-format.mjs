import { childAt } from '../../../../../shared/ingest/common.mjs';

export const SPRING_JAVA_FORMAT = 'spring';

const SPRING_FORMAT_ARTIFACT = 'spring-javaformat-maven-plugin';
const PLUGIN_ID = String.raw`["']io\.spring\.javaformat["']`;
const APPLY_FALSE = /\bapply\s+false/u;
const APPLIED_IN_GRADLE = [
  new RegExp(String.raw`\bid\s*(?:\(\s*)?${PLUGIN_ID}\s*\)?`, 'u'),
  new RegExp(String.raw`\bapply\s*(?:\(\s*)?plugin\s*[:=]\s*${PLUGIN_ID}`, 'u'),
  new RegExp(String.raw`\bid\s*=\s*${PLUGIN_ID}`, 'u'),
];
const NOT_RUN_IN_POM = new Set(['pluginManagement', 'reporting']);

export function declaresSpringJavaFormat(code) {
  return code
    .split('\n')
    .filter((line) => !APPLY_FALSE.test(line))
    .some((line) => APPLIED_IN_GRADLE.some((pattern) => pattern.test(line)));
}

export function springFormatInPom(root) {
  const queue = [{ node: root, skipped: false }];
  for (const { node, skipped } of queue) {
    queue.push(
      ...node.children.map((child) => ({
        node: child,
        skipped: skipped || NOT_RUN_IN_POM.has(child.name),
      })),
    );
  }
  return queue
    .filter(({ node, skipped }) => !skipped && node.name === 'plugin')
    .some(({ node }) => childAt(node, 'artifactId')?.text === SPRING_FORMAT_ARTIFACT);
}

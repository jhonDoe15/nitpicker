const NODE_WORD = /\bnode\b/u;
const QUOTED_CODE_FILE = /['"]([^'"\s$]+\.[cm]?[jt]sx?)['"]/gu;
const SHELL_NODE = /['"`]\s*node\s+([^'"`\s]+)/gu;
const MAVEN_NODE = /<executable>\s*node\s*<\/executable>\s*<arguments>\s*<argument>([^<]+)</gu;

function stripped(file: string): string {
  return file.trim().replace(/^(?:\.\/)+/u, '');
}

export function filesStartedByBuildTool(text: string): string[] {
  if (!NODE_WORD.test(text)) {
    return [];
  }
  return [QUOTED_CODE_FILE, SHELL_NODE, MAVEN_NODE].flatMap((pattern) =>
    [...text.matchAll(pattern)].map(([, file]) => stripped(file ?? '')),
  );
}

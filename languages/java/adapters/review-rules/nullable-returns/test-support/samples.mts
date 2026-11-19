import { nullableReturnUses } from '../nullable-returns.mts';

export const MARK = '// flagged';

function flagged(text: string): number[] {
  return text.split('\n').flatMap((line, index) => (line.includes(MARK) ? [index + 1] : []));
}

export function reported(files: Readonly<Record<string, string>>): string[] {
  const sources = Object.entries(files).map(([file, text]) => ({ file, text }));
  return nullableReturnUses(sources).map(({ file, line }) => `${file}:${String(line)}`);
}

export function flaggedReport(text: string): { found: string[]; marked: string[] } {
  return {
    found: reported({ 'Sample.java': text }),
    marked: flagged(text).map((line) => `Sample.java:${String(line)}`),
  };
}

export function peers(name: string, count = 6): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `  boolean ${name}Peer${String(index)}(String key) { return ${name}(key) != null; }\n`,
  ).join('');
}

export function sample(body: string): string {
  return `package shop;\nimport java.util.*;\nclass Sample {\n${body}\n}\n`;
}

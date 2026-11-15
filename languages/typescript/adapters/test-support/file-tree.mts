import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function writeFileTree(
  root: string,
  files: Readonly<Record<string, string | readonly string[]>>,
): void {
  for (const [name, contents] of Object.entries(files)) {
    const target = path.resolve(root, name);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) {
      throw new Error(`Test project file is outside the project: ${name}`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof contents === 'string' ? contents : `${contents.join('\n')}\n`);
  }
}

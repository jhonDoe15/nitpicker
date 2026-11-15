import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFileTree } from '../../test-support/file-tree.mts';
import { temporaryRoots } from '../../test-support/temporary-roots.mts';

export function strictProjects(prefix: string): {
  readonly create: (
    source: string,
    compilerOptions: object,
    extra: Readonly<Record<string, string>>,
  ) => string;
} {
  const roots = temporaryRoots();
  return {
    create(source, compilerOptions, extra) {
      const root = mkdtempSync(path.join(tmpdir(), prefix));
      roots.push(root);
      writeFileTree(root, {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { strict: true, types: [], lib: ['ES2022'], ...compilerOptions },
          include: ['src'],
        }),
        'src/main.ts': source,
        ...extra,
      });
      return root;
    },
  };
}

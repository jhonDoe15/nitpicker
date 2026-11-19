import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { MainSourceOptions } from '../java-sources.mts';

export const PROJECT = {
  qualifier: '',
  sourceRoots: ['src/main/java'],
  testSourceRoots: ['src/test/java'],
  kotlinSourceRoots: ['src/main/kotlin'],
  kotlinTestSourceRoots: ['src/test/kotlin'],
};

export function useTempProjects(
  prefix: string,
): (files: Readonly<Record<string, string>>) => string {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  return (files) => {
    const root = mkdtempSync(path.join(tmpdir(), prefix));
    roots.push(root);
    for (const [file, text] of Object.entries(files)) {
      const target = path.join(root, file);
      if (path.relative(root, target).startsWith('..')) {
        throw new Error(`${file} is outside the temp project`);
      }
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
    return root;
  };
}

export function useScanner(
  prefix: string,
  read: (projectRoot: string, options: MainSourceOptions) => ReviewFinding[],
): (file: string, text: string, kotlin: boolean) => ReviewFinding[] {
  const projectWith = useTempProjects(prefix);
  return (file, text, kotlin) =>
    read(projectWith({ [file]: text }), { projects: [PROJECT], kotlin });
}

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFilesUnder as projectFilesUnderUntyped } from '../../../../../shared/project-files/project-files.mjs';
import { parseJava, type JavaSource } from './java-model.mts';

const projectFilesUnder: (root: string) => string[] = projectFilesUnderUntyped;

export type SourceIndex = {
  readonly files: () => readonly string[];
  readonly source: (file: string) => JavaSource | undefined;
};

export type IndexRoots = {
  readonly projectRoot: string;
  readonly sourceRoots: readonly string[];
};

function readSource(projectRoot: string, file: string): JavaSource | undefined {
  const base = path.resolve(projectRoot);
  const absolute = path.resolve(base, file);
  if (!absolute.startsWith(base + path.sep)) {
    return undefined;
  }
  return file.endsWith('.java') && existsSync(absolute)
    ? parseJava(readFileSync(absolute, 'utf8'))
    : undefined;
}

export function sourceIndex({ projectRoot, sourceRoots }: IndexRoots): SourceIndex {
  const parsed = new Map<string, JavaSource | undefined>();
  let listed: string[] | undefined;
  function files(): string[] {
    listed ??= sourceRoots.flatMap((root) => {
      const base = path.resolve(projectRoot, root);
      return projectFilesUnder(base)
        .filter((file) => file.endsWith('.java'))
        .map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
    });
    return listed;
  }
  function source(file: string): JavaSource | undefined {
    if (!parsed.has(file)) {
      parsed.set(file, readSource(projectRoot, file));
    }
    return parsed.get(file);
  }
  return { files, source };
}

import type TypeScript from 'typescript';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';

const known = new WeakMap<TypeScript.Program, Map<string, boolean>>();

function isProjectFile(file: TypeScript.SourceFile): boolean {
  return !file.isDeclarationFile && !file.fileName.includes('/node_modules/');
}

export function projectMentions(context: Context, tokens: readonly string[]): boolean {
  const program = typeServices(context)?.program;
  if (program === undefined) {
    return true;
  }
  const key = tokens.join('|');
  const cache = known.get(program) ?? new Map<string, boolean>();
  known.set(program, cache);
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const found = program
    .getSourceFiles()
    .some((file) => isProjectFile(file) && tokens.some((token) => file.text.includes(token)));
  cache.set(key, found);
  return found;
}

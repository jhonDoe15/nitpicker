import type TypeScript from 'typescript';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';

const known = new WeakMap<TypeScript.Program, Map<string, boolean>>();

export function isProjectFile(file: TypeScript.SourceFile): boolean {
  return !(file.isDeclarationFile || file.fileName.includes('/node_modules/'));
}

export function projectMentions(context: Context, tokens: readonly string[]): boolean {
  const program = typeServices(context)?.program;
  if (program === undefined) {
    return true;
  }
  const key = tokens.join('|');
  const cache = cachedValue(known, program, () => new Map<string, boolean>());
  return cachedValue(cache, key, () =>
    program
      .getSourceFiles()
      .some((file) => isProjectFile(file) && tokens.some((token) => file.text.includes(token))),
  );
}

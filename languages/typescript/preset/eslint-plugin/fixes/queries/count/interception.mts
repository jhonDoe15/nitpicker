import type TypeScript from 'typescript';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';

const HOOKS = ['$use(', '$extends('];
const known = new WeakMap<TypeScript.Program, boolean>();

function isProjectFile(file: TypeScript.SourceFile): boolean {
  return !file.isDeclarationFile && !file.fileName.includes('/node_modules/');
}

export function hasQueryInterception(context: Context): boolean {
  const program = typeServices(context)?.program;
  if (program === undefined) {
    return true;
  }
  const cached = known.get(program);
  if (cached !== undefined) {
    return cached;
  }
  const found = program
    .getSourceFiles()
    .some((file) => isProjectFile(file) && HOOKS.some((hook) => file.text.includes(hook)));
  known.set(program, found);
  return found;
}

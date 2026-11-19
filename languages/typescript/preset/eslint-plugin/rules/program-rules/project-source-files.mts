import type TypeScript from 'typescript';

export function isProjectSource(file: TypeScript.SourceFile, testPath: RegExp): boolean {
  const name = file.fileName.replaceAll('\\', '/');
  return !(file.isDeclarationFile || name.includes('/node_modules/') || testPath.test(name));
}

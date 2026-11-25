import { createRequire } from 'node:module';
import path from 'node:path';
import { isToolInstalled, resolveTool } from '../../../../core/tooling/tool-resolution.mts';
import { isFile } from '../../../../shared/filesystem.mts';

const API_PACKAGE = '@typescript/native';
const COMPILER = process.platform === 'win32' ? 'tsc.exe' : 'tsc';
const PLATFORM_PACKAGE = `@typescript/typescript-${process.platform}-${process.arch}`;

function installedApiRoot(): string | undefined {
  return isToolInstalled(API_PACKAGE) ? resolveTool(API_PACKAGE).root : undefined;
}

export function nativeCompilerPath(apiRoot = installedApiRoot()): string | undefined {
  if (apiRoot === undefined) {
    return undefined;
  }
  const folders = createRequire(path.join(apiRoot, 'package.json')).resolve.paths(PLATFORM_PACKAGE);
  return (folders ?? [])
    .map((folder) => path.join(folder, PLATFORM_PACKAGE, 'lib', COMPILER))
    .find(isFile);
}

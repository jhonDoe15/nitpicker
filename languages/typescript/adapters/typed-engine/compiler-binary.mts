import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mts';

const COMPILER = process.platform === 'win32' ? 'tsc.exe' : 'tsc';

export function nativeCompilerPath(apiRoot?: string): string | undefined {
  const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}/package.json`;
  try {
    const root = apiRoot ?? resolveTool('@typescript/native').root;
    const manifest = createRequire(path.join(root, 'package.json')).resolve(platformPackage);
    const compiler = path.join(path.dirname(manifest), 'lib', COMPILER);
    return existsSync(compiler) ? compiler : undefined;
  } catch {
    return undefined;
  }
}

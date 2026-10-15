import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ts = createRequire(import.meta.url)('typescript');
const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-tsconfig-quality-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function programFiles(files) {
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), 'export {};');
  }
  const configPath = path.join(root, 'tsconfig.json');
  copyFileSync(path.join(import.meta.dirname, 'tsconfig.quality.json'), configPath);
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  return ts
    .parseJsonConfigFileContent(config, ts.sys, root, undefined, configPath)
    .fileNames.map((name) => path.relative(root, name));
}

describe('the default quality tsconfig', () => {
  it('puts a project declaration file under a source root in the program', () => {
    const files = programFiles(['src/main/vite-env.d.ts', 'src/main/app.ts', 'dist/out.d.ts']);

    expect(files).toContain('src/main/vite-env.d.ts');
    expect(files).toContain('src/main/app.ts');
    expect(files).not.toContain('dist/out.d.ts');
  });
});

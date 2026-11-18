import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import type { SourceModule } from '../errorprone/compiler-types.mts';

export function sourceModule(fields: Partial<SourceModule> & { basedir: string }): SourceModule {
  return {
    outputDirectory: '',
    testOutputDirectory: '',
    sourceRoots: [],
    testSourceRoots: [],
    compiler: {},
    ...fields,
  };
}

export function fakeJava(basedir: string, reportFlag: string): void {
  const java = path.join(basedir, 'jdk/bin/java');
  mkdirSync(path.dirname(java), { recursive: true });
  writeFileSync(
    java,
    [
      `#!${process.execPath}`,
      "const fs = require('node:fs');",
      "const lines = fs.readFileSync(process.argv[2].slice(1), 'utf8').split('\\n');",
      'const args = lines.map((line) => JSON.parse(line));',
      `fs.writeFileSync(${JSON.stringify(path.join(basedir, 'arguments.json'))}, JSON.stringify(args));`,
      `fs.writeFileSync(args[args.indexOf(${JSON.stringify(reportFlag)}) + 1], '{}');`,
    ].join('\n'),
  );
  chmodSync(java, 0o755);
  vi.stubEnv('JAVA_HOME', path.join(basedir, 'jdk'));
}

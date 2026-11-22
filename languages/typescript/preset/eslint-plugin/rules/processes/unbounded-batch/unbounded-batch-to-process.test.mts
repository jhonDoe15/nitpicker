import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './unbounded-batch-to-process.mts';

const tester = typescriptRuleTester();

const UNBOUNDED_BATCH = { messageId: 'unboundedBatchToProcess' };

tester.run('unbounded-batch-to-process', rule, {
  valid: [
    {
      filename: 'src/lint.mts',
      code: `
        import { spawn } from 'node:child_process';
        declare function batchesOf<T>(items: T[], size: number): T[][];
        export function lintAll(allProjectFiles: string[]) {
          for (const batch of batchesOf(allProjectFiles, 50)) {
            spawn('oxlint', ['--type-aware', ...batch]);
          }
        }
      `,
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { execFileSync } from 'node:child_process';
        const BATCH_SIZE = 50;
        export function lintAll(files: string[]) {
          for (let i = 0; i < files.length; i += BATCH_SIZE) {
            execFileSync('oxlint', ['--fix', ...files.slice(i, i + BATCH_SIZE)]);
          }
        }
      `,
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { execa } from 'execa';
        declare function batchesOf<T>(items: T[], size: number): T[][];
        export function lintAll(files: string[]) {
          return Promise.all(
            batchesOf(files, 100).map((chunk) => execa('eslint', [...chunk])),
          );
        }
      `,
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function lintSample(files: string[]) {
          return spawn('oxlint', ['--type-aware', ...files.slice(0, 50)]);
        }
      `,
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function runTool(
          args: string[],
          flags: string[],
          extraArgs: string[],
          options: string[],
          defaultArgs: string[],
        ) {
          return spawn('oxlint', [...defaultArgs, ...flags, ...options, ...args, ...extraArgs]);
        }
      `,
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { spawn } from 'node:child_process';
        const FIXED_FILES = ['a.ts', 'b.ts'];
        export function lintFixed() {
          return spawn('oxlint', ['--type-aware', ...FIXED_FILES]);
        }
      `,
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function lintLiteral() {
          return spawn('oxlint', [...['a.ts', 'b.ts']]);
        }
      `,
    },
    {
      filename: 'src/lint.mts',
      code: `
        declare function runCustom(cmd: string, args: string[]): void;
        export function lintAll(allProjectFiles: string[]) {
          runCustom('oxlint', ['--type-aware', ...allProjectFiles]);
        }
      `,
    },
    {
      filename: 'src/lint.test.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function lintAll(allProjectFiles: string[]) {
          return spawn('oxlint', ['--type-aware', ...allProjectFiles]);
        }
      `,
    },
  ],
  invalid: [
    {
      filename: 'src/lint.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function lintAll(allProjectFiles: string[]) {
          return spawn('oxlint', ['--type-aware', ...allProjectFiles]);
        }
      `,
      errors: [UNBOUNDED_BATCH],
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { spawnSync } from 'node:child_process';
        export function lintAll(files: string[]) {
          return spawnSync('eslint', [...files]);
        }
      `,
      errors: [UNBOUNDED_BATCH],
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { execFile } from 'node:child_process';
        export class Linter {
          private sources: string[] = [];
          run() {
            return execFile('prettier', ['--check', ...this.sources]);
          }
        }
      `,
      errors: [UNBOUNDED_BATCH],
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { execFileSync } from 'node:child_process';
        export function lintTargets(ctx: { targets: string[] }) {
          return execFileSync('tool', [...ctx.targets]);
        }
      `,
      errors: [UNBOUNDED_BATCH],
    },
    {
      filename: 'src/lint.mts',
      code: `
        declare function spawnAsync(cmd: string, args: string[]): Promise<void>;
        export function lintEntries(entries: string[]) {
          return spawnAsync('oxlint', ['--type-aware', ...entries]);
        }
      `,
      errors: [UNBOUNDED_BATCH],
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { execa } from 'execa';
        export function checkPaths(paths: string[]) {
          return execa('biome', ['check', ...paths]);
        }
      `,
      errors: [UNBOUNDED_BATCH],
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { spawn } from 'node:child_process';
        declare function walkDir(root: string): string[];
        export function lintRoot(root: string) {
          const discovered = walkDir(root);
          return spawn('oxlint', [...discovered]);
        }
      `,
      errors: [UNBOUNDED_BATCH],
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { execFile } from 'node:child_process';
        export function checkModules(modules: string[]) {
          const cmdArgs = ['--check', ...modules];
          return execFile('tool', cmdArgs);
        }
      `,
      errors: [UNBOUNDED_BATCH],
    },
    {
      filename: 'src/lint.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function checkFindings(findings: { path: string }[]) {
          return spawn('oxlint', ['--type-aware', ...findings.map((f) => f.path)]);
        }
      `,
      errors: [UNBOUNDED_BATCH],
    },
  ],
});

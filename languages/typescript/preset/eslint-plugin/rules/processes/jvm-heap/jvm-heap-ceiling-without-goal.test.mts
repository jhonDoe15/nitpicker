import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './jvm-heap-ceiling-without-goal.mts';

const tester = typescriptRuleTester();

const MISSING_GOAL = { messageId: 'jvmHeapCeilingWithoutGoal' };

tester.run('jvm-heap-ceiling-without-goal', rule, {
  valid: [
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function startServer(jar: string) {
          return spawn('java', ['-Xmx2g', '-jar', jar]);
        }
      `,
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        function runOnce(jar: string) {
          return spawn('java', ['-Xmx2g', '-jar', jar]);
        }
        export function main(jar: string) {
          return runOnce(jar);
        }
      `,
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function runAll(items: string[], userArgs: string[]) {
          for (const item of items) {
            spawn('java', [...userArgs, item]);
          }
        }
      `,
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function runAll(items: string[]) {
          for (const item of items) {
            spawn('java', ['-Xmx2g', '-XX:GCTimeRatio=4', '-jar', item]);
          }
        }
      `,
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { execFile } from 'node:child_process';
        export function runAll(items: string[]) {
          return Promise.all(
            items.map((item) => execFile('java', ['-Xmx2g', '-XX:+UseZGC', '-XX:SoftMaxHeapSize=512m', '-jar', item])),
          );
        }
      `,
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawnSync } from 'node:child_process';
        export function runAll(items: string[]) {
          for (const item of items) {
            spawnSync('java', ['-XX:MaxRAMPercentage=50', '-XX:MaxHeapFreeRatio=30', '-jar', item]);
          }
        }
      `,
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function runAll(items: string[]) {
          for (const item of items) {
            spawn('java', ['-Xmx2g', '-jar', item], {
              env: { ...process.env, JDK_JAVA_OPTIONS: '-XX:GCTimeRatio=4' },
            });
          }
        }
      `,
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function runAll(items: string[]) {
          for (const item of items) {
            spawn('java', ['-jar', item], {
              env: { ...process.env, JAVA_TOOL_OPTIONS: '-Xmx1g -XX:GCTimeRatio=4' },
            });
          }
        }
      `,
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function runAll(items: string[]) {
          for (const item of items) {
            spawn('python', ['-Xmx2g', item]);
          }
        }
      `,
    },
    {
      filename: 'src/runner.test.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function runAll(items: string[]) {
          for (const item of items) {
            spawn('java', ['-Xmx2g', '-jar', item]);
          }
        }
      `,
    },
  ],
  invalid: [
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function runAll(items: string[]) {
          for (const item of items) {
            spawn('java', ['-Xmx2g', '-jar', item]);
          }
        }
      `,
      errors: [MISSING_GOAL],
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawnSync } from 'node:child_process';
        export function runAll(items: string[]) {
          for (let i = 0; i < items.length; i++) {
            spawnSync('/usr/bin/java', ['-XX:MaxRAMPercentage=50', '-jar', items[i]]);
          }
        }
      `,
      errors: [MISSING_GOAL],
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { execFile } from 'node:child_process';
        export function runAll(javaBin: string, items: string[]) {
          return Promise.all(
            items.map((item) => execFile(javaBin, ['-Xmx512m', '-jar', item])),
          );
        }
      `,
      errors: [MISSING_GOAL],
    },
    {
      filename: 'src/runner.mts',
      code: `
        import path from 'node:path';
        import { execFileSync } from 'node:child_process';
        export function runAll(javaHome: string, items: string[], mb: number) {
          items.forEach((item) => {
            execFileSync(path.join(javaHome, 'bin', 'java'), [\`-Xmx\${mb}m\`, '-jar', item]);
          });
        }
      `,
      errors: [MISSING_GOAL],
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { execa } from 'execa';
        declare function runPool<T>(items: T[], fn: (item: T) => unknown): Promise<void>;
        export function runAll(items: string[]) {
          return runPool(items, (item) => execa('java', ['-Xmx1g', '-jar', item]));
        }
      `,
      errors: [MISSING_GOAL],
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function runQueue(queue: string[]) {
          while (queue.length > 0) {
            const next = queue.pop();
            spawn('java', ['-jar', String(next)], {
              env: { ...process.env, JDK_JAVA_OPTIONS: '-Xmx2g' },
            });
          }
        }
      `,
      errors: [MISSING_GOAL],
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        export function runRecord(jars: Record<string, string>) {
          for (const key in jars) {
            spawn('java', ['-jar', jars[key]], {
              env: { ...process.env, JAVA_TOOL_OPTIONS: '-XX:MaxRAMPercentage=40' },
            });
          }
        }
      `,
      errors: [MISSING_GOAL],
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        function runWorker(file: string) {
          return spawn('java', ['-Xmx2g', '-jar', 'tool.jar', file]);
        }
        export function runAll(files: string[]) {
          for (const file of files) {
            runWorker(file);
          }
        }
      `,
      errors: [MISSING_GOAL],
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { execFile } from 'node:child_process';
        function runWorker(file: string) {
          return execFile('java', ['-Xmx2g', '-jar', 'tool.jar', file]);
        }
        export function runAll(files: string[]) {
          return Promise.all(files.map(runWorker));
        }
      `,
      errors: [MISSING_GOAL],
    },
    {
      filename: 'src/runner.mts',
      code: `
        import { spawn } from 'node:child_process';
        export class Runner {
          private runOne(file: string) {
            return spawn('java', ['-Xmx2g', '-jar', 'tool.jar', file]);
          }
          runAll(files: string[]) {
            for (const file of files) {
              this.runOne(file);
            }
          }
        }
      `,
      errors: [MISSING_GOAL],
    },
  ],
});

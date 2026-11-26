import { typedTsProject } from '../../test-support/projects/typed-ts-project.mts';
import { rule } from './no-early-wait-on-started-work.mts';

const { tester, write } = typedTsProject('nitpicker-early-wait-');
const PRELUDE = `declare function startReport(files: string[]): Promise<string>;
declare function startServer(): Promise<string>;
declare function spawnChild(): Promise<{ code: number }>;
declare function listNames(report?: string): Promise<string[]>;
declare function measureAll(files: string[]): number;
declare function merge(...parts: unknown[]): string;
declare function compute(files: string[]): string;
declare function cleanup(): void;
declare function flushLogs(): Promise<void>;
declare function removeListeners(): void;
declare function report(code: unknown): void;
declare function index(rows: unknown): void;
declare function write(rows: unknown): void;
declare function send(rows: unknown): void;
declare function loadRows(): string[];
declare function run(resolve: (value: string) => void): void;
declare const logger: { info(message: string): void };
declare const query: { select(): { from(table: string): PromiseLike<string[]> } };
`;

const START = 'const reportJob = startReport(files);';
const LATER = 'const names = await listNames(); const sizes = measureAll(files);';

function inMethod(body: string) {
  const code = `${PRELUDE}export class Collector { job?: Promise<string>; other = 1; files: string[] = [];
  reset() { this.job = undefined; }
  async collect(files: string[]) { ${body} } }`;
  return { filename: write(code, 'ts'), code };
}

const MEMBER_START = 'this.job = startReport(files);';

function inFunction(body: string) {
  const code = `${PRELUDE}export async function collect(files: string[]) { ${body} }`;
  return { filename: write(code, 'ts'), code };
}

tester.run('no-early-wait-on-started-work', rule, {
  valid: [
    inFunction(`${START} const report = await reportJob; return merge(report, files);`),
    inFunction(
      `${START} const report = await reportJob; const names = await listNames(report); const sizes = measureAll(files); return merge(report, names, sizes);`,
    ),
    inFunction(`${START} const report = await reportJob; ${LATER}`),
    inFunction(
      `const report = await startReport(files); ${LATER} return merge(report, names, sizes);`,
    ),
    inFunction(
      `${START} const report = await reportJob; const a = 1; const b = 2; return merge(report, a, b);`,
    ),
    inFunction(
      `${START} const report = await reportJob; if (!files) return; ${LATER} return merge(report, names, sizes);`,
    ),
    inFunction(
      `${START} try { const report = await reportJob; ${LATER} return merge(report, names, sizes); } finally { cleanup(); }`,
    ),
    inFunction(
      `const ready = startServer(); const server = await ready; ${LATER} return merge(server, names, sizes);`,
    ),
    inFunction(
      `${START} const report = await reportJob; const names = await listNames(); reportJob.cancel(); return merge(report, names);`,
    ),
    inFunction(
      `let reportJob = startReport(files); const report = await reportJob; ${LATER} return merge(report, names, sizes);`,
    ),
    inFunction(
      `const childExited = spawnChild(); const code = await childExited; flushLogs(); removeListeners(); report(code);`,
    ),
    inFunction(
      'const q = query.select().from("t"); const rows = await q; const names = await listNames(); const sizes = measureAll(files); return merge(rows, names, sizes);',
    ),
    inFunction(
      'const n = compute(files); const r = await n; const names = await listNames(); const sizes = measureAll(files); return merge(r, names, sizes);',
    ),
    inFunction(
      `${START} const report = await reportJob; logger.info("x"); console.log("y"); const m = Math.max(1, 2); return merge(report, m);`,
    ),
    inMethod(`${MEMBER_START} const report = await this.job; return merge(report, files);`),
    inMethod(
      `${MEMBER_START} const report = await this.job; this.reset(); ${LATER} return merge(report, names, sizes);`,
    ),
    inMethod(
      `${MEMBER_START} const report = await this.job; this.job = startReport(files); ${LATER} return merge(report, names, sizes);`,
    ),
    inMethod(
      `${MEMBER_START} const report = await this.job; this.other = 2; ${LATER} return merge(report, names, sizes);`,
    ),
    inMethod(
      `${MEMBER_START} const report = await this.job; send(this); ${LATER} return merge(report, names, sizes);`,
    ),
    inMethod(`const report = await this.job; ${LATER} return merge(report, names, sizes);`),
    inMethod(
      `this.job = Promise.resolve(compute(files)); this.reset(); const report = await this.job; ${LATER} return merge(report, names, sizes);`,
    ),
    inMethod(
      `this.other = 3; const report = await this.other; ${LATER} return merge(report, names, sizes);`,
    ),
  ],
  invalid: [
    {
      ...inMethod(
        `${MEMBER_START} const report = await this.job; const names = await listNames(this.files[0]); const sizes = measureAll(this.files); return merge(report, names, sizes);`,
      ),
      errors: [
        {
          messageId: 'early',
          data: { task: 'this.job', next: 'const names = await listNames(this.files[0]);' },
        },
      ],
    },
    {
      ...inFunction(
        `const jobs: { report?: Promise<string> } = {}; jobs.report = startReport(files); const report = await jobs.report; ${LATER} return merge(report, names, sizes);`,
      ),
      errors: [
        {
          messageId: 'early',
          data: { task: 'jobs.report', next: 'const names = await listNames();' },
        },
      ],
    },
    {
      ...inFunction(
        `${START} const report = await reportJob; ${LATER} return merge(report, names, sizes);`,
      ),
      errors: [
        {
          messageId: 'early',
          data: { task: 'reportJob', next: 'const names = await listNames();' },
        },
      ],
    },
    {
      ...inFunction(
        `const pending = new Promise<string>(run); const rows = loadRows(); const result = await pending; index(rows); write(rows); send(result);`,
      ),
      errors: [{ messageId: 'early' }],
    },
  ],
});

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { typedTsProject } from '../../../test-support/projects/typed-ts-project.mts';
import { rule } from '../no-presence-truthiness.mts';

const ASSIGNED =
  '`""`, `0` or `false` is assigned or passed for it elsewhere in the project or its tests';

const { tester, write } = typedTsProject('nitpicker-presence-project-', {
  prepare(directory) {
    writeFileSync(
      path.join(directory, 'src/options.ts'),
      'export type Options = { label?: string; mode?: string; quiet?: boolean };',
    );
    writeFileSync(
      path.join(directory, 'src/callers.ts'),
      'import type { Options } from "./options";\nexport const cleared: Options = { label: "" };\nexport function run(options: Options) { return options; }\n',
    );
    writeFileSync(
      path.join(directory, 'src/options.test.ts'),
      'import { run } from "./callers";\nrun({ quiet: false });\n',
    );
  },
});
const HEADER = 'import type { Options } from "./options";\n';

type Reported = { messageId: string; data: Record<string, string> };

function script(code: string) {
  return { filename: write(code, 'js'), code };
}

function project(body: string) {
  const code = `${HEADER}${body}`;
  return { filename: write(code, 'ts'), code };
}

function reported(test: { filename: string; code: string }, errors: Reported[]) {
  return { ...test, errors };
}

tester.run('no-presence-truthiness across files', rule, {
  valid: [
    script(
      '/** @param {string | undefined} title */\nexport function f(title) { return title ? title.trim() : "none"; }\n',
    ),
    project('export function f(o: Options, out: string[]) { if (o.mode) { out.push(o.mode); } }'),
    project(
      'export function f(req: { query?: string }, out: string[]) { const query = req.query; if (query) { out.push(query); } }',
    ),
  ],
  invalid: [
    reported(
      script(
        '/** @param {string | undefined} title */\nexport function f(title) { return title ? title.trim() : "none"; }\nf("");\n',
      ),
      [{ messageId: 'presence', data: { value: 'title', evidence: ASSIGNED } }],
    ),
    reported(
      project(
        'export function f(o: Options, out: string[]) { if (o.label) { out.push(o.label); } }',
      ),
      [{ messageId: 'presence', data: { value: 'o.label', evidence: ASSIGNED } }],
    ),
    reported(
      project(
        'export function f(o: Options, out: boolean[]) { if (o.quiet) { out.push(o.quiet); } }',
      ),
      [{ messageId: 'presence', data: { value: 'o.quiet', evidence: ASSIGNED } }],
    ),
  ],
});

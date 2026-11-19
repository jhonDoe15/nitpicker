import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeFiles, findingsIn } from '../../test-support/project.mts';

const UNSET = {
  'src/unset/run.js': `export function run(task, { retries = 1, verbose = false, label } = {}) {
  return [task, retries, verbose, label];
}
export const start = ({ port, host = 'localhost' }) => [port, host];
function hidden({ secret }) { return secret; }
export const reveal = () => hidden({});
`,
  'src/unset/use.js': `import { run, start } from './run.js';
run('a', { retries: 2, label: 'x' });
run('b');
start({ port: 1 });
`,
};

const ARGUMENTS = {
  'src/arguments/api.js': `export function opaque({ a, b }) { return [a, b]; }
export function spreads({ a, b }) { return [a, b]; }
export function literal({ a, b }) { return [a, b]; }
export function renamed({ a: first, b: second = 2 }) { return [first, second]; }
export function rest({ a, ...others }) { return [a, others]; }
export function plain(options) { return options; }
`,
  'src/arguments/use.js': `import { opaque, spreads, literal, renamed, rest, plain } from './api.js';
const shared = { a: 1 };
opaque(shared);
spreads({ ...shared, b: 1 });
literal({ a: 1 });
renamed({ a: 1 });
rest({ a: 1 });
plain({ a: 1 });
`,
};

const CALLERS = {
  'src/callers/api.js': `export function used({ a, b }) { return [a, b]; }
export function unused({ never }) { return never; }
export function asValue({ a, b }) { return [a, b]; }
`,
  'src/callers/use.js': `import { used, asValue } from './api.js';
used({ a: 1 });
[{ a: 1 }].map(asValue);
`,
};

let findings: ReturnType<typeof analyzeFiles>;

beforeAll(() => {
  findings = analyzeFiles(
    { ...UNSET, ...ARGUMENTS, ...CALLERS },
    { policy: { preset: 'javascript' } },
  );
});

describe('unused function options in JavaScript', () => {
  it('reports destructured options of an exported function that no call sets', () => {
    expect(findingsIn(findings, 'src/unset')).toEqual([
      'unused-option src/unset/run.js run.verbose',
      'unused-option src/unset/run.js start.host',
    ]);
  });

  it('treats a non-literal argument or a spread as setting everything and reads renamed keys', () => {
    expect(findingsIn(findings, 'src/arguments')).toEqual([
      'unused-option src/arguments/api.js literal.b',
      'unused-option src/arguments/api.js renamed.b',
    ]);
  });

  it('leaves a function used as a value and a function nothing calls alone', () => {
    expect(findingsIn(findings, 'src/callers')).toEqual([
      'unused-option src/callers/api.js used.b',
    ]);
  });

  it('does not read JavaScript files in a TypeScript project', () => {
    const typescriptProject = analyzeFiles({ ...UNSET });

    expect(findingsIn(typescriptProject, 'src/unset')).toEqual([]);
  });
});

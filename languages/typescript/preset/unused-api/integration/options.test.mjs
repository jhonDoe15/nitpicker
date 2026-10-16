import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeFiles, findingsIn } from '../test-support/project.mjs';

const UNSET = {
  'src/unset/run.ts': `export type RunOptions = { retries?: number; verbose?: boolean; label?: string };
export function run(task: string, options: RunOptions = {}) { return [task, options.retries]; }
export const start = (config: { port?: number; host?: string }) => config.port;
function hidden(options: { secret?: number }) { return options.secret; }
export const reveal = () => hidden({});
`,
  'src/unset/use.ts': `import { run, start } from './run';
run('a', { retries: 2, label: 'x' });
run('b');
start({ port: 1 });
`,
};

const ARGUMENTS = {
  'src/arguments/api.ts': `export function opaque(options: { a?: number; b?: number }) { return options.a; }
export function spreads(options: { a?: number; b?: number }) { return options.a; }
export function literal(options: { a?: number; b?: number }) { return options.a; }
`,
  'src/arguments/use.ts': `import { opaque, spreads, literal } from './api';
const shared = { a: 1 };
opaque(shared);
spreads({ ...shared, b: 1 });
literal({ a: 1 });
`,
};

const REFERENCES = {
  'src/references/api.ts': `export function viaBarrel(options: { a?: number; b?: number }) { return options.a; }
export function viaNamespace(options: { a?: number; b?: number }) { return options.a; }
export function asValue(options: { a?: number; b?: number }) { return options.a; }
export function bound(options: { a?: number; b?: number }) { return options.a; }
`,
  'src/references/index.ts': "export * from './api';\n",
  'src/references/use.ts': `import { viaBarrel, asValue, bound } from './index';
import * as api from './index';
viaBarrel({ a: 1 });
api.viaNamespace({ a: 1 });
[{ a: 1 }].map(asValue);
bound.call(undefined, { a: 1 });
`,
};

const PARAMETERS = {
  'src/parameters/api.ts': `export type User = { name: string; nickname?: string };
export type FormatOptions = { upper?: boolean; trim?: boolean };
export function greet(user: User) { return user.name; }
export function format(text: string, shape: FormatOptions) { return [text, shape.upper]; }
export function destructured({ left, right }: { left?: number; right?: number }) { return left; }
`,
  'src/parameters/use.ts': `import { greet, format, destructured } from './api';
greet({ name: 'a' });
format('t', { upper: true });
destructured({ left: 1 });
`,
};

const LIBRARY = {
  'src/library/api.ts': `import type { HTMLAttributes } from 'react';
export type RequestOptions = HTMLAttributes<HTMLElement> & { retries?: number; delay?: number };
export function request(url: string, options: RequestOptions) { return [url, options.retries]; }
export function unused(options: { never?: number }) { return options.never; }
`,
  'src/library/use.ts': `import { request } from './api';
request('/x', { id: 'a', retries: 1 });
`,
};

const SHARED = {
  'src/shared/geometry.ts': `type Rect = { width: number; height: number; label?: string };
export function area({ width, height }: Rect) { return width * height; }
export const describe = (rect: Rect) => rect.label;
type PluginOptions = { minify?: boolean; sourcemap?: boolean };
export function plugin(options: PluginOptions) { return options; }
export function legacyPlugin(options: PluginOptions) { return options; }
`,
  'src/shared/use.ts': `import { area, plugin, legacyPlugin } from './geometry';
area({ width: 1, height: 2 });
plugin({ minify: true });
legacyPlugin({ minify: true });
`,
};

let findings;

beforeAll(() => {
  findings = analyzeFiles({
    ...UNSET,
    ...ARGUMENTS,
    ...REFERENCES,
    ...PARAMETERS,
    ...LIBRARY,
    ...SHARED,
  });
});

describe('unused function options', () => {
  it('reports options of an exported function that no call sets', () => {
    expect(findingsIn(findings, 'src/unset')).toEqual([
      'unused-option src/unset/run.ts run.verbose',
      'unused-option src/unset/run.ts start.host',
    ]);
  });

  it('treats a non-literal argument or a spread as setting everything', () => {
    expect(findingsIn(findings, 'src/arguments')).toEqual([
      'unused-option src/arguments/api.ts literal.b',
    ]);
  });

  it('follows barrels and namespaces and leaves a function used as a value alone', () => {
    expect(findingsIn(findings, 'src/references')).toEqual([
      'unused-option src/references/api.ts viaBarrel.b',
      'unused-option src/references/api.ts viaNamespace.b',
    ]);
  });

  it('checks only parameters that look like an options object', () => {
    expect(findingsIn(findings, 'src/parameters')).toEqual([
      'unused-option src/parameters/api.ts destructured.right',
      'unused-option src/parameters/api.ts format.trim',
    ]);
  });

  it('leaves out library members and functions nothing calls', () => {
    expect(findingsIn(findings, 'src/library')).toEqual([
      'unused-option src/library/api.ts request.delay',
    ]);
  });

  it('does not judge a domain type that several functions share', () => {
    expect(findingsIn(findings, 'src/shared')).toEqual([]);
  });
});

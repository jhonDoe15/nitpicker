import { beforeAll, describe, expect, it } from 'vitest';
import {
  analyzeFiles,
  analyzeProject,
  createProject,
  findingsIn,
  removeProject,
  summarize,
} from '../test-support/project.mts';

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

let findings: ReturnType<typeof analyzeFiles>;

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

describe('an option declared by several members of a union', () => {
  const UNION = {
    'src/api.ts': `type Named = { kind: 'named'; name: string;
  label?: string };
type Plain = { kind: 'plain';
  label?: string };
export function show(options: Plain | Named) { return options.kind; }
type Wide = { kind: 'wide'; width: number;
  label?: string };
type Bare = { kind: 'bare';
  label?: string };
export function showSwapped(options: Wide | Bare) { return options.kind; }
`,
    'src/app.ts': `import { show, showSwapped } from './api';
export const shown = [show({ kind: 'plain' }), showSwapped({ kind: 'bare' })];
`,
  };

  it('reports the first declaration in the file, whatever order the union names its members in', () => {
    const lines = analyzeFiles(UNION).map(({ symbol, location }) => [symbol, location?.line]);

    expect(lines).toEqual([
      ['show.label', 2],
      ['show.name', 1],
      ['showSwapped.label', 7],
      ['showSwapped.width', 6],
    ]);
  });
});

describe('a project whose config sets baseUrl', () => {
  const CONFIG = JSON.stringify({
    compilerOptions: { baseUrl: '.', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true },
    include: ['src'],
  });
  const FILES = {
    'src/api.ts': 'export function show(options: { a?: string; b?: string }) { return options; }\n',
    'src/app.ts': "import { show } from 'src/api';\nexport const shown = show({ a: '1' });\n",
  };

  it('resolves imports through baseUrl, which only the compiler in this process still does', () => {
    const root = createProject(FILES);
    try {
      expect(summarize(analyzeProject(root, {}, { configSource: CONFIG }))).toEqual([
        'unused-option src/api.ts show.b',
      ]);
    } finally {
      removeProject(root);
    }
  });
});

describe('sources the two compilers read differently', () => {
  const lines = (files: Readonly<Record<string, string>>) =>
    analyzeFiles(files).map(
      ({ symbol, location }) => `${String(symbol)}:${String(location?.line)}`,
    );

  it('names a #private field as the source writes it', () => {
    const files = {
      'src/api.ts':
        'export class Cls { #p = 1; pub?: number; other?: number }\n' +
        'export function f(options: Cls) { return options; }\n',
      'src/app.ts':
        "import { Cls, f } from './api';\nexport const direct = f({ pub: 1 } as Cls);\n",
    };

    expect(lines(files)).toEqual(['f.#p:1', 'f.other:1']);
  });

  it('does not count a type named in a documentation comment of a JavaScript file as a use', () => {
    const files = {
      'src/a.ts':
        'export interface FooOptions { a?: number; b?: number }\n' +
        'export function f(options: FooOptions) { return options; }\n',
      'src/b.js':
        "/** @import {FooOptions} from './a' */\n/** @param {FooOptions} x */\n" +
        'export function g(x) { return x; }\n',
      'src/app.ts': "import { f } from './a';\nexport const used = f({ a: 1 });\n",
    };

    expect(lines(files)).toEqual(['f.b:1']);
  });
});

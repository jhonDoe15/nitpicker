import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveLayoutFor } from '../../layout.mjs';
import { codeFilesUnder } from '../program.mjs';
import { createProject, removeProject } from '../test-support/project.mjs';
import { loadPackages } from '../workspace/packages.mjs';
import { reexportedTestOnlyEntries } from './reexported-exports.mjs';

const APP = { name: 'app', private: true };
let root;

const walked = [];

function walk(directories, layout) {
  walked.push(...directories);
  return codeFilesUnder(directories, layout);
}

function report(listed) {
  const byFile = Map.groupBy(listed, ([file]) => file);
  return {
    issues: [...byFile].map(([file, items]) => ({
      file,
      exports: items.map(([, name]) => ({ name })),
    })),
  };
}

function reexportedItems({
  files,
  listed,
  unused = [],
  project = '.',
  sourceRoots = ['src'],
  entryPoints = [],
  entryPatterns = ['src/main.ts'],
  links = {},
}) {
  root = createProject(files, { manifest: files['package.json'] ?? APP });
  for (const [link, target] of Object.entries(links)) {
    symlinkSync(`${root}/${target}`, `${root}/${link}`);
  }
  const layout = { ...resolveLayoutFor({ layout: { sourceRoots } }), entryPoints };
  const projectRoot = project === '.' ? root : `${root}/${project}`;
  return reexportedTestOnlyEntries({
    production: report(unused),
    entryExportsRun: () => report(listed),
    packagesInfo: loadPackages(projectRoot, layout),
    layout,
    projectRoot,
    entryPatterns,
    walk,
  });
}

function reexported(options) {
  return reexportedItems(options)
    .map(({ file, entry, reexportedBy }) => `${file} ${entry.name} via ${reexportedBy}`)
    .toSorted();
}

beforeEach(() => {
  walked.length = 0;
});

afterEach(() => {
  removeProject(root);
});

describe('exports kept alive by a re-export from an entry', () => {
  it('reports the declaration behind each re-export form, whatever the barrels between', () => {
    const files = {
      'src/main.ts': `import { renamed as third } from './one';
export { second as final } from './one';
export { third as thirdFinal };
export * from './stars';
`,
      'src/one.ts': `import { inner as renamed } from './two';
export { inner as second } from './two';
export { renamed };
`,
      'src/two.ts': "export { inner } from './impl';\n",
      'src/impl.ts': 'export function inner() { return 1; }\n',
      'src/stars.ts': 'export function starred() { return 2; }\n',
      'src/all.test.ts': `import { inner } from './impl';
import { starred } from './stars';
export const check = [inner, starred];
`,
    };
    const listed = [
      ['src/stars.ts', 'starred'],
      ['src/one.ts', 'second'],
      ['src/main.ts', 'final'],
      ['src/main.ts', 'thirdFinal'],
    ];

    expect(reexported({ files, listed })).toEqual([
      'src/impl.ts inner via src/main.ts',
      'src/stars.ts starred via src/main.ts',
    ]);
  });

  it('leaves out a re-export whose own export knip does not list, because a host consumes it', () => {
    const files = {
      'package.json': { name: 'app', private: true, dependencies: { next: '15.0.0' } },
      'src/app/api/widgets/route.ts': "export { GET } from '../../../handlers';\n",
      'src/main.ts': "export { metadata } from './meta';\n",
      'src/handlers.ts': 'export function GET() { return 1; }\n',
      'src/meta.ts': 'export const metadata = {};\n',
      'src/all.test.ts': `import { GET } from './handlers';
import { metadata } from './meta';
export const check = [GET, metadata];
`,
    };
    const listed = [
      ['src/handlers.ts', 'GET'],
      ['src/meta.ts', 'metadata'],
      ['src/main.ts', 'metadata'],
    ];
    const entryPatterns = ['src/main.ts', 'src/app/api/widgets/route.ts'];

    expect(reexported({ files, listed, entryPatterns })).toEqual([
      'src/meta.ts metadata via src/main.ts',
    ]);
  });

  it('leaves out an import that scripts or configs outside the source roots use, but not a story', () => {
    const files = {
      'src/main.ts': `import { fromScript, fromConfig, fromNobody } from './shared';
export { fromScript, fromConfig, fromNobody };
`,
      'src/shared.ts': `export const fromScript = 1;
export const fromConfig = 2;
export const fromNobody = 3;
`,
      'scripts/seed.ts': "import { fromScript } from '../src/shared';\nconsole.log(fromScript);\n",
      'vite.config.ts':
        "import { fromConfig } from './src/shared';\nexport default { fromConfig };\n",
      'src/shared.stories.ts':
        "import { fromNobody } from './shared';\nexport default fromNobody;\n",
      'src/shared.test.ts': `import { fromScript, fromConfig, fromNobody } from './shared';
export const check = [fromScript, fromConfig, fromNobody];
`,
    };
    const listed = [
      ['src/main.ts', 'fromScript'],
      ['src/main.ts', 'fromConfig'],
      ['src/main.ts', 'fromNobody'],
    ];

    expect(reexported({ files, listed })).toEqual(['src/shared.ts fromNobody via src/main.ts']);
  });

  it('gives an export that knip does not list the line of its declaration', () => {
    const files = {
      'src/main.ts': "import { weigh } from './feat';\nexport { weigh };\n",
      'src/feat/index.ts': "export { weigh } from './impl';\n",
      'src/feat/impl.ts': 'export const unit = 1;\nexport function weigh() { return unit; }\n',
      'src/feat/impl.test.ts': "import { weigh } from './impl';\nexport const check = weigh;\n",
    };
    const listed = [['src/main.ts', 'weigh']];

    expect(reexportedItems({ files, listed }).map(({ file, entry }) => [file, entry])).toEqual([
      ['src/feat/impl.ts', { name: 'weigh', line: 2 }],
    ]);
  });

  it('follows export * as like a namespace that is imported and exported', () => {
    const files = {
      'src/main.ts': "export * as shelf from './shelf';\n",
      'src/shelf.ts': 'export function stack() { return 1; }\n',
      'src/shelf.test.ts': "import { stack } from './shelf';\nexport const check = stack;\n",
    };

    expect(reexported({ files, listed: [['src/shelf.ts', 'stack']] })).toEqual([
      'src/shelf.ts stack via src/main.ts',
    ]);
  });

  it('counts a const that only aliases an import as a re-export, unless the file reads it', () => {
    const files = {
      'src/main.ts': "import { handle } from './api';\nexport const serve = handle;\n",
      'src/api.ts': 'export function handle() { return 1; }\n',
      'src/api.test.ts': "import { handle } from './api';\nexport const check = handle;\n",
    };
    const read = {
      ...files,
      'src/main.ts': `${files['src/main.ts']}console.log(serve());\n`,
    };

    expect(reexported({ files, listed: [['src/main.ts', 'serve']] })).toEqual([
      'src/api.ts handle via src/main.ts',
    ]);
    expect(reexported({ files: read, listed: [['src/main.ts', 'serve']] })).toEqual([]);
  });

  it('leaves out what a published package or a layout entry point puts in its public surface', () => {
    const files = {
      'package.json': {
        name: 'library',
        exports: { '.': './src/main.ts', './extra': './src/extra.ts' },
      },
      'src/main.ts': "export { shown } from './impl';\n",
      'src/extra.ts': "export { more } from './impl';\n",
      'src/loaded.ts': "export { loaded } from './impl';\n",
      'src/impl.ts': 'export const shown = 1;\nexport const more = 2;\nexport const loaded = 3;\n',
      'src/impl.test.ts': `import { shown, more, loaded } from './impl';
export const check = [shown, more, loaded];
`,
    };
    const listed = [
      ['src/impl.ts', 'shown'],
      ['src/impl.ts', 'more'],
      ['src/impl.ts', 'loaded'],
      ['src/main.ts', 'shown'],
      ['src/extra.ts', 'more'],
    ];
    const entryPoints = ['src/loaded.ts'];

    expect(reexported({ files, listed, unused: [['src/impl.ts', 'loaded']], entryPoints })).toEqual(
      [],
    );
  });

  it('counts a layout entry point of a private package as used from outside as well', () => {
    const files = {
      'src/main.ts': "export { handler } from './impl';\n",
      'src/impl.ts': 'export const handler = 1;\n',
      'src/impl.test.ts': "import { handler } from './impl';\nexport const check = handler;\n",
    };
    const listed = [
      ['src/impl.ts', 'handler'],
      ['src/main.ts', 'handler'],
    ];

    expect(reexported({ files, listed })).toEqual(['src/impl.ts handler via src/main.ts']);
    expect(reexported({ files, listed, entryPoints: ['src/main.ts'] })).toEqual([]);
  });

  it('leaves out a declaration in another package or outside the project', () => {
    const files = {
      'package.json': { name: 'repo', private: true, workspaces: ['packages/*'] },
      'packages/core/package.json': { name: '@scope/core', private: true },
      'packages/core/src/index.ts': 'export const core = 1;\n',
      'packages/app/package.json': { name: '@scope/app', private: true },
      'packages/app/src/main.ts': "export { core } from '../../core/src/index';\n",
      'packages/app/src/own.ts': "export { local } from './local';\n",
      'packages/app/src/local.ts': 'export const local = 2;\n',
      'packages/app/src/all.test.ts': `import { core } from '../../core/src/index';
import { local } from './local';
export const check = [core, local];
`,
    };
    const listed = [['src/main.ts', 'core']];

    expect(reexported({ files, listed, project: 'packages/app' })).toEqual([]);
  });

  it('reads the whole project only once an entry re-exports something', () => {
    const plain = {
      'src/main.ts': 'export const value = 1;\n',
      'src/other.ts': 'export const other = 2;\n',
      'src/other.test.ts': "import { other } from './other';\nexport const check = other;\n",
    };
    const reexporting = { ...plain, 'src/main.ts': "export { other } from './other';\n" };

    expect(reexported({ files: plain, listed: [] })).toEqual([]);
    expect(walked).toEqual([]);

    const listed = [
      ['src/other.ts', 'other'],
      ['src/main.ts', 'other'],
    ];

    expect(reexported({ files: reexporting, listed })).toEqual([
      'src/other.ts other via src/main.ts',
    ]);
    expect(walked).toEqual([root]);
  });
});

describe('an alias that the entry passes onward', () => {
  const api = {
    'src/api.ts': 'export function handle() { return 1; }\n',
    'src/api.test.ts': "import { handle } from './api';\nexport const check = handle;\n",
  };
  const forms = [
    ['as the default export', 'export default serve;', "import used from './main';", 'default'],
    [
      'under another name',
      'export { serve as run };',
      "import { run as used } from './main';",
      'run',
    ],
    [
      'as another alias',
      'export const wrapped = serve;',
      "import { wrapped as used } from './main';",
      'wrapped',
    ],
  ];

  function filesOf({ onward, reader }) {
    return {
      ...api,
      'src/main.ts': `import { handle } from './api';\nexport const serve = handle;\n${onward}\n`,
      ...(reader === undefined
        ? {}
        : { 'src/runner.ts': `${reader}\nexport const go = () => used();\n` }),
    };
  }

  it.each(forms)('follows production that imports the onward name (%s)', (...form) => {
    const [, onward, reader, name] = form;
    const listed = [
      ['src/main.ts', 'serve'],
      ['src/main.ts', name],
    ];

    expect(reexported({ files: filesOf({ onward, reader }), listed })).toEqual([]);
    expect(reexported({ files: filesOf({ onward }), listed })).toEqual([
      'src/api.ts handle via src/main.ts',
    ]);
  });
});

describe('a namespace that an entry exports with export * as', () => {
  const files = {
    'src/main.ts': "export * as api from './api';\n",
    'src/api.ts': 'export function handle() { return 1; }\nexport function other() { return 2; }\n',
    'src/api.test.ts': `import { handle, other } from './api';
export const check = [handle, other];
`,
  };
  const listed = [
    ['src/api.ts', 'handle'],
    ['src/api.ts', 'other'],
  ];
  const reader = (body) => ({
    ...files,
    'src/runner.ts': `import { api } from './main';\n${body}\n`,
  });

  it('counts production that uses it as a whole value as using every member', () => {
    const passed =
      'function use(value: object) { return value; }\nexport const run = () => use(api);';

    expect(
      reexported({ files: reader('export const run = () => Object.keys(api);'), listed }),
    ).toEqual([]);
    expect(reexported({ files: reader(passed), listed })).toEqual([]);
  });

  it('keeps member access per member', () => {
    expect(reexported({ files: reader('export const run = () => api.handle();'), listed })).toEqual(
      ['src/api.ts other via src/main.ts'],
    );
  });

  it('counts a whole value passed on through a barrel the entry re-exports from', () => {
    const viaBarrel = {
      ...files,
      'src/barrel.ts': "export * as api from './api';\n",
      'src/main.ts': "export { api } from './barrel';\n",
      'src/runner.ts': `import { api } from './barrel';
function use(value: object) { return value; }
export const run = () => use(api);
`,
    };

    expect(reexported({ files: viaBarrel, listed: [['src/main.ts', 'api'], ...listed] })).toEqual(
      [],
    );
  });
});

describe('the entries found near a glob', () => {
  const impl = {
    'src/impl.ts': 'export function impl() { return 1; }\n',
    'src/impl.test.ts': "import { impl } from './impl';\nexport const check = impl;\n",
  };
  const skipped = [
    ['a dot directory', '.hidden/*.ts', '.hidden/entry.ts', {}],
    ['a dist directory', 'dist/*.ts', 'dist/entry.ts', {}],
    ['a build directory', 'build/entry.ts', 'build/entry.ts', {}],
    ['a generated directory', 'generated/*.ts', 'generated/entry.ts', {}],
    ['a symlinked directory', 'linked/*.ts', 'linked/entry.ts', { linked: 'real' }],
  ];

  function found({ pattern, file, links }) {
    const [link, target] = Object.entries(links)[0] ?? [];
    const written = link === undefined ? file : file.replace(`${link}/`, `${target}/`);
    const toImpl = path.posix.relative(path.posix.dirname(written), 'src/impl');
    const files = { ...impl, [written]: `export { impl } from '${toImpl}';\n` };
    const listed = [
      [file, 'impl'],
      ['src/impl.ts', 'impl'],
    ];
    return reexported({ files, listed, entryPatterns: [pattern], links });
  }

  it.each(skipped)('leaves out a file in %s, as the walk of the whole project does', (...args) => {
    const [, pattern, file, links] = args;

    expect(found({ pattern, file, links })).toEqual([]);
  });

  it('finds the same files in a place the walk reaches', () => {
    expect(found({ pattern: 'src/entries/*.ts', file: 'src/entries/entry.ts', links: {} })).toEqual(
      ['src/impl.ts impl via src/entries/entry.ts'],
    );
  });
});

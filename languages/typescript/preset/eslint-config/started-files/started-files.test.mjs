import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { frameworkConventions } from '../scope-support.mjs';
import { filesStartedByBuildTool } from './build-tool-commands.mjs';
import { filesStartedByCommand } from './command-files.mjs';
import { filesStartedBySource } from './source-starts.mjs';
import { startedFiles } from './started-files.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-started-files-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe('filesStartedByCommand', () => {
  it('finds the file a runner starts', () => {
    expect(filesStartedByCommand('node scripts/check.mts --flag').entryPoints).toEqual([
      'scripts/check.mts',
    ]);
    expect(
      filesStartedByCommand('CI=1 npx tsx watch ./scripts/x.ts && echo done').entryPoints,
    ).toEqual(['scripts/x.ts']);
  });

  it('treats modules loaded by a runtime flag as entry points that may default-export', () => {
    const found = filesStartedByCommand(
      'node --test-reporter=./reporter.mjs --import ./setup.mjs --test dist',
    );

    expect(found.entryPoints).toEqual(['reporter.mjs', 'setup.mjs']);
    expect(found.defaultExports).toEqual(['reporter.mjs', 'setup.mjs']);
  });

  it('keeps a plain script out of the default-export list', () => {
    expect(filesStartedByCommand('node scripts/a.mjs').defaultExports).toEqual([]);
  });

  it('ignores commands that name no file or use variables and globs', () => {
    expect(filesStartedByCommand('vitest run && node --test').entryPoints).toEqual([]);
    expect(filesStartedByCommand('node $SCRIPT && node scripts/*.mjs').entryPoints).toEqual([]);
    expect(filesStartedByCommand('eslint src/index.mjs').entryPoints).toEqual([]);
  });
});

describe('filesStartedByCommand in shell forms', () => {
  it('skips option values, echo and comments', () => {
    expect(
      filesStartedByCommand('node --max-old-space-size 4096 scripts/a.mjs').entryPoints,
    ).toEqual(['scripts/a.mjs']);
    expect(filesStartedByCommand('echo node scripts/a.mjs').entryPoints).toEqual([]);
    expect(filesStartedByCommand('# node scripts/a.mjs').entryPoints).toEqual([]);
  });

  it('follows cd, wrappers and relative segments', () => {
    expect(filesStartedByCommand('cd scripts && node a.mjs').entryPoints).toEqual([
      'scripts/a.mjs',
    ]);
    expect(filesStartedByCommand('sh -c "node a.mjs"', 'x').entryPoints).toEqual(['x/a.mjs']);
    expect(filesStartedByCommand('concurrently "node a.mjs" "tsx b.ts"').entryPoints).toEqual([
      'a.mjs',
      'b.ts',
    ]);
    expect(filesStartedByCommand('node ./lib/rel/../v.mjs').entryPoints).toEqual(['lib/v.mjs']);
  });
});

describe('filesStartedBySource', () => {
  it('detects a shebang and a main-module guard', () => {
    expect(filesStartedBySource('bin/a.mjs', '#!/usr/bin/env node\nrun();')).toEqual(['bin/a.mjs']);
    expect(filesStartedBySource('a.mjs', 'if (import.meta.main) run();')).toEqual(['a.mjs']);
    expect(
      filesStartedBySource(
        'a.mjs',
        'if (process.argv[1] === fileURLToPath(import.meta.url)) run();',
      ),
    ).toEqual(['a.mjs']);
  });

  it('detects literal paths passed to Worker, fork and spawn of the node binary', () => {
    const text = [
      "new Worker(new URL('./worker.mjs', import.meta.url));",
      "fork(fileURLToPath(new URL('./runner.mjs', import.meta.url)));",
      "spawn(process.execPath, [path.join(import.meta.dirname, 'child.mjs')]);",
    ].join('\n');

    expect(filesStartedBySource('src/main.mjs', text)).toEqual([
      'src/worker.mjs',
      'src/worker.mts',
      'src/runner.mjs',
      'src/runner.mts',
      'src/child.mjs',
      'src/child.mts',
    ]);
  });

  it('resolves a module-relative URL against the file only', () => {
    const text = "new Worker(new URL('./w.mjs', import.meta.url));";

    expect(filesStartedBySource('a/b.mjs', text)).toEqual(['a/w.mjs', 'a/w.mts']);
  });

  it('follows a variable that is passed to the call, and ignores unrelated literals', () => {
    const bound = "const W = fileURLToPath(new URL('./w.mjs', import.meta.url));\nfork(W);";
    const unrelated = "const U = new URL('./other.mjs', import.meta.url);\nfork(process.argv[2]);";

    expect(filesStartedBySource('a/b.mjs', bound)).toEqual(['a/w.mjs', 'a/w.mts']);
    expect(filesStartedBySource('a/b.mjs', unrelated)).toEqual([]);
  });

  it('ignores a guard or a launch inside a comment or a string', () => {
    const text = "// import.meta.main\nconst s = 'import.meta.main';\n/* fork('./x.mjs') */";

    expect(filesStartedBySource('a.mjs', text)).toEqual([]);
  });

  it('ignores a spawned binary that is not node and a file that only mentions a guard', () => {
    expect(filesStartedBySource('a.mjs', "spawn('git', ['./hook.mjs']);")).toEqual([]);
    expect(filesStartedBySource('a.mjs', 'const x = 1;')).toEqual([]);
  });
});

describe('filesStartedByBuildTool', () => {
  it('finds node tasks in Gradle and Maven files', () => {
    expect(filesStartedByBuildTool("commandLine 'node', 'tools/gen.mjs'")).toEqual([
      'tools/gen.mjs',
    ]);
    expect(filesStartedByBuildTool('commandLine("node", "tools/gen.mjs")')).toEqual([
      'tools/gen.mjs',
    ]);
    expect(
      filesStartedByBuildTool(
        '<executable>node</executable><arguments><argument>tools/gen.mjs</argument>',
      ),
    ).toEqual(['tools/gen.mjs']);
  });
});

describe('startedFiles', () => {
  it('collects entries from scripts, workflows, source and build files that are tracked', () => {
    const root = projectWith({
      'package.json': JSON.stringify({
        scripts: { check: 'node scripts/check.mts', gone: 'node scripts/missing.mjs' },
      }),
      '.github/workflows/ci.yml':
        'jobs:\n  a:\n    steps:\n      - run: node --import ./ci/setup.mjs ci/run.mjs\n',
      'build.gradle': "task gen(type: Exec) { commandLine 'node', 'tools/gen.mjs' }",
      'scripts/check.mts': 'export {};',
      'ci/setup.mjs': 'export default {};',
      'ci/run.mjs': 'export {};',
      'tools/gen.mjs': 'export {};',
      'src/main.mjs': "new Worker(new URL('./worker.mjs', import.meta.url));",
      'src/worker.mjs': 'export {};',
      'bin/cli.mjs': '#!/usr/bin/env node\nrun();',
      'src/lib.mjs': 'export const x = 1;',
      'packages/app/package.json': JSON.stringify({ scripts: { start: 'node server.mjs' } }),
      'packages/app/server.mjs': 'export {};',
      'node_modules/dep/index.mjs': '#!/usr/bin/env node\n',
    });

    expect(startedFiles(root)).toEqual({
      entryPoints: [
        'bin/cli.mjs',
        'ci/run.mjs',
        'ci/setup.mjs',
        'packages/app/server.mjs',
        'scripts/check.mts',
        'src/worker.mjs',
        'tools/gen.mjs',
      ],
      defaultExports: ['ci/setup.mjs'],
    });
  });

  it('reaches the preset through the framework conventions', () => {
    const root = projectWith({
      'package.json': JSON.stringify({ scripts: { build: 'tsx scripts/build.ts' } }),
      'scripts/build.ts': 'export {};',
    });

    expect(frameworkConventions(root).entryPoints).toEqual(['scripts/build.ts']);
  });
});

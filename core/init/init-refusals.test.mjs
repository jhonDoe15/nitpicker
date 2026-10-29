import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { init, initWith, readText, useProjects } from './test-support/projects.mjs';

const createProject = useProjects();
const TYPESCRIPT = { 'package.json': '{}', 'src/index.ts': 'export const value = 1;\n' };

function project(files = TYPESCRIPT) {
  return createProject(files, { repository: true });
}

describe('nitpicker init stops before writing anything', () => {
  it('when the project is on TypeScript 7 and Node.js is older than 22.19', () => {
    const root = project({
      ...TYPESCRIPT,
      'package.json': '{"devDependencies":{"typescript":"^7.0.0"}}',
    });

    expect(initWith({ currentProjectRoot: root, nodeVersion: '22.18.1' })).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        'nitpicker failed: This project uses TypeScript 7 (^7.0.0 declared). nitpicker reads a TypeScript 7 project through its own TypeScript 6 API, which needs Node.js 22.19 or newer, and this is Node.js 22.18.1. Install Node.js 22.19 or newer, or use TypeScript 6 (typescript@^6), and run nitpicker init again.\n',
    });
    expect(existsSync(path.join(root, 'nitpicker.config.json'))).toBe(false);
  });

  it('when AGENTS.md is a folder', () => {
    const root = project();
    mkdirSync(path.join(root, 'AGENTS.md'));

    expect(init(root, '--agents-md')).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        'nitpicker failed: AGENTS.md is a folder, so nitpicker init cannot write it as a file. Rename or remove the folder, or make the change by hand.\n',
    });
    expect(existsSync(path.join(root, 'nitpicker.config.json'))).toBe(false);
  });

  it('when .github is a file', () => {
    const root = project({ ...TYPESCRIPT, '.github': 'notes\n' });

    expect(init(root, '--ci', 'github')).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        'nitpicker failed: .github is a file, so nitpicker init cannot create .github/workflows/nitpicker.yml inside it. Rename or remove .github, or make the change by hand.\n',
    });
    expect(existsSync(path.join(root, 'nitpicker.config.json'))).toBe(false);
  });

  it('when nitpicker.config.json is a folder', () => {
    const root = project();
    mkdirSync(path.join(root, 'nitpicker.config.json'));

    expect(init(root)).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText:
        'nitpicker failed: nitpicker.config.json is a folder, so nitpicker init cannot write it as a file. Rename or remove the folder, or make the change by hand.\n',
    });
  });
});

describe('nitpicker init run again', () => {
  const JAVA = { 'build.gradle': '', gradlew: '', 'src/main/java/App.java': 'class App {}\n' };
  const report = (configLine) =>
    [
      'nitpicker init: Java, Gradle (preset "java")',
      '',
      'Needs Java 21 or newer. nitpicker adds its own analysis tools to the build.',
      '',
      configLine,
      '',
      'Install the agent skill:',
      '  npx skills add jhonDoe15/nitpicker --skill nitpicker-java',
      '',
      'Then run `npx nitpicker` to check a change, or `npx nitpicker --all` to survey the whole project.',
      '',
    ].join('\n');

  it('offers neither the snippet nor the workflow once both are there', () => {
    const root = project(JAVA);
    init(root, '--agents-md', '--ci', 'github');

    expect(init(root)).toEqual({
      exitCode: 0,
      stdoutText: report('nitpicker.config.json is already set up'),
      stderrText: '',
    });
  });

  it("refuses a Yarn Plug'n'Play project, which nitpicker cannot read", () => {
    const root = project({ ...TYPESCRIPT, 'package.json': '{"packageManager":"yarn@4.5.0"}' });

    expect(init(root)).toEqual({
      exitCode: 2,
      stdoutText: '',
      stderrText: `nitpicker failed: This project uses Yarn Plug'n'Play, which nitpicker does not support: it reads the packages from node_modules. Add the line \`nodeLinker: node-modules\` to ${root}/.yarnrc.yml, run yarn install, and run nitpicker init again.\n`,
    });
    expect(existsSync(path.join(root, 'nitpicker.config.json'))).toBe(false);
  });

  it('writes a workflow that a rerun keeps, with no final newline in the copy', () => {
    const root = project(JAVA);
    init(root, '--ci', 'github');
    const workflow = '.github/workflows/nitpicker.yml';
    writeFileSync(path.join(root, workflow), readText(root, workflow).trimEnd());

    expect(init(root, '--ci', 'github').exitCode).toBe(0);
  });
});

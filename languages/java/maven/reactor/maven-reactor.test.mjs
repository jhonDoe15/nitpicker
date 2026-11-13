import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runMavenPreset } from '../maven-build.mjs';
import { readReactor } from '../maven-project.mjs';
import { mavenScope } from './maven-scope.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const MODULES = {
  '.': { packaging: 'pom', modules: ['core', 'app', 'web', 'tools'] },
  core: {},
  app: { depends: ['core'] },
  web: { depends: ['app'] },
  tools: {},
};

function project(name, { packaging = 'jar', modules = [], depends = [] }, root, directory) {
  const basedir = path.join(root, directory);
  const listed = modules.map((module) => `<module>${module}</module>`).join('');
  const dependencies = depends
    .map((id) => `<dependency><groupId>demo</groupId><artifactId>${id}</artifactId></dependency>`)
    .join('');
  return `<project><groupId>demo</groupId><artifactId>${name}</artifactId><packaging>${packaging}</packaging>
<modules>${listed}</modules><dependencies>${dependencies}</dependencies>
<build><directory>${basedir}/target</directory><sourceDirectory>${basedir}/src/main/java</sourceDirectory>
<testSourceDirectory>${basedir}/src/test/java</testSourceDirectory></build></project>`;
}

function reactorOn(disk) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-reactor-')));
  roots.push(root);
  mkdirSync(path.join(root, '.git'));
  const effective = [];
  for (const [directory, spec] of Object.entries(disk)) {
    const name = directory === '.' ? 'demo' : directory;
    mkdirSync(path.join(root, directory), { recursive: true });
    const pom = project(name, spec, root, directory);
    writeFileSync(path.join(root, directory, 'pom.xml'), pom);
    effective.push(pom);
  }
  return { root, effective: `<projects>${effective.join('')}</projects>` };
}

function scopeOf(changedFiles) {
  const { root, effective } = reactorOn(MODULES);
  const projectRoot = root;
  const modules = readReactor(root, effective);
  return mavenScope({ modules, projectRoot, changedFiles });
}

describe('the modules a Maven run reports', () => {
  it('are all of them, with no selection, when nothing narrows the run', () => {
    const scope = scopeOf(undefined);

    expect(scope.reported).toHaveLength(5);
    expect(scope.selection).toEqual([]);
    expect(scope.notAffected).toEqual([]);
  });

  it('are the changed module and its dependents, built with the modules they need', () => {
    const scope = scopeOf(['app/src/main/java/demo/App.java']);

    expect(scope.selection).toEqual(['-pl', 'app,web', '-am']);
    expect(scope.notAffected).toEqual(['core', 'tools']);
  });

  it('are every dependent of a shared module', () => {
    const scope = scopeOf(['core/pom.xml']);

    expect(scope.selection).toEqual(['-pl', 'core,app,web', '-am']);
    expect(scope.notAffected).toEqual(['tools']);
  });

  it('are all of them when a file of the root changed', () => {
    const scope = scopeOf(['pom.xml']);

    expect(scope.selection).toEqual([]);
    expect(scope.notAffected).toEqual([]);
  });
});

describe('the Maven build of the affected modules', () => {
  function buildCall(projectDirectory, policy) {
    const { root, effective } = reactorOn(MODULES);
    const calls = [];
    const spawn = (_command, args, options) => {
      const output = args.find((argument) => argument.startsWith('-Doutput='));
      if (output !== undefined) {
        writeFileSync(output.slice('-Doutput='.length), effective);
        return { status: 0, stdout: '', stderr: '' };
      }
      calls.push({ args, cwd: options.cwd });
      return { status: 1, stdout: '', stderr: '[ERROR] stop after the build goals' };
    };

    expect(() =>
      runMavenPreset(path.join(root, projectDirectory), { maven: 'mvn', spawn, policy }),
    ).toThrow('stop after the build goals');
    return { call: calls[0], root };
  }

  it('builds only the affected modules of a whole-reactor project', () => {
    const { call, root } = buildCall('.', { changedFiles: ['web/src/main/java/demo/Web.java'] });

    expect(call.cwd).toBe(root);
    expect(call.args).toContain('web');
    expect(call.args[call.args.indexOf('-pl') + 1]).toBe('web');
  });

  it('keeps the whole reactor when the change cannot be placed in a module', () => {
    const { call } = buildCall('.', { changedFiles: ['README.md'] });

    expect(call.args).not.toContain('-pl');
  });
});

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveToolSet } from './tool-cache.mjs';
import { TOOL_DEPENDENCIES, launcherDependencies, toolFiles, toolSetKey } from './tool-set.mjs';

const VERSIONS = {
  pmd: '7.7.0',
  spotbugs: '4.9.3',
  googleJavaFormat: '1.25.2',
  jacoco: '0.8.12',
  checkstyle: '10.21.1',
  pitest: '1.17.4',
  pitestJunit5: '1.2.1',
};

const roots = [];

function cacheRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-tool-cache-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('toolFiles', () => {
  const files = toolFiles(TOOL_DEPENDENCIES, VERSIONS);

  it('pins every tool to the version of the shared map', () => {
    expect(files.get('pmd/pom.xml')).toContain(
      '<artifactId>pmd-cli</artifactId><version>7.7.0</version>',
    );
    expect(files.get('pmd/pom.xml')).toContain(
      '<artifactId>pmd-java</artifactId><version>7.7.0</version>',
    );
    expect(files.get('spotbugs/pom.xml')).toContain('<version>4.9.3</version>');
    expect(files.get('format/pom.xml')).toContain('<version>1.25.2</version>');
    expect(files.get('checkstyle/pom.xml')).toContain('<version>10.21.1</version>');
    expect(files.get('pit/pom.xml')).toContain('<version>1.17.4</version>');
  });

  it('asks for the runnable JaCoCo command line and the agent jars', () => {
    expect(files.get('jacoco-cli/pom.xml')).toContain('<classifier>nodeps</classifier>');
    expect(files.get('jacoco-agent/pom.xml')).toContain('<classifier>runtime</classifier>');
  });

  it('keeps the JUnit Platform out of the PIT plugin, as the project brings its own', () => {
    expect(files.get('pit-junit5/pom.xml')).toContain(
      '<exclusion><groupId>org.junit.platform</groupId><artifactId>*</artifactId></exclusion>',
    );
  });

  it('unpacks the Checkstyle Google config and lists one module per tool', () => {
    expect(files.get('checkstyle/pom.xml')).toContain('google_checks.xml');
    expect(files.get('pom.xml')).toContain('<module>pmd</module>');
    expect(files.get('pom.xml')).toContain('${nitpicker.out}/classpaths/${project.artifactId}.txt');
  });

  it('changes its key with a tool version', () => {
    const other = toolFiles(TOOL_DEPENDENCIES, { ...VERSIONS, pmd: '7.8.0' });

    expect(toolSetKey(other)).not.toBe(toolSetKey(files));
    expect(toolSetKey(toolFiles(TOOL_DEPENDENCIES, VERSIONS))).toBe(toolSetKey(files));
  });

  it('resolves the JUnit launcher at the version of the project engine', () => {
    const launcher = toolFiles(launcherDependencies('1.13.4'), VERSIONS);

    expect(launcher.get('junit-launcher/pom.xml')).toContain(
      '<artifactId>junit-platform-launcher</artifactId><version>1.13.4</version>',
    );
  });
});

describe('resolveToolSet', () => {
  function fakeMaven(calls) {
    return (args) => {
      calls.push(args);
      const staging = args
        .find((arg) => arg.startsWith('-Dnitpicker.out='))
        .slice('-Dnitpicker.out='.length);
      mkdirSync(path.join(staging, 'classpaths'), { recursive: true });
      for (const name of Object.keys(TOOL_DEPENDENCIES)) {
        writeFileSync(path.join(staging, 'classpaths', `${name}.txt`), '/missing/tool.jar');
      }
    };
  }

  it('runs Maven once for the whole set and reuses a cached set whose jars still exist', () => {
    const jarsRoot = cacheRoot();
    const jar = path.join(jarsRoot, 'tool.jar');
    writeFileSync(jar, '');
    const calls = [];
    const runMaven = (args) => {
      calls.push(args);
      const staging = args
        .find((arg) => arg.startsWith('-Dnitpicker.out='))
        .slice('-Dnitpicker.out='.length);
      mkdirSync(path.join(staging, 'classpaths'), { recursive: true });
      for (const name of Object.keys(TOOL_DEPENDENCIES)) {
        writeFileSync(path.join(staging, 'classpaths', `${name}.txt`), jar);
      }
    };
    const root = cacheRoot();
    const options = {
      dependencies: TOOL_DEPENDENCIES,
      versions: VERSIONS,
      runMaven,
      cacheRoot: root,
    };

    const first = resolveToolSet(options);
    const second = resolveToolSet(options);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('validate');
    expect(first.classpath('pmd')).toEqual([jar]);
    expect(second.directory).toBe(first.directory);
    expect(existsSync(first.directory)).toBe(true);
  });

  it('resolves again when a cached jar has disappeared', () => {
    const calls = [];
    const root = cacheRoot();
    const options = {
      dependencies: TOOL_DEPENDENCIES,
      versions: VERSIONS,
      runMaven: fakeMaven(calls),
      cacheRoot: root,
    };

    resolveToolSet(options);
    resolveToolSet(options);

    expect(calls).toHaveLength(2);
  });

  it('rejects a tool that was not part of the set', () => {
    const jarsRoot = cacheRoot();
    const jar = path.join(jarsRoot, 'tool.jar');
    writeFileSync(jar, '');
    const set = resolveToolSet({
      dependencies: TOOL_DEPENDENCIES,
      versions: VERSIONS,
      cacheRoot: cacheRoot(),
      runMaven: (args) => {
        const staging = args
          .find((arg) => arg.startsWith('-Dnitpicker.out='))
          .slice('-Dnitpicker.out='.length);
        mkdirSync(path.join(staging, 'classpaths'), { recursive: true });
        for (const name of Object.keys(TOOL_DEPENDENCIES)) {
          writeFileSync(path.join(staging, 'classpaths', `${name}.txt`), jar);
        }
      },
    });

    expect(() => set.classpath('unknown')).toThrow('Tool unknown was not resolved');
  });

  it('does not keep a half-resolved set when Maven fails', () => {
    const root = cacheRoot();

    expect(() =>
      resolveToolSet({
        dependencies: TOOL_DEPENDENCIES,
        versions: VERSIONS,
        cacheRoot: root,
        runMaven: () => {
          throw new Error('Could not resolve');
        },
      }),
    ).toThrow('Could not resolve');
    expect(readdirSync(root)).toEqual([]);
  });
});

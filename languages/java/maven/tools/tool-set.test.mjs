import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { childrenNamed, descendantsNamed, parseXml } from '../../ingest/common.mjs';
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
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function field(element, name) {
  return childrenNamed(element, name)[0]?.text;
}

function coordinates(dependency) {
  return ['groupId', 'artifactId', 'version', 'classifier']
    .map((name) => field(dependency, name))
    .filter((value) => value !== undefined)
    .join(':');
}

function dependenciesOf(xml) {
  return descendantsNamed(parseXml(xml), 'dependency')
    .filter((dependency) => field(dependency, 'version') !== undefined)
    .map(coordinates);
}

function textsOf(xml, name) {
  return descendantsNamed(parseXml(xml), name).map((element) => element.text);
}

describe('toolFiles', () => {
  const files = toolFiles(TOOL_DEPENDENCIES, VERSIONS);

  it('pins every tool to the version of the shared map', () => {
    const pinned = Object.fromEntries(
      ['pmd', 'spotbugs', 'format', 'checkstyle', 'pit'].map((name) => [
        name,
        dependenciesOf(files.get(`${name}/pom.xml`)),
      ]),
    );

    expect(pinned).toEqual({
      pmd: ['net.sourceforge.pmd:pmd-cli:7.7.0', 'net.sourceforge.pmd:pmd-java:7.7.0'],
      spotbugs: ['com.github.spotbugs:spotbugs:4.9.3'],
      format: ['com.google.googlejavaformat:google-java-format:1.25.2'],
      checkstyle: ['com.puppycrawl.tools:checkstyle:10.21.1'],
      pit: ['org.pitest:pitest-command-line:1.17.4'],
    });
  });

  it('asks for the runnable JaCoCo command line and the agent jars', () => {
    expect([
      dependenciesOf(files.get('jacoco-cli/pom.xml')),
      dependenciesOf(files.get('jacoco-agent/pom.xml')),
    ]).toEqual([
      ['org.jacoco:org.jacoco.cli:0.8.12:nodeps'],
      ['org.jacoco:org.jacoco.agent:0.8.12:runtime'],
    ]);
  });

  it('keeps the JUnit Platform out of the PIT plugin, as the project brings its own', () => {
    const exclusions = descendantsNamed(parseXml(files.get('pit-junit5/pom.xml')), 'exclusion').map(
      (exclusion) => field(exclusion, 'groupId'),
    );

    expect(exclusions).toEqual([
      'org.junit.platform',
      'org.junit.jupiter',
      'org.opentest4j',
      'org.apiguardian',
    ]);
  });

  it('unpacks the Checkstyle Google config and lists one module per tool', () => {
    expect(textsOf(files.get('checkstyle/pom.xml'), 'includes')).toEqual(['google_checks.xml']);
    expect(textsOf(files.get('pom.xml'), 'module')).toEqual([
      'checkstyle',
      'format',
      'jacoco-agent',
      'jacoco-cli',
      'pit',
      'pit-junit5',
      'pmd',
      'spotbugs',
    ]);
    expect(textsOf(files.get('pom.xml'), 'outputFile')).toEqual([
      '${nitpicker.out}/classpaths/${project.artifactId}.txt',
    ]);
  });

  it('changes its key with a tool version', () => {
    const other = toolFiles(TOOL_DEPENDENCIES, { ...VERSIONS, pmd: '7.8.0' });

    expect(toolSetKey(other)).not.toBe(toolSetKey(files));
    expect(toolSetKey(toolFiles(TOOL_DEPENDENCIES, VERSIONS))).toBe(toolSetKey(files));
  });

  it('resolves the JUnit launcher at the version of the project engine', () => {
    const launcher = toolFiles(launcherDependencies('1.13.4'), VERSIONS);

    expect(dependenciesOf(launcher.get('junit-launcher/pom.xml'))).toEqual([
      'org.junit.platform:junit-platform-launcher:1.13.4',
    ]);
  });
});

function jarFile() {
  const jar = path.join(cacheRoot(), 'tool.jar');
  writeFileSync(jar, '');
  return jar;
}

function fakeMaven(calls, jar = '/missing/tool.jar') {
  return (args) => {
    calls.push(args);
    const staging = args
      .find((arg) => arg.startsWith('-Dnitpicker.out='))
      .slice('-Dnitpicker.out='.length);
    mkdirSync(path.join(staging, 'classpaths'), { recursive: true });
    for (const name of Object.keys(TOOL_DEPENDENCIES)) {
      writeFileSync(path.join(staging, 'classpaths', `${name}.txt`), jar);
    }
  };
}

function toolOptions(runMaven) {
  return {
    dependencies: TOOL_DEPENDENCIES,
    versions: VERSIONS,
    runMaven,
    cacheRoot: cacheRoot(),
  };
}

describe('resolveToolSet', () => {
  it('runs Maven once for the whole set and reuses a cached set whose jars still exist', () => {
    const jar = jarFile();
    const calls = [];
    const options = toolOptions(fakeMaven(calls, jar));

    const first = resolveToolSet(options);
    const second = resolveToolSet(options);

    expect(calls).toHaveLength(1);
    expect(calls[0].includes('validate')).toBe(true);
    expect(first.classpath('pmd')).toEqual([jar]);
    expect(second.directory).toBe(first.directory);
    expect(existsSync(first.directory)).toBe(true);
  });

  it('resolves again when a cached jar has disappeared', () => {
    const calls = [];
    const options = toolOptions(fakeMaven(calls));

    resolveToolSet(options);
    resolveToolSet(options);

    expect(calls).toHaveLength(2);
  });

  it('rejects a tool that was not part of the set', () => {
    const set = resolveToolSet(toolOptions(fakeMaven([], jarFile())));

    expect(() => set.classpath('unknown')).toThrow('Tool unknown was not resolved');
  });

  it('does not keep a half-resolved set when Maven fails', () => {
    const options = toolOptions(() => {
      throw new Error('Could not resolve');
    });

    expect(() => resolveToolSet(options)).toThrow('Could not resolve');
    expect(readdirSync(options.cacheRoot)).toEqual([]);
  });
});

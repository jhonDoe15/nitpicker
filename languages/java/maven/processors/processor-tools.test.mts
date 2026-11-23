import type { SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { childrenAt, parseXml } from '../../../../shared/ingest/report-records.mts';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { skippedToolFindings } from '../../adapters/reporting/skips/skipped-tools.mts';
import { spawnResult } from '../../adapters/test-support/spawn-result.mts';
import type { JavaSpawn } from '../../adapters/typed/java-values.mts';
import { textAt } from '../configuration/pom-elements.mts';
import { runErrorProne } from '../errorprone/maven-errorprone.mts';
import type { MavenModule } from '../typed/maven-values.mts';
import { processorFailureFor, processorTool, resolveProcessorTools } from './processor-tools.mts';

const makeRoot = useTempProjects('nitpicker-processor-tools-');

function tempDir(prefix: string): string {
  const dir = path.join(realpathSync(makeRoot({})), prefix);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function fakeModule(basedir: string, compiler: unknown): MavenModule {
  return {
    coordinates: 'org.example:demo:1',
    packaging: 'jar',
    basedir,
    buildDirectory: path.join(basedir, 'target'),
    compiler,
  };
}

function fileArgOf(args: readonly string[]): string {
  const index = args.indexOf('--file');
  return index >= 0 ? (args[index + 1] ?? '') : '';
}

function fixtureRepo(
  root: string,
  coordinate: string,
): { readonly url: string; readonly jar: string } {
  const [groupId, artifactId, version] = coordinate.split(':');
  const repoDir = path.join(root, 'local-repo');
  const artifactDir = path.join(
    repoDir,
    ...(groupId ?? '').split('.'),
    artifactId ?? '',
    version ?? '',
  );
  mkdirSync(artifactDir, { recursive: true });
  const jar = path.join(artifactDir, `${artifactId ?? ''}-${version ?? ''}.jar`);
  writeFileSync(jar, 'fake-jar');
  return { url: pathToFileURL(repoDir).href, jar };
}

function resolveFromSyntheticPom(pomPath: string): SpawnSyncReturns<string> {
  const staging = path.dirname(pomPath);
  const rootPom = parseXml(readFileSync(pomPath, 'utf8'));
  const modules = childrenAt(rootPom, 'modules', 'module').map((entry) => entry.text ?? '');
  for (const name of modules) {
    const moduleDir = path.join(staging, name);
    const modulePom = parseXml(readFileSync(path.join(moduleDir, 'pom.xml'), 'utf8'));
    const repoUrls = childrenAt(modulePom, 'repositories', 'repository')
      .map((repo) => textAt(repo, 'url'))
      .filter((url): url is string => url !== undefined && url.startsWith('file:'));
    const deps = childrenAt(modulePom, 'dependencies', 'dependency');
    const jars = deps.flatMap((dep) => {
      const group = (textAt(dep, 'groupId') ?? '').split('.');
      const artifact = textAt(dep, 'artifactId') ?? '';
      const version = textAt(dep, 'version') ?? '';
      return repoUrls.map((url) =>
        path.join(fileURLToPath(url), ...group, artifact, version, `${artifact}-${version}.jar`),
      );
    });
    writeFileSync(path.join(moduleDir, 'classpath.txt'), jars.join(path.delimiter));
  }
  return spawnResult({ status: 0, stdout: '', stderr: '' });
}

describe('resolveProcessorTools', () => {
  it('copies effective POM repositories into the synthetic POM and resolves from a file:// fixture', () => {
    const root = tempDir('nitpicker-proc-repo-');
    const coord = 'org.jenkins-ci.tools:custom-processor:1.2.3';
    const { url, jar } = fixtureRepo(root, coord);
    const effectivePom = `<project xmlns="http://maven.apache.org/POM/4.0.0">
      <repositories>
        <repository>
          <id>local-fixture</id>
          <url>${url}</url>
        </repository>
      </repositories>
      <pluginRepositories>
        <pluginRepository>
          <id>local-plugin-fixture</id>
          <url>${url}</url>
        </pluginRepository>
      </pluginRepositories>
    </project>`;
    const seenPoms: string[] = [];
    const spawn: JavaSpawn = (_command, args) => {
      const pomPath = fileArgOf(args);
      seenPoms.push(readFileSync(pomPath, 'utf8'));
      return resolveFromSyntheticPom(pomPath);
    };

    const result = resolveProcessorTools({
      projectRoot: root,
      maven: 'mvn',
      modules: [fakeModule(root, { processorPaths: [coord] })],
      effectivePom,
      spawn,
      environment: { XDG_CACHE_HOME: path.join(root, 'cache') },
    });

    const tool = processorTool({ processorPaths: [coord] });
    expect(tool).toBeDefined();
    expect(seenPoms[0]).toContain(`<url>${url}</url>`);
    expect(seenPoms[0]).toContain('<pluginRepositories>');
    expect(result).toEqual({
      classpaths: { [tool?.name ?? '']: [jar] },
      failures: {},
    });
  });

  it('records resolution failures without throwing and still resolves other modules processors', () => {
    const root = tempDir('nitpicker-proc-fail-');
    const goodCoord = 'org.example:good-proc:1.0';
    const badCoord = 'org.example:missing-proc:9.9';
    const { url, jar } = fixtureRepo(root, goodCoord);
    const effectivePom =
      `<project><repositories><repository><id>local</id><url>${url}</url>` +
      '</repository></repositories></project>';
    const badTool = processorTool({ processorPaths: [badCoord] });
    const goodTool = processorTool({ processorPaths: [goodCoord] });

    const spawn: JavaSpawn = (_command, args) => {
      const pomPath = fileArgOf(args);
      const pomText = readFileSync(pomPath, 'utf8');
      if (badTool !== undefined && pomText.includes(`<module>${badTool.name}</module>`)) {
        return spawnResult({
          status: 1,
          stdout: '',
          stderr: 'Could not find artifact org.example:missing-proc:jar:9.9',
        });
      }
      return resolveFromSyntheticPom(pomPath);
    };

    const result = resolveProcessorTools({
      projectRoot: root,
      maven: 'mvn',
      modules: [
        fakeModule(root, { processorPaths: [badCoord] }),
        fakeModule(root, { processorPaths: [goodCoord] }),
      ],
      effectivePom,
      spawn,
      environment: { XDG_CACHE_HOME: path.join(root, 'cache') },
    });

    expect(result.classpaths).toEqual({ [goodTool?.name ?? '']: [jar] });
    expect(result.failures[badTool?.name ?? '']).toContain('missing-proc');
  });

  it('degrades Error Prone gracefully by writing a skip report when processor resolution failed', () => {
    const root = tempDir('nitpicker-ep-proc-skip-');
    const reportDir = path.join(root, 'report');
    mkdirSync(reportDir, { recursive: true });
    const coord = 'org.jenkins-ci:missing-processor:2.0';
    const tool = processorTool({ processorPaths: [coord] });
    const failures = { [tool?.name ?? '']: 'Repository unreachable' };

    runErrorProne({
      module: {
        basedir: root,
        outputDirectory: path.join(root, 'target/classes'),
        testOutputDirectory: path.join(root, 'target/test-classes'),
        sourceRoots: [path.join(root, 'src/main/java')],
        testSourceRoots: [],
        compiler: { processorPaths: [coord] },
      },
      reportDir,
      tools: { errorprone: ['/fake/errorprone.jar'] },
      processorFailures: failures,
      classpaths: { mainCompile: [], mainRuntime: [], testCompile: [], testRuntime: [] },
      configs: {},
      environment: {},
    });

    expect(readFileSync(path.join(reportDir, 'errorprone.json'), 'utf8')).toBe('[]\n');
    expect(readFileSync(path.join(reportDir, 'errorprone-skipped.txt'), 'utf8')).toContain(
      'Could not resolve annotation processors (org.jenkins-ci:missing-processor:2.0): Repository unreachable',
    );
    expect(skippedToolFindings({ reportRoot: reportDir, javaStyle: 'google' })).toEqual([
      expect.objectContaining({
        tool: 'errorprone',
        classification: 'tool-error',
        message: expect.stringContaining('org.jenkins-ci:missing-processor:2.0'),
      }),
    ]);
  });

  it('ignores processor failures when proc is set to none', () => {
    const coord = 'org.example:proc:1.0';
    const tool = processorTool({ processorPaths: [coord] });
    const failures = { [tool?.name ?? '']: 'unreachable' };

    expect(
      processorFailureFor({ processorPaths: [coord], proc: 'none' }, failures),
    ).toBeUndefined();
  });

  it('uses separate cache keys when repositories differ for the same processor coordinates', () => {
    const root = tempDir('nitpicker-proc-cache-');
    const coord = 'org.example:cached-proc:1.0';
    const first = fixtureRepo(path.join(root, 'repo-a'), coord);
    const second = fixtureRepo(path.join(root, 'repo-b'), coord);
    const cacheHome = path.join(root, 'cache');
    const pomFor = (url: string): string =>
      `<project><repositories><repository><id>r</id><url>${url}</url></repository></repositories></project>`;
    const spawn: JavaSpawn = (_command, args) => resolveFromSyntheticPom(fileArgOf(args));
    const tool = processorTool({ processorPaths: [coord] });

    const fromFirst = resolveProcessorTools({
      projectRoot: root,
      maven: 'mvn',
      modules: [fakeModule(root, { processorPaths: [coord] })],
      effectivePom: pomFor(first.url),
      spawn,
      environment: { XDG_CACHE_HOME: cacheHome },
    });
    const fromSecond = resolveProcessorTools({
      projectRoot: root,
      maven: 'mvn',
      modules: [fakeModule(root, { processorPaths: [coord] })],
      effectivePom: pomFor(second.url),
      spawn,
      environment: { XDG_CACHE_HOME: cacheHome },
    });

    expect(fromFirst.classpaths[tool?.name ?? '']).toEqual([first.jar]);
    expect(fromSecond.classpaths[tool?.name ?? '']).toEqual([second.jar]);
  });
});

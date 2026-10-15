import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEffectivePom, selectModules } from './module-facts.mjs';

const roots = [];

function repository(layout) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-modules-')));
  roots.push(root);
  for (const file of layout) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  return root;
}

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function projectXml({ root, dir = '', artifactId, packaging, extraBuild = '' }) {
  const base = path.join(root, dir);
  return `<project>
    <parent><groupId>org.demo</groupId></parent>
    <artifactId>${artifactId}</artifactId>
    ${packaging === undefined ? '' : `<packaging>${packaging}</packaging>`}
    <build>
      <sourceDirectory>${base}/src/main/java</sourceDirectory>
      <testSourceDirectory>${base}/src/test/java</testSourceDirectory>
      <outputDirectory>${base}/target/classes</outputDirectory>
      <testOutputDirectory>${base}/target/test-classes</testOutputDirectory>
      <directory>${base}/target</directory>
      <resources><resource><directory>${base}/src/main/resources</directory></resource></resources>
      ${extraBuild}
    </build>
  </project>`;
}

function effectivePom(...projects) {
  return `<?xml version="1.0"?><!-- Generated --><projects>${projects.map(projectXml).join('')}</projects>`;
}

describe('parseEffectivePom', () => {
  it('reads the packaging, the build paths and the inherited group of each project', () => {
    const [project] = parseEffectivePom(
      effectivePom({ root: '/repo', artifactId: 'shop', packaging: 'war' }),
    );

    expect(project).toMatchObject({
      groupId: 'org.demo',
      artifactId: 'shop',
      packaging: 'war',
      buildDirectory: '/repo/target',
      classesDirectory: '/repo/target/classes',
      testClassesDirectory: '/repo/target/test-classes',
      declaredSourceRoots: ['/repo/src/main/java'],
      declaredTestRoots: ['/repo/src/test/java'],
      declaredResourceRoots: ['/repo/src/main/resources'],
    });
  });

  it('defaults to jar and accepts a single project document', () => {
    const [project] = parseEffectivePom(projectXml({ root: '/repo', artifactId: 'solo' }));

    expect(project.packaging).toBe('jar');
    expect(project.artifactId).toBe('solo');
  });

  it('adds the source roots that build-helper registers', () => {
    const extraBuild = `<plugins><plugin><artifactId>build-helper-maven-plugin</artifactId><executions>
      <execution><goals><goal>add-source</goal></goals><configuration><sources><source>src/gen/java</source></sources></configuration></execution>
      <execution><goals><goal>add-test-source</goal></goals><configuration><sources><source>src/it/java</source></sources></configuration></execution>
    </executions></plugin></plugins>`;
    const [project] = parseEffectivePom(
      effectivePom({ root: '/repo', artifactId: 'gen', extraBuild }),
    );

    expect(project.declaredSourceRoots).toEqual(['/repo/src/main/java', 'src/gen/java']);
    expect(project.declaredTestRoots).toEqual(['/repo/src/test/java', 'src/it/java']);
  });
});

describe('selectModules', () => {
  const layout = [
    'pom.xml',
    'lib/pom.xml',
    'lib/src/main/java/a/Lib.java',
    'app/pom.xml',
    'app/src/main/java/a/App.java',
    'app/src/test/java/a/AppTest.java',
    'docs/pom.xml',
  ];

  function pom(root, ...extra) {
    return parseEffectivePom(
      effectivePom(
        { root, artifactId: 'parent', packaging: 'pom' },
        { root, dir: 'lib', artifactId: 'lib' },
        { root, dir: 'app', artifactId: 'app' },
        { root, dir: 'docs', artifactId: 'docs', packaging: 'pom' },
        ...extra,
      ),
    );
  }

  it('takes every jar module with Java sources, with paths relative to the project', () => {
    const root = repository(layout);
    const modules = selectModules(pom(root), root);

    expect(modules.map(({ key, path: modulePath, dir }) => ({ key, modulePath, dir }))).toEqual([
      { key: 'module-lib', modulePath: ':lib', dir: 'lib' },
      { key: 'module-app', modulePath: ':app', dir: 'app' },
    ]);
    expect(modules[1].sourceRoots).toEqual([path.join(root, 'app/src/main/java')]);
    expect(modules[1].testSourceRoots).toEqual([path.join(root, 'app/src/test/java')]);
  });

  it('names a root jar module root', () => {
    const root = repository(['pom.xml', 'src/main/java/a/A.java']);
    const [module] = selectModules(
      parseEffectivePom(projectXml({ root, artifactId: 'single' })),
      root,
    );

    expect(module).toMatchObject({ key: 'root', path: ':', dir: '' });
  });

  it('fails instead of passing when no module can be analyzed', () => {
    const root = repository(['pom.xml', 'docs/pom.xml']);

    expect(() =>
      selectModules(
        parseEffectivePom(
          effectivePom({ root, dir: 'docs', artifactId: 'docs', packaging: 'pom' }),
        ),
        root,
      ),
    ).toThrow('found no Maven module');
  });

  it('fails and names a module with Java sources that is neither jar nor war', () => {
    const root = repository([...layout, 'bundle/pom.xml', 'bundle/src/main/java/a/B.java']);

    expect(() =>
      selectModules(
        pom(root, { root, dir: 'bundle', artifactId: 'bundle', packaging: 'ear' }),
        root,
      ),
    ).toThrow('bundle (packaging ear)');
  });

  it('analyzes a war module like a jar module', () => {
    const root = repository([...layout, 'web/pom.xml', 'web/src/main/java/a/W.java']);
    const modules = selectModules(
      pom(root, { root, dir: 'web', artifactId: 'web', packaging: 'war' }),
      root,
    );

    expect(modules.map((module) => module.key)).toContain('module-web');
  });

  it('ignores source roots that live under the build directory', () => {
    const root = repository([
      'pom.xml',
      'src/main/java/a/A.java',
      'target/generated-sources/G.java',
    ]);
    const extraBuild = `<plugins><plugin><artifactId>build-helper-maven-plugin</artifactId><executions>
      <execution><goals><goal>add-source</goal></goals><configuration><sources><source>${root}/target/generated-sources</source></sources></configuration></execution>
    </executions></plugin></plugins>`;
    const [module] = selectModules(
      parseEffectivePom(projectXml({ root, artifactId: 'gen', extraBuild })),
      root,
    );

    expect(module.sourceRoots).toEqual([path.join(root, 'src/main/java')]);
  });

  it('fails when the directory of a module cannot be found', () => {
    const root = repository(['src/main/java/a/A.java']);

    expect(() =>
      selectModules(parseEffectivePom(projectXml({ root, artifactId: 'lost' })), root),
    ).toThrow('Could not find the directory of Maven module org.demo:lost');
  });
});

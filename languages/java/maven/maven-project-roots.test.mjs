import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readReactor } from './maven-project.mjs';
import {
  inBuild,
  plugin,
  raw,
  reactor,
  removeReactors,
  soloModule,
} from './test-support/maven-project-sources.mjs';

afterEach(removeReactors);

describe('describeModule Groovy test sources', () => {
  it('adds the GMavenPlus test sources, src/test/groovy unless an execution or the plugin names others', () => {
    const gmavenplus = (inner) =>
      soloModule(inBuild(plugin('gmavenplus-plugin', inner, 'org.codehaus.gmavenplus')));
    const testSource = (directory) =>
      `<configuration><testSources><testSource><directory>${directory}</directory></testSource></testSources></configuration>`;
    const named = gmavenplus(
      `${testSource('src/spec/groovy')}<executions><execution>${testSource('src/it/groovy')}</execution></executions>`,
    );
    const plain = gmavenplus('');

    expect(plain.testSourceRoots).toEqual([
      path.join(plain.basedir, 'src/test/java'),
      path.join(plain.basedir, 'src/test/groovy'),
    ]);
    expect(named.testSourceRoots).toEqual(
      ['src/test/java', 'src/spec/groovy', 'src/it/groovy'].map((root) =>
        path.join(named.basedir, root),
      ),
    );
  });
});

describe('describeModule test roots of other compilers and outside the module', () => {
  it('adds an existing src/test/groovy without GMavenPlus, as groovy-eclipse-compiler builds it', () => {
    const solo = '<project><groupId>demo</groupId><artifactId>solo</artifactId></project>';
    const withGroovy = reactor({ 'pom.xml': raw('solo'), 'src/test/groovy/demo/ASpec.groovy': '' });
    const withoutGroovy = reactor({ 'pom.xml': raw('solo') });

    expect(
      [withGroovy, withoutGroovy].map((root) => readReactor(root, solo)[0].testSourceRoots),
    ).toEqual([
      [path.join(withGroovy, 'src/test/java'), path.join(withGroovy, 'src/test/groovy')],
      [path.join(withoutGroovy, 'src/test/java')],
    ]);
  });

  it('keeps no build-helper or GMavenPlus root that lies outside the module', () => {
    const helper = plugin(
      'build-helper-maven-plugin',
      '<executions><execution><goals><goal>add-test-source</goal></goals><configuration>' +
        '<sources><source>../shared/src/test/java</source><source>src/it/java</source></sources>' +
        '</configuration></execution></executions>',
      'org.codehaus.mojo',
    );
    const gmavenplus = plugin(
      'gmavenplus-plugin',
      '<configuration><testSources><testSource><directory>/elsewhere/groovy</directory>' +
        '</testSource></testSources></configuration>',
      'org.codehaus.gmavenplus',
    );
    const module = soloModule(inBuild(helper + gmavenplus));

    expect(module.testSourceRoots).toEqual([
      path.join(module.basedir, 'src/test/java'),
      path.join(module.basedir, 'src/it/java'),
    ]);
  });
});

describe('describeModule publishing', () => {
  const DISTRIBUTION =
    '<distributionManagement><repository><id>releases</id><url>https://repo.example.com</url>' +
    '</repository></distributionManagement>';

  it('counts a module with distributionManagement as published unless deploy is skipped', () => {
    const skippedByProperty = `${DISTRIBUTION}<properties><maven.deploy.skip>true</maven.deploy.skip></properties>`;
    const skippedByPlugin =
      DISTRIBUTION +
      inBuild(plugin('maven-deploy-plugin', '<configuration><skip>true</skip></configuration>'));

    expect(
      [DISTRIBUTION, skippedByProperty, skippedByPlugin, ''].map(
        (inner) => soloModule(inner).published,
      ),
    ).toEqual([true, false, false, false]);
  });

  it('counts a library jar a publishing plugin deploys, but not a war or a pom', () => {
    const central = inBuild(
      plugin('central-publishing-maven-plugin', '', 'org.sonatype.central') +
        plugin('maven-surefire-plugin', ''),
    );

    expect(
      [
        central,
        inBuild(plugin('nexus-staging-maven-plugin', '', 'org.sonatype.plugins')),
        `<packaging>war</packaging>${DISTRIBUTION}`,
        `<packaging>pom</packaging>${DISTRIBUTION}`,
        `<packaging>bundle</packaging>${DISTRIBUTION}`,
      ].map((inner) => soloModule(inner).published),
    ).toEqual([true, true, false, false, true]);
  });
});

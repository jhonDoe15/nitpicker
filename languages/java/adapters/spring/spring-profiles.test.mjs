import { afterEach, describe, expect, it } from 'vitest';
import { project, removeProjects, resource } from './test-support/spring-config-projects.mjs';
import { readSpringConfigFindings } from './java-spring.mjs';
import { readTestProfiles } from './spring-profiles.mjs';

afterEach(removeProjects);

const DDL_CREATE = 'spring.jpa.hibernate.ddl-auto=create-drop';

function ddlFiles(extra) {
  return { [resource('application-staging.properties')]: DDL_CREATE, ...extra };
}

function flaggedFiles(files, options = {}) {
  const root = project(files, { jpa: false });
  return readSpringConfigFindings(root, { sourceRoots: [], ...options }).map(
    (finding) => finding.path,
  );
}

describe('test profiles taken from the project', () => {
  it('flags an unknown profile name until the tests use it', () => {
    expect(flaggedFiles(ddlFiles({}))).toEqual([resource('application-staging.properties')]);
  });

  it('accepts a profile named by @ActiveProfiles in a test', () => {
    const files = ddlFiles({
      'src/test/java/demo/StagingTest.java':
        'package demo;\n@ActiveProfiles({"staging", "extra"})\nclass StagingTest {}\n',
    });

    expect(flaggedFiles(files)).toEqual([]);
  });

  it('accepts a profile named by @ActiveProfiles(profiles = ...) in a Kotlin test', () => {
    const files = ddlFiles({
      'src/test/kotlin/demo/StagingTest.kt':
        '@ActiveProfiles(profiles = ["x"], value = ["Staging"])\nclass StagingTest\n',
    });

    expect(flaggedFiles(files)).toEqual([]);
  });

  it('accepts a profile that has its own file under test resources', () => {
    const files = ddlFiles({ 'src/test/resources/application-staging.yml': 'a: b\n' });

    expect(flaggedFiles(files)).toEqual([]);
  });

  it('accepts a profile set by spring.profiles.active in test resources or test properties', () => {
    expect(
      flaggedFiles(
        ddlFiles({ 'src/test/resources/application.properties': 'spring.profiles.active=staging' }),
      ),
    ).toEqual([]);
    expect(
      flaggedFiles(
        ddlFiles({
          'src/test/java/demo/T.java':
            '@SpringBootTest(properties = "spring.profiles.active=staging")\nclass T {}\n',
        }),
      ),
    ).toEqual([]);
  });

  it('uses the test source roots the build declares', () => {
    const files = ddlFiles({
      'it/java/demo/StagingIT.java': '@ActiveProfiles("staging")\nclass StagingIT {}\n',
    });

    expect(flaggedFiles(files)).toEqual([resource('application-staging.properties')]);
    expect(flaggedFiles(files, { testSourceRoots: ['it/java'] })).toEqual([]);
  });

  it('never treats a production profile as a test profile', () => {
    const files = {
      [resource('application-prod.properties')]: DDL_CREATE,
      'src/test/java/demo/ProdTest.java': '@ActiveProfiles("prod")\nclass ProdTest {}\n',
    };

    expect(flaggedFiles(files)).toEqual([resource('application-prod.properties')]);
  });

  it('lists lower-cased profile names from sources and resources', () => {
    const root = project(
      {
        'src/test/java/demo/A.java': '@ActiveProfiles("H2")\nclass A {}\n',
        'src/test/resources/application-ci.yml': 'a: b\n',
      },
      { jpa: false },
    );

    expect([...readTestProfiles(root, undefined)].sort()).toEqual(['ci', 'h2']);
  });
});

describe('profile name words', () => {
  it.each(['test', 'testing', 'it', 'integration-test', 'ci-test', 'it_postgres'])(
    'treats %s as a test profile',
    (profile) => {
      const files = { [resource(`application-${profile}.properties`)]: DDL_CREATE };

      expect(flaggedFiles(files)).toEqual([]);
    },
  );

  it.each(['local', 'dev', 'development', 'local-dev', 'dev-docker'])(
    'treats %s as a local profile for ddl-auto',
    (profile) => {
      const files = { [resource(`application-${profile}.properties`)]: DDL_CREATE };

      expect(flaggedFiles(files)).toEqual([]);
    },
  );

  it.each(['staging', 'prod', 'device', 'qa'])('flags ddl-auto in %s', (profile) => {
    const files = { [resource(`application-${profile}.properties`)]: DDL_CREATE };

    expect(flaggedFiles(files)).toEqual([resource(`application-${profile}.properties`)]);
  });
});

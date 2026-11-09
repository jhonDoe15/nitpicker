import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../core/diff/git/test-support/git-checkout.mjs';
import { afterEach, describe, expect, it } from 'vitest';
import { project, removeProjects, resource } from './test-support/spring-config-projects.mjs';
import { readSpringConfigFindings } from './java-spring.mjs';
import { readTestProfiles } from './spring-profiles.mjs';

const extraRoots = [];
const { gitCheckout } = useGitCheckouts();

afterEach(() => {
  removeProjects();
  for (const root of extraRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const DDL_CREATE = 'spring.jpa.hibernate.ddl-auto=create-drop';
const MAIN_YAML = resource('application.yml');

function onProfile(name) {
  return {
    [MAIN_YAML]: `spring:\n  config:\n    activate:\n      on-profile: ${name}\n  jpa:\n    hibernate:\n      ddl-auto: create-drop\n`,
  };
}

function activeProfiles(...names) {
  const literals = names.map((name) => `"${name}"`).join(', ');
  return {
    'src/test/java/demo/EnvTest.java': `@ActiveProfiles({${literals}})\nclass EnvTest {}\n`,
  };
}

function flaggedFiles(files, options = {}) {
  const root = project(files, { jpa: false });
  return readSpringConfigFindings(root, { sourceRoots: [], ...options }).map(
    (finding) => finding.path,
  );
}

describe('profiles that only the tests use', () => {
  it('flags a profile document until the tests use the profile', () => {
    expect(flaggedFiles(onProfile('qa'))).toEqual([MAIN_YAML]);
  });

  it('accepts a profile named by @ActiveProfiles in a Java or Kotlin test', () => {
    expect(flaggedFiles({ ...onProfile('qa'), ...activeProfiles('qa', 'extra') })).toEqual([]);
    expect(
      flaggedFiles({
        ...onProfile('qa'),
        'src/test/kotlin/demo/QaTest.kt':
          '@ActiveProfiles(profiles = ["x"], value = ["Qa"])\nclass QaTest\n',
      }),
    ).toEqual([]);
  });

  it('accepts a profile that has its own file under test resources', () => {
    const files = { ...onProfile('qa'), 'src/test/resources/application-qa.yml': 'a: b\n' };

    expect(flaggedFiles(files)).toEqual([]);
  });

  it('accepts a profile set by spring.profiles.active in test resources or test sources', () => {
    const resources = { 'src/test/resources/application.properties': 'spring.profiles.active=qa' };
    const sources = {
      'src/test/java/demo/T.java':
        '@SpringBootTest(properties = "spring.profiles.active=qa")\nclass T {}\n',
    };

    expect(flaggedFiles({ ...onProfile('qa'), ...resources })).toEqual([]);
    expect(flaggedFiles({ ...onProfile('qa'), ...sources })).toEqual([]);
  });

  it('uses the test source roots the build declares', () => {
    const files = {
      ...onProfile('qa'),
      'it/java/demo/QaIT.java': '@ActiveProfiles("qa")\nclass QaIT {}\n',
    };

    expect(flaggedFiles(files)).toEqual([MAIN_YAML]);
    expect(flaggedFiles(files, { testSourceRoots: ['it/java'] })).toEqual([]);
  });

  it.each(['docker', 'k8s', 'qa'])(
    'still flags the %s profile file in main resources when a test activates it',
    (profile) => {
      const files = {
        [resource(`application-${profile}.properties`)]: DDL_CREATE,
        ...activeProfiles(profile),
        [`src/test/resources/application-${profile}.properties`]: 'a=b',
      };

      expect(flaggedFiles(files)).toEqual([resource(`application-${profile}.properties`)]);
    },
  );

  it('keeps a main resources profile file exempt when its name has a test word', () => {
    const files = { [resource('application-it-docker.properties')]: DDL_CREATE };

    expect(flaggedFiles(files)).toEqual([]);
  });

  it('reads the profiles the tests use from the baseline checkout when there is one', () => {
    const head = { ...onProfile('qa'), ...activeProfiles('qa') };
    const baseline = project(
      { 'src/test/java/demo/Other.java': 'class Other {}\n' },
      { jpa: false },
    );

    expect(flaggedFiles(head, { baselineRoot: baseline })).toEqual([MAIN_YAML]);
    expect(flaggedFiles(head)).toEqual([]);
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

  it('ignores test roots that do not exist', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-profiles-'));
    extraRoots.push(root);
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src/X.java'), 'class X {}');

    expect([...readTestProfiles(root, ['missing/java'])]).toEqual([]);
  });
});

describe('production words', () => {
  it.each([
    'prod',
    'staging',
    'Stage',
    'UAT',
    'preprod',
    'stg',
    'prd',
    'live',
    'production',
    'prod2',
    'stage1',
    'testprod',
    'prodeu',
    'produs',
    'prodtest',
    'itprod',
    'nonprod',
  ])('never treats %s as a test profile even when the tests activate it', (profile) => {
    const files = { ...onProfile(profile), ...activeProfiles(profile) };

    expect(flaggedFiles(files)).toEqual([MAIN_YAML]);
  });

  it.each([
    'prod-test',
    'prod-dev',
    'test-prod',
    'local-staging',
    'it-UAT',
    'dev_stg',
    'dev.prod2',
  ])('lets a production word win over the other words of %s', (profile) => {
    const files = { [resource(`application-${profile}.properties`)]: DDL_CREATE };

    expect(flaggedFiles(files)).toEqual([resource(`application-${profile}.properties`)]);
  });

  it.each(['product', 'staged', 'livestock', 'prodigy', 'olive'])(
    'does not mistake %s for a production profile',
    (profile) => {
      const files = { ...onProfile(profile), ...activeProfiles(profile) };

      expect(flaggedFiles(files)).toEqual([]);
    },
  );
});

describe('profile name words', () => {
  it.each(['test', 'testing', 'it', 'integration-test', 'ci-test', 'it_postgres', 'test2'])(
    'treats %s as a test profile',
    (profile) => {
      const files = { [resource(`application-${profile}.properties`)]: DDL_CREATE };

      expect(flaggedFiles(files)).toEqual([]);
    },
  );

  it.each(['local', 'dev', 'development', 'local-dev', 'dev-docker', 'dev2'])(
    'treats %s as a local profile for ddl-auto',
    (profile) => {
      const files = { [resource(`application-${profile}.properties`)]: DDL_CREATE };

      expect(flaggedFiles(files)).toEqual([]);
    },
  );

  it.each(['staging', 'prod', 'device', 'qa', 'docker'])('flags ddl-auto in %s', (profile) => {
    const files = { [resource(`application-${profile}.properties`)]: DDL_CREATE };

    expect(flaggedFiles(files)).toEqual([resource(`application-${profile}.properties`)]);
  });
});

describe('readTestProfiles in a Git checkout', () => {
  it('reads the test sources of the checkout, not ignored folders or nested checkouts', () => {
    const active = (name) => `@ActiveProfiles("${name}")\nclass T {}\n`;
    const root = gitCheckout(
      {
        'src/test/java/A.java': active('ci'),
        'src/test/java/gen/G.java': active('generated'),
        ...nestedCheckout('src/test/java/agent', { 'X.java': active('nested') }),
      },
      ['src/test/java/gen/'],
    );

    expect([...readTestProfiles(root, ['src/test/java'])]).toEqual(['ci']);
  });
});

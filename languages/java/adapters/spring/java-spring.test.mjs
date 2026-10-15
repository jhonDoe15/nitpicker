import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import { CONFIGURATION_FILES, createJavaAnalyzer } from '../java-analyzer.mjs';
import { applyJavaPolicy } from '../java-policy.mjs';
import { readSpringConfigFindings } from './java-spring.mjs';
import {
  MAIN_PROPERTIES,
  OPEN_IN_VIEW_OFF,
  OPEN_IN_VIEW_OFF_YAML,
  finding,
  openInView,
  project,
  removeProjects,
  resource,
  rules,
  sourceRoots,
} from './test-support/spring-config-projects.mjs';

afterEach(removeProjects);

function read(files, options) {
  return readSpringConfigFindings(project(files, options), { sourceRoots });
}

describe('readSpringConfigFindings', () => {
  it('reports nothing without Spring configuration files', () => {
    expect(read({ 'src/main/resources/data.properties': 'spring.jpa.open-in-view=true' })).toEqual(
      [],
    );
    expect(read({})).toEqual([]);
  });

  it('shapes findings with the printed id, the allowance sentence and a line location', () => {
    const findings = read({
      [resource('application.properties')]: '\n\nspring.jpa.open-in-view=true\n',
    });

    expect(findings).toEqual([openInView(MAIN_PROPERTIES, 3)]);
    expect(parseAnalyzerReport({ findings }, 'java').findings).toEqual(findings);
  });

  it('lets a spring/<rule> exception drop the finding', () => {
    const findings = read({ [resource('application.properties')]: 'spring.jpa.open-in-view=true' });

    expect(
      applyJavaPolicy(findings, {
        exceptions: [{ rule: 'spring/open-in-view', glob: 'src/main/resources/**' }],
      }),
    ).toEqual([]);
  });

  it('honors manifest resource roots, including nested module roots', () => {
    const root = project({ 'app/conf/application.yml': 'spring.jpa.open-in-view: true' });

    expect(readSpringConfigFindings(root, { sourceRoots, resourceRoots: ['app/conf/'] })).toEqual([
      openInView('app/conf/application.yml', 1),
    ]);
    expect(readSpringConfigFindings(root, { sourceRoots })).toEqual([]);
  });

  it('only reads application files directly in a resource root or its config directory', () => {
    const findings = read({
      [resource('nested/application.properties')]: 'spring.jpa.open-in-view=true',
      [resource('config/nested/application.properties')]: 'spring.jpa.open-in-view=true',
      [resource('other.properties')]: 'spring.jpa.open-in-view=true',
      [resource('application-.properties')]: 'spring.jpa.open-in-view=true',
    });

    expect(findings).toEqual([]);
  });

  it('reads application files in the config directory of a resource root', () => {
    expect(read({ [resource('config/application.yml')]: 'spring.jpa.open-in-view: true' })).toEqual(
      [openInView('src/main/resources/config/application.yml', 1)],
    );
    expect(
      readSpringConfigFindings(project({ 'conf/config/application.properties': 'x=1' }), {
        sourceRoots,
        resourceRoots: ['conf'],
      }),
    ).toEqual([openInView('conf/config/application.properties')]);
  });

  it('skips files it cannot read', () => {
    const root = project({ [resource('application.properties')]: 'spring.jpa.open-in-view=true' });
    mkdirSync(path.join(root, 'src/main/resources/application.yml'));
    mkdirSync(path.join(root, 'src/main/java/demo/Dir.java'));

    expect(readSpringConfigFindings(root, { sourceRoots })).toEqual([
      openInView(MAIN_PROPERTIES, 1),
    ]);
    expect(readSpringConfigFindings(root, { sourceRoots: ['missing'], resourceRoots: [] })).toEqual(
      [],
    );
  });

  it('keeps identity when lines shift', () => {
    const plain = read(
      { [resource('application.yml')]: 'server:\n  error:\n    include-stacktrace: always\n' },
      { jpa: false },
    );
    const shifted = read(
      {
        [resource('application.yml')]:
          '# a\n# b\n\nserver:\n  error:\n    include-stacktrace: always\n',
      },
      { jpa: false },
    );

    expect(plain[0].identity).toBe(shifted[0].identity);
    expect(plain[0].location.line).not.toBe(shifted[0].location.line);
  });

  it('numbers repeats of the same key in one file', () => {
    const findings = read(
      {
        [resource('application.yml')]:
          'spring.main.lazy-initialization: true\n---\nspring.main.lazy-initialization: true\n',
      },
      { jpa: false },
    );

    expect(findings.map((finding) => finding.identity)).toEqual([
      'spring.main.lazyinitialization',
      'spring.main.lazyinitialization#2',
    ]);
  });
});

describe('open-in-view', () => {
  it('fires once at the main file when a JPA project leaves it unset', () => {
    const findings = read({
      [resource('application-prod.properties')]: 'x=1',
      [resource('application.properties')]: 'x=1',
      [resource('application.yml')]: 'x: 1',
    });

    expect(findings).toEqual([openInView('src/main/resources/application.properties')]);
  });

  it('does not report a missing setting when only profile files exist', () => {
    expect(
      read({
        [resource('application-b.properties')]: 'x=1',
        [resource('application-test.yml')]: 'x: 1',
        [resource('application-prod.yml')]: 'x: 1',
      }),
    ).toEqual([]);
  });

  it('reports a missing setting at an empty main file', () => {
    expect(read({ [resource('application.yaml')]: '' })).toEqual([
      openInView('src/main/resources/application.yaml'),
    ]);
  });

  it('accepts false in the main file, relaxed forms, and non-test profile files', () => {
    expect(read({ [resource('application.properties')]: OPEN_IN_VIEW_OFF })).toEqual([]);
    expect(
      read({ [resource('application.yml')]: 'spring:\n  jpa:\n    openInView: false' }),
    ).toEqual([]);
    expect(
      read({
        [resource('application.properties')]: 'x=1',
        [resource('application-prod.properties')]: OPEN_IN_VIEW_OFF,
      }),
    ).toEqual([]);
  });

  it('does not count false set only in a test profile', () => {
    const findings = read({
      [resource('application.properties')]: 'x=1',
      [resource('application-test.properties')]: OPEN_IN_VIEW_OFF,
    });

    expect(rules(findings)).toEqual(['open-in-view']);
  });

  it('flags true outside test profiles but not in them', () => {
    expect(
      read({
        [resource('application.yml')]:
          `${OPEN_IN_VIEW_OFF_YAML}\n---\nspring:\n  config.activate.on-profile: local\n  jpa.open-in-view: true\n`,
      }),
    ).toEqual([openInView('src/main/resources/application.yml', 5)]);
    expect(
      read({
        [resource('application.properties')]: OPEN_IN_VIEW_OFF,
        [resource('application-testcontainers.properties')]: 'spring.jpa.open-in-view=true',
      }),
    ).toEqual([]);
  });

  it('is silent for projects without JPA', () => {
    expect(read({ [resource('application.properties')]: 'x=1' }, { jpa: false })).toEqual([]);
    expect(
      read(
        { [resource('application.properties')]: 'spring.jpa.open-in-view=true' },
        { jpa: false },
      ),
    ).toEqual([]);
  });

  it('recognizes the javax namespace', () => {
    const findings = read(
      {
        'src/main/java/demo/Old.java': 'import javax.persistence.Id;\n',
        [resource('application.properties')]: 'x=1',
      },
      { jpa: false },
    );

    expect(rules(findings)).toEqual(['open-in-view']);
  });
});

function ddlFinding(key, line, file = MAIN_PROPERTIES, suffix = '') {
  return finding({
    rule: 'ddl-auto',
    file,
    identity: `${key.replaceAll('-', '')}${suffix}`,
    message: `${key} lets Hibernate change the schema. Manage the schema with Flyway or Liquibase and use none or validate.`,
    line,
  });
}

describe('ddl-auto', () => {
  it('flags values other than none and validate, and generate-ddl=true', () => {
    const findings = read({
      [resource('application.properties')]: [
        OPEN_IN_VIEW_OFF,
        'spring.jpa.hibernate.ddl-auto=update',
        'spring.jpa.generate-ddl=true',
      ].join('\n'),
    });

    expect(findings).toEqual([
      ddlFinding('spring.jpa.hibernate.ddl-auto', 2),
      finding({
        rule: 'ddl-auto',
        file: MAIN_PROPERTIES,
        identity: 'spring.jpa.generateddl',
        message:
          'spring.jpa.generate-ddl lets Hibernate change the schema. Manage the schema with Flyway or Liquibase and keep it false.',
        line: 3,
      }),
    ]);
  });

  it('covers the Hibernate property in every spelling', () => {
    const key = 'spring.jpa.properties.hibernate.hbm2ddl.auto';

    expect(
      read({
        [resource('application.properties')]: `${OPEN_IN_VIEW_OFF}\n${key}=create-drop`,
        [resource('application-prod.yml')]:
          'spring:\n  jpa:\n    properties:\n      hibernate.hbm2ddl.auto: update',
      }),
    ).toEqual([ddlFinding(key, 4, 'src/main/resources/application-prod.yml'), ddlFinding(key, 2)]);
  });

  it('reads flow maps and the on, yes and 1 spellings of true', () => {
    expect(
      read({
        [resource('application.yml')]: [
          OPEN_IN_VIEW_OFF_YAML,
          'spring: {jpa: {hibernate: {ddl-auto: create}, generate-ddl: on}}',
        ].join('\n'),
      }).map((found) => [found.identity, found.location.line]),
    ).toEqual([
      ['spring.jpa.hibernate.ddlauto', 2],
      ['spring.jpa.generateddl', 2],
    ]);
  });

  it.each(['none', 'validate', 'VALIDATE', '${DDL:update}'])('accepts %s', (mode) => {
    expect(
      read({
        [resource('application.properties')]:
          `${OPEN_IN_VIEW_OFF}\nspring.jpa.hibernate.ddl-auto=${mode}\nspring.jpa.generate-ddl=false`,
      }),
    ).toEqual([]);
  });

  it.each(['test', 'testcontainers', 'local', 'dev', 'development', 'it', 'integration-test'])(
    'is exempt in the %s profile',
    (profile) => {
      expect(
        read({
          [resource('application.properties')]: OPEN_IN_VIEW_OFF,
          [resource(`application-${profile}.yml`)]: 'spring.jpa.hibernate.ddl-auto: create-drop',
        }),
      ).toEqual([]);
    },
  );

  it('is not exempt in other profiles, nor in a prod document of a multi-document file', () => {
    const findings = read({
      [resource('application.yml')]: [
        OPEN_IN_VIEW_OFF_YAML,
        '---',
        'spring.config.activate.on-profile: prod',
        'spring.jpa.hibernate.ddl-auto: update',
        '---',
        'spring.config.activate.on-profile: dev',
        'spring.jpa.hibernate.ddl-auto: update',
        '---',
        'spring.profiles: test',
        'spring.jpa.hibernate.ddl-auto: update',
      ].join('\n'),
    });

    expect(findings).toEqual([
      ddlFinding('spring.jpa.hibernate.ddl-auto', 4, resource('application.yml')),
    ]);
  });

  it('exempts a profile expression only when every positive token is a test or local profile', () => {
    const document = (expression) =>
      `---\nspring.config.activate.on-profile: ${expression}\nspring.jpa.hibernate.ddl-auto: update`;
    const expressions = [
      '"test | local"',
      '"dev & !prod"',
      '"!local"',
      '"test | prod"',
      '"(dev,prod)"',
      '[dev, integration-test]',
      '"!test"',
    ];
    const findings = read({
      [resource('application.yml')]: [OPEN_IN_VIEW_OFF_YAML, ...expressions.map(document)].join(
        '\n',
      ),
    });

    expect(findings.map((found) => found.location.line)).toEqual([7, 10, 13, 16, 22]);
  });

  it('applies a #--- profile document of a properties file to its own lines only', () => {
    const findings = read({
      [resource('application.properties')]: [
        OPEN_IN_VIEW_OFF,
        'spring.jpa.hibernate.ddl-auto=update',
        '#---',
        'spring.config.activate.on-profile=local',
        'spring.jpa.hibernate.ddl-auto=update',
        '#---',
        'spring.config.activate.on-profile=prod',
        'spring.jpa.hibernate.ddl-auto=update',
      ].join('\n'),
    });

    expect(findings).toEqual([
      ddlFinding('spring.jpa.hibernate.ddl-auto', 2),
      ddlFinding('spring.jpa.hibernate.ddl-auto', 8, MAIN_PROPERTIES, '#2'),
    ]);
  });

  it('reads profile lists', () => {
    const findings = read({
      [resource('application.yml')]: [
        OPEN_IN_VIEW_OFF_YAML,
        '---',
        'spring.config.activate.on-profile:',
        '  - dev',
        '  - test',
        'spring.jpa.hibernate.ddl-auto: update',
      ].join('\n'),
    });

    expect(findings).toEqual([]);
  });
});

describe('Java analyzer declaration', () => {
  it('declares spring as a reported tool', () => {
    expect(createJavaAnalyzer().reportedTools.includes('spring')).toBe(true);
  });

  it('hashes the Spring configuration modules', () => {
    const modules = [
      'languages/java/adapters/spring/java-spring.mjs',
      'languages/java/adapters/spring/spring-config-files.mjs',
      'languages/java/adapters/spring/spring-config-parser.mjs',
      'languages/java/adapters/spring/spring-secrets.mjs',
    ];

    expect(CONFIGURATION_FILES.filter((file) => modules.includes(file)).sort()).toEqual(modules);
  });
});

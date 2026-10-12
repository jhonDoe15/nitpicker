import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { CONFIGURATION_FILES, createJavaAnalyzer } from './java-analyzer.mjs';
import { applyJavaPolicy } from './java-policy.mjs';
import { readSpringConfigFindings } from './java-spring.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files, { jpa = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-spring-'));
  roots.push(root);
  const all = {
    ...(jpa
      ? { 'src/main/java/demo/Repo.java': 'package demo;\nimport jakarta.persistence.Entity;\n' }
      : { 'src/main/java/demo/Plain.java': 'package demo;\nclass Plain {}\n' }),
    ...files,
  };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const sourceRoots = ['src/main/java'];
const resource = (name) => `src/main/resources/${name}`;

function read(files, options) {
  return readSpringConfigFindings(project(files, options), { sourceRoots });
}

const OPEN_IN_VIEW_MESSAGE =
  'Spring Boot enables open-in-view by default, which holds a database connection through view rendering and hides N+1 queries. Set spring.jpa.open-in-view=false.';
const MAIN_PROPERTIES = 'src/main/resources/application.properties';

function finding({ rule, file, identity, message, line }) {
  return {
    tool: 'spring',
    rule,
    path: file,
    identity,
    message: `${message} To allow it here, add an exception for spring/${rule} in nitpicker.config.json.`,
    classification: 'enforceable',
    ...(line === undefined ? {} : { location: { line } }),
  };
}

function openInView(file, line) {
  return finding({
    rule: 'open-in-view',
    file,
    identity: line === undefined ? 'spring.jpa.openinview:missing' : 'spring.jpa.openinview',
    message: OPEN_IN_VIEW_MESSAGE,
    line,
  });
}

function secretFinding({ key, variable, file = MAIN_PROPERTIES, line = 1, identity = key }) {
  return finding({
    rule: 'literal-secret',
    file,
    identity: identity.toLowerCase().replaceAll(/[-_]/g, ''),
    message:
      variable === undefined
        ? `${key} falls back to a literal secret. Drop the default from the placeholder.`
        : `${key} holds a literal secret. Remove it and set ${variable} in the environment, or read it from a secret store.`,
    line,
  });
}

const OPEN_IN_VIEW_OFF = 'spring.jpa.open-in-view=false';
const OPEN_IN_VIEW_OFF_YAML = 'spring.jpa.open-in-view: false';
function rules(findings) {
  return findings.map((finding) => finding.rule);
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
        exceptions: [{ rule: 'spring/open-in-view', paths: ['src/main/resources/**'] }],
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

describe('risky-startup-flags', () => {
  const flags = [
    'spring.main.allow-circular-references',
    'spring.main.allow-bean-definition-overriding',
    'spring.main.lazy-initialization',
  ];

  const flagFinding = (file, flag, line) =>
    finding({
      rule: 'risky-startup-flags',
      file: resource(file),
      identity: flag.replaceAll('-', ''),
      message: `${flag}=true hides wiring problems instead of fixing them. Remove it, or restructure the beans.`,
      line,
    });

  it('flags each key once, including in local and dev profiles', () => {
    const findings = read(
      {
        [resource('application.properties')]: flags.map((flag) => `${flag}=true`).join('\n'),
        [resource('application-dev.properties')]: 'spring.main.lazy-initialization=true',
      },
      { jpa: false },
    );

    expect(findings).toEqual([
      flagFinding('application-dev.properties', flags[2], 1),
      flagFinding('application.properties', flags[0], 1),
      flagFinding('application.properties', flags[1], 2),
      flagFinding('application.properties', flags[2], 3),
    ]);
  });

  it('is silent for false, relaxed false, and test profiles', () => {
    expect(
      read(
        {
          [resource('application.properties')]:
            'spring.main.allowCircularReferences=false\nspring.main.lazy_initialization=false',
          [resource('application-test.properties')]: flags.map((flag) => `${flag}=true`).join('\n'),
        },
        { jpa: false },
      ),
    ).toEqual([]);
  });

  it('matches relaxed true keys', () => {
    const findings = read(
      { [resource('application.yml')]: 'spring:\n  main:\n    lazyInitialization: true' },
      { jpa: false },
    );

    expect(findings).toEqual([flagFinding('application.yml', flags[2], 3)]);
  });

  it.each(['TRUE', 'on', 'Yes', '1'])('treats %s as true', (spelling) => {
    const findings = read(
      { [resource('application.properties')]: `${flags[0]}=${spelling}` },
      { jpa: false },
    );

    expect(findings).toEqual([flagFinding('application.properties', flags[0], 1)]);
  });

  it.each(['off', 'no', '0', 'false'])('accepts %s', (spelling) => {
    expect(
      read({ [resource('application.properties')]: `${flags[0]}=${spelling}` }, { jpa: false }),
    ).toEqual([]);
  });

  it('is exempt only in test profiles, not in local ones', () => {
    const findings = read(
      {
        [resource('application-it.properties')]: `${flags[0]}=true`,
        [resource('application-local.properties')]: `${flags[0]}=true`,
      },
      { jpa: false },
    );

    expect(findings).toEqual([flagFinding('application-local.properties', flags[0], 1)]);
  });
});

describe('actuator-exposure', () => {
  const exposure = 'management.endpoints.web.exposure.include';
  const actuatorFinding = (file, line, identity = exposure) =>
    finding({
      rule: 'actuator-exposure',
      file,
      identity,
      message:
        'management.endpoints.web.exposure.include=* exposes every actuator endpoint. List the endpoints you need, for example health,info.',
      line,
    });

  it.each([
    `${exposure}=*`,
    `${exposure}=health,*`,
    `${exposure}[0]=*`,
    `${exposure}: "*"`,
    `${exposure}: [health, '*']`,
    `management: {endpoints: {web: {exposure: {include: "*"}}}}`,
    `management.endpoints.web.exposure: {include: [health, "*"]}`,
  ])('flags %s', (line) => {
    const name = line.includes(': ') ? 'application.yml' : 'application.properties';

    expect(read({ [resource(name)]: line }, { jpa: false })).toEqual([
      actuatorFinding(resource(name), 1),
    ]);
  });

  it('flags the wildcard at any index', () => {
    const text = `${exposure}[0]=health\n${exposure}[1]=*`;

    expect(read({ [resource('application.properties')]: text }, { jpa: false })).toEqual([
      actuatorFinding(MAIN_PROPERTIES, 2),
    ]);
  });

  it('flags a YAML list containing *', () => {
    const text =
      'management:\n  endpoints:\n    web:\n      exposure:\n        include:\n          - "*"\n';

    expect(read({ [resource('application.yml')]: text }, { jpa: false })).toEqual([
      actuatorFinding(resource('application.yml'), 6),
    ]);
  });

  it('accepts named endpoints and local, dev and test profiles', () => {
    expect(
      read(
        {
          [resource('application.properties')]: `${exposure}=health,info\n${exposure}[0]=health`,
          [resource('application.yml')]: `${exposure}: [health, info]`,
          [resource('application-local.properties')]: `${exposure}=*`,
          [resource('application-dev.properties')]: `${exposure}=*`,
          [resource('application-test.properties')]: `${exposure}=*`,
        },
        { jpa: false },
      ),
    ).toEqual([]);
  });
});

describe('error-details', () => {
  const stacktraceFinding = finding({
    rule: 'error-details',
    file: MAIN_PROPERTIES,
    identity: 'server.error.includestacktrace',
    message: 'server.error.include-stacktrace sends stack traces to clients. Use never.',
    line: 1,
  });

  it.each(['always', 'on-param', 'on_param', 'ALWAYS'])('flags %s', (value) => {
    expect(
      read(
        { [resource('application.properties')]: `server.error.include-stacktrace=${value}` },
        { jpa: false },
      ),
    ).toEqual([stacktraceFinding]);
  });

  it('accepts never and exempt profiles', () => {
    expect(
      read(
        {
          [resource('application.properties')]: 'server.error.include-stacktrace=never',
          [resource('application-dev.properties')]: 'server.error.include-stacktrace=always',
          [resource('application-test.properties')]: 'server.error.include-stacktrace=always',
        },
        { jpa: false },
      ),
    ).toEqual([]);
  });
});

describe('literal-secret', () => {
  const secretKeys = [
    ['spring.datasource.password', 'SPRING_DATASOURCE_PASSWORD'],
    ['app.secret', 'APP_SECRET'],
    ['app.api-key', 'APP_APIKEY'],
    ['app.apiKey', 'APP_APIKEY'],
    ['app.apikey', 'APP_APIKEY'],
    ['app.private_key', 'APP_PRIVATE_KEY'],
    ['app.client-secret', 'APP_CLIENTSECRET'],
    ['app.credentials', 'APP_CREDENTIALS'],
    ['jwt.token', 'JWT_TOKEN'],
    ['server.ssl.key-store-password', 'SERVER_SSL_KEYSTOREPASSWORD'],
    ['app.refresh-token', 'APP_REFRESHTOKEN'],
    ['app.service.jwtSecret', 'APP_SERVICE_JWTSECRET'],
    ['spring.cloud.aws.credentials.secret-key', 'SPRING_CLOUD_AWS_CREDENTIALS_SECRETKEY'],
    ['spring.cloud.aws.credentials.access-key', 'SPRING_CLOUD_AWS_CREDENTIALS_ACCESSKEY'],
    ['app.db-password', 'APP_DBPASSWORD'],
  ];

  it.each(secretKeys)('flags a literal in %s without leaking the value', (key, variable) => {
    expect(
      read({ [resource('application.properties')]: `${key}=hunter2value` }, { jpa: false }),
    ).toEqual([secretFinding({ key, variable })]);
  });

  it('flags a literal default inside a placeholder', () => {
    expect(
      read(
        { [resource('application.properties')]: 'spring.datasource.password=${DB_PASS:hunter2}' },
        { jpa: false },
      ),
    ).toEqual([secretFinding({ key: 'spring.datasource.password' })]);
  });

  it('flags YAML values, flow maps and !!str scalars, and ignores other keys', () => {
    const findings = read(
      {
        [resource('application.yml')]: [
          'spring:',
          '  datasource:',
          '    password: "s3cr3t"',
          '    username: admin',
          'app:',
          '  token: ${APP_TOKEN}',
          '  secret:',
          '  token-validity-seconds: 3600',
          '  passwords-file: x',
          '  keys:',
          '    - password',
          '  client: {secret: abc, id: x}',
          '  api-key: !!str 12345abc',
          '  null-password: null',
        ].join('\n'),
      },
      { jpa: false },
    );

    expect(findings).toEqual([
      secretFinding({
        key: 'spring.datasource.password',
        variable: 'SPRING_DATASOURCE_PASSWORD',
        file: resource('application.yml'),
        line: 3,
      }),
      secretFinding({
        key: 'app.client.secret',
        variable: 'APP_CLIENT_SECRET',
        file: resource('application.yml'),
        line: 12,
      }),
      secretFinding({
        key: 'app.api-key',
        variable: 'APP_APIKEY',
        file: resource('application.yml'),
        line: 13,
      }),
    ]);
  });

  it('is exempt in test, local and dev profiles only', () => {
    const findings = read(
      {
        [resource('application-test.properties')]: 'app.password=a',
        [resource('application-local.properties')]: 'app.password=a',
        [resource('application-dev.properties')]: 'app.password=a',
        [resource('application-prod.properties')]: 'app.password=a',
      },
      { jpa: false },
    );

    expect(findings).toEqual([
      secretFinding({
        key: 'app.password',
        variable: 'APP_PASSWORD',
        file: 'src/main/resources/application-prod.properties',
      }),
    ]);
  });

  it('keeps identity independent of the value', () => {
    const first = read(
      { [resource('application.properties')]: 'app.password=one' },
      { jpa: false },
    );
    const second = read(
      { [resource('application.properties')]: 'app.password=two' },
      { jpa: false },
    );

    expect(first).toEqual(second);
  });

  it('judges every secret-looking line of a realistic file', () => {
    const findings = read(
      {
        [resource('application.properties')]: [
          'app.require-password=true',
          'feature.reset-token=header',
          'app.jwt.expiration-token=3600',
          'app.csrf-token=true',
          'spring.datasource.password=@db.password@',
          'app.secret=ENC(abc123)',
          'spring.cloud.config.password={cipher}AQB1',
          'app.user.password={bcrypt}$2a$10$abc',
          'app.token=#{systemProperties.token}',
          'app.api-key=${API_KEY}',
          'app.client-secret=${CLIENT_SECRET:}',
          'spring.datasource.password-file=/run/secrets/db',
          'spring.datasource.password=hunter2',
        ].join('\n'),
      },
      { jpa: false },
    );

    expect(findings).toEqual([
      secretFinding({
        key: 'spring.datasource.password',
        variable: 'SPRING_DATASOURCE_PASSWORD',
        line: 13,
      }),
    ]);
  });
});

describe('Java analyzer declaration', () => {
  it('declares spring as a reported tool', () => {
    expect(createJavaAnalyzer().reportedTools.includes('spring')).toBe(true);
  });

  it('hashes the Spring configuration modules', () => {
    const modules = [
      'languages/java/adapters/java-spring.mjs',
      'languages/java/adapters/spring-config-parser.mjs',
      'languages/java/adapters/spring-secrets.mjs',
    ];

    expect(CONFIGURATION_FILES.filter((file) => modules.includes(file)).sort()).toEqual(modules);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import {
  MAIN_PROPERTIES,
  finding,
  project,
  removeProjects,
  resource,
  secretFinding,
  sourceRoots,
} from './test-support/spring-config-projects.mjs';
import { readSpringConfigFindings } from './java-spring.mjs';

afterEach(removeProjects);

function read(files, options) {
  return readSpringConfigFindings(project(files, options), { sourceRoots });
}

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
      message: `Remove ${flag}=true and restructure the beans; the flag hides wiring problems instead of fixing them.`,
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
        'List only the actuator endpoints you need in management.endpoints.web.exposure.include, for example health,info; * exposes every endpoint.',
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

describe('actuator-exposure: sensitive endpoints and access', () => {
  const exposure = 'management.endpoints.web.exposure.include';
  const sensitive = (names) =>
    `List only health, info and metrics endpoints such as prometheus in management.endpoints.web.exposure.include; ${names} serve configuration, heap or thread contents, or control of the running application.`;
  const actuator = (line, identity, message) =>
    finding({ rule: 'actuator-exposure', file: MAIN_PROPERTIES, identity, message, line });
  const relaxed = (key) => key.replaceAll('-', '');

  it('names the sensitive endpoints a production file exposes', () => {
    const text = `${exposure}=health,info,env,heapdump,shutdown`;

    expect(read({ [resource('application.properties')]: text }, { jpa: false })).toEqual([
      actuator(1, exposure, sensitive('env, heapdump, shutdown')),
    ]);
  });

  it.each([
    [
      'management.endpoints.access.default=unrestricted',
      'Leave management.endpoints.access.default unset, or set it to read-only, and open single endpoints with management.endpoint.<id>.access; unrestricted also opens the shutdown and heapdump endpoints.',
    ],
    [
      'management.endpoint.shutdown.access=unrestricted',
      'Set management.endpoint.shutdown.access to none, or remove it; unrestricted lets callers stop the application or download its memory.',
    ],
    [
      'management.endpoint.heapdump.access=read-only',
      'Set management.endpoint.heapdump.access to none, or remove it; read-only lets callers stop the application or download its memory.',
    ],
    [
      'management.endpoint.shutdown.enabled=true',
      'Remove management.endpoint.shutdown.enabled=true; it turns the shutdown endpoint on.',
    ],
    [
      'management.endpoints.enabled-by-default=true',
      'Remove management.endpoints.enabled-by-default=true; it turns the shutdown endpoint on.',
    ],
  ])('flags %s', (line, message) => {
    const key = line.split('=')[0];

    expect(read({ [resource('application.properties')]: line }, { jpa: false })).toEqual([
      actuator(1, relaxed(key), message),
    ]);
  });

  it('accepts health, info and metrics, closed access, and local profiles', () => {
    expect(
      read(
        {
          [resource('application.properties')]: [
            `${exposure}=health,info,prometheus,metrics`,
            'management.endpoint.shutdown.access=none',
            'management.endpoints.access.default=read-only',
            'management.endpoint.loggers.access=unrestricted',
          ].join('\n'),
          [resource('application-local.properties')]: `${exposure}=env,heapdump`,
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
    message:
      'Set server.error.include-stacktrace=never; other values send stack traces to clients.',
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

import { afterEach, describe, expect, it } from 'vitest';
import {
  MAIN_PROPERTIES,
  finding,
  project,
  removeProjects,
  resource,
  sourceRoots,
} from '../test-support/spring-config-projects.mjs';
import { readSpringConfigFindings } from '../java-spring.mjs';

afterEach(removeProjects);

function relaxed(key) {
  return key.toLowerCase().replaceAll(/[-_]/g, '');
}

function read(files) {
  return readSpringConfigFindings(project(files, { jpa: false }), { sourceRoots });
}

function only(name, text) {
  return read({ [resource(name)]: text });
}

const PROFILE_ADVICE = {
  'spring.profiles.active':
    'Set SPRING_PROFILES_ACTIVE in each deployment instead, or spring.profiles.default for a fallback that a deployment can override.',
  'spring.profiles.include':
    'Name them in a spring.profiles.group entry instead, and activate that group with SPRING_PROFILES_ACTIVE in each deployment.',
};

describe('active-profile', () => {
  const profileFinding = (key, line = 1, file = MAIN_PROPERTIES) =>
    finding({
      rule: 'active-profile',
      file,
      identity: relaxed(key),
      message: `${PROFILE_ADVICE[key]} ${key} in the packaged main file turns those profiles on in every environment.`,
      line,
    });

  it.each(['spring.profiles.active', 'spring.profiles.include'])(
    'flags %s in the main file',
    (key) => {
      expect(only('application.properties', `${key}=dev`)).toEqual([profileFinding(key)]);
    },
  );

  it('flags a literal list and a placeholder that defaults to a profile', () => {
    expect(
      only('application.yml', 'spring:\n  profiles:\n    active:\n      - dev\n      - h2\n').map(
        (item) => item.location.line,
      ),
    ).toEqual([4, 5]);
    expect(only('application.properties', 'spring.profiles.active=${PROFILE:prod}')).toEqual([
      profileFinding('spring.profiles.active'),
    ]);
  });

  it('reports a flow list once for its line', () => {
    expect(only('application.yml', 'spring:\n  profiles:\n    active: [dev, h2]\n')).toEqual([
      profileFinding('spring.profiles.active', 3, 'src/main/resources/application.yml'),
    ]);
  });

  it.each(['', '${SPRING_PROFILES_ACTIVE}', '${PROFILE:}', '@spring.profiles.active@'])(
    'accepts the environment: %j',
    (value) => {
      expect(only('application.properties', `spring.profiles.active=${value}`)).toEqual([]);
    },
  );

  it('ignores profile files, profile documents and other resources', () => {
    expect(
      read({
        [resource('application-dev.properties')]: 'spring.profiles.include=h2',
        [resource('application.yml')]:
          'a: 1\n---\nspring.config.activate.on-profile: dev\nspring.profiles.include: h2\n',
      }),
    ).toEqual([]);
  });
});

describe('unsafe-diagnostics', () => {
  const diagnostic = (key, message, line = 1) =>
    finding({
      rule: 'unsafe-diagnostics',
      file: MAIN_PROPERTIES,
      identity: relaxed(key),
      message,
      line,
    });

  it.each([
    [
      'spring.jpa.show-sql=true',
      diagnostic(
        'spring.jpa.show-sql',
        'Log SQL with the logging.level.org.hibernate.SQL logger in a local profile and remove spring.jpa.show-sql=true, which prints SQL to standard output, outside logging.',
      ),
    ],
    [
      'logging.level.org.hibernate.orm.jdbc.bind=TRACE',
      diagnostic(
        'logging.level.org.hibernate.orm.jdbc.bind',
        'Leave logging.level.org.hibernate.orm.jdbc.bind at its default level; TRACE logs bound SQL values, including passwords and personal data.',
      ),
    ],
    [
      'logging.level.org.hibernate.type.descriptor.sql.BasicBinder=trace',
      diagnostic(
        'logging.level.org.hibernate.type.descriptor.sql.BasicBinder',
        'Leave logging.level.org.hibernate.type.descriptor.sql.BasicBinder at its default level; trace logs bound SQL values, including passwords and personal data.',
      ),
    ],
    [
      'management.endpoint.env.show-values=ALWAYS',
      diagnostic(
        'management.endpoint.env.show-values',
        'Set management.endpoint.env.show-values to when-authorized or never; always serves internals to every caller.',
      ),
    ],
    [
      'management.endpoint.health.show-details=always',
      diagnostic(
        'management.endpoint.health.show-details',
        'Set management.endpoint.health.show-details to when-authorized or never; always serves internals to every caller.',
      ),
    ],
    [
      'spring.h2.console.enabled=true',
      diagnostic(
        'spring.h2.console.enabled',
        'Enable spring.h2.console.enabled only in a local profile; it opens the H2 web console.',
      ),
    ],
    [
      'spring.jpa.show-sql=${SHOW_SQL:true}',
      diagnostic(
        'spring.jpa.show-sql',
        'Log SQL with the logging.level.org.hibernate.SQL logger in a local profile and remove spring.jpa.show-sql=true, which prints SQL to standard output, outside logging.',
      ),
    ],
    [
      'logging.level.org.hibernate.type=TRACE',
      diagnostic(
        'logging.level.org.hibernate.type',
        'Leave logging.level.org.hibernate.type at its default level; TRACE logs bound SQL values, including passwords and personal data.',
      ),
    ],
    [
      'logging.level.root=all',
      diagnostic(
        'logging.level.root',
        'Leave logging.level.root at its default level; all logs bound SQL values, including passwords and personal data.',
      ),
    ],
  ])('flags %s', (line, expected) => {
    expect(only('application.properties', line)).toEqual([expected]);
  });

  it.each([
    'logging.level.org=info',
    'logging.level.org.hibernate.SQL=trace',
    'spring.jpa.show-sql=${SHOW_SQL}',
    'spring.jpa.show-sql=false',
    'spring.jpa.show-sql=${SHOW_SQL:false}',
    'logging.level.org.hibernate.orm.jdbc.bind=INFO',
    'logging.level.org.hibernate.SQL=debug',
    'management.endpoint.health.show-details=when-authorized',
    'management.endpoint.env.show-values=never',
    'spring.h2.console.enabled=false',
  ])('accepts %s', (line) => {
    expect(only('application.properties', line)).toEqual([]);
  });

  it('allows them in local, dev and test profiles', () => {
    expect(
      read({
        [resource('application-local.properties')]: 'spring.jpa.show-sql=true',
        [resource('application-dev.yml')]: 'spring.h2.console.enabled: true',
        [resource('application-test.properties')]:
          'logging.level.org.hibernate.orm.jdbc.bind=TRACE',
      }),
    ).toEqual([]);
  });
});

describe('error-details beyond the stack trace', () => {
  const detail = (key, message) =>
    finding({ rule: 'error-details', file: MAIN_PROPERTIES, identity: key, message, line: 1 });

  it.each([
    [
      'server.error.include-message=always',
      'server.error.includemessage',
      'Set server.error.include-message=never and return a fixed ProblemDetail from a @RestControllerAdvice; other values send exception messages to clients.',
    ],
    [
      'server.error.include-binding-errors=on-param',
      'server.error.includebindingerrors',
      'Set server.error.include-binding-errors=never and report field errors from a @RestControllerAdvice; other values send rejected values to clients.',
    ],
    [
      'server.error.include-message=${INCLUDE_MESSAGE:always}',
      'server.error.includemessage',
      'Set server.error.include-message=never and return a fixed ProblemDetail from a @RestControllerAdvice; other values send exception messages to clients.',
    ],
    [
      'server.error.include-exception=true',
      'server.error.includeexception',
      'Set server.error.include-exception=false; true sends exception class names to clients.',
    ],
  ])('flags %s', (line, identity, message) => {
    expect(only('application.properties', line)).toEqual([detail(identity, message)]);
  });

  it('accepts never and false', () => {
    expect(
      only(
        'application.properties',
        'server.error.include-message=never\nserver.error.include-exception=false',
      ),
    ).toEqual([]);
  });
});

describe('credentials in URLs', () => {
  const urlFinding = (key, identity = key) =>
    finding({
      rule: 'literal-secret',
      file: MAIN_PROPERTIES,
      identity,
      message: `Supply the credential in ${key} from the environment, for example through a placeholder without a default, and take it out of the URL.`,
      line: 1,
    });

  it.each([
    'jdbc:postgresql://db:5432/shop?user=shop&password=Sup3rS3cret',
    'jdbc:sqlserver://db;user=shop;password=Sup3rS3cret',
    'mongodb://app:Sup3rS3cret@mongo:27017/shop',
    'redis://:Sup3rS3cret@cache:6379',
    '${DB_URL:jdbc:postgresql://db/shop?password=Sup3rS3cret}',
  ])('flags %s', (url) => {
    expect(only('application.properties', `spring.datasource.url=${url}`)).toEqual([
      urlFinding('spring.datasource.url', 'spring.datasource.url'),
    ]);
  });

  it.each([
    'jdbc:postgresql://db:5432/shop',
    'jdbc:postgresql://db:5432/shop?user=shop&password=${DB_PASSWORD}',
    'mongodb://app:${MONGO_PASSWORD}@mongo:27017/shop',
    'https://example.com/path?token=${TOKEN}',
    'jdbc:postgresql://user@host/db',
  ])('accepts %s', (url) => {
    expect(only('application.properties', `spring.datasource.url=${url}`)).toEqual([]);
  });

  it('is exempt in local profiles', () => {
    expect(
      read({
        [resource('application-local.properties')]:
          'spring.datasource.url=jdbc:h2:mem:db?password=sa',
      }),
    ).toEqual([]);
  });
});

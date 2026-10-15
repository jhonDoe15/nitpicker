import { afterEach, describe, expect, it } from 'vitest';
import {
  MAIN_PROPERTIES,
  finding,
  project,
  removeProjects,
  resource,
  sourceRoots,
} from '../../fixtures/spring-config-projects.mjs';
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

describe('active-profile', () => {
  const profileFinding = (key, line = 1, file = MAIN_PROPERTIES) =>
    finding({
      rule: 'active-profile',
      file,
      identity: relaxed(key),
      message: `${key} in the packaged main file turns those profiles on in every environment. Set SPRING_PROFILES_ACTIVE in each deployment instead.`,
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
        'spring.jpa.show-sql=true prints SQL to standard output, outside logging. Remove it, and use the logging.level.org.hibernate.SQL logger in a local profile.',
      ),
    ],
    [
      'logging.level.org.hibernate.orm.jdbc.bind=TRACE',
      diagnostic(
        'logging.level.org.hibernate.orm.jdbc.bind',
        'logging.level.org.hibernate.orm.jdbc.bind=TRACE logs bound SQL values, including passwords and personal data. Leave the level at its default.',
      ),
    ],
    [
      'logging.level.org.hibernate.type.descriptor.sql.BasicBinder=trace',
      diagnostic(
        'logging.level.org.hibernate.type.descriptor.sql.BasicBinder',
        'logging.level.org.hibernate.type.descriptor.sql.BasicBinder=trace logs bound SQL values, including passwords and personal data. Leave the level at its default.',
      ),
    ],
    [
      'management.endpoint.env.show-values=ALWAYS',
      diagnostic(
        'management.endpoint.env.show-values',
        'management.endpoint.env.show-values=always serves internals to every caller. Use when-authorized, or never.',
      ),
    ],
    [
      'management.endpoint.health.show-details=always',
      diagnostic(
        'management.endpoint.health.show-details',
        'management.endpoint.health.show-details=always serves internals to every caller. Use when-authorized, or never.',
      ),
    ],
    [
      'spring.h2.console.enabled=true',
      diagnostic(
        'spring.h2.console.enabled',
        'spring.h2.console.enabled=true opens the H2 web console. Enable it only in a local profile.',
      ),
    ],
  ])('flags %s', (line, expected) => {
    expect(only('application.properties', line)).toEqual([expected]);
  });

  it.each([
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
      'server.error.include-message sends exception messages to clients. Use never, and return a fixed ProblemDetail from a @RestControllerAdvice.',
    ],
    [
      'server.error.include-binding-errors=on-param',
      'server.error.includebindingerrors',
      'server.error.include-binding-errors sends rejected values to clients. Use never, and report field errors from a @RestControllerAdvice.',
    ],
    [
      'server.error.include-exception=true',
      'server.error.includeexception',
      'server.error.include-exception sends exception class names to clients. Use false.',
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
      message: `${key} embeds a credential in its URL. Take it out of the URL and supply it from the environment, for example through a placeholder without a default.`,
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

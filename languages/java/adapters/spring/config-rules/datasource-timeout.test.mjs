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
import { DATASOURCE_TIMEOUT_MESSAGE } from './datasource-timeout.mjs';

afterEach(removeProjects);

const RULE = 'datasource-without-timeout';
const URL = 'spring.datasource.url=jdbc:postgresql://db:5432/shop';

function timeouts(files) {
  return readSpringConfigFindings(project(files, { jpa: false }), { sourceRoots }).filter(
    (found) => found.rule === RULE,
  );
}

function urlFinding(file, line, identity = 'spring.datasource.url') {
  return finding({ rule: RULE, file, identity, message: DATASOURCE_TIMEOUT_MESSAGE, line });
}

describe('datasource-without-timeout', () => {
  it('flags each server URL when no live profile sets a query deadline', () => {
    expect(
      timeouts({
        [resource('application.properties')]: `server.port=8080\n${URL}`,
        [resource('application-prod.yml')]:
          'spring:\n  datasource:\n    hikari:\n      jdbc-url: ${DATABASE_URL}\n',
        [resource('application-test.properties')]: 'spring.transaction.default-timeout=5s',
      }),
    ).toEqual([
      urlFinding(resource('application-prod.yml'), 4, 'spring.datasource.hikari.jdbcurl'),
      urlFinding(MAIN_PROPERTIES, 2),
    ]);
  });

  it.each([
    'spring.jpa.properties.jakarta.persistence.query.timeout=30000',
    'spring.jpa.properties.javax.persistence.query.timeout=30000',
    'spring.transaction.default-timeout=30s',
    'spring.transaction.defaultTimeout=${TX_TIMEOUT}',
    'spring.jdbc.template.query-timeout=30s',
    'spring.datasource.hikari.data-source-properties.socketTimeout=30',
    'spring.datasource.hikari.data-source-properties.options=-c statement_timeout=30000',
    'spring.datasource.hikari.connection-init-sql=SET SESSION max_execution_time=30000',
  ])('accepts %s', (line) => {
    expect(timeouts({ [resource('application.properties')]: `${URL}\n${line}` })).toEqual([]);
  });

  it.each([
    'jdbc:postgresql://db/shop?socketTimeout=30',
    'jdbc:mysql://db/shop?connectTimeout=5000&socketTimeout=30000',
    'jdbc:postgresql://db/shop?options=-c%20statement_timeout=30000',
    'jdbc:h2:mem:shop',
    '${DB_URL:jdbc:h2:mem:shop}',
  ])('accepts the URL %s', (url) => {
    expect(
      timeouts({ [resource('application.properties')]: `spring.datasource.url=${url}` }),
    ).toEqual([]);
  });

  it('takes a timeout from a profile file, and ignores one set to zero', () => {
    expect(
      timeouts({
        [resource('application.properties')]: URL,
        [resource('application-prod.properties')]: 'spring.transaction.default-timeout=30s',
      }),
    ).toEqual([]);
    expect(
      timeouts({
        [resource('application.properties')]: `${URL}\nspring.transaction.default-timeout=0`,
      }),
    ).toEqual([urlFinding(MAIN_PROPERTIES, 1)]);
  });

  it('is exempt in test, local and dev profiles', () => {
    expect(
      timeouts({
        [resource('application-local.properties')]: URL,
        [resource('application-dev.properties')]: URL,
        [resource('application-test.properties')]: URL,
      }),
    ).toEqual([]);
  });
});

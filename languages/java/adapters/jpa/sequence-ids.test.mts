import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withoutMysqlSequenceIds, SEQUENCE_RULE } from './sequence-ids.mts';
import type { JavaFinding } from '../typed/java-values.mts';

const ENTITY_FILE = 'src/main/java/shop/Order.java';
const FINDING: JavaFinding = { tool: 'pmd', rule: SEQUENCE_RULE, path: ENTITY_FILE };
const MYSQL_DRIVER = "dependencies { runtimeOnly 'com.mysql:mysql-connector-j:9.1.0' }\n";
const MYSQL_MAVEN =
  '<dependency><groupId>mysql</groupId><artifactId>mysql-connector-java</artifactId></dependency>\n';
const MARIADB_DRIVER =
  "dependencies { runtimeOnly 'org.mariadb.jdbc:mariadb-java-client:3.4.0' }\n";
const POSTGRES_DRIVER = "dependencies { runtimeOnly 'org.postgresql:postgresql:42.7.4' }\n";

function keptIn(files: Readonly<Record<string, string>>, found: JavaFinding): string[] {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'jpa-sequences-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      const file = path.join(projectRoot, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    return withoutMysqlSequenceIds([found], { projectRoot }).map(({ rule }) => rule);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

function kept(files: Readonly<Record<string, string>>): string[] {
  return keptIn(files, FINDING);
}

describe('withoutMysqlSequenceIds', () => {
  it.each([
    ['a MySQL driver in the Gradle build', { 'build.gradle': MYSQL_DRIVER }],
    ['a MySQL driver in the Maven build', { 'pom.xml': MYSQL_MAVEN }],
    [
      'a MySQL datasource url',
      {
        'src/main/resources/application.properties': 'spring.datasource.url=jdbc:mysql://db/shop\n',
      },
    ],
    [
      'a MySQL dialect in persistence.xml',
      {
        'src/main/resources/META-INF/persistence.xml':
          '<property name="hibernate.dialect" value="org.hibernate.dialect.MySQL57Dialect"/>\n',
      },
    ],
    [
      'a MySQL dialect in a Play configuration',
      { 'conf/application.conf': 'jpa.dialect=org.hibernate.dialect.MySQL5InnoDBDialect\n' },
    ],
  ])('drops the finding for %s', (_, files) => {
    expect(kept(files)).toEqual([]);
  });

  it.each([
    ['a project with no database signal', { 'build.gradle': "plugins { id 'java' }\n" }],
    ['a MariaDB driver, which has sequences', { 'build.gradle': MARIADB_DRIVER }],
    [
      'a MariaDB datasource url',
      { 'application.properties': 'spring.datasource.url=jdbc:mariadb://db/shop\n' },
    ],
    [
      'a MySQL url that is only commented out',
      {
        'build.gradle': "plugins { id 'java' }\n",
        'application.properties': '#spring.datasource.url=jdbc:mysql://db/shop\n',
      },
    ],
    ['a PostgreSQL driver', { 'build.gradle': POSTGRES_DRIVER }],
    [
      'a MySQL driver beside a PostgreSQL driver',
      { 'build.gradle': MYSQL_DRIVER + POSTGRES_DRIVER },
    ],
    [
      'a PostgreSQL dialect',
      {
        'src/main/resources/application.properties':
          'spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect\n',
      },
    ],
  ])('keeps the finding for %s', (_, files) => {
    expect(kept(files)).toEqual([SEQUENCE_RULE]);
  });

  it('keeps findings of other rules in a MySQL project', () => {
    const other: JavaFinding = { tool: 'pmd', rule: 'JpaVersion', path: ENTITY_FILE };
    expect(keptIn({ 'build.gradle': MYSQL_DRIVER }, other)).toEqual(['JpaVersion']);
  });
});

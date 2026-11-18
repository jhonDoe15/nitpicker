import path from 'node:path';
import { readSource } from '../migrations/revision-graph.mjs';

const POSTGRES = 'postgres';
const MYSQL = 'mysql';
const MARIADB = 'mariadb';
const UNKNOWN = 'unknown';
const COMMENT_LINES = /^[ \t]*(?:#|\/\/|--).*$/gmu;
const XML_COMMENTS = /<!--[\s\S]*?-->/gu;
const TEST_SOURCES = /(?:^|\/)src\/test\//u;
const MYSQL_PROVIDER = /\bprovider\s*=\s*"mysql"/u;
const RELATION_MODE = /\brelationMode\s*=\s*"prisma"/u;
const DIALECT_KEY = String.raw`(?:dialect|database-platform)["']?\s*(?:[=:]|value=)\s*["']?[\w.]*`;
const MYSQL_DIALECT = `${DIALECT_KEY}(?:MySQL|MariaDB)`;
const POSTGRES_DIALECT = `${DIALECT_KEY}PostgreSQL`;
const SIGNAL_FILES = [
  {
    matches: (base) => base === 'package.json',
    postgres:
      /"(?:pg|pg-promise|postgres|@neondatabase\/serverless|@vercel\/postgres|slonik)"\s*:/u,
    mysql: /"(?:mysql2?|mariadb|@planetscale\/database)"\s*:/u,
    mariadb: /"mariadb"\s*:/u,
  },
  {
    matches: (base) => base.endsWith('.prisma'),
    postgres: /\bprovider\s*=\s*"(?:postgresql|postgres|cockroachdb)"/u,
    mysql: { test: (text) => MYSQL_PROVIDER.test(text) && !RELATION_MODE.test(text) },
  },
  {
    matches: (base) =>
      /^(?:application.*\.(?:properties|ya?ml|conf)|persistence\.xml|hibernate\.properties)$/u.test(
        base,
      ),
    postgres: new RegExp(String.raw`jdbc:postgresql:|r2dbc:postgresql:|${POSTGRES_DIALECT}`, 'iu'),
    mysql: new RegExp(
      String.raw`jdbc:(?:mysql|mariadb):|r2dbc:(?:mysql|mariadb):|${MYSQL_DIALECT}`,
      'iu',
    ),
    mariadb: new RegExp(String.raw`jdbc:mariadb:|r2dbc:mariadb:|${DIALECT_KEY}MariaDB`, 'iu'),
  },
  {
    matches: (base) =>
      /^(?:build\.gradle(?:\.kts)?|pom\.xml)$/u.test(base) || base.endsWith('.versions.toml'),
    postgres: /org\.postgresql/u,
    mysql: /mysql-connector|org\.mariadb/u,
    mariadb: /org\.mariadb/u,
  },
  {
    matches: (base) => /^(?:pyproject\.toml|requirements.*\.txt|Pipfile|setup\.cfg)$/u.test(base),
    postgres: /\b(?:psycopg2?(?:-binary)?|asyncpg|pg8000)\b/u,
    mysql: /\b(?:pymysql|mysqlclient|aiomysql|asyncmy|mysql-connector-python)\b/iu,
  },
  {
    matches: (base) => base === 'go.mod',
    postgres: /gorm\.io\/driver\/postgres|jackc\/pgx|lib\/pq/u,
    mysql: /gorm\.io\/driver\/mysql|go-sql-driver\/mysql/u,
  },
];

function signalsByFolder(projectRoot, files) {
  const folders = new Map();
  for (const file of files.filter((name) => !TEST_SOURCES.test(name))) {
    const signal = SIGNAL_FILES.find(({ matches }) => matches(path.posix.basename(file)));
    const text = signal === undefined ? undefined : readSource(projectRoot, file);
    if (text !== undefined) {
      const folder = path.posix.dirname(file);
      const code = text.replace(XML_COMMENTS, '').replace(COMMENT_LINES, '');
      const found = folders.get(folder) ?? { postgres: false, mysql: false, mysqlOnly: false };
      const mariadb = signal.mariadb?.test(code) === true;
      found.postgres ||= signal.postgres.test(code);
      found.mysql ||= signal.mysql.test(code);
      found.mysqlOnly ||= signal.mysql.test(code) && !mariadb;
      folders.set(folder, found);
    }
  }
  return folders;
}

function kindOf(found, separateMariadb) {
  if (found?.postgres === true) {
    return POSTGRES;
  }
  if (found?.mysql !== true) {
    return UNKNOWN;
  }
  return separateMariadb && !found.mysqlOnly ? MARIADB : MYSQL;
}

export function ancestorFolders(file) {
  const parts = file.split('/').slice(0, -1);
  return [...[...parts.keys()].map((index) => parts.slice(0, parts.length - index).join('/')), '.'];
}

export function databaseKinds(projectRoot, files, { separateMariadb = false } = {}) {
  const folders = signalsByFolder(projectRoot, files);
  const all = [...folders.values()];
  const overall = kindOf(
    {
      postgres: all.some((found) => found.postgres),
      mysql: all.some((found) => found.mysql),
      mysqlOnly: all.some((found) => found.mysqlOnly),
    },
    separateMariadb,
  );
  return (file) =>
    ancestorFolders(file)
      .map((folder) => kindOf(folders.get(folder), separateMariadb))
      .find((kind) => kind !== UNKNOWN) ?? overall;
}

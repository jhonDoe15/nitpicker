import path from 'node:path';
import { readSource } from '../migrations/revision-graph.mjs';

const POSTGRES = 'postgres';
const MYSQL = 'mysql';
const UNKNOWN = 'unknown';
const MYSQL_PROVIDER = /\bprovider\s*=\s*"mysql"/u;
const RELATION_MODE = /\brelationMode\s*=\s*"prisma"/u;
const SIGNAL_FILES = [
  {
    matches: (base) => base === 'package.json',
    postgres:
      /"(?:pg|pg-promise|postgres|@neondatabase\/serverless|@vercel\/postgres|slonik)"\s*:/u,
    mysql: /"(?:mysql2?|mariadb|@planetscale\/database)"\s*:/u,
  },
  {
    matches: (base) => base.endsWith('.prisma'),
    postgres: /\bprovider\s*=\s*"(?:postgresql|postgres|cockroachdb)"/u,
    mysql: { test: (text) => MYSQL_PROVIDER.test(text) && !RELATION_MODE.test(text) },
  },
  {
    matches: (base) => /^application.*\.(?:properties|ya?ml)$/u.test(base),
    postgres: /jdbc:postgresql:|r2dbc:postgresql:/u,
    mysql: /jdbc:(?:mysql|mariadb):|r2dbc:(?:mysql|mariadb):/u,
  },
  {
    matches: (base) => /^(?:build\.gradle(?:\.kts)?|pom\.xml)$/u.test(base),
    postgres: /org\.postgresql/u,
    mysql: /mysql-connector|org\.mariadb/u,
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

export function databaseKind(projectRoot, files) {
  const found = { postgres: false, mysql: false };
  for (const file of files) {
    const signal = SIGNAL_FILES.find(({ matches }) => matches(path.posix.basename(file)));
    const text = signal === undefined ? undefined : readSource(projectRoot, file);
    if (text !== undefined) {
      found.postgres ||= signal.postgres.test(text);
      found.mysql ||= signal.mysql.test(text);
    }
  }
  if (found.postgres) {
    return POSTGRES;
  }
  return found.mysql ? MYSQL : UNKNOWN;
}

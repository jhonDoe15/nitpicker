import { readFileSync } from 'node:fs';
import { blankLiterals, pathInside } from '../review-rules/java-sources.mjs';

const ENTITY_ANNOTATIONS = new Set([
  'jakarta.persistence.Entity',
  'javax.persistence.Entity',
  'jakarta.persistence.MappedSuperclass',
  'javax.persistence.MappedSuperclass',
  'org.springframework.data.mongodb.core.mapping.Document',
  'org.springframework.data.relational.core.mapping.Table',
  'org.springframework.data.cassandra.core.mapping.Table',
  'org.springframework.data.elasticsearch.annotations.Document',
  'org.springframework.data.couchbase.core.mapping.Document',
  'org.springframework.data.redis.core.RedisHash',
  'org.springframework.data.neo4j.core.schema.Node',
]);
const READ_MODEL_ANNOTATIONS = new Set([
  'org.hibernate.annotations.Immutable',
  'org.hibernate.annotations.Subselect',
  'org.hibernate.annotations.View',
]);
const REPOSITORY_ANNOTATION = 'org.springframework.stereotype.Repository';
const ENTITY_SUPERTYPES = [
  'org.jetbrains.exposed.sql.Table',
  'org.jetbrains.exposed.dao.id.IdTable',
  'org.jetbrains.exposed.dao.id.IntIdTable',
  'org.jetbrains.exposed.dao.id.LongIdTable',
  'org.jetbrains.exposed.dao.id.UUIDTable',
  'org.jetbrains.exposed.dao.Entity',
  'org.jetbrains.exposed.dao.IntEntity',
  'org.jetbrains.exposed.dao.LongEntity',
  'org.jetbrains.exposed.dao.UUIDEntity',
];
const DATA_ACCESS_CLASSES = new Set([
  'jakarta.persistence.EntityManager',
  'javax.persistence.EntityManager',
  'org.hibernate.Session',
  'org.hibernate.StatelessSession',
  'java.sql.Connection',
  'java.sql.PreparedStatement',
  'java.sql.Statement',
  'javax.sql.DataSource',
  'org.springframework.jdbc.core.JdbcTemplate',
  'org.springframework.jdbc.core.JdbcOperations',
  'org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate',
  'org.springframework.jdbc.core.namedparam.NamedParameterJdbcOperations',
  'org.springframework.jdbc.core.simple.JdbcClient',
  'org.springframework.jdbc.core.simple.SimpleJdbcInsert',
  'org.springframework.r2dbc.core.DatabaseClient',
  'org.springframework.data.jdbc.core.JdbcAggregateTemplate',
  'org.springframework.data.r2dbc.core.R2dbcEntityTemplate',
  'org.springframework.data.mongodb.core.MongoTemplate',
  'org.springframework.data.mongodb.core.MongoOperations',
  'org.springframework.data.mongodb.core.ReactiveMongoTemplate',
  'org.jooq.DSLContext',
  'org.jdbi.v3.core.Jdbi',
  'org.jdbi.v3.core.Handle',
]);
const DECLARATION_HEADER = /\b(?:class|interface|object)\s+[\w$]+([^{;]*)/gu;
const PARAMETERS = /\([^()]*\)/gu;

function isSpringDataRepository(className) {
  return (
    className.startsWith('org.springframework.data.') &&
    className.includes('.repository.') &&
    className.endsWith('Repository')
  );
}

function simpleName(className) {
  return className.slice(className.lastIndexOf('.') + 1).split('$')[0];
}

function supertypeReader(projectRoot) {
  const headers = new Map();
  return (file) => {
    if (!headers.has(file)) {
      const text = blankLiterals(readFileSync(pathInside(projectRoot, file), 'utf8'));
      const found = [...text.matchAll(DECLARATION_HEADER)].map((match) =>
        match[1].replaceAll(PARAMETERS, '').replaceAll(PARAMETERS, ''),
      );
      headers.set(file, found.join('\n'));
    }
    return headers.get(file);
  };
}

function declaresSupertype(headers, file, className) {
  return new RegExp(`\\b${simpleName(className)}\\b`, 'u').test(headers(file));
}

function evidenceOf(library, { headers, file }) {
  if (READ_MODEL_ANNOTATIONS.has(library)) {
    return 'read-model';
  }
  if (ENTITY_ANNOTATIONS.has(library)) {
    return 'entity';
  }
  if (ENTITY_SUPERTYPES.includes(library) && declaresSupertype(headers, file, library)) {
    return 'entity';
  }
  const repository =
    library === REPOSITORY_ANNOTATION ||
    (isSpringDataRepository(library) && declaresSupertype(headers, file, library));
  return repository || DATA_ACCESS_CLASSES.has(library) ? 'data-access' : undefined;
}

function strongest(kinds) {
  if (kinds.has('read-model')) {
    return undefined;
  }
  return kinds.has('entity') ? 'entity' : [...kinds][0];
}

export function persistenceOf({ libraryEdges }, projectRoot) {
  const headers = supertypeReader(projectRoot);
  const kinds = new Map();
  for (const { source, library } of libraryEdges) {
    const kind = evidenceOf(library, { headers, file: source.file });
    if (kind !== undefined) {
      kinds.set(source.file, new Set([...(kinds.get(source.file) ?? []), kind]));
    }
  }
  return new Map(
    [...kinds]
      .map(([file, found]) => [file, strongest(found)])
      .filter(([, kind]) => kind !== undefined),
  );
}

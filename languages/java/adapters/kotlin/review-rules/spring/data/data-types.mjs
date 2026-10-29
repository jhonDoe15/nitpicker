import { group } from '../spring-types.mjs';

const DATA = 'org.springframework.data';
const HIBERNATE = 'org.hibernate.annotations';

function persistence(...names) {
  return new Set(
    names.flatMap((name) => [`jakarta.persistence.${name}`, `javax.persistence.${name}`]),
  );
}

export const ENTITY = persistence('Entity');
export const ENTITY_CLASSES = persistence('Entity', 'MappedSuperclass');
export const COLUMN_HOLDERS = persistence('Entity', 'MappedSuperclass', 'Embeddable');
export const TO_ONE = persistence('ManyToOne', 'OneToOne');
export const TO_MANY = persistence('OneToMany', 'ManyToMany', 'ElementCollection');
export const MANY_TO_MANY = persistence('ManyToMany');
export const ORDER_COLUMN = persistence('OrderColumn');
export const IDS = persistence('Id', 'EmbeddedId');
export const VERSION = persistence('Version');
export const GENERATED_VALUE = persistence('GeneratedValue');
export const ENUMERATED = persistence('Enumerated');
export const MAP_KEY_ENUMERATED = persistence('MapKeyEnumerated');
export const ELEMENT_COLLECTION = persistence('ElementCollection');
export const QUERY_TYPES = persistence('Query', 'TypedQuery');
export const IMMUTABLE = group([`${HIBERNATE}.Immutable`]);
export const NOT_COLUMNS = group([
  ...persistence('Transient', 'Convert'),
  'kotlin.jvm.Transient',
  `${HIBERNATE}.JdbcTypeCode`,
  `${HIBERNATE}.JdbcType`,
  `${HIBERNATE}.Type`,
]);
export const JDK_ENUMS = group([
  'java.time.DayOfWeek',
  'java.time.Month',
  'java.time.temporal.ChronoUnit',
  'java.util.concurrent.TimeUnit',
  'java.math.RoundingMode',
]);

export const JPA_QUERY = group([`${DATA}.jpa.repository.Query`]);
export const NATIVE_QUERY = group([`${DATA}.jpa.repository.NativeQuery`]);
export const MODIFYING = group([`${DATA}.jpa.repository.Modifying`]);
export const QUERY_ANNOTATIONS = group([
  `${DATA}.jpa.repository.Query`,
  `${DATA}.jpa.repository.NativeQuery`,
  `${DATA}.jpa.repository.query.Procedure`,
  `${DATA}.jpa.repository.Procedure`,
  `${DATA}.jdbc.repository.query.Query`,
  `${DATA}.r2dbc.repository.Query`,
  `${DATA}.mongodb.repository.Query`,
  `${DATA}.mongodb.repository.Aggregation`,
  `${DATA}.neo4j.repository.query.Query`,
  `${DATA}.cassandra.repository.Query`,
  `${DATA}.couchbase.repository.Query`,
  `${DATA}.elasticsearch.annotations.Query`,
]);
export const SUPPRESS = group(['kotlin.Suppress', 'java.lang.SuppressWarnings']);

export const INHERITED_METHODS = group([
  'findById',
  'findAll',
  'findAllById',
  'findOne',
  'findBy',
  'count',
  'exists',
  'existsById',
  'save',
  'saveAll',
  'saveAndFlush',
  'saveAllAndFlush',
  'delete',
  'deleteById',
  'deleteAll',
  'deleteAllById',
  'deleteAllInBatch',
  'deleteAllByIdInBatch',
  'getReferenceById',
]);
export const ENTITY_WRITES = group([
  'save',
  'saveAndFlush',
  'delete',
  'deleteById',
  'persist',
  'merge',
  'remove',
]);
export const STANDARD_WRITES = group([
  'save',
  'saveAndFlush',
  'saveAll',
  'saveAllAndFlush',
  'delete',
  'deleteById',
  'deleteAll',
  'deleteAllById',
  'deleteAllInBatch',
  'deleteAllByIdInBatch',
  'flush',
]);
export const BATCH_WRITES = group([
  'saveAll',
  'saveAllAndFlush',
  'deleteAll',
  'deleteAllById',
  'deleteAllInBatch',
]);
export const FLUSHES = group(['saveAndFlush', 'saveAllAndFlush', 'flush']);
export const COLLECTION_TYPES = group([
  'List',
  'MutableList',
  'ArrayList',
  'Set',
  'MutableSet',
  'HashSet',
  'LinkedHashSet',
  'Collection',
  'MutableCollection',
  'Iterable',
  'MutableIterable',
  'Sequence',
  'Array',
  'Map',
  'MutableMap',
  'HashMap',
  'LinkedHashMap',
  'Stream',
  'Iterator',
  'IntRange',
  'LongRange',
]);
export const LIST_TYPES = group([
  'List',
  'MutableList',
  'ArrayList',
  'Collection',
  'MutableCollection',
  'mutableListOf',
  'arrayListOf',
  'listOf',
  'emptyList',
]);

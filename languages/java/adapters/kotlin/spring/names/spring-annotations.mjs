import { PERSISTENCE, set, SPRING, under } from './spring-names.mjs';

export const STEREOTYPES = set(
  ...under(`${SPRING}.stereotype`, 'Component', 'Service', 'Repository', 'Controller'),
  ...under(
    `${SPRING}.web.bind.annotation`,
    'RestController',
    'ControllerAdvice',
    'RestControllerAdvice',
  ),
);
export const CONTROLLERS = set(
  `${SPRING}.stereotype.Controller`,
  `${SPRING}.web.bind.annotation.RestController`,
);
export const CONFIGURATION = set(`${SPRING}.context.annotation.Configuration`);
export const CONFIGURATION_LIKE = set(
  ...CONFIGURATION,
  `${SPRING}.boot.autoconfigure.SpringBootApplication`,
  `${SPRING}.boot.autoconfigure.AutoConfiguration`,
  `${SPRING}.boot.test.context.TestConfiguration`,
);
export const SPRING_BOOT_APPLICATION = set(`${SPRING}.boot.autoconfigure.SpringBootApplication`);
export const BEAN = set(`${SPRING}.context.annotation.Bean`);
export const AUTOWIRING = set(
  `${SPRING}.beans.factory.annotation.Autowired`,
  'jakarta.inject.Inject',
  'jakarta.annotation.Resource',
);
export const AUTOWIRED_OR_INJECT = set(
  `${SPRING}.beans.factory.annotation.Autowired`,
  'jakarta.inject.Inject',
);
export const VALUE = set(`${SPRING}.beans.factory.annotation.Value`);
export const PERSISTENCE_INJECTION = set(
  'jakarta.persistence.PersistenceContext',
  'jakarta.persistence.PersistenceUnit',
);
export const LAZY = set(`${SPRING}.context.annotation.Lazy`);
export const PROFILE = set(`${SPRING}.context.annotation.Profile`);
export const COMPONENT_SCAN = set(`${SPRING}.context.annotation.ComponentScan`);
export const TRANSACTIONAL = set(`${SPRING}.transaction.annotation.Transactional`);
export const FOREIGN_TRANSACTIONAL = set(
  'jakarta.transaction.Transactional',
  'javax.transaction.Transactional',
);
export const ASYNC = set(`${SPRING}.scheduling.annotation.Async`);
export const SCHEDULED = set(`${SPRING}.scheduling.annotation.Scheduled`);
export const PROXY_ANNOTATIONS = set(
  ...TRANSACTIONAL,
  ...ASYNC,
  ...under(`${SPRING}.cache.annotation`, 'Cacheable', 'CachePut', 'CacheEvict', 'Caching'),
  `${SPRING}.retry.annotation.Retryable`,
  `${SPRING}.resilience.annotation.Retryable`,
  ...under(`${SPRING}.security.access.prepost`, 'PreAuthorize', 'PostAuthorize'),
  `${SPRING}.security.access.annotation.Secured`,
);
const WEB = `${SPRING}.web.bind.annotation`;
export const REQUEST_MAPPING = set(`${WEB}.RequestMapping`);
export const REQUEST_BODY = set(`${WEB}.RequestBody`);
export const RESPONSE_BODY = set(`${WEB}.ResponseBody`);
export const CROSS_ORIGIN = set(`${WEB}.CrossOrigin`);
export const VALIDATION = set(
  'jakarta.validation.Valid',
  `${SPRING}.validation.annotation.Validated`,
);
export const NO_OP_ENCODER = set(`${SPRING}.security.crypto.password.NoOpPasswordEncoder`);

export const ENTITY = set(`${PERSISTENCE}.Entity`);
export const ENTITY_OR_SUPERCLASS = set(`${PERSISTENCE}.Entity`, `${PERSISTENCE}.MappedSuperclass`);
export const SINGLE_VALUED_ASSOCIATIONS = set(
  `${PERSISTENCE}.ManyToOne`,
  `${PERSISTENCE}.OneToOne`,
);
export const COLLECTION_ASSOCIATIONS = set(
  ...under(PERSISTENCE, 'OneToMany', 'ManyToMany', 'ElementCollection'),
);
export const MANY_TO_MANY = set(`${PERSISTENCE}.ManyToMany`);
export const ORDER_COLUMN = set(`${PERSISTENCE}.OrderColumn`);
export const IDENTIFIERS = set(`${PERSISTENCE}.Id`, `${PERSISTENCE}.EmbeddedId`);
export const VERSION = set(`${PERSISTENCE}.Version`);
export const IMMUTABLE = set('org.hibernate.annotations.Immutable');
export const GENERATED_VALUE = set(`${PERSISTENCE}.GeneratedValue`);

const DATA_JPA = `${SPRING}.data.jpa.repository`;
export const JPA_QUERY = set(`${DATA_JPA}.Query`);
export const JPA_QUERIES = set(`${DATA_JPA}.Query`, `${DATA_JPA}.NativeQuery`);
export const NATIVE_QUERY = set(`${DATA_JPA}.NativeQuery`);
export const MODIFYING = set(`${DATA_JPA}.Modifying`);
export const QUERY_ANNOTATIONS = set(
  ...JPA_QUERIES,
  `${DATA_JPA}.query.Procedure`,
  `${DATA_JPA}.Procedure`,
  `${SPRING}.data.jdbc.repository.query.Query`,
  `${SPRING}.data.r2dbc.repository.Query`,
  `${SPRING}.data.mongodb.repository.Query`,
  `${SPRING}.data.mongodb.repository.Aggregation`,
  `${SPRING}.data.neo4j.repository.query.Query`,
  `${SPRING}.data.cassandra.repository.Query`,
  `${SPRING}.data.couchbase.repository.Query`,
  `${SPRING}.data.elasticsearch.annotations.Query`,
);

export const POST_CONSTRUCT = set(
  'jakarta.annotation.PostConstruct',
  'javax.annotation.PostConstruct',
);
export const SCOPES = set(`${SPRING}.context.annotation.Scope`);
export const SHORT_LIVED_SCOPES = set(
  ...under(`${SPRING}.web.context.annotation`, 'RequestScope', 'SessionScope'),
);
export const DEFAULT_VALUE = set(`${SPRING}.boot.context.properties.bind.DefaultValue`);
export const EXCEPTION_HANDLER = set(`${WEB}.ExceptionHandler`);
export const HANDLER_MAPPINGS = set(
  ...under(WEB, 'GetMapping', 'PostMapping', 'PutMapping', 'PatchMapping', 'DeleteMapping'),
  ...REQUEST_MAPPING,
  ...EXCEPTION_HANDLER,
);
export const THROWS = set('kotlin.jvm.Throws', 'kotlin.Throws');
export const ENUMERATED = set(`${PERSISTENCE}.Enumerated`);
export const MAP_KEY_ENUMERATED = set(`${PERSISTENCE}.MapKeyEnumerated`);
export const ELEMENT_COLLECTION = set(`${PERSISTENCE}.ElementCollection`);
export const ENTITY_OR_EMBEDDABLE = set(
  ...under(PERSISTENCE, 'Entity', 'Embeddable', 'MappedSuperclass'),
);
export const ENUM_OPT_OUTS = set(
  ...under(PERSISTENCE, 'Transient', 'Convert'),
  ...under('org.hibernate.annotations', 'JdbcTypeCode', 'JdbcType', 'Type'),
  'kotlin.jvm.Transient',
);
export const CONVERTER = set(`${PERSISTENCE}.Converter`);
export const BEAN_INITIALIZERS = set(
  `${SPRING}.beans.factory.InitializingBean`,
  `${SPRING}.beans.factory.SmartInitializingSingleton`,
);
export const SYNCHRONIZED = set('kotlin.jvm.Synchronized', 'kotlin.Synchronized');

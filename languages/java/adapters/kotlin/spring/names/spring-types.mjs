import { PERSISTENCE, set, SPRING, under } from './spring-names.mjs';

const DATA = `${SPRING}.data`;
export const REPOSITORY_ROOTS = set(
  ...under(
    `${DATA}.repository`,
    'Repository',
    'CrudRepository',
    'ListCrudRepository',
    'PagingAndSortingRepository',
    'ListPagingAndSortingRepository',
    'ReactiveCrudRepository',
    'ReactiveSortingRepository',
    'CoroutineCrudRepository',
    'CoroutineSortingRepository',
  ),
  `${DATA}.jpa.repository.JpaRepository`,
  `${DATA}.mongodb.repository.MongoRepository`,
  `${DATA}.mongodb.repository.ReactiveMongoRepository`,
  `${DATA}.r2dbc.repository.R2dbcRepository`,
  `${DATA}.neo4j.repository.Neo4jRepository`,
  `${DATA}.elasticsearch.repository.ElasticsearchRepository`,
  `${DATA}.cassandra.repository.CassandraRepository`,
  `${DATA}.couchbase.repository.CouchbaseRepository`,
);
export const ENTITY_MANAGER = set(`${PERSISTENCE}.EntityManager`);

export const BEAN_FACTORIES = set(
  ...under(
    `${SPRING}.beans.factory`,
    'BeanFactory',
    'ListableBeanFactory',
    'HierarchicalBeanFactory',
    'config.ConfigurableBeanFactory',
    'config.ConfigurableListableBeanFactory',
    'config.AutowireCapableBeanFactory',
    'support.DefaultListableBeanFactory',
  ),
  ...under(
    `${SPRING}.context`,
    'ApplicationContext',
    'ConfigurableApplicationContext',
    'support.GenericApplicationContext',
    'annotation.AnnotationConfigApplicationContext',
  ),
);
export const AWARE_INTERFACES = set(
  `${SPRING}.context.ApplicationContextAware`,
  `${SPRING}.beans.factory.BeanFactoryAware`,
);
export const BEAN_PROCESSORS = set(
  `${SPRING}.beans.factory.config.BeanFactoryPostProcessor`,
  `${SPRING}.beans.factory.config.BeanPostProcessor`,
);
export const PROPERTY_RESOLVERS = set(
  ...under(
    `${SPRING}.core.env`,
    'PropertyResolver',
    'ConfigurablePropertyResolver',
    'Environment',
    'ConfigurableEnvironment',
    'AbstractEnvironment',
    'StandardEnvironment',
  ),
);

const DATA_ACCESS = `${SPRING}.dao`;
export const BROAD_EXCEPTIONS = set(
  'java.lang.Exception',
  'java.lang.RuntimeException',
  'java.lang.Throwable',
);
export const PERSISTENCE_EXCEPTIONS = set(
  ...under(
    DATA_ACCESS,
    'DataAccessException',
    'DataIntegrityViolationException',
    'DuplicateKeyException',
    'EmptyResultDataAccessException',
    'IncorrectResultSizeDataAccessException',
    'OptimisticLockingFailureException',
    'PessimisticLockingFailureException',
    'ConcurrencyFailureException',
    'DataRetrievalFailureException',
    'InvalidDataAccessApiUsageException',
    'InvalidDataAccessResourceUsageException',
    'CannotAcquireLockException',
    'QueryTimeoutException',
    'TransientDataAccessException',
    'NonTransientDataAccessException',
    'RecoverableDataAccessException',
  ),
  ...under(
    `${SPRING}.transaction`,
    'TransactionException',
    'TransactionSystemException',
    'UnexpectedRollbackException',
    'TransactionUsageException',
    'NoTransactionException',
    'CannotCreateTransactionException',
    'TransactionTimedOutException',
    'IllegalTransactionStateException',
  ),
  ...under(
    PERSISTENCE,
    'PersistenceException',
    'EntityNotFoundException',
    'EntityExistsException',
    'NoResultException',
    'NonUniqueResultException',
    'OptimisticLockException',
    'PessimisticLockException',
    'RollbackException',
    'TransactionRequiredException',
    'LockTimeoutException',
    'QueryTimeoutException',
  ),
);

export const JDK_ENUMS = set(
  ...under('java.time', 'DayOfWeek', 'Month'),
  'java.util.concurrent.TimeUnit',
  'java.math.RoundingMode',
);
export const CHECKED_EXCEPTIONS = set(
  ...under(
    'java.lang',
    'Exception',
    'Throwable',
    'InterruptedException',
    'ClassNotFoundException',
    'CloneNotSupportedException',
    'IllegalAccessException',
    'InstantiationException',
    'NoSuchMethodException',
    'NoSuchFieldException',
    'ReflectiveOperationException',
  ),
  ...under('kotlin', 'Exception', 'Throwable'),
  ...under(
    'java.io',
    'IOException',
    'FileNotFoundException',
    'EOFException',
    'UnsupportedEncodingException',
  ),
  ...under('java.util.concurrent', 'TimeoutException', 'ExecutionException'),
  ...under('java.net', 'URISyntaxException', 'MalformedURLException'),
  ...under('java.security', 'GeneralSecurityException', 'NoSuchAlgorithmException'),
  'java.sql.SQLException',
  'java.text.ParseException',
  'java.lang.reflect.InvocationTargetException',
);

export const ERROR_LEAK_EXCEPTIONS = set(
  ...BROAD_EXCEPTIONS,
  ...PERSISTENCE_EXCEPTIONS,
  ...under(
    'java.lang',
    'IllegalArgumentException',
    'IllegalStateException',
    'NullPointerException',
  ),
  ...under('java.io', 'IOException', 'UncheckedIOException'),
  'java.sql.SQLException',
);

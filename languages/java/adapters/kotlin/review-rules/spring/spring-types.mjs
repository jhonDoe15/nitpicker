const SPRING = 'org.springframework';
const STEREOTYPE = `${SPRING}.stereotype`;
const WEB = `${SPRING}.web.bind.annotation`;
const CONTEXT = `${SPRING}.context.annotation`;
const BOOT = `${SPRING}.boot.autoconfigure`;
const FACTORY = `${SPRING}.beans.factory`;

function twins(...names) {
  return names.flatMap((name) => [`jakarta.${name}`, `javax.${name}`]);
}

function inPackage(prefix, ...names) {
  return names.map((name) => `${prefix}.${name}`);
}

function group(...lists) {
  return new Set(lists.flat());
}

export const STEREOTYPES = group(
  inPackage(STEREOTYPE, 'Component', 'Service', 'Repository', 'Controller'),
  inPackage(WEB, 'RestController', 'ControllerAdvice', 'RestControllerAdvice'),
);
export const CONTROLLERS = group(
  inPackage(STEREOTYPE, 'Controller'),
  inPackage(WEB, 'RestController'),
);
export const REST_CONTROLLER = group(inPackage(WEB, 'RestController'));
export const CONTROLLER = group(inPackage(STEREOTYPE, 'Controller'));
export const CONFIGURATION = group(inPackage(CONTEXT, 'Configuration'));
export const CONFIGURATION_CLASSES = group(
  inPackage(CONTEXT, 'Configuration'),
  inPackage(BOOT, 'SpringBootApplication', 'AutoConfiguration'),
  inPackage(`${SPRING}.boot.test.context`, 'TestConfiguration'),
);
export const SPRING_MANAGED_CLASSES = group([...STEREOTYPES, ...CONFIGURATION_CLASSES]);
export const BOOT_APPLICATION = group(inPackage(BOOT, 'SpringBootApplication'));
export const BEAN = group(inPackage(CONTEXT, 'Bean'));
export const PROFILE = group(inPackage(CONTEXT, 'Profile'));
export const COMPONENT_SCAN = group(inPackage(CONTEXT, 'ComponentScan'));
export const LAZY = group(inPackage(CONTEXT, 'Lazy'));
export const AUTOWIRED = group(inPackage(`${FACTORY}.annotation`, 'Autowired'));
export const INJECT = group(twins('inject.Inject'));
export const RESOURCE = group(twins('annotation.Resource'));
export const VALUE = group(inPackage(`${FACTORY}.annotation`, 'Value'));
export const DEFAULT_VALUE = group(
  inPackage(`${SPRING}.boot.context.properties.bind`, 'DefaultValue'),
);
export const PERSISTENCE_INJECTION = group(
  twins('persistence.PersistenceContext', 'persistence.PersistenceUnit'),
);
export const POST_CONSTRUCT = group(twins('annotation.PostConstruct'));
export const SINGLETON_SCOPES = group(
  inPackage(`${SPRING}.web.context.annotation`, 'RequestScope', 'SessionScope'),
);
export const SCOPE = group(inPackage(CONTEXT, 'Scope'));
export const SYNCHRONIZED = group(['kotlin.jvm.Synchronized']);
export const COMPLETABLE_FUTURE = group(['java.util.concurrent.CompletableFuture']);

export const SPRING_TRANSACTIONAL = group(
  inPackage(`${SPRING}.transaction.annotation`, 'Transactional'),
);
export const JAKARTA_TRANSACTIONAL = group(twins('transaction.Transactional'));
export const ASYNC = group(inPackage(`${SPRING}.scheduling.annotation`, 'Async'));
export const SCHEDULED = group(inPackage(`${SPRING}.scheduling.annotation`, 'Scheduled'));
export const PROXIED = group(
  [...SPRING_TRANSACTIONAL, ...ASYNC],
  inPackage(`${SPRING}.cache.annotation`, 'Cacheable', 'CachePut', 'CacheEvict', 'Caching'),
  inPackage(`${SPRING}.retry.annotation`, 'Retryable'),
  inPackage(`${SPRING}.resilience.annotation`, 'Retryable'),
  inPackage(`${SPRING}.security.access.prepost`, 'PreAuthorize', 'PostAuthorize'),
  inPackage(`${SPRING}.security.access.annotation`, 'Secured'),
);
export const SPRING_PRESET_OPEN = group(
  [...STEREOTYPES, ...CONFIGURATION_CLASSES, ...SPRING_TRANSACTIONAL, ...ASYNC],
  inPackage(`${SPRING}.cache.annotation`, 'Cacheable'),
  inPackage(`${SPRING}.boot.test.context`, 'SpringBootTest'),
  inPackage(`${SPRING}.validation.annotation`, 'Validated'),
);

export const MAPPINGS = group(
  inPackage(WEB, 'GetMapping', 'PostMapping', 'PutMapping', 'PatchMapping', 'DeleteMapping'),
  inPackage(WEB, 'RequestMapping'),
);
export const REQUEST_MAPPING = group(inPackage(WEB, 'RequestMapping'));
export const EXCEPTION_HANDLER = group(inPackage(WEB, 'ExceptionHandler'));
export const RESPONSE_BODY = group(inPackage(WEB, 'ResponseBody'));
export const REQUEST_BODY = group(inPackage(WEB, 'RequestBody'));
export const CROSS_ORIGIN = group(inPackage(WEB, 'CrossOrigin'));
export const VALID = group(
  twins('validation.Valid'),
  inPackage(`${SPRING}.validation.annotation`, 'Validated'),
);

export const BEAN_FACTORIES = group(
  inPackage(FACTORY, 'BeanFactory', 'ListableBeanFactory', 'HierarchicalBeanFactory'),
  inPackage(
    `${FACTORY}.config`,
    'ConfigurableBeanFactory',
    'ConfigurableListableBeanFactory',
    'AutowireCapableBeanFactory',
  ),
  inPackage(`${FACTORY}.support`, 'DefaultListableBeanFactory'),
  inPackage(`${SPRING}.context`, 'ApplicationContext', 'ConfigurableApplicationContext'),
  inPackage(`${SPRING}.context.support`, 'GenericApplicationContext', 'AbstractApplicationContext'),
  inPackage(`${SPRING}.web.context`, 'WebApplicationContext'),
);
export const LOCATOR_INTERFACES = group(
  inPackage(`${SPRING}.context`, 'ApplicationContextAware'),
  inPackage(FACTORY, 'BeanFactoryAware'),
);
export const POST_PROCESSORS = group(
  inPackage(`${FACTORY}.config`, 'BeanFactoryPostProcessor', 'BeanPostProcessor'),
);
export const PERSISTENCE_EXCEPTIONS = [
  /^org\.springframework\.(?:dao|transaction|orm|jdbc)(?:\.\w+)*\.\w*Exception$/u,
  /^(?:jakarta|javax)\.persistence\.\w*Exception$/u,
  /^org\.hibernate(?:\.\w+)*\.\w*Exception$/u,
];
export const CONFIGURATION_PROPERTIES = group(
  inPackage(`${SPRING}.boot.context.properties`, 'ConfigurationProperties'),
);
export const CONFIG_INITIALIZERS = group(
  inPackage(`${SPRING}.boot.env`, 'EnvironmentPostProcessor'),
  inPackage(`${SPRING}.context`, 'ApplicationContextInitializer'),
);
export const PROPERTY_RESOLVERS = group(
  inPackage(
    `${SPRING}.core.env`,
    'Environment',
    'PropertyResolver',
    'ConfigurableEnvironment',
    'StandardEnvironment',
    'AbstractEnvironment',
  ),
);

const DATA = `${SPRING}.data`;
export const DATA_REPOSITORIES = group(
  inPackage(
    `${DATA}.repository`,
    'Repository',
    'CrudRepository',
    'ListCrudRepository',
    'PagingAndSortingRepository',
    'ListPagingAndSortingRepository',
  ),
  inPackage(`${DATA}.repository.reactive`, 'ReactiveCrudRepository', 'ReactiveSortingRepository'),
  inPackage(`${DATA}.repository.kotlin`, 'CoroutineCrudRepository', 'CoroutineSortingRepository'),
  inPackage(`${DATA}.jpa.repository`, 'JpaRepository'),
  inPackage(`${DATA}.mongodb.repository`, 'MongoRepository', 'ReactiveMongoRepository'),
  inPackage(`${DATA}.r2dbc.repository`, 'R2dbcRepository'),
);
export const ENTITY_MANAGER = group(twins('persistence.EntityManager'));
export const JDBC = group(
  inPackage(`${SPRING}.jdbc.core`, 'JdbcTemplate', 'JdbcOperations'),
  inPackage(
    `${SPRING}.jdbc.core.namedparam`,
    'NamedParameterJdbcTemplate',
    'NamedParameterJdbcOperations',
  ),
  inPackage(`${SPRING}.jdbc.core.simple`, 'JdbcClient'),
);
export const HTTP_CLIENTS = group(
  inPackage(`${SPRING}.web.client`, 'RestTemplate', 'RestOperations', 'RestClient'),
  inPackage(`${SPRING}.web.reactive.function.client`, 'WebClient'),
  ['java.net.http.HttpClient'],
);
export const REST_TEMPLATE = group(inPackage(`${SPRING}.web.client`, 'RestTemplate'));
export const REST_TEMPLATE_BUILDER = group(
  inPackage(`${SPRING}.boot.web.client`, 'RestTemplateBuilder'),
  inPackage(`${SPRING}.boot.restclient`, 'RestTemplateBuilder'),
);
export const SPRING_CLIENT_FACTORIES = group(
  inPackage(`${SPRING}.web.client`, 'RestClient'),
  inPackage(`${SPRING}.web.reactive.function.client`, 'WebClient'),
);
export const JDK_HTTP_CLIENT = group(['java.net.http.HttpClient']);
export const REACTOR_HTTP_CLIENT = group(['reactor.netty.http.client.HttpClient']);
export const REQUEST_FACTORIES = group(
  inPackage(
    `${SPRING}.http.client`,
    'SimpleClientHttpRequestFactory',
    'HttpComponentsClientHttpRequestFactory',
  ),
);
export const REACTOR_CONNECTOR = group(
  inPackage(`${SPRING}.http.client.reactive`, 'ReactorClientHttpConnector'),
);

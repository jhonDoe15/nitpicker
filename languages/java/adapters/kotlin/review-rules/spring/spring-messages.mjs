import { exceptionRoute } from '../review-finding.mjs';

const ALLOWED = {
  SpringConstructorInjection:
    'Inject through the primary constructor into private val properties. Do not put @Autowired, @Inject, @Resource or @Value on properties, lateinit vars or setter functions, and drop @Autowired from the only constructor.',
  SpringImmutableBeans:
    'Make this property of a bean a val. Beans are shared singletons, so keep per-call state in locals.',
  SpringNoServiceLocator:
    'Inject the bean you need through the constructor instead of looking it up in the ApplicationContext or BeanFactory. Use ObjectProvider for optional or prototype beans.',
  SpringNoLazyInjection:
    'Remove @Lazy from this injection point. It hides a dependency cycle; break the cycle with a new component or an event instead.',
  SpringLiteConfiguration:
    'Write @Configuration(proxyBeanMethods = false) and take dependencies as @Bean function parameters instead of calling other @Bean functions.',
  SpringNoComponentScan:
    'Put the @SpringBootApplication class in the top package and let it scan its own packages; do not add @ComponentScan or scanBasePackages.',
  SpringBeanCollectionState:
    'Fill a plain collection of a shared singleton bean only at startup (the constructor, an init block, @PostConstruct or afterPropertiesSet) and keep it read-only (toMap(), toList()), or use a ConcurrentHashMap or a cache (@Cacheable). Changed after startup, request threads would write to it at once.',
  SpringHttpClientPerCall:
    'Build the HTTP client once, from the injected RestClient.Builder or RestTemplateBuilder, and keep it in a private val or a @Bean. A client built in each call throws away its connection pool.',
  SpringHttpClientTimeouts:
    'Build this HTTP client with connect and read timeouts, from the injected RestClient.Builder or RestTemplateBuilder (spring.http.client.* properties), with a request factory or connector that sets them, or with connectTimeout and readTimeout on the builder; give a Reactor Netty HttpClient a responseTimeout. A client without timeouts waits forever for a slow server.',
  SpringNoPostConstructIo:
    'Move startup work that calls a database or a remote service out of @PostConstruct, afterPropertiesSet or a @Bean initMethod (and the private helpers only they call) into an ApplicationRunner or an @EventListener(ApplicationReadyEvent::class). These run before the context is ready: there is no transaction around this call, other beans may not be proxied yet, and a failure stops the application from starting.',
  SpringTypedConfiguration:
    'Read configuration through a @ConfigurationProperties data class and pass the values in through constructors or parameters, not @Value, System.getProperty or Environment.getProperty. JVM properties such as java.*, user.*, javax.*, jdk.* and http.* are fine.',
  SpringValueSecretDefault:
    'Read this secret without a default, so a missing value fails at startup; a secret with a built-in fallback ships to production unnoticed.',
  SpringProfileOnConfiguration:
    'Put @Profile only on a @Configuration class or a @Bean function, so profiles choose beans and never branch business code.',
  SpringProxyMethodVisibility:
    'Make this proxied function public, and let Spring subclass it: apply the kotlin("plugin.spring") compiler plugin (or write open class and open fun), and keep it out of objects and companion objects. Spring never proxies private, final or static functions, and nitpicker keeps proxied functions public.',
  SpringProxySelfCall:
    "Move the annotated function to another bean and call it there. This call stays inside the class, so it skips the proxy and the called function's annotation does nothing.",
  SpringTransactionalAnnotation:
    'Use org.springframework.transaction.annotation.Transactional. The jakarta and javax annotations have no readOnly or timeout and roll back on different exceptions.',
  SpringNoTransactionalController:
    'Put @Transactional on a service function, not on a controller; a controller transaction spans the whole request and response serialization.',
  SpringNoRequiresNew:
    'Keep the default REQUIRED propagation and drop Propagation.REQUIRES_NEW: each nested transaction holds a second connection and can exhaust the pool under load.',
  SpringNoSwallowedTransactionException:
    'Rethrow a broad or persistence exception caught inside a @Transactional function (throw, error(), getOrThrow(), or a getOrElse, onFailure or fold that throws), or catch it in the caller. Swallowed there, by a catch without throw or a runCatching that never rethrows, it leaves the transaction rollback-only, so the commit fails anyway.',
  SpringTransactionalCheckedRollback:
    'Add rollbackFor = [Exception::class] to this @Transactional, or throw an unchecked exception. Kotlin lets any function throw a checked exception, and a checked exception commits the work done so far instead of rolling it back.',
  SpringTransactionalReadOnlyWrite:
    'Put @Transactional without readOnly on this function: a write inside a read-only transaction is skipped or fails.',
  SpringAsyncExecutor:
    'Name a bounded executor bean, @Async("executorName"), and return CompletableFuture so failures reach the caller.',
  SpringScheduledFixedDelay:
    'Use fixedDelay or cron instead of fixedRate, so a slow run never overlaps the next one.',
  SpringComposedMapping:
    'Use @GetMapping, @PostMapping, @PutMapping, @PatchMapping or @DeleteMapping on functions. @RequestMapping belongs only on the class, for the path prefix.',
  SpringRestController: 'Use @RestController for a JSON controller and drop @ResponseBody.',
  SpringValidRequestBody:
    "Add @Valid to this @RequestBody; without it the data class's constraints are never checked.",
  SpringTypedResponse:
    'Return a data class or a specific type from this handler, never Any, JsonNode, Map<String, Any>, ResponseEntity<*>, a list or Mono of those, or null. For no body return Unit or ResponseEntity<Void>, and for an error throw an exception that a @RestControllerAdvice maps to a ProblemDetail.',
  SpringTypedRequestBody:
    'Bind this @RequestBody to a data class with validation annotations, not to Any, JsonNode, Map<String, Any> or a list of those. Untyped payloads skip validation and allow mass assignment. A Map with typed values, such as Map<String, String>, is fine.',
  SpringNoErrorLeak:
    'Log the exception and return a ProblemDetail with a fixed detail from this @ExceptionHandler. The message or stack trace of a generic, JDK or persistence exception exposes internals; messages of your own exception types are fine.',
  SpringNoCrossOrigin:
    'Configure CORS once, in a CorsConfigurationSource bean with origins from configuration, instead of @CrossOrigin on controllers.',
  SpringCorsWildcard:
    'List the allowed origins from configuration instead of "*" when credentials are allowed; any site could then call this API as the signed-in user.',
  SpringPasswordEncoder:
    'Hash passwords with PasswordEncoderFactories.createDelegatingPasswordEncoder(). NoOpPasswordEncoder stores them in plain text, and the MD4, message-digest, LDAP SHA and standard SHA-256 encoders and User.withDefaultPasswordEncoder() are not safe for passwords.',
  SpringPermitAllAnyRequest:
    'Name the public paths in requestMatchers(...).permitAll() (authorize("/public/**", permitAll) in the Kotlin DSL), or pathMatchers(...).permitAll() on WebFlux, and end with anyRequest().authenticated() (authorize(anyRequest, authenticated)), or anyExchange().authenticated(), so a new endpoint is protected by default.',
  SpringCsrfDisabled:
    'Keep CSRF protection on for session-based security. Turn it off only for a stateless API, in the same filter chain: SessionCreationPolicy.STATELESS or a NullSecurityContextRepository on servlet security, NoOpServerSecurityContextRepository on WebFlux, or oauth2ResourceServer with jwt or opaqueToken and every login form disabled.',
  SpringHardcodedUser:
    'Load users from a UserDetailsService backed by the database, with passwords hashed by the delegating encoder. Do not put a user password in source code.',
};

export const SPRING_RULES = Object.keys(ALLOWED);
export const JAVA_ONLY_SPRING_RULE = 'SpringQueryConcatenation';

export function springMessage(rule) {
  return `${ALLOWED[rule]} ${exceptionRoute(rule)}`;
}

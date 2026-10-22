import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readKotlinSpringFindings } from './kotlin-spring.mjs';
import { KOTLIN_SPRING_RULES } from './spring-rules.mjs';
import { FIXTURE, markedViolations } from './test-support/kotlin-spring-projects.mjs';

function read(reportRoot) {
  return readKotlinSpringFindings({ projectRoot: FIXTURE, reportRoot });
}

describe('Kotlin Spring rules', () => {
  const findings = read(path.join(FIXTURE, 'report'));

  it('finds every violation of the fixture sources and nothing else', () => {
    expect(
      findings.map(
        ({ path: file, location, identity }) =>
          `${path.basename(file)}:${String(location.line)} ${identity}`,
      ),
    ).toEqual([
      'Beans.kt:26 SpringConstructorInjection:FieldInjected.repo@Autowired',
      'Beans.kt:29 SpringConstructorInjection:FieldInjected.other@Resource',
      'Beans.kt:63 SpringConstructorInjection:Lazily.late@Autowired',
      'Beans.kt:38 SpringConstructorInjection:FieldInjected.use@Autowired',
      'Beans.kt:32 SpringConstructorInjection:FieldInjected.limit@Value',
      'Beans.kt:43 SpringConstructorInjection:Annotated.<init>@Autowired',
      'Beans.kt:26 SpringImmutableBeans:FieldInjected.repo',
      'Beans.kt:29 SpringImmutableBeans:FieldInjected.other',
      'Beans.kt:51 SpringImmutableBeans:Mutable.counter',
      'Beans.kt:52 SpringImmutableBeans:Mutable.cache',
      'Beans.kt:62 SpringImmutableBeans:Lazily.late',
      'Beans.kt:69 SpringNoServiceLocator:Locator.factory',
      'Beans.kt:70 SpringNoServiceLocator:Locator.context',
      'Beans.kt:72 SpringNoServiceLocator:Locator.find.beanFactory',
      'Beans.kt:74 SpringNoServiceLocator:Locator.setApplicationContext.applicationContext',
      'Beans.kt:71 SpringNoServiceLocator:Locator:ApplicationContextAware',
      'Beans.kt:62 SpringNoLazyInjection:Lazily.late@Lazy',
      'Beans.kt:61 SpringNoLazyInjection:Lazily.<init>.repo@Lazy',
      'Beans.kt:77 SpringLiteConfiguration:Wiring@Configuration',
      'Beans.kt:80 SpringLiteConfiguration:Proxied@Configuration',
      'Beans.kt:92 SpringNoComponentScan:Application@ComponentScan',
      'Beans.kt:93 SpringNoComponentScan:Application@SpringBootApplication',
      'Beans.kt:97 SpringTypedConfiguration:Settings.<init>.url@Value',
      'Beans.kt:99 SpringTypedConfiguration:Settings.read@getenv',
      'Beans.kt:101 SpringTypedConfiguration:Settings.read@getProperty',
      'Beans.kt:102 SpringTypedConfiguration:Settings.read@getRequiredProperty',
      'Beans.kt:107 SpringProfileOnConfiguration:Branching@Profile',
      'Beans.kt:109 SpringProfileOnConfiguration:Branching.run@Profile',
      'Clients.kt:34 SpringHttpClientPerCall:Gateways.fetch@create',
      'Clients.kt:39 SpringHttpClientPerCall:Gateways.later@newBuilder',
      'Clients.kt:17 SpringHttpClientTimeouts:Gateways.bare@builder',
      'Clients.kt:18 SpringHttpClientTimeouts:Gateways.template@RestTemplate',
      'Clients.kt:20 SpringHttpClientTimeouts:Gateways.plain@newHttpClient',
      'Clients.kt:21 SpringHttpClientTimeouts:Gateways.web@create',
      'Clients.kt:23 SpringHttpClientTimeouts:Gateways.unlimited@create',
      'Clients.kt:25 SpringHttpClientTimeouts:Gateways.factory@SimpleClientHttpRequestFactory',
      'Clients.kt:46 SpringHttpClientTimeouts:ClientBeans.clientTemplate@RestTemplate',
      'Clients.kt:49 SpringHttpClientTimeouts:ClientBeans.clientWeb@builder',
      'Data.kt:12 SpringDataDerivedQuery:OrderRepo.findByName',
      'Data.kt:48 SpringDataDerivedQuery:ExtendedRepo.findByOwner',
      'Data.kt:22 SpringDataNativeQuery:OrderRepo.nativeOne@Query',
      'Data.kt:38 SpringDataModifyingQuery:OrderRepo.wipe@Modifying',
      'Data.kt:19 SpringDataNamedParameters:OrderRepo.positional@Query',
      'Data.kt:29 SpringDataQueryTextBlock:OrderRepo.joined@Query',
      'Data.kt:54 SpringDataNoSaveInLoop:Batches.loop@save',
      'Data.kt:55 SpringDataNoSaveInLoop:Batches.loop@delete',
      'Data.kt:56 SpringDataNoSaveInLoop:Batches.loop@delete#2',
      'Data.kt:57 SpringDataNoSaveInLoop:Batches.loop@persist',
      'Data.kt:64 SpringDataNoFlush:Batches.flushing@flush',
      'Data.kt:65 SpringDataNoFlush:Batches.flushing@flush#2',
      'Data.kt:66 SpringDataNoFlush:Batches.flushing@saveAndFlush',
      'Handlers.kt:21 SpringTypedResponse:Reports.any',
      'Handlers.kt:24 SpringTypedResponse:Reports.map',
      'Handlers.kt:27 SpringTypedResponse:Reports.list',
      'Handlers.kt:30 SpringTypedResponse:Reports.entity',
      'Handlers.kt:43 SpringTypedResponse:Reports.nothing@null',
      'Handlers.kt:48 SpringTypedRequestBody:Reports.post.payload@RequestBody',
      'Handlers.kt:49 SpringTypedRequestBody:Reports.post.anything@RequestBody',
      'Handlers.kt:51 SpringTypedRequestBody:Reports.post.items@RequestBody',
      'Handlers.kt:63 SpringNoErrorLeak:Problems.state@message',
      'Handlers.kt:68 SpringNoErrorLeak:Problems.io@template',
      'Handlers.kt:72 SpringNoErrorLeak:Problems.fallback@printStackTrace',
      'Handlers.kt:83 SpringNoErrorLeak:Problems.bad@message',
      'Jpa.kt:19 JpaLazyFetching:Parent.owner@ManyToOne',
      'Jpa.kt:25 JpaLazyFetching:Parent.children@OneToMany',
      'Jpa.kt:8 JpaEntityClass:DataEntity@Entity',
      'Jpa.kt:11 JpaEntityClass:FinalEntity@Entity',
      'Jpa.kt:28 JpaManyToManyCascade:Parent.tags@ManyToMany',
      'Jpa.kt:28 JpaManyToManySet:Parent.tags',
      'Jpa.kt:17 JpaVersion:Parent@Entity',
      'Jpa.kt:39 JpaVersion:Base@MappedSuperclass',
      'Jpa.kt:13 JpaSequenceIds:FinalEntity.<init>.id@GeneratedValue',
      'Mappings.kt:63 JpaEntityClass:Ticket@Entity',
      'Mappings.kt:20 JpaEnumString:Gauge.level',
      'Mappings.kt:26 JpaEnumString:Gauge.rank',
      'Mappings.kt:32 JpaEnumString:Gauge.levels',
      'Mappings.kt:40 JpaEnumString:Gauge.byKey',
      'Mappings.kt:50 JpaIdentityHashCode:Account.hashCode',
      'Mappings.kt:63 JpaIdentityHashCode:Ticket.hashCode',
      'Proxies.kt:29 SpringProxyMethodVisibility:FinalBean@Transactional',
      'Proxies.kt:15 SpringProxyMethodVisibility:Visibility.hidden@Transactional',
      'Proxies.kt:18 SpringProxyMethodVisibility:Visibility.internalOne@Transactional',
      'Proxies.kt:21 SpringProxyMethodVisibility:Visibility.closed@Cacheable',
      'Proxies.kt:42 SpringProxySelfCall:SelfCalls.outer',
      'Proxies.kt:43 SpringProxySelfCall:SelfCalls.outer#2',
      'Proxies.kt:60 SpringTransactionalAnnotation:Transactions.old@jakarta.transaction.Transactional',
      'Proxies.kt:80 SpringNoTransactionalController:Pages@Transactional',
      'Proxies.kt:82 SpringNoTransactionalController:Pages.page@Transactional',
      'Proxies.kt:63 SpringNoRequiresNew:Transactions.nested@Transactional',
      'Proxies.kt:68 SpringNoSwallowedTransactionException:Transactions.swallow',
      'Proxies.kt:88 SpringAsyncExecutor:Jobs.fire@Async',
      'Proxies.kt:88 SpringAsyncExecutor:Jobs.fire',
      'Proxies.kt:91 SpringAsyncExecutor:Jobs.again',
      'Proxies.kt:94 SpringScheduledFixedDelay:Jobs.tick@Scheduled',
      'Security.kt:97 SpringNoCrossOrigin:CorsPage@CrossOrigin',
      'Security.kt:23 SpringPermitAllAnyRequest:Chains.open@permitAll',
      'Security.kt:39 SpringPermitAllAnyRequest:Chains.everything@permitAll',
      'Security.kt:54 SpringPermitAllAnyRequest:Chains.dsl@authorize',
      'Security.kt:60 SpringPermitAllAnyRequest:Chains.ignoreAll@requestMatchers',
      'Security.kt:22 SpringCsrfDisabled:Chains.open@csrf',
      'Security.kt:53 SpringCsrfDisabled:Chains.dsl@csrf',
      'Security.kt:76 SpringCorsWildcard:Chains.cors@allowedOrigins',
      'Security.kt:84 SpringCorsWildcard:Chains.corsPatterns@addAllowedOriginPattern',
      'Security.kt:97 SpringCorsWildcard:CorsPage@CrossOrigin',
      'Security.kt:65 SpringHardcodedUser:Chains.users@password',
      'Security.kt:70 SpringHardcodedUser:Chains.memory@password',
      'Startup.kt:21 SpringNoPostConstructIo:Warmup.load@count',
      'Startup.kt:22 SpringNoPostConstructIo:Warmup.load@find',
      'Startup.kt:23 SpringNoPostConstructIo:Warmup.load@get',
      'Startup.kt:33 SpringValueSecretDefault:Secrets.<init>.token@Value',
      'Startup.kt:46 SpringValueSecretDefault:AppSecrets.<init>.password@DefaultValue',
      'Startup.kt:39 SpringValueSecretDefault:Secrets.password@getProperty',
      'Startup.kt:52 SpringBeanCollectionState:Registry.seen',
      'Startup.kt:56 SpringBeanCollectionState:Registry.counted',
      'Web.kt:19 SpringComposedMapping:Orders.a@RequestMapping',
      'Web.kt:37 SpringRestController:Pages2@ResponseBody',
      'Web.kt:23 SpringRestController:Orders.b@ResponseBody',
      'Web.kt:27 SpringValidRequestBody:Orders.create.order@RequestBody',
      'Web.kt:31 SpringValidRequestBody:Orders.create.items@RequestBody',
      'Web.kt:17 SpringNoCrossOrigin:Orders@CrossOrigin',
      'Web.kt:40 SpringPasswordEncoder:NoOpPasswordEncoder',
      'Web.kt:42 SpringPasswordEncoder:NoOpPasswordEncoder#2',
      'Web.kt:32 SpringTypedRequestBody:Orders.create.raw@RequestBody',
      'Writes.kt:30 SpringTransactionalCheckedRollback:Ledger.load@Throws',
      'Writes.kt:114 SpringTransactionalCheckedRollback:Posting.post@Throws',
      'Writes.kt:47 SpringTransactionalReadOnlyWrite:Ledger.report@save',
      'Writes.kt:48 SpringTransactionalReadOnlyWrite:Ledger.report@deleteAllInBatch',
      'Writes.kt:49 SpringTransactionalReadOnlyWrite:Ledger.report@persist',
      'Writes.kt:50 SpringTransactionalReadOnlyWrite:Ledger.report@markSeen',
      'Writes.kt:125 SpringTransactionalReadOnlyWrite:Viewer.view@save',
      'Writes.kt:60 SpringQueryConcatenation:Ledger.search@createQuery',
      'Writes.kt:61 SpringQueryConcatenation:Ledger.search@createQuery#2',
      'Writes.kt:62 SpringQueryConcatenation:Ledger.search@createNativeQuery',
      'Writes.kt:65 SpringQueryConcatenation:Ledger.search@queryForList',
      'Writes.kt:67 SpringQueryConcatenation:Ledger.search@update',
      'Writes.kt:70 SpringQueryConcatenation:Ledger.search@execute',
      'Writes.kt:75 SpringDataBatchOfOne:Ledger.batches@saveAll',
      'Writes.kt:76 SpringDataBatchOfOne:Ledger.batches@deleteAll',
      'Writes.kt:80 SpringDataBatchOfOne:Ledger.batches@saveAll#2',
      'Writes.kt:85 SpringDataRowWriteInLoop:Ledger.rows@markSeen',
      'Writes.kt:86 SpringDataRowWriteInLoop:Ledger.rows@markSeen#2',
      'Writes.kt:87 SpringDataRowWriteInLoop:Ledger.rows@touch',
      'Writes.kt:96 SpringDataSaveInLoopHelper:Ledger.helper@store',
      'Writes.kt:97 SpringDataSaveInLoopHelper:Ledger.helper@store#2',
      'Writes.kt:102 SpringDataFilterInQuery:Ledger.filtering@findAll',
      'Writes.kt:103 SpringDataFilterInQuery:Ledger.filtering@findAll#2',
      'Writes.kt:104 SpringDataFilterInQuery:Ledger.filtering@findAll#3',
      'Writes.kt:105 SpringDataFilterInQuery:Ledger.filtering@findAll#4',
    ]);
  });

  it('reports exactly the violations marked in the fixture sources', () => {
    expect(
      findings
        .map(
          ({ path: file, location, rule }) =>
            `${path.basename(file)}:${String(location.line)} ${rule}`,
        )
        .toSorted(),
    ).toEqual(markedViolations().toSorted());
  });

  it('reports each finding as an enforceable pmd finding of its file with its symbol', () => {
    expect(findings[0]).toEqual({
      tool: 'pmd',
      rule: 'SpringConstructorInjection',
      path: 'src/main/kotlin/demo/Beans.kt',
      identity: 'SpringConstructorInjection:FieldInjected.repo@Autowired',
      symbol: 'FieldInjected.repo@Autowired',
      location: { line: 26 },
      message:
        'Inject through the constructor into private val properties. Do not put @Autowired, @Inject, @Resource or @Value on properties or setters, and do not annotate the only constructor. If it is right here, add an exception for pmd/SpringConstructorInjection in nitpicker.config.json.',
      classification: 'enforceable',
    });
  });

  it('names the exception route of its own rule in every message', () => {
    expect(
      KOTLIN_SPRING_RULES.filter(
        ({ name, message }) =>
          !message.endsWith(
            `If it is right here, add an exception for pmd/${name} in nitpicker.config.json.`,
          ),
      ),
    ).toEqual([]);
  });

  it('stops with the missing report when the build wrote no syntax report', () => {
    expect(() => read(path.join(FIXTURE, 'missing'))).toThrow(
      `The Kotlin syntax report ${path.join(FIXTURE, 'missing', 'kotlin-syntax.json')} is missing, so the Spring rules cannot run`,
    );
  });
});

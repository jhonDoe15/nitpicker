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
      'Jpa.kt:19 JpaLazyFetching:Parent.owner@ManyToOne',
      'Jpa.kt:25 JpaLazyFetching:Parent.children@OneToMany',
      'Jpa.kt:8 JpaEntityClass:DataEntity@Entity',
      'Jpa.kt:11 JpaEntityClass:FinalEntity@Entity',
      'Jpa.kt:28 JpaManyToManyCascade:Parent.tags@ManyToMany',
      'Jpa.kt:28 JpaManyToManySet:Parent.tags',
      'Jpa.kt:17 JpaVersion:Parent@Entity',
      'Jpa.kt:39 JpaVersion:Base@MappedSuperclass',
      'Jpa.kt:13 JpaSequenceIds:FinalEntity.<init>.id@GeneratedValue',
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
      'Web.kt:19 SpringComposedMapping:Orders.a@RequestMapping',
      'Web.kt:37 SpringRestController:Pages2@ResponseBody',
      'Web.kt:23 SpringRestController:Orders.b@ResponseBody',
      'Web.kt:27 SpringValidRequestBody:Orders.create.order@RequestBody',
      'Web.kt:31 SpringValidRequestBody:Orders.create.items@RequestBody',
      'Web.kt:17 SpringNoCrossOrigin:Orders@CrossOrigin',
      'Web.kt:40 SpringPasswordEncoder:NoOpPasswordEncoder',
      'Web.kt:42 SpringPasswordEncoder:NoOpPasswordEncoder#2',
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

  it('reports each finding as an enforceable spring finding of its file with its symbol', () => {
    expect(findings[0]).toEqual({
      tool: 'spring',
      rule: 'SpringConstructorInjection',
      path: 'src/main/kotlin/demo/Beans.kt',
      identity: 'SpringConstructorInjection:FieldInjected.repo@Autowired',
      symbol: 'FieldInjected.repo@Autowired',
      location: { line: 26 },
      message:
        'Inject through the constructor into private val properties. Do not put @Autowired, @Inject, @Resource or @Value on properties or setters, and do not annotate the only constructor. If it is right here, add an exception for spring/SpringConstructorInjection in nitpicker.config.json.',
      classification: 'enforceable',
    });
  });

  it('names the exception route of its own rule in every message', () => {
    expect(
      KOTLIN_SPRING_RULES.filter(
        ({ name, message }) =>
          !message.endsWith(
            `If it is right here, add an exception for spring/${name} in nitpicker.config.json.`,
          ),
      ),
    ).toEqual([]);
  });

  it('reads nothing when the build wrote no syntax report', () => {
    expect(read(path.join(FIXTURE, 'missing'))).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findingFactory } from '../review-finding.mjs';
import { KOTLIN_REVIEW_EXCEPTION_RULES } from '../review-rules.mjs';
import { springFindings, withoutCoveredSourceFindings } from './spring-findings.mjs';
import { SPRING_RULES } from './spring-messages.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures');
const FIXTURE = path.join(FIXTURES, 'kotlin-spring-facts.json');
const PROJECT = path.join(FIXTURES, 'kotlin-spring-project');
const RULESET = path.resolve(import.meta.dirname, '../../../../gradle/spring-ruleset.xml');
const { files } = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const ENTITY_ANNOTATIONS = ['Entity', 'MappedSuperclass', 'Embeddable'].map(
  (name) => `jakarta.persistence.${name}`,
);
const BUILD_PLUGIN = { annotations: ENTITY_ANNOTATIONS, presets: ['spring'] };
const SKIPPED = {
  SpringQueryConcatenation:
    'kotlin-source/SqlStringBuilding flags SQL built from runtime values on the same calls',
};
const OWN_ROUTE = {
  SpringDataNativeQuery: 'the only inline suppression nitpicker accepts.',
};

function findingsWith(manifest, { projectRoot = PROJECT, javaRoots = ['src/main/java'] } = {}) {
  return springFindings(files, {
    finding: findingFactory(),
    manifest,
    projectFiles: files,
    projectRoot,
    javaRoots,
  });
}

function summary(findings) {
  return findings.map(
    ({ path: file, location, rule, symbol }) =>
      `${file.replace('src/main/kotlin/shop/', '')}:${String(location.line)} ${rule} ${symbol}`,
  );
}

const EXPECTED = [
  'bad/Beans.kt:21 SpringConstructorInjection FieldInjected.orders',
  'bad/Beans.kt:21 SpringImmutableBeans FieldInjected.orders',
  'bad/Beans.kt:24 SpringConstructorInjection FieldInjected.token',
  'bad/Beans.kt:24 SpringImmutableBeans FieldInjected.token',
  'bad/Beans.kt:24 SpringValueSecretDefault FieldInjected.token',
  'bad/Beans.kt:26 SpringImmutableBeans FieldInjected.counter',
  'bad/Beans.kt:28 SpringBeanCollectionState FieldInjected.cache',
  'bad/Beans.kt:35 SpringConstructorInjection FieldInjected.setClock',
  'bad/Beans.kt:39 SpringNoServiceLocator Locator.context',
  'bad/Beans.kt:39 SpringNoLazyInjection Locator.other',
  'bad/Beans.kt:46 SpringLiteConfiguration AppConfig',
  'bad/Beans.kt:46 SpringNoComponentScan AppConfig',
  'bad/Beans.kt:49 SpringNoComponentScan App',
  'bad/Beans.kt:52 SpringTypedConfiguration Remote.url',
  'bad/Beans.kt:53 SpringHttpClientTimeouts Remote.create',
  'bad/Beans.kt:56 SpringHttpClientPerCall Remote.fetch.RestTemplate',
  'bad/Beans.kt:57 SpringTypedConfiguration Remote.fetch.getProperty',
  'bad/Beans.kt:60 SpringHttpClientPerCall Remote.builder.RestTemplateBuilder',
  'bad/Beans.kt:67 SpringNoPostConstructIo Warmup.load.findAll',
  'bad/Beans.kt:73 SpringProfileOnConfiguration ProdOnly',
  'bad/Beans.kt:74 SpringTypedConfiguration ProdOnly.read.getProperty',
  'bad/Clients.kt:19 SpringHttpClientTimeouts HttpConfig.jdk.newHttpClient',
  'bad/Clients.kt:22 SpringHttpClientTimeouts HttpConfig.rest.builder',
  'bad/Clients.kt:33 SpringHardcodedUser HttpConfig.admin.password',
  'bad/Clients.kt:36 SpringHttpClientTimeouts HttpConfig.template.RestTemplate',
  'bad/Clients.kt:41 SpringNoPostConstructIo Loader.warm.findAll',
  'bad/Clients.kt:53 SpringNoPostConstructIo Ledger.prime.count',
  'bad/Clients.kt:58 SpringTransactionalReadOnlyWrite Ledger.total.deleteAll',
  'bad/Clients.kt:70 SpringNoSwallowedTransactionException Ledger.apply.e',
  'bad/Clients.kt:77 SpringTransactionalCheckedRollback Ledger.close',
  'bad/Data.kt:12 SpringDataDerivedQuery InvoiceRepository.findByStatus',
  'bad/Data.kt:15 SpringDataNamedParameters InvoiceRepository.byId',
  'bad/Data.kt:18 SpringDataQueryTextBlock InvoiceRepository.byStatus',
  'bad/Data.kt:21 SpringDataNativeQuery InvoiceRepository.raw',
  'bad/Data.kt:24 SpringDataNativeQuery InvoiceRepository.rawOpen',
  'bad/Data.kt:28 SpringDataModifyingQuery InvoiceRepository.markStatus',
  'bad/Data.kt:36 SpringDataNoSaveInLoop InvoiceService.importAll.save',
  'bad/Data.kt:38 SpringDataBatchOfOne InvoiceService.importAll.saveAll',
  'bad/Data.kt:39 SpringDataNoSaveInLoop InvoiceService.importAll.delete',
  'bad/Data.kt:40 SpringDataRowWriteInLoop InvoiceService.importAll.markStatus',
  'bad/Data.kt:41 SpringDataSaveInLoopHelper InvoiceService.importAll.store',
  'bad/Data.kt:42 SpringDataNoSaveInLoop InvoiceService.importAll.persist',
  'bad/Data.kt:43 SpringDataSaveInLoopHelper InvoiceService.importAll.archive',
  'bad/Data.kt:47 SpringDataRowWriteInLoop InvoiceService.importAll.executeUpdate',
  'bad/Data.kt:49 SpringDataNoFlush InvoiceService.importAll.flush',
  'bad/Data.kt:50 SpringDataNativeQuery InvoiceService.importAll.createNativeQuery',
  'bad/Data.kt:62 SpringDataFilterInQuery InvoiceService.anyOpen.findAll',
  'bad/Data.kt:65 SpringDataFilterInQuery InvoiceService.unpaid.findAll',
  'bad/Data.kt:68 SpringDataFilterInQuery InvoiceService.total.findAll',
  'bad/Entities.kt:20 JpaEntityClass Customer',
  'bad/Entities.kt:20 JpaVersion Customer',
  'bad/Entities.kt:20 JpaIdentityHashCode Customer',
  'bad/Entities.kt:21 JpaSequenceIds Customer.id',
  'bad/Entities.kt:32 JpaLazyFetching Invoice.customer',
  'bad/Entities.kt:33 JpaLazyFetching Invoice.receipt',
  'bad/Entities.kt:34 JpaLazyFetching Invoice.lines',
  'bad/Entities.kt:35 JpaManyToManyCascade Invoice.tags',
  'bad/Entities.kt:35 JpaManyToManySet Invoice.tags',
  'bad/Entities.kt:36 JpaEnumString Invoice.status',
  'bad/Entities.kt:37 JpaEnumString Invoice.history',
  'bad/Entities.kt:38 JpaEnumString Invoice.limits',
  'bad/Entities.kt:40 JpaIdentityHashCode Invoice.hashCode',
  'bad/Entities.kt:46 JpaVersion BaseEntity',
  'bad/Entities.kt:49 JpaSequenceIds BaseEntity.id',
  'bad/Proxies.kt:17 SpringProxySelfCall Billing.charge.record',
  'bad/Proxies.kt:18 SpringProxySelfCall Billing.charge.record',
  'bad/Proxies.kt:25 SpringNoSwallowedTransactionException Billing.record.e',
  'bad/Proxies.kt:28 SpringNoSwallowedTransactionException Billing.record.runCatching',
  'bad/Proxies.kt:28 SpringDataNoFlush Billing.record.flush',
  'bad/Proxies.kt:32 SpringProxyMethodVisibility Billing.hidden',
  'bad/Proxies.kt:35 SpringNoRequiresNew Billing.audit',
  'bad/Proxies.kt:39 SpringTransactionalReadOnlyWrite Billing.report.save',
  'bad/Proxies.kt:40 SpringTransactionalReadOnlyWrite Billing.report.persist',
  'bad/Proxies.kt:45 SpringTransactionalCheckedRollback Billing.export',
  'bad/Proxies.kt:48 SpringAsyncExecutor Billing.notifyLater',
  'bad/Proxies.kt:48 SpringAsyncExecutor Billing.notifyLater',
  'bad/Proxies.kt:51 SpringScheduledFixedDelay Billing.tick',
  'bad/Proxies.kt:55 SpringProxyMethodVisibility Billing.Companion.statics',
  'bad/Proxies.kt:60 SpringTransactionalAnnotation LegacyTx',
  'bad/Proxies.kt:64 SpringNoTransactionalController TxController',
  'bad/Proxies.kt:71 SpringProxyMethodVisibility Mailer.send',
  'bad/Security.kt:18 SpringCsrfDisabled SecurityConfig.chain.csrf',
  'bad/Security.kt:21 SpringPermitAllAnyRequest SecurityConfig.chain.authorize',
  'bad/Security.kt:29 SpringPermitAllAnyRequest SecurityConfig.javaStyle.permitAll',
  'bad/Security.kt:29 SpringCsrfDisabled SecurityConfig.javaStyle.csrf',
  'bad/Security.kt:32 SpringPasswordEncoder SecurityConfig.encoder.getInstance',
  'bad/Security.kt:35 SpringHardcodedUser SecurityConfig.users.password',
  'bad/Security.kt:40 SpringCorsWildcard SecurityConfig.cors.allowedOrigins',
  'bad/Security.kt:47 SpringNoCrossOrigin Open',
  'bad/Security.kt:47 SpringCorsWildcard Open',
  'bad/Web.kt:15 SpringNoCrossOrigin OrderController',
  'bad/Web.kt:17 SpringComposedMapping OrderController.all',
  'bad/Web.kt:17 SpringTypedResponse OrderController.all',
  'bad/Web.kt:21 SpringRestController OrderController.create',
  'bad/Web.kt:21 SpringValidRequestBody OrderController.create.request',
  'bad/Web.kt:21 SpringTypedResponse OrderController.create',
  'bad/Web.kt:24 SpringTypedRequestBody OrderController.update.payload',
  'bad/Web.kt:24 SpringTypedResponse OrderController.update',
  'bad/Web.kt:28 SpringTypedResponse OrderController.find:null',
  'bad/Web.kt:33 SpringTypedRequestBody OrderController.raw.node',
  'bad/Web.kt:33 SpringTypedResponse OrderController.raw',
  'bad/Web.kt:38 SpringRestController PageController',
  'bad/Web.kt:47 SpringNoErrorLeak Errors.handle.e',
  'bad/Web.kt:52 SpringNoErrorLeak Errors.state.e',
  'bad/Web.kt:57 SpringNoErrorLeak Errors.trace.e',
];

describe('Kotlin Spring rules on the recorded fixture facts', () => {
  it('reports every banned form as agents write it and none of the allowed forms', () => {
    expect(summary(findingsWith({ spring: true, kotlinAllOpen: BUILD_PLUGIN }))).toEqual(EXPECTED);
  });

  it('covers every ported rule with a banned fixture', () => {
    const reported = new Set(
      findingsWith({ spring: true, kotlinAllOpen: BUILD_PLUGIN }).map(({ rule }) => rule),
    );

    expect([...reported].toSorted()).toEqual([...SPRING_RULES].toSorted());
  });

  it('uses the Java rule ids, so one exception entry lifts the rule in both languages', () => {
    const javaRules = new Set(
      [...readFileSync(RULESET, 'utf8').matchAll(/<rule name="(\w+)"/gu)].map(([, name]) => name),
    );

    expect(SPRING_RULES.filter((rule) => !javaRules.has(rule))).toEqual([]);
    expect([...javaRules].filter((rule) => !SPRING_RULES.includes(rule))).toEqual(
      Object.keys(SKIPPED),
    );
    expect(
      SPRING_RULES.every((rule) => KOTLIN_REVIEW_EXCEPTION_RULES.includes(`pmd/${rule}`)),
    ).toBe(true);
  });

  it('names the allowed form first and ends with the exception route of its own rule', () => {
    for (const finding of findingsWith({ spring: true, kotlinAllOpen: BUILD_PLUGIN })) {
      expect(finding.tool).toBe('pmd');
      expect(finding.classification).toBe('enforceable');
      expect(/^[A-Z]/u.test(finding.message)).toBe(true);
      expect(
        finding.message.endsWith(
          OWN_ROUTE[finding.rule] ??
            `If it is right here, add an exception for pmd/${finding.rule} in nitpicker.config.json.`,
        ),
      ).toBe(true);
    }
  });

  it('runs only on a Spring project, as the Java rule set does', () => {
    expect(findingsWith({ spring: false })).toEqual([]);
    expect(findingsWith({})).toEqual([]);
  });

  it('checks finality only when the build tells which classes the all-open plugin opens', () => {
    const unknown = summary(findingsWith({ spring: true }));
    const withoutPlugin = summary(
      findingsWith({ spring: true, kotlinAllOpen: { annotations: [], presets: [] } }),
    );

    expect(EXPECTED.filter((line) => !unknown.includes(line))).toEqual([
      'bad/Proxies.kt:71 SpringProxyMethodVisibility Mailer.send',
    ]);
    expect(withoutPlugin.filter((line) => line.startsWith('good/'))).toEqual([
      'good/Clients.kt:85 SpringProxyMethodVisibility Ledger.total',
      'good/Clients.kt:88 SpringProxyMethodVisibility Ledger.settle',
      'good/Clients.kt:102 SpringProxyMethodVisibility Ledger.close',
      'good/Data.kt:35 SpringProxyMethodVisibility ShipmentService.importAll',
      'good/Data.kt:48 SpringProxyMethodVisibility ShipmentService.later',
      'good/Data.kt:51 SpringProxyMethodVisibility ShipmentService.touch',
      'good/Data.kt:54 SpringProxyMethodVisibility ShipmentService.open',
      'good/Data.kt:57 SpringProxyMethodVisibility ShipmentService.openCount',
      'good/Entities.kt:48 JpaEntityClass Tag',
      'good/Entities.kt:51 JpaEntityClass Shipment',
      'good/Entities.kt:64 JpaEntityClass Line',
      'good/Proxies.kt:14 SpringProxyMethodVisibility Billing.charge',
      'good/Proxies.kt:26 SpringProxyMethodVisibility Billing.record',
      'good/Proxies.kt:31 SpringProxyMethodVisibility Billing.report',
      'good/Proxies.kt:35 SpringProxyMethodVisibility Billing.export',
      'good/Proxies.kt:38 SpringProxyMethodVisibility Billing.notifyLater',
      'good/Proxies.kt:47 SpringProxyMethodVisibility Audit.write',
    ]);
  });
});

describe('Kotlin Spring rules that read the rest of the project', () => {
  it('finds a repository declared in Java by reading its source under the Java roots', () => {
    const viaJava = summary(
      findingsWith({ spring: true, kotlinAllOpen: BUILD_PLUGIN }, { javaRoots: [] }),
    );

    expect(EXPECTED.filter((line) => !viaJava.includes(line))).toEqual([
      'bad/Clients.kt:41 SpringNoPostConstructIo Loader.warm.findAll',
      'bad/Clients.kt:53 SpringNoPostConstructIo Ledger.prime.count',
      'bad/Clients.kt:58 SpringTransactionalReadOnlyWrite Ledger.total.deleteAll',
    ]);
  });

  it('treats a class as open when the all-open plugin names one of its annotations', () => {
    const opened = summary(
      findingsWith({
        spring: true,
        kotlinAllOpen: {
          annotations: ['org.springframework.stereotype.Service', ...ENTITY_ANNOTATIONS],
          presets: [],
        },
      }),
    );

    expect(opened.filter((line) => line.startsWith('good/'))).toEqual([]);
  });
});

describe('withoutCoveredSourceFindings', () => {
  const at = (tool, rule, line) => ({ tool, rule, path: 'A.kt', location: { line } });

  it('keeps one finding when a Spring rule names the allowed form for the same client or loop', () => {
    const findings = [
      at('kotlin-source', 'HttpWithoutTimeout', 3),
      at('pmd', 'SpringHttpClientPerCall', 3),
      at('kotlin-source', 'HttpWithoutTimeout', 9),
      at('kotlin-source', 'IoCallInLoop', 3),
      at('kotlin-source', 'IoCallInLoop', 7),
      at('pmd', 'SpringDataNoSaveInLoop', 7),
    ];

    expect(withoutCoveredSourceFindings(findings)).toEqual([
      findings[1],
      findings[2],
      findings[3],
      findings[5],
    ]);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findingFactory } from '../review-finding.mjs';
import { routed } from '../test-support/facts.mjs';
import { KOTLIN_REVIEW_EXCEPTION_RULES } from '../review-rules.mjs';
import { springFindings, withoutCoveredSourceFindings } from './spring-findings.mjs';
import { ALLOWED_FORM_FIRST } from '../../../spring/test-support/allowed-form.mjs';
import { SPRING_RULES, springMessage } from './spring-messages.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures');
const FIXTURE = path.join(FIXTURES, 'kotlin-spring-facts.json');
const PROJECT = path.join(FIXTURES, 'kotlin-spring-project');
const RULESET = path.resolve(import.meta.dirname, '../../../../gradle/spring-ruleset.xml');
const { files } = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const SPRING_PLUGIN = { annotations: [], presets: ['spring'] };

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
  'bad/Defaults.kt:17 SpringValueSecretDefault JwtProps.secret',
  'bad/Defaults.kt:23 SpringNoServiceLocator Receipts.context',
  'bad/Defaults.kt:26 SpringProxySelfCall Receipts.issue.record',
  'bad/Defaults.kt:27 SpringProxySelfCall Receipts.issue.find',
  'bad/Defaults.kt:43 SpringNoSwallowedTransactionException Receipts.retry.e',
  'bad/Defaults.kt:49 SpringTransactionalCheckedRollback Receipts.importAll',
  'bad/Defaults.kt:61 SpringNoSwallowedTransactionException Receipts.cancel.e',
  'bad/Defaults.kt:66 SpringTypedConfiguration Receipts.secret.getProperty',
  'bad/Defaults.kt:66 SpringValueSecretDefault Receipts.secret.getProperty',
  'bad/Defaults.kt:68 SpringTypedConfiguration Receipts.url.get',
  'bad/Defaults.kt:70 SpringTypedConfiguration Receipts.mode.getProperty',
  'bad/Defaults.kt:72 SpringHttpClientPerCall Receipts.fetch.RestTemplate',
  'bad/Defaults.kt:84 SpringImmutableBeans Sequence.instances',
  'bad/Defaults.kt:85 SpringBeanCollectionState Sequence.seen',
  'bad/Defaults.kt:91 SpringBeanCollectionState Caches.first',
  'bad/Defaults.kt:92 SpringBeanCollectionState Caches.second',
  'bad/Defaults.kt:93 SpringBeanCollectionState Caches.third',
  'bad/Defaults.kt:103 SpringConstructorInjection SecondaryInjected',
  'bad/Defaults.kt:117 SpringProxyMethodVisibility Invoicing.charge',
  'bad/Handlers.kt:19 SpringTypedResponse InferredController.inferred',
  'bad/Handlers.kt:22 SpringTypedRequestBody InferredController.echo.body',
  'bad/Handlers.kt:22 SpringTypedResponse InferredController.echo',
  'bad/Handlers.kt:29 SpringNoErrorLeak AliasedErrors.failed.e',
  'bad/Handlers.kt:41 SpringHttpClientTimeouts FactoryConfig.bare.SimpleClientHttpRequestFactory',
  'bad/Handlers.kt:45 SpringHttpClientTimeouts FactoryConfig.named.SimpleClientHttpRequestFactory',
  'bad/Handlers.kt:50 SpringHttpClientTimeouts FactoryConfig.qualified.RestTemplate',
  'bad/Proxies.kt:17 SpringProxySelfCall Billing.charge.record',
  'bad/Proxies.kt:18 SpringProxySelfCall Billing.charge.record',
  'bad/Proxies.kt:25 SpringNoSwallowedTransactionException Billing.record.e',
  'bad/Proxies.kt:28 SpringNoSwallowedTransactionException Billing.record.runCatching',
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
    expect(summary(findingsWith({ spring: true, kotlinAllOpen: SPRING_PLUGIN }))).toEqual(EXPECTED);
  });

  it('covers every ported rule with a banned fixture', () => {
    const reported = new Set(
      findingsWith({ spring: true, kotlinAllOpen: SPRING_PLUGIN }).map(({ rule }) => rule),
    );

    expect([...reported].toSorted()).toEqual([...SPRING_RULES].toSorted());
  });

  it('uses the Java rule ids, so one exception entry lifts the rule in both languages', () => {
    const javaRules = new Set(
      [...readFileSync(RULESET, 'utf8').matchAll(/<rule name="(\w+)"/gu)].map(([, name]) => name),
    );

    expect(SPRING_RULES.filter((rule) => !javaRules.has(rule))).toEqual([]);
    expect(
      SPRING_RULES.every((rule) => KOTLIN_REVIEW_EXCEPTION_RULES.includes(`pmd/${rule}`)),
    ).toBe(true);
    expect(KOTLIN_REVIEW_EXCEPTION_RULES.includes('pmd/SpringQueryConcatenation')).toBe(true);
  });

  it('ends each message with the exception route of its own rule', () => {
    for (const finding of findingsWith({ spring: true, kotlinAllOpen: SPRING_PLUGIN })) {
      expect(finding.tool).toBe('pmd');
      expect(finding.classification).toBe('enforceable');
      expect(finding.message).toBe(routed(springMessage(finding.rule), finding.rule, finding.path));
    }
  });

  it('leads every message with the allowed form, never with a prohibition or the problem', () => {
    const leads = SPRING_RULES.filter((rule) => !ALLOWED_FORM_FIRST.test(springMessage(rule)));

    expect(leads).toEqual([]);
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
      'bad/Defaults.kt:117 SpringProxyMethodVisibility Invoicing.charge',
      'bad/Proxies.kt:71 SpringProxyMethodVisibility Mailer.send',
    ]);
    expect(withoutPlugin.filter((line) => line.startsWith('good/'))).toEqual([
      'good/Clients.kt:85 SpringProxyMethodVisibility Ledger.total',
      'good/Clients.kt:88 SpringProxyMethodVisibility Ledger.settle',
      'good/Clients.kt:102 SpringProxyMethodVisibility Ledger.close',
      'good/Defaults.kt:23 SpringProxyMethodVisibility Accounts.duplicate',
      'good/Defaults.kt:32 SpringProxyMethodVisibility Accounts.helper',
      'good/Defaults.kt:43 SpringProxyMethodVisibility Accounts.onFailure',
      'good/Defaults.kt:48 SpringProxyMethodVisibility Accounts.folded',
      'good/Defaults.kt:51 SpringProxyMethodVisibility Accounts.orElse',
      'good/Defaults.kt:54 SpringProxyMethodVisibility Accounts.later',
      'good/Defaults.kt:60 SpringProxyMethodVisibility Accounts.sendLater',
      'good/Defaults.kt:68 SpringProxyMethodVisibility Catalog.cached',
      'good/Defaults.kt:71 SpringProxyMethodVisibility Catalog.list',
      'good/Defaults.kt:87 SpringProxyMethodVisibility Inventory.cached',
      'good/Defaults.kt:90 SpringProxyMethodVisibility Inventory.list',
      'good/Defaults.kt:121 SpringProxyMethodVisibility Pricing.quote',
      'good/Defaults.kt:127 SpringProxyMethodVisibility Checks.run',
      'good/Proxies.kt:14 SpringProxyMethodVisibility Billing.charge',
      'good/Proxies.kt:26 SpringProxyMethodVisibility Billing.record',
      'good/Proxies.kt:31 SpringProxyMethodVisibility Billing.report',
      'good/Proxies.kt:35 SpringProxyMethodVisibility Billing.export',
      'good/Proxies.kt:38 SpringProxyMethodVisibility Billing.notifyLater',
      'good/Proxies.kt:47 SpringProxyMethodVisibility Audit.write',
      'good/StarImports.kt:13 SpringProxyMethodVisibility Parser.parse',
    ]);
  });
});

describe('Kotlin Spring rules that read the rest of the project', () => {
  it('finds a repository declared in Java by reading its source under the Java roots', () => {
    const viaJava = summary(
      findingsWith({ spring: true, kotlinAllOpen: SPRING_PLUGIN }, { javaRoots: [] }),
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
        kotlinAllOpen: { annotations: ['org.springframework.stereotype.Service'], presets: [] },
      }),
    );

    expect(opened.filter((line) => line.startsWith('good/'))).toEqual([
      'good/Defaults.kt:121 SpringProxyMethodVisibility Pricing.quote',
      'good/Defaults.kt:127 SpringProxyMethodVisibility Checks.run',
    ]);
  });

  it('opens a class through a project annotation only when the plugin opens that annotation', () => {
    const opened = summary(
      findingsWith({
        spring: true,
        kotlinAllOpen: { annotations: ['org.springframework.stereotype.Component'], presets: [] },
      }),
    );

    expect(opened.filter((line) => /Pricing\.quote|Invoicing\.charge/u.test(line))).toEqual([
      'bad/Defaults.kt:117 SpringProxyMethodVisibility Invoicing.charge',
    ]);
  });
});

describe('withoutCoveredSourceFindings', () => {
  const at = (tool, rule, line) => ({ tool, rule, path: 'A.kt', location: { line } });

  it('keeps one finding when a Spring rule names the allowed form for the same client', () => {
    const findings = [
      at('kotlin-source', 'HttpWithoutTimeout', 3),
      at('pmd', 'SpringHttpClientPerCall', 3),
      at('kotlin-source', 'HttpWithoutTimeout', 9),
      at('kotlin-source', 'IoCallInLoop', 3),
    ];

    expect(withoutCoveredSourceFindings(findings)).toEqual(findings.slice(1));
  });

  it('keeps the Kotlin finding when an exception lifts the Spring finding on that line', () => {
    const findings = [
      at('kotlin-source', 'HttpWithoutTimeout', 3),
      at('pmd', 'SpringHttpClientPerCall', 3),
    ];
    const exceptions = [{ rule: 'pmd/SpringHttpClientPerCall', glob: 'app/A.kt' }];

    expect(withoutCoveredSourceFindings(findings, { exceptions, modulePath: 'app' })).toEqual(
      findings,
    );
    expect(withoutCoveredSourceFindings(findings, { exceptions, modulePath: 'other' })).toEqual(
      findings.slice(1),
    );
  });
});

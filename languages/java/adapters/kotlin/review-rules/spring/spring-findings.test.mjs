import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findingFactory } from '../review-finding.mjs';
import { routed } from '../test-support/facts.mjs';
import { KOTLIN_REVIEW_EXCEPTION_RULES } from '../review-rules.mjs';
import { springFindings } from './spring-findings.mjs';
import { ALLOWED_FORM_FIRST } from '../../../spring/test-support/allowed-form.mjs';
import { SPRING_RULES, springMessage } from './spring-messages.mjs';
import { EXPECTED } from '../test-support/spring-expected.mjs';

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
  return findings
    .filter(({ path: file }) => !file.endsWith('/Ledger.kt'))
    .map(
      ({ path: file, location, rule, symbol }) =>
        `${file.replace('src/main/kotlin/shop/', '')}:${String(location.line)} ${rule} ${symbol}`,
    );
}

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
    expect(KOTLIN_REVIEW_EXCEPTION_RULES.includes('pmd/SpringQueryConcatenation')).toBe(true);
  });

  it('ends each message with the exception route of its own rule', () => {
    const findings = findingsWith({ spring: true, kotlinAllOpen: BUILD_PLUGIN });
    expect(
      findings.map(({ tool, classification, message, allowedForm }) => ({
        tool,
        classification,
        message,
        allowedForm,
      })),
    ).toEqual(
      findings.map(({ rule, path }) => ({
        tool: 'pmd',
        classification: 'enforceable',
        message: routed(springMessage(rule), rule, path),
        allowedForm: springMessage(rule),
      })),
    );
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
      'good/Batches.kt:32 JpaEntityClass Swatch',
      'good/Batches.kt:56 SpringProxyMethodVisibility SwatchService.recolor',
      'good/Batches.kt:73 SpringProxyMethodVisibility SwatchService.sweep',
      'good/Batches.kt:84 SpringProxyMethodVisibility SwatchService.lookups',
      'good/Batches.kt:91 SpringProxyMethodVisibility SwatchService.batches',
      'good/Batches.kt:109 SpringProxyMethodVisibility SwatchService.chunkUpdates',
      'good/Clients.kt:85 SpringProxyMethodVisibility Ledger.total',
      'good/Clients.kt:88 SpringProxyMethodVisibility Ledger.settle',
      'good/Clients.kt:102 SpringProxyMethodVisibility Ledger.close',
      'good/Data.kt:35 SpringProxyMethodVisibility ShipmentService.importAll',
      'good/Data.kt:48 SpringProxyMethodVisibility ShipmentService.later',
      'good/Data.kt:51 SpringProxyMethodVisibility ShipmentService.touch',
      'good/Data.kt:54 SpringProxyMethodVisibility ShipmentService.open',
      'good/Data.kt:57 SpringProxyMethodVisibility ShipmentService.openCount',
      'good/Data.kt:73 SpringProxyMethodVisibility StockService.retire',
      'good/Data.kt:84 SpringProxyMethodVisibility StockService.reopen',
      'good/Data.kt:95 SpringProxyMethodVisibility GroupedStockService.retireGroups',
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
      'good/Entities.kt:48 JpaEntityClass Tag',
      'good/Entities.kt:51 JpaEntityClass Shipment',
      'good/Entities.kt:64 JpaEntityClass Line',
      'good/Entities.kt:70 JpaEntityClass Parcel',
      'good/Proxies.kt:14 SpringProxyMethodVisibility Billing.charge',
      'good/Proxies.kt:26 SpringProxyMethodVisibility Billing.record',
      'good/Proxies.kt:31 SpringProxyMethodVisibility Billing.report',
      'good/Proxies.kt:35 SpringProxyMethodVisibility Billing.export',
      'good/Proxies.kt:38 SpringProxyMethodVisibility Billing.notifyLater',
      'good/Proxies.kt:47 SpringProxyMethodVisibility Audit.write',
      'good/ProxyFamilies.kt:19 SpringProxyMethodVisibility RemoteCalls.fetch',
      'good/ProxyFamilies.kt:22 SpringProxyMethodVisibility RemoteCalls.timed',
      'good/Rows.kt:38 JpaEntityClass Crate',
      'good/Rows.kt:63 SpringProxyMethodVisibility CrateService.archive',
      'good/Rows.kt:103 SpringProxyMethodVisibility ShelfService.tidy',
      'good/StarImports.kt:13 SpringProxyMethodVisibility Parser.parse',
    ]);
  });
});

describe('Kotlin Spring Data loop rules on grouped and partitioned locals', () => {
  const rowWrites = (owner) =>
    summary(findingsWith({ spring: true, kotlinAllOpen: BUILD_PLUGIN })).filter(
      (line) => line.includes('SpringDataRowWriteInLoop') && line.includes(` ${owner}.`),
    );

  it('reads groupBy values and both sides of partition as collections, so passing them is set-based', () => {
    expect(rowWrites('GroupedStockService')).toEqual([]);
  });

  it('still reports a per-id write over a partition side, the groupBy keys or one grouped list', () => {
    expect(rowWrites('GroupedService').map((line) => line.split(' ')[0])).toEqual([
      'bad/Data.kt:154',
      'bad/Data.kt:156',
      'bad/Data.kt:157',
      'bad/Data.kt:159',
    ]);
  });
});

describe('Kotlin Spring rules that read the rest of the project', () => {
  it('finds a repository or an enum declared in Java by reading its source under the Java roots', () => {
    const viaJava = summary(
      findingsWith({ spring: true, kotlinAllOpen: BUILD_PLUGIN }, { javaRoots: [] }),
    );

    expect(EXPECTED.filter((line) => !viaJava.includes(line))).toEqual([
      'bad/Batches.kt:24 JpaEnumString Posting.grade',
      'bad/Clients.kt:41 SpringNoPostConstructIo Loader.warm.findAll',
      'bad/Clients.kt:53 SpringNoPostConstructIo Ledger.prime.count',
      'bad/Clients.kt:58 SpringTransactionalReadOnlyWrite Ledger.total.deleteAll',
      'bad/Entities.kt:62 JpaEnumString Refund.priority',
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

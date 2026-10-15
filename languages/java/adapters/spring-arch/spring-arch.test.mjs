import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../core/diff/finding-schema.mjs';
import { readSpringArchFindings, SPRING_ARCH_REPORT } from './spring-arch.mjs';

const ROOT = 'com.shop';
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function read(violations, resolvePath = (className) => `src/${className}.java`) {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-arch-'));
  temporaryRoots.push(reportRoot);
  writeFileSync(
    path.join(reportRoot, SPRING_ARCH_REPORT),
    JSON.stringify({ root: ROOT, violations }),
  );
  return readSpringArchFindings(reportRoot, { resolvePath });
}

function violation(rule, className, detail = '', fileName = '') {
  return { rule, className, fileName, detail };
}

function exceptionRoute(rule) {
  return `If it is right here, add an exception for archunit/${rule} in nitpicker.config.json.`;
}

describe('readSpringArchFindings messages', () => {
  it.each([
    [
      violation('spring-layout', 'com.shop.Helper'),
      'Helper sits in the root package com.shop. Put it in a feature package (com.shop.<feature>); the root package holds only the application and @Configuration classes.',
    ],
    [
      violation('spring-layout', 'com.shop.service.CustomerService', 'service'),
      'CustomerService is in the layer package "service". Group by feature instead: com.shop.<feature> holds its controller, service and repository together, and pure utilities go to com.shop.shared.',
    ],
    [
      violation(
        'spring-feature-boundary',
        'com.shop.billing.Rules',
        'com.shop.web.internal.Formats',
      ),
      'Rules uses Formats from com.shop.web.internal, inside another root package com.shop.web. Depend only on the classes directly in com.shop.web, or move what both need to com.shop.shared.',
    ],
    [
      violation('spring-shared-pure', 'com.shop.shared.Slug'),
      'Slug is a Spring bean or entity in the shared package. shared holds pure utilities; move it into the feature that owns it.',
    ],
    [
      violation('spring-shared-pure', 'com.shop.shared.Slug', 'com.shop.orders.Total'),
      'Slug depends on Total in com.shop.orders. shared holds pure utilities and depends on no other root package; move the code into the package that uses it.',
    ],
    [
      violation(
        'spring-controller-repository',
        'com.shop.web.Ctrl',
        'com.shop.data.CustomerRepository',
      ),
      'Ctrl depends on repository CustomerRepository. Controllers call services only; inject a service and let it use the repository.',
    ],
    [
      violation('spring-controller-entity', 'com.shop.web.Ctrl', 'all:com.shop.data.Customer'),
      'Ctrl.all exposes the entity Customer in its signature. Take and return a record (DTO) and map it in the service.',
    ],
    [
      violation(
        'spring-service-web',
        'com.shop.core.Svc',
        'jakarta.servlet.http.HttpServletRequest',
      ),
      'Svc depends on HttpServletRequest, a web type. Services and repositories do not know the web layer; pass plain values and map them in the controller.',
    ],
    [
      violation('spring-test-placement', 'com.shop.orders.FlowTest'),
      'FlowTest starts a Spring context outside an integration package. Move it to com.shop.orders.integration (a package named integration or it), or test the class directly with new and mocks.',
    ],
    [
      violation('spring-no-dirties-context', 'com.shop.orders.FlowTest'),
      'FlowTest uses @DirtiesContext, which rebuilds the context and slows the suite. Remove it: reset state in the test, or test the class without a context.',
    ],
  ])('words %j with the allowed form and the exception route', (input, message) => {
    const [finding] = read([input]);

    expect(finding.message).toBe(`${message} ${exceptionRoute(input.rule)}`);
    expect(finding.rule).toBe(input.rule);
  });
});

describe('readSpringArchFindings findings', () => {
  it('reports one enforceable archunit finding per rule, class and detail at the class source file', () => {
    const findings = read([
      violation('spring-service-web', 'com.shop.core.Svc', 'a.Web'),
      violation('spring-service-web', 'com.shop.core.Svc', 'b.Web'),
      violation('spring-controller-entity', 'com.shop.web.Ctrl', 'all:com.shop.data.Customer'),
      violation('spring-layout', 'com.shop.Helper'),
    ]);

    expect(
      findings.map(({ tool, rule, path: file, identity, symbol, classification }) => ({
        tool,
        rule,
        file,
        identity,
        symbol,
        classification,
      })),
    ).toEqual([
      {
        tool: 'archunit',
        rule: 'spring-service-web',
        file: 'src/com.shop.core.Svc.java',
        identity: 'Svc|Web',
        symbol: 'Svc',
        classification: 'enforceable',
      },
      {
        tool: 'archunit',
        rule: 'spring-service-web',
        file: 'src/com.shop.core.Svc.java',
        identity: 'Svc|Web#2',
        symbol: 'Svc',
        classification: 'enforceable',
      },
      {
        tool: 'archunit',
        rule: 'spring-controller-entity',
        file: 'src/com.shop.web.Ctrl.java',
        identity: 'Ctrl|all:Customer',
        symbol: 'Ctrl',
        classification: 'enforceable',
      },
      {
        tool: 'archunit',
        rule: 'spring-layout',
        file: 'src/com.shop.Helper.java',
        identity: 'Helper',
        symbol: 'Helper',
        classification: 'enforceable',
      },
    ]);
    expect(parseAnalyzerReport({ findings }, 'java').findings).toEqual(findings);
  });

  it('keeps the identity when the class and its dependency move to other packages', () => {
    const identity = (className, detail) =>
      read([violation('spring-service-web', className, detail)]).map((finding) => [
        finding.identity,
        finding.symbol,
      ]);

    expect(identity('com.shop.audit.AuditService', 'com.shop.web.AuditController')).toEqual(
      identity('com.shop.service.AuditService', 'com.shop.controller.AuditController'),
    );
  });

  it('asks the resolver for the file name the class was compiled from, or none', () => {
    const asked = [];
    read(
      [
        violation('spring-layout', 'com.shop.Helper', '', 'Helper.kt'),
        violation('spring-layout', 'com.shop.Other'),
      ],
      (className, fileName) => {
        asked.push([className, fileName]);
        return undefined;
      },
    );

    expect(asked).toEqual([
      ['com.shop.Helper', 'Helper.kt'],
      ['com.shop.Other', undefined],
    ]);
  });

  it('skips a class whose source file cannot be found', () => {
    expect(read([violation('spring-layout', 'com.shop.Helper')], () => undefined)).toEqual([]);
  });

  it('fails on a rule it does not know, so a stale report is never half read', () => {
    expect(() => read([violation('spring-made-up', 'com.shop.Helper')])).toThrow(
      'Unknown Spring architecture rule spring-made-up in spring-arch.json',
    );
  });

  it('fails when the report is missing', () => {
    const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-arch-'));
    temporaryRoots.push(reportRoot);

    expect(() => readSpringArchFindings(reportRoot, { resolvePath: () => 'x' })).toThrow(
      'The Spring architecture report spring-arch.json is missing',
    );
  });
});

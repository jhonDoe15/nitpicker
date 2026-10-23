import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import { withoutRouteFields } from '../../../../core/exceptions/test-support/route-check.mjs';
import { readSpringArchFindings, SPRING_ARCH_REPORT } from './spring-arch.mjs';

const ROOT = 'com.shop';
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function read(violations, resolvePath = (className) => `src/${className}.java`, isExcepted) {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-arch-'));
  temporaryRoots.push(reportRoot);
  writeFileSync(
    path.join(reportRoot, SPRING_ARCH_REPORT),
    JSON.stringify({ root: ROOT, violations }),
  );
  return readSpringArchFindings(reportRoot, { resolvePath, isExcepted });
}

function violation(rule, className, detail = '', fileName = '') {
  return { rule, className, fileName, detail };
}

function exceptionRoute(rule, file) {
  return `If this is intended, add {"rule":"archunit/${rule}","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
}

describe('readSpringArchFindings messages', () => {
  it.each([
    [
      violation('spring-layout', 'com.shop.Helper'),
      'Put Helper in a feature package com.shop.<feature>: the root package com.shop holds only the application, @Configuration and @ConfigurationProperties classes.',
    ],
    [
      violation('spring-layout', 'com.shop.service.CustomerService', 'service'),
      'Put CustomerService in the feature package it belongs to, com.shop.<feature>, which holds that feature\'s controller, service and repository together (pure utilities go to com.shop.shared); "service" is a layer package.',
    ],
    [
      violation(
        'spring-feature-boundary',
        'com.shop.billing.Rules',
        'com.shop.catalog.internal.Formats',
      ),
      'Have Rules use only the classes directly in com.shop.catalog, or move what both need to com.shop.shared: Formats is internal to that feature (com.shop.catalog.internal).',
    ],
    [
      violation('spring-shared-pure', 'com.shop.shared.Slug'),
      'Move Slug into the feature that owns it: com.shop.shared holds only pure utilities, not Spring beans or entities.',
    ],
    [
      violation('spring-shared-pure', 'com.shop.shared.Slug', 'com.shop.orders.Total'),
      'Move Slug into the package that uses it, or drop its use of Total: com.shop.shared holds pure utilities and depends on no feature package such as com.shop.orders.',
    ],
    [
      violation(
        'spring-controller-repository',
        'com.shop.web.Ctrl',
        'com.shop.data.CustomerRepository',
      ),
      'Have Ctrl call a service that uses CustomerRepository: controllers call services only, not repositories or data access.',
    ],
    [
      violation('spring-controller-entity', 'com.shop.web.Ctrl', 'all:com.shop.data.Customer'),
      'Take and return a record (DTO) in Ctrl.all and map it in the service: the entity Customer stays out of controller signatures.',
    ],
    [
      violation('ddd-aggregate-reference', 'com.shop.orders.Order', 'com.shop.customers.Customer'),
      'Refer to Customer by its identifier or an Association<Customer, ID> in Order: Customer is the root of another aggregate, and holding it lets one aggregate change another outside its consistency boundary.',
    ],
    [
      violation(
        'ddd-foreign-entity',
        'com.shop.orders.Order',
        'com.shop.carts.Cart:com.shop.carts.LineItem',
      ),
      'Refer to Cart by its identifier in Order instead of holding LineItem: LineItem belongs to the aggregate Cart, and an entity belongs to exactly one aggregate.',
    ],
    [
      violation(
        'ddd-value-object-reference',
        'com.shop.orders.Address',
        'com.shop.customers.Customer',
      ),
      'Hold the identifier of Customer in Address, not the object: a value object is compared by its values, and Customer is an entity with an identity and lifecycle of its own.',
    ],
    [
      violation('spring-controller-controller', 'com.shop.web.Ctrl', 'com.shop.web.OtherCtrl'),
      'Move what Ctrl needs from OtherCtrl into a service both controllers call: a controller handles its own requests and does not hold another controller.',
    ],
    [
      violation('spring-repository-service', 'com.shop.data.Repo', 'com.shop.core.Pricing'),
      'Have the service call Repo and pass it what it needs from Pricing: a repository only reads and writes data and depends on no service.',
    ],
    [
      violation('spring-scope-capture', 'com.shop.core.Svc', 'request:com.shop.web.Cart'),
      "Inject ObjectProvider<Cart> into Svc and call getObject() per use, or give Cart a scoped proxy (proxyMode = ScopedProxyMode.TARGET_CLASS): a singleton gets one Cart when it is created, which fails outside a request and otherwise keeps the first request's bean.",
    ],
    [
      violation(
        'spring-scope-capture',
        'com.shop.core.Config',
        'pricing:session:com.shop.web.Cart',
      ),
      "Inject ObjectProvider<Cart> into the bean Config.pricing and call getObject() per use, or give Cart a scoped proxy (proxyMode = ScopedProxyMode.TARGET_CLASS): a singleton gets one Cart when it is created, which fails outside a session and otherwise keeps the first session's bean.",
    ],
    [
      violation(
        'spring-service-web',
        'com.shop.core.Svc',
        'org.springframework.web.server.ServerWebExchange',
      ),
      'Keep Svc free of web types: take and return plain values, throw a domain exception for errors, and map them to and from ServerWebExchange in the controller or a @ControllerAdvice.',
    ],
    [
      violation('spring-test-placement', 'com.shop.orders.FlowTest'),
      'Test FlowTest with new and mocks, or run it as an integration test: name it FlowIT (Failsafe runs *IT on Maven) or put it in an integration test source set. Both keep its package, so package-private classes stay visible; a package named integration or it also counts.',
    ],
    [
      violation('spring-no-dirties-context', 'com.shop.orders.FlowTest'),
      'Reset state in FlowTest itself, or test the class without a Spring context: @DirtiesContext rebuilds the context and slows the suite.',
    ],
  ])('leads %j with the allowed form and ends with the exception route', (input, message) => {
    const [finding] = read([input]);

    expect(finding.message).toBe(`${message} ${exceptionRoute(input.rule, finding.path)}`);
    expect(finding.allowedForm).toBe(message);
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
    expect(withoutRouteFields(parseAnalyzerReport({ findings }, 'java').findings)).toEqual(
      findings,
    );
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

  it('numbers repeated findings per file, so same-named classes in other packages keep theirs', () => {
    const findings = (withOrders) =>
      read([
        ...(withOrders
          ? [violation('spring-service-web', 'com.shop.orders.Mapper', 'a.web.Request')]
          : []),
        violation('spring-service-web', 'com.shop.billing.Mapper', 'b.web.Request'),
      ]).filter((finding) => finding.path === 'src/com.shop.billing.Mapper.java');

    expect(findings(true).map((finding) => finding.identity)).toEqual(['Mapper|Request']);
    expect(findings(false)).toEqual(findings(true));
  });

  it('reports a feature boundary crossing once, as the layering rule it also breaks, unless that rule is excepted', () => {
    const violations = [
      violation(
        'spring-controller-repository',
        'com.shop.orders.OrderController',
        'com.shop.catalog.internal.CatalogRepository',
      ),
      violation(
        'spring-feature-boundary',
        'com.shop.orders.OrderController',
        'com.shop.catalog.internal.CatalogRepository',
      ),
    ];
    const rules = (isExcepted) =>
      read(violations, undefined, isExcepted).map((finding) => finding.rule);

    expect(rules(undefined)).toEqual(['spring-controller-repository']);
    expect(
      rules(
        (rule, file) =>
          rule === 'archunit/spring-controller-repository' &&
          file === 'src/com.shop.orders.OrderController.java',
      ),
    ).toEqual(['spring-controller-repository', 'spring-feature-boundary']);
  });

  it('leaves out the context tests the shared integration-test rule accepts', () => {
    const placed = read(
      [
        'com.shop.orders.OrderControllerIT',
        'com.shop.orders.OrderIntegrationTest',
        'com.shop.orders.integration.OrderControllerTest',
        'com.shop.it.SliceTest',
        'com.shop.e2e.CheckoutTest',
        'com.shop.orders.OrderControllerTest',
        'com.shop.iterators.IteratorTest',
      ].map((className) => violation('spring-test-placement', className)),
    );

    expect(placed.map((finding) => finding.path)).toEqual([
      'src/com.shop.orders.OrderControllerTest.java',
      'src/com.shop.iterators.IteratorTest.java',
    ]);
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

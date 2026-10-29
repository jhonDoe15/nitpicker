import { afterEach, describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../../shared/findings/finding-policy.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { javaRouteRule } from '../java-policy.mjs';
import { readTestRuntimeFindings } from './test-runtime-findings.mjs';
import {
  JUNIT_TEST,
  createFakeProjects,
  fakeModule,
  javaSource,
  kotlinSource,
} from './test-support/fake-jdeps-project.mjs';

const fake = createFakeProjects();

afterEach(fake.remove);

const NO_PRODUCTION = 'no-production-runtime';
const MATH_TEST = `${javaSource('MathTest')}\n${javaSource('MathOtherTest')}`;

function judge(files, module) {
  const root = fake.project(files);
  return readTestRuntimeFindings(root, { projects: [fakeModule(root, '', module)] });
}

function enforced(findings) {
  return findings
    .filter(({ classification }) => classification === 'enforceable')
    .map(({ tool, rule, path: file }) => `${tool}/${rule} ${file}`);
}

function categories(findings) {
  return Object.fromEntries(
    findings
      .filter(({ rule }) => rule === 'category-count')
      .map(({ metric }) => [metric.name, metric.value]),
  );
}

describe('readTestRuntimeFindings reach', () => {
  it('passes a test that references a production class', () => {
    const findings = judge(
      { 'src/test/java/shop/CartTest.java': javaSource('CartTest') },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.CartTest', JUNIT_TEST],
          ['shop.CartTest', 'shop.Cart'],
        ],
      },
    );

    expect(enforced(findings)).toEqual([]);
    expect(categories(findings)).toEqual({ 'direct-production-runtime': 1 });
  });

  it('passes a test that reaches production through a test helper', () => {
    const findings = judge(
      {
        'src/test/java/shop/CartTest.java': javaSource('CartTest'),
        'src/test/java/shop/Fixtures.java': javaSource('Fixtures'),
      },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.CartTest', JUNIT_TEST],
          ['shop.CartTest', 'shop.Fixtures'],
          ['shop.Fixtures', 'shop.Cart'],
        ],
      },
    );

    expect(enforced(findings)).toEqual([]);
    expect(categories(findings)).toEqual({ 'transitive-production-runtime': 1 });
  });

  it('passes a test that reaches production through its base class', () => {
    const findings = judge(
      {
        'src/test/java/shop/CartTest.java': javaSource('CartTest'),
        'src/test/java/shop/BaseTest.java': `package shop;\n\nabstract class BaseTest {}\n`,
      },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.CartTest', JUNIT_TEST],
          ['shop.CartTest', 'shop.BaseTest'],
          ['shop.BaseTest', 'shop.Cart'],
        ],
      },
    );

    expect(enforced(findings)).toEqual([]);
  });

  it('merges nested and lambda classes into the test class that declares them', () => {
    const findings = judge(
      {
        'src/test/java/shop/CartTest.java': javaSource('CartTest'),
        'src/test/kotlin/shop/PriceTest.kt': kotlinSource('PriceTest'),
      },
      {
        classes: ['shop.Cart', 'shop.Price'],
        tests: [
          ['shop.CartTest$Nested', JUNIT_TEST],
          ['shop.CartTest$Nested$1', 'shop.Cart$Item'],
          ['shop.PriceTest', JUNIT_TEST],
          ['shop.PriceTest$total$1', 'shop.Price'],
        ],
      },
    );

    expect(enforced(findings)).toEqual([]);
  });

  it('passes a test in one module that reaches a class of another module', () => {
    const root = fake.project({
      'api/src/test/java/shop/ApiTest.java': javaSource('ApiTest'),
      'core/src/main/java/shop/Cart.java': javaSource('Cart'),
    });
    const projects = [
      fakeModule(root, 'api', {
        classes: ['shop.Api'],
        tests: [
          ['shop.ApiTest', JUNIT_TEST],
          ['shop.ApiTest', 'shop.Cart'],
        ],
      }),
      fakeModule(root, 'core', { classes: ['shop.Cart'] }),
    ];

    expect(enforced(readTestRuntimeFindings(root, { projects }))).toEqual([]);
  });
});

describe('readTestRuntimeFindings reports', () => {
  it('reports a test that reaches no production class, once per file', () => {
    const findings = judge(
      {
        'src/test/java/shop/MathTest.java': MATH_TEST,
        'src/test/java/shop/Fixtures.java': javaSource('Fixtures'),
      },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.MathTest', JUNIT_TEST],
          ['shop.MathOtherTest', JUNIT_TEST],
          ['shop.MathTest', 'shop.Fixtures'],
          ['shop.Fixtures', 'java.lang.Math'],
        ],
      },
    );

    expect(enforced(findings)).toEqual([
      `test-runtime/${NO_PRODUCTION} src/test/java/shop/MathTest.java`,
    ]);
    expect(findings.filter(({ classification }) => classification === 'enforceable')).toEqual([
      {
        tool: 'test-runtime',
        rule: NO_PRODUCTION,
        path: 'src/test/java/shop/MathTest.java',
        identity: `test:src/test/java/shop/MathTest.java:source:${hash(MATH_TEST)}`,
        message: 'Test has no production runtime',
        classification: 'enforceable',
      },
    ]);
  });

  it('does not judge helpers, abstract bases or classes without a source file', () => {
    const findings = judge(
      {
        'src/test/java/shop/Fixtures.java': javaSource('Fixtures'),
        'src/test/java/shop/BaseTest.java': `package shop;\n\nabstract class BaseTest {}\n`,
      },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.Fixtures', 'java.lang.Object'],
          ['shop.BaseTest', JUNIT_TEST],
          ['shop.GeneratedTest', JUNIT_TEST],
        ],
      },
    );

    expect(findings).toEqual([]);
  });

  it('reports a Kotest spec without production and passes one with it', () => {
    const findings = judge(
      {
        'src/test/kotlin/shop/EmptySpec.kt': kotlinSource('EmptySpec'),
        'src/test/kotlin/shop/CartSpec.kt': kotlinSource('CartSpec'),
      },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.EmptySpec', 'io.kotest.core.spec.style.StringSpec'],
          ['shop.CartSpec', 'io.kotest.core.spec.style.FunSpec'],
          ['shop.CartSpec$1', 'shop.Cart'],
        ],
      },
    );

    expect(enforced(findings)).toEqual([
      `test-runtime/${NO_PRODUCTION} src/test/kotlin/shop/EmptySpec.kt`,
    ]);
  });

  it('reports nothing when a project has no jdeps reports', () => {
    const root = fake.project({});
    const module = fakeModule(root, '', {});
    const projects = [{ ...module, reportRoot: `${root}/missing` }];

    expect(readTestRuntimeFindings(root, { projects })).toEqual([]);
  });
});

describe('readTestRuntimeFindings framework bridges', () => {
  it.each([
    'org.springframework.boot.test.context.SpringBootTest',
    'org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest',
    'org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest',
    'org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest',
    'org.springframework.test.context.junit.jupiter.SpringJUnitConfig',
    'org.springframework.test.context.ContextConfiguration',
    'io.quarkus.test.junit.QuarkusTest',
    'io.micronaut.test.extensions.junit5.annotation.MicronautTest',
    'com.tngtech.archunit.junit.AnalyzeClasses',
  ])('passes a test annotated with %s', (annotation) => {
    const findings = judge(
      { 'src/test/java/shop/AppTest.java': javaSource('AppTest') },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.AppTest', JUNIT_TEST],
          ['shop.AppTest', annotation],
        ],
      },
    );

    expect(enforced(findings)).toEqual([]);
    expect(categories(findings)).toEqual({ 'framework-production-runtime': 1 });
  });

  it('passes a test whose base class starts the framework context', () => {
    const findings = judge(
      {
        'src/test/java/shop/AppTest.java': javaSource('AppTest'),
        'src/test/java/shop/IntegrationBase.java': javaSource('IntegrationBase'),
      },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.AppTest', JUNIT_TEST],
          ['shop.AppTest', 'shop.IntegrationBase'],
          ['shop.IntegrationBase', 'org.springframework.boot.test.context.SpringBootTest'],
        ],
      },
    );

    expect(enforced(findings)).toEqual([]);
  });

  it('does not treat other Spring test annotations as a bridge', () => {
    const findings = judge(
      { 'src/test/java/shop/AppTest.java': javaSource('AppTest') },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.AppTest', JUNIT_TEST],
          ['shop.AppTest', 'org.springframework.boot.test.autoconfigure.AutoConfigureCache'],
        ],
      },
    );

    expect(enforced(findings)).toEqual([
      `test-runtime/${NO_PRODUCTION} src/test/java/shop/AppTest.java`,
    ]);
  });
});

describe('readTestRuntimeFindings exceptions', () => {
  const offending = () =>
    judge(
      { 'src/test/java/shop/MathTest.java': javaSource('MathTest') },
      { classes: ['shop.Cart'], tests: [['shop.MathTest', JUNIT_TEST]] },
    ).filter(({ classification }) => classification === 'enforceable');

  it('names the exception entry that lifts the finding', () => {
    const [finding] = applyFindingPolicy(offending(), { routeRule: javaRouteRule });

    expect(finding.message).toBe(
      'Test has no production runtime. If this is intended, add {"rule":"no-production-runtime","paths":["src/test/java/shop/MathTest.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it.each(['test-runtime/no-production-runtime', 'no-production-runtime'])(
    'lifts the finding with an exception for %s',
    (rule) => {
      const exceptions = [{ rule, paths: ['src/test/java/shop/**'] }];

      expect(applyFindingPolicy(offending(), { routeRule: javaRouteRule, exceptions })).toEqual([]);
    },
  );
});

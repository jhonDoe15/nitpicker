import { afterEach, describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../../shared/findings/finding-policy.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { NO_PRODUCTION_RUNTIME_MESSAGE } from '../../../../shared/test-support/test-runtime-messages.mjs';
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

function judge(files, module, roots = {}) {
  const root = fake.project(files);
  return readTestRuntimeFindings(root, {
    projects: [{ ...fakeModule(root, '', module), ...roots }],
  });
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
        message: NO_PRODUCTION_RUNTIME_MESSAGE,
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

  it.each([
    'src/test/java/shop/e2e/CartTest.java',
    'src/test/java/shop/End_To_End/CartTest.java',
    'src/e2eTest/java/shop/CartTest.java',
    'src/contractTest/java/shop/CartTest.java',
    'contracts/src/test/java/shop/CartTest.java',
    'src/test/java/shop/endToEnd/CartTest.java',
  ])('excludes %s without judging it', (file) => {
    const findings = judge(
      { [file]: javaSource('CartTest') },
      { classes: ['shop.Cart'], tests: [['shop.CartTest', JUNIT_TEST]] },
      { testSourceRoots: [file.slice(0, file.indexOf('/java/') + 5)] },
    );
    const metrics = Object.fromEntries(
      findings
        .filter(({ rule }) => rule === 'test-runtime')
        .map(({ metric }) => [metric.name, metric.value]),
    );

    expect(enforced(findings)).toEqual([]);
    expect(metrics).toEqual({
      discoveredTests: 1,
      analyzedTests: 0,
      excludedTests: 1,
      findings: 0,
    });
  });

  it('judges a Kotest spec style and not a scope type that a helper mentions', () => {
    const findings = judge(
      {
        'src/test/kotlin/shop/EmptySpec.kt': kotlinSource('EmptySpec'),
        'src/test/kotlin/shop/Scopes.kt': kotlinSource('Scopes'),
      },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.EmptySpec', 'io.kotest.core.spec.style.FunSpec'],
          ['shop.Scopes', 'io.kotest.core.spec.style.scopes.FunSpecContainerScope'],
          ['shop.Scopes', 'io.kotest.core.spec.style.FunSpecContainerScope'],
        ],
      },
    );

    expect(enforced(findings)).toEqual([
      `test-runtime/${NO_PRODUCTION} src/test/kotlin/shop/EmptySpec.kt`,
    ]);
  });

  it('does not judge open or abstract Kotlin classes, nor abstract Java classes', () => {
    const findings = judge(
      {
        'src/test/kotlin/shop/OpenSpec.kt': 'package shop\n\nopen class OpenSpec : FunSpec()\n',
        'src/test/kotlin/shop/BaseSpec.kt': 'package shop\n\nabstract class BaseSpec : FunSpec()\n',
        'src/test/java/shop/BaseTest.java': 'package shop;\n\npublic abstract class BaseTest {}\n',
      },
      {
        classes: ['shop.Cart'],
        tests: [
          ['shop.OpenSpec', 'io.kotest.core.spec.style.FunSpec'],
          ['shop.BaseSpec', 'io.kotest.core.spec.style.FunSpec'],
          ['shop.BaseTest', JUNIT_TEST],
        ],
      },
    );

    expect(findings).toEqual([]);
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
      `${NO_PRODUCTION_RUNTIME_MESSAGE}. If this is intended, add ` +
        '{"rule":"no-production-runtime","paths":["src/test/java/shop/MathTest.java"],"reason":"..."} ' +
        'to "exceptions" in nitpicker.config.json.',
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

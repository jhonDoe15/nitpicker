import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { productionTypeResolver } from '../../production-types.mjs';
import { findingFactory } from '../../review-finding.mjs';
import { file, fn, klass, testFile } from '../../test-support/facts.mjs';
import { staticMessage, subjectMessage, subjectMockFindings } from './subject-mocks.mjs';

const roots = [];
const TEST_FILE = 'src/test/kotlin/demo/OrderServiceTest.kt';
const HEAD = `package demo

import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkConstructor
import io.mockk.mockkObject
import io.mockk.mockkStatic
import io.mockk.spyk
import io.mockk.impl.annotations.InjectMockKs
import io.mockk.impl.annotations.MockK
import io.mockk.impl.annotations.SpyK
import org.mockito.Mockito
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.whenever
import java.time.Clock
`;
const MAIN_FILES = [
  file({
    classes: [
      klass('OrderService'),
      klass('Pricing'),
      klass('Repo'),
      klass('Ids', { kind: 'object' }),
    ],
  }),
  file({ file: 'src/main/kotlin/demo/Totals.kt', functions: [fn('total')] }),
];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function rawFindings(text, testPath = TEST_FILE) {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-subject-mocks-'));
  roots.push(projectRoot);
  mkdirSync(path.dirname(path.join(projectRoot, testPath)), { recursive: true });
  writeFileSync(path.join(projectRoot, testPath), text);
  const projectFiles = [...MAIN_FILES, testFile({ file: testPath, imports: [] })];
  return subjectMockFindings(projectFiles, {
    finding: findingFactory(),
    projectRoot,
    projectFiles,
    isProduction: productionTypeResolver({ files: projectFiles, projectRoot }),
  });
}

function findingsFor(body, testPath = TEST_FILE) {
  return rawFindings(`${HEAD}\n${body}`, testPath).map(({ rule, location, message }) => ({
    rule,
    line: location.line - HEAD.split('\n').length,
    message,
  }));
}

function routed(message, rule = 'MockedSubjectInTest') {
  return findingFactory()({ rule, file: TEST_FILE, line: 1, message }).message;
}

function summary(body, testPath) {
  return findingsFor(body, testPath).map(({ rule, line }) => `${rule}@${String(line)}`);
}

describe('subjectMockFindings', () => {
  it('reports a mock of the class named by the test class', () => {
    const body = `class OrderServiceTest {
  @MockK lateinit var mocked: OrderService
  @MockK lateinit var pricing: Pricing
  private val direct = mockk<OrderService>(relaxed = true)
  private val viaMockito: OrderService = mock()
  private val viaClass = Mockito.mock(OrderService::class.java)
  private val clock = mockk<Clock>()
}
`;
    expect(summary(body)).toEqual([
      'MockedSubjectInTest@2',
      'MockedSubjectInTest@4',
      'MockedSubjectInTest@5',
      'MockedSubjectInTest@6',
    ]);
    expect(findingsFor(body)[0].message).toBe(routed(subjectMessage('OrderService')));
  });

  it('reports a spy of the subject only when its own methods are stubbed', () => {
    const body = `class OrderServiceTests {
  @SpyK var annotated = OrderService(Pricing())
  private val stubbed = spyk(OrderService(Pricing()))
  private val verified = spyk(OrderService(Pricing()))
  private val mockito = spy(OrderService(Pricing()))
  private val real = Mockito.mock(OrderService::class.java, Mockito.CALLS_REAL_METHODS)
  @Mock(answer = Answers.CALLS_REAL_METHODS) lateinit var partial: OrderService

  fun stubs() {
    every { annotated.total() } returns 1
    every { stubbed.total() } returns 2
    doReturn(3).whenever(mockito).total()
    verify { verified.total() }
    every { real.total() } returns 4
    every { partial.total() } returns 5
  }
}
`;
    expect(summary(body)).toEqual([
      'MockedSubjectInTest@2',
      'MockedSubjectInTest@3',
      'MockedSubjectInTest@5',
    ]);
  });

  it('matches the stubbing of a local spy in its own function only', () => {
    const body = `class OrderServiceTest {
  fun a() {
    val svc = spyk(OrderService(Pricing()))
    svc.total()
  }

  fun b() {
    val svc = mockk<Pricing>()
    every { svc.price() } returns 1
    val stubbed = spyk(OrderService(Pricing()))
    every { stubbed.total() } returns 2
  }
}
`;
    expect(summary(body)).toEqual(['MockedSubjectInTest@10']);
  });

  it('reads Spring mock annotations, use-site targets, nested generics and the lambda form', () => {
    const body = `class RepoTest {
  @field:MockK lateinit var annotated: Repo
  private val nested = mockk<Repo<List<String>>>()
  private val declared: Repo<String> = mockk()
  private val stubbed = mock<Repo<String>> { on { size() } doReturn 1 }
  private val named = spyk(recordPrivateCalls = true, objToCopy = Repo<String>())

  fun stubs() {
    every { named.size() } returns 2
    mockkStatic(Repo::class, Repo::class)
  }
}
`;
    expect(summary(body, 'src/test/kotlin/demo/RepoTest.kt')).toEqual([
      'MockedSubjectInTest@2',
      'MockedSubjectInTest@3',
      'MockedSubjectInTest@4',
      'MockedSubjectInTest@5',
      'MockedSubjectInTest@6',
      'StaticMockOfProjectType@10',
    ]);
  });

  it('scans a file that imports only a Spring mock annotation', () => {
    const springOnly = `package demo

import org.springframework.boot.test.mock.mockito.MockBean

class OrderServiceTest {
  @MockBean lateinit var service: OrderService
}
`;
    expect(rawFindings(springOnly).map(({ location }) => location.line)).toEqual([6]);
  });

  it('takes the subject from an injected property over the class name', () => {
    const body = `class PricingSpec {
  @MockK lateinit var pricing: Pricing
  @SpyK @InjectMockKs lateinit var service: OrderService

  fun stubs() {
    every { service.total() } returns 1
  }
}
`;
    expect(summary(body, 'src/test/kotlin/demo/PricingSpec.kt')).toEqual(['MockedSubjectInTest@3']);
  });

  it('reports static, object and constructor mocks of project code only', () => {
    const body = `class CheckoutTest {
  fun mocks() {
    mockkObject(Ids)
    mockkStatic("demo.TotalsKt")
    mockkStatic(::total)
    mockkConstructor(Pricing::class)
    Mockito.mockStatic(OrderService::class.java)
    mockkStatic(Clock::class)
    mockkStatic("java.time.LocalDate")
    mockkObject(Clock.systemUTC())
  }
}
`;
    const found = findingsFor(body);
    expect(found.map(({ rule, line }) => `${rule}@${String(line)}`)).toEqual([
      'StaticMockOfProjectType@3',
      'StaticMockOfProjectType@4',
      'StaticMockOfProjectType@5',
      'StaticMockOfProjectType@6',
      'StaticMockOfProjectType@7',
    ]);
    expect(found[0].message).toBe(
      routed(staticMessage('mockkObject', 'Ids'), 'StaticMockOfProjectType'),
    );
  });

  it('skips files that import no mocking library and production files', () => {
    const body = `class OrderServiceTest {
  fun mock(type: Any) = type
  val fake = mock(OrderService::class)
}
`;
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-subject-mocks-'));
    roots.push(projectRoot);
    mkdirSync(path.join(projectRoot, 'src/test/kotlin/demo'), { recursive: true });
    writeFileSync(path.join(projectRoot, TEST_FILE), `package demo\n\n${body}`);
    const projectFiles = [...MAIN_FILES, testFile({ file: TEST_FILE })];
    expect(
      subjectMockFindings(projectFiles, {
        finding: findingFactory(),
        projectRoot,
        projectFiles,
        isProduction: () => true,
      }),
    ).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { file, klass, type RuleFinding } from '../../test-support/facts.mts';
import {
  RELAXED_MOCK_RULE,
  relaxedMessage as untypedRelaxedMessage,
  relaxedMockFindings,
} from './relaxed-mocks.mjs';
import { mockProject } from './mock-project.mts';
import { routedMessage } from './routed-message.mts';

const relaxedMessage: (type: string) => string = untypedRelaxedMessage;
const TEST_FILE = 'src/test/kotlin/demo/CheckoutTest.kt';
const HEAD = `package demo

import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkClass
import io.mockk.impl.annotations.MockK
import io.mockk.impl.annotations.RelaxedMockK
import com.ninjasquad.springmockk.MockkBean
import org.slf4j.Logger
`;
const HEAD_LINES = HEAD.split('\n').length;
const MAIN_FILES = [file({ classes: [klass('Mailer'), klass('Pricing'), klass('Checkout')] })];

const projectFindings = mockProject({
  prefix: 'nitpicker-relaxed-mocks-',
  rule: relaxedMockFindings,
  mainFiles: MAIN_FILES,
  defaultPath: TEST_FILE,
  extraOptions: () => ({}),
});

function findingsFor(body: string, head = HEAD): RuleFinding[] {
  return projectFindings(`${head}\n${body}`);
}

function summary(body: string, head?: string): string[] {
  return findingsFor(body, head).map(
    ({ rule, location }) => `${rule}@${String(location.line - HEAD_LINES)}`,
  );
}

describe('relaxedMockFindings', () => {
  it('reports relaxed mocks of project classes in every MockK form', () => {
    const body = `class CheckoutTest {
  @RelaxedMockK lateinit var mailer: Mailer
  @MockK(relaxed = true) lateinit var pricing: Pricing
  private val direct = mockk<Mailer>(relaxed = true)
  private val named: Pricing = mockk(name = "p", relaxed = true)
  private val byClass = mockkClass(Mailer::class, relaxed = true)
  @MockkBean(relaxed = true) lateinit var bean: Pricing
}
`;
    expect(summary(body)).toEqual([
      `${RELAXED_MOCK_RULE}@2`,
      `${RELAXED_MOCK_RULE}@3`,
      `${RELAXED_MOCK_RULE}@4`,
      `${RELAXED_MOCK_RULE}@5`,
      `${RELAXED_MOCK_RULE}@6`,
      `${RELAXED_MOCK_RULE}@7`,
    ]);
  });

  it('names the stubbed form and the exception route', () => {
    const [found] = findingsFor('val m = mockk<Mailer>(relaxed = true)\n');

    expect(found?.message).toBe(
      routedMessage({
        rule: RELAXED_MOCK_RULE,
        file: TEST_FILE,
        line: 1,
        message: relaxedMessage('Mailer'),
      }),
    );
  });

  it('allows plain mocks, relaxUnitFun, library types and the class under test', () => {
    const body = `class CheckoutTest {
  @MockK lateinit var mailer: Mailer
  private val plain = mockk<Pricing>()
  private val units = mockk<Mailer>(relaxUnitFun = true)
  private val off = mockk<Mailer>(relaxed = false)
  private val log = mockk<Logger>(relaxed = true)
  private val subject = mockk<Checkout>(relaxed = true)
}
`;
    expect(summary(body)).toEqual([]);
  });

  it('skips files that do not use MockK and production sources', () => {
    const head = HEAD.replaceAll(/^import (?:io\.mockk|com\.ninjasquad).*$/gmu, '');

    expect(summary('val m = mockk<Mailer>(relaxed = true)\n', head)).toEqual([]);
  });
});

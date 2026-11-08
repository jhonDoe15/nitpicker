import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { productionTypeResolver } from '../../production-types.mjs';
import { findingFactory } from '../../review-finding.mjs';
import { file, klass, testFile } from '../../test-support/facts.mjs';
import { RELAXED_MOCK_RULE, relaxedMessage, relaxedMockFindings } from './relaxed-mocks.mjs';

const roots = [];
const TEST_FILE = 'src/test/kotlin/demo/CheckoutTest.kt';
const HEAD = `package demo

import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkClass
import io.mockk.impl.annotations.MockK
import io.mockk.impl.annotations.RelaxedMockK
import org.slf4j.Logger
`;
const HEAD_LINES = HEAD.split('\n').length;
const MAIN_FILES = [file({ classes: [klass('Mailer'), klass('Pricing'), klass('Checkout')] })];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function findingsFor(body, head = HEAD) {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-relaxed-mocks-'));
  roots.push(projectRoot);
  mkdirSync(path.dirname(path.join(projectRoot, TEST_FILE)), { recursive: true });
  writeFileSync(path.join(projectRoot, TEST_FILE), `${head}\n${body}`);
  const projectFiles = [...MAIN_FILES, testFile({ file: TEST_FILE, imports: [] })];
  return relaxedMockFindings(projectFiles, {
    finding: findingFactory(),
    projectRoot,
    isProduction: productionTypeResolver({ files: projectFiles, projectRoot }),
  });
}

function summary(body, head) {
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
}
`;
    expect(summary(body)).toEqual([
      `${RELAXED_MOCK_RULE}@2`,
      `${RELAXED_MOCK_RULE}@3`,
      `${RELAXED_MOCK_RULE}@4`,
      `${RELAXED_MOCK_RULE}@5`,
      `${RELAXED_MOCK_RULE}@6`,
    ]);
  });

  it('names the stubbed form and the exception route', () => {
    const [found] = findingsFor('val m = mockk<Mailer>(relaxed = true)\n');

    expect(found.message).toBe(
      findingFactory()({
        rule: RELAXED_MOCK_RULE,
        file: TEST_FILE,
        line: 1,
        message: relaxedMessage('Mailer'),
      }).message,
    );
    expect(found.message).toContain('every { ... } returns');
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
    const head = HEAD.replaceAll(/^import io\.mockk.*$/gmu, '');

    expect(summary('val m = mockk<Mailer>(relaxed = true)\n', head)).toEqual([]);
  });
});

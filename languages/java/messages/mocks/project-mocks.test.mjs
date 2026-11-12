import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MOCKED_SUBJECT_RULE, STATIC_MOCK_RULE, withProjectTypeMocks } from './project-mocks.mjs';

const roots = [];
const TEST_FILE = 'src/test/java/shop/OrderServiceTest.java';
const TEST_SOURCE = [
  'package shop;',
  '',
  'import java.time.LocalDate;',
  'import shop.pricing.*;',
  '',
  'class OrderServiceTest {',
  '  @Mock OrderService service;',
  '  void a() {',
  '    mockStatic(LocalDate.class);',
  '    mockStatic(Rates.class);',
  '    mockConstruction(shop.Orders.class);',
  '    mockStatic(OrdersKt.class);',
  '    mockStatic(Fixture.class);',
  '  }',
  '}',
].join('\n');
const PROJECT = {
  'src/main/java/shop/OrderService.java': 'package shop;\n\npublic class OrderService {}\n',
  'billing/src/main/java/shop/pricing/Rates.java': 'package shop.pricing;\n\nclass Rates {}\n',
  'src/main/kotlin/shop/Orders.kt': 'package shop\n\nobject Orders\n',
  'src/test/java/shop/Fixture.java': 'package shop;\n\nclass Fixture {}\n',
  [TEST_FILE]: TEST_SOURCE,
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-mocks-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function columnOf(line, text) {
  return TEST_SOURCE.split('\n')[line - 1].indexOf(text) + 1;
}

const mockAt = (rule, line, text) => ({
  tool: 'pmd',
  rule,
  path: TEST_FILE,
  identity: String(line),
  location: { line, column: columnOf(line, text) },
  message:
    rule === MOCKED_SUBJECT_RULE
      ? 'This test mocks the class it tests, so it checks the mock.'
      : 'A static mock replaces a class of this project, for the whole thread.',
});

function filtered(findings) {
  return withProjectTypeMocks(findings, {
    projectRoot: projectWith(PROJECT),
    mainRoots: ['src/main/java', 'src/main/kotlin'],
  });
}

describe('withProjectTypeMocks', () => {
  it('keeps mocks of project main types and names the type', () => {
    const found = filtered([
      mockAt(MOCKED_SUBJECT_RULE, 7, 'OrderService'),
      mockAt(STATIC_MOCK_RULE, 10, 'Rates'),
      mockAt(STATIC_MOCK_RULE, 11, 'shop.Orders'),
      mockAt(STATIC_MOCK_RULE, 12, 'OrdersKt'),
    ]);
    expect(found.map(({ message }) => message)).toEqual([
      'This test mocks OrderService, the class it tests, so it checks the mock.',
      'A static mock replaces Rates, a class of this project, for the whole thread.',
      'A static mock replaces Orders, a class of this project, for the whole thread.',
      'A static mock replaces OrdersKt, a class of this project, for the whole thread.',
    ]);
  });

  it('drops mocks of library and test-only types', () => {
    const found = filtered([
      mockAt(STATIC_MOCK_RULE, 9, 'LocalDate'),
      mockAt(STATIC_MOCK_RULE, 13, 'Fixture'),
    ]);
    expect(found).toEqual([]);
  });

  it('drops a finding without a column and leaves other rules alone', () => {
    const other = { tool: 'pmd', rule: 'RetryInTest', path: TEST_FILE, location: { line: 7 } };
    const found = filtered([
      { ...mockAt(STATIC_MOCK_RULE, 10, 'Rates'), location: { line: 10 } },
      other,
    ]);
    expect(found).toEqual([other]);
  });
});

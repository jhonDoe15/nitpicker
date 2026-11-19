import { describe, expect, it } from 'vitest';
import { MOCKED_SUBJECT_RULE, STATIC_MOCK_RULE, withProjectTypeMocks } from './project-mocks.mts';
import { temporaryProjectMaker } from '../../__tests__/temporary-roots.mts';

type MockAt = {
  tool: string;
  rule: string;
  path: string;
  identity: string;
  location: { line: number; column?: number };
  message: string;
};

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

const projectWith = temporaryProjectMaker('nitpicker-project-mocks-');

function columnOf(line: number, text: string): number {
  return (TEST_SOURCE.split('\n')[line - 1] ?? '').indexOf(text) + 1;
}

function mockAt(rule: string, line: number, text: string): MockAt {
  return {
    tool: 'pmd',
    rule,
    path: TEST_FILE,
    identity: String(line),
    location: { line, column: columnOf(line, text) },
    message:
      rule === MOCKED_SUBJECT_RULE
        ? 'This test mocks the class it tests, so it checks the mock.'
        : 'A static mock replaces a class of this project, for the whole thread.',
  };
}

function filtered(findings: MockAt[]): MockAt[] {
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
    const other: MockAt = {
      tool: 'pmd',
      rule: 'RetryInTest',
      path: TEST_FILE,
      identity: '7',
      location: { line: 7 },
      message: 'Retry.',
    };
    const found = filtered([
      { ...mockAt(STATIC_MOCK_RULE, 10, 'Rates'), location: { line: 10 } },
      other,
    ]);
    expect(found).toEqual([other]);
  });
});

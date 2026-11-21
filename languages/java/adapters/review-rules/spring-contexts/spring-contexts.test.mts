import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';
import { SPRING_CONTEXT_RULE, readSpringContextFindings } from './spring-contexts.mts';

const { temporaryRoot } = useGitFixtures();
const PROJECT = { sourceRoots: ['src/main/java'], testSourceRoots: ['src/test/java'] };
const TEST_METHOD = '  @Test\n  void works() {}\n';

type Written = {
  readonly annotations?: string;
  readonly parent?: string;
  readonly members?: string;
  readonly modifiers?: string;
  readonly packageName?: string;
};

function testClass(name: string, written: Written = {}): Record<string, string> {
  const {
    annotations = '@SpringBootTest',
    parent,
    members = TEST_METHOD,
    modifiers = '',
    packageName = 'shop',
  } = written;
  const header = `${annotations}\n${modifiers}class ${name}${parent === undefined ? '' : ` extends ${parent}`}`;
  return {
    [`src/test/java/${packageName.replaceAll('.', '/')}/${name}.java`]: `package ${packageName};\n${header} {\n${members}}\n`,
  };
}

function mocking(...types: string[]): Written {
  return {
    members: `${types.map((type) => `  @MockBean private ${type} ${type.toLowerCase()};\n`).join('')}${TEST_METHOD}`,
  };
}

function expectedMessage(starts: string, sharing: number, file: string): string {
  return [
    `${starts} Its configuration is the same as that of ${String(sharing)} other test classes of the module`,
    ' (InvoiceTest is one) except for its mock beans (the mock beans @MockBean MailClient), and every distinct',
    " set of @MockBean, @MockitoBean, @SpyBean and @MockitoSpyBean fields is a separate entry in Spring's context",
    ' cache, so these classes start 3 contexts between them. Declare the mocks in a base class or',
    ' @TestConfiguration that all of them share, or test this class without the whole context: a slice such as',
    ' @WebMvcTest or a unit test that creates the class with new. If this is intended, add',
    ` {"rule":"pmd/SpringContextPerMockSet","paths":["src/test/java/shop/${file}"],"reason":"..."}`,
    ' to "exceptions" in nitpicker.config.json.',
  ].join('');
}

function found(...classes: Record<string, string>[]) {
  const root = temporaryRoot('nitpicker-spring-contexts-');
  writeFiles(root, Object.fromEntries(classes.flatMap((files) => Object.entries(files))));
  return readSpringContextFindings(root, { projects: [PROJECT] });
}

function reported(...classes: Record<string, string>[]): string[] {
  return found(...classes).map(
    ({ rule, path: file, location }) => `${rule} ${file}:${String(location.line)}`,
  );
}

describe('Spring test contexts that differ only in their mock beans', () => {
  it('reports one class of every mock set beyond the largest group', () => {
    expect(
      reported(
        testClass('OrderTest'),
        testClass('InvoiceTest'),
        testClass('PaymentTest', mocking('PaymentClient')),
        testClass('RefundTest', mocking('PaymentClient')),
        testClass('MailTest', mocking('MailClient')),
      ),
    ).toEqual([
      `${SPRING_CONTEXT_RULE} src/test/java/shop/MailTest.java:3`,
      `${SPRING_CONTEXT_RULE} src/test/java/shop/PaymentTest.java:3`,
    ]);
  });

  it('describes the finding, names the mocks and never fails the gate', () => {
    const [first] = found(
      testClass('OrderTest'),
      testClass('InvoiceTest'),
      testClass('PaymentTest', mocking('PaymentClient', 'Ledger')),
      testClass('MailTest', mocking('MailClient')),
    );
    expect(first?.classification).toBe('descriptive');
    expect(first?.symbol).toBe('MailTest');
    expect(first?.message).toBe(
      expectedMessage('This test class starts its own application context.', 3, 'MailTest.java'),
    );
  });

  it('reads mock beans and the configuration from the base classes', () => {
    const base = testClass('BaseTest', {
      annotations: '@SpringBootTest\n@ActiveProfiles("h2")',
      modifiers: 'abstract ',
      members: '  @MockitoBean protected Clock clock;\n',
    });
    const child = (name: string, members: string) =>
      testClass(name, { annotations: '', parent: 'BaseTest', members: `${members}${TEST_METHOD}` });
    expect(
      reported(
        base,
        child('OrderTest', ''),
        child('InvoiceTest', ''),
        child('PaymentTest', '  @MockitoSpyBean PaymentClient payments;\n'),
        child('MailTest', '  @SpyBean(name = "mail") @Qualifier("smtp") MailClient mail;\n'),
      ),
    ).toEqual([
      `${SPRING_CONTEXT_RULE} src/test/java/shop/MailTest.java:3`,
      `${SPRING_CONTEXT_RULE} src/test/java/shop/PaymentTest.java:3`,
    ]);
  });

  it('reads a base class that carries only the mock beans, and compares mocked types by simple name', () => {
    const base = {
      'src/test/java/shop/Mocks.java':
        'package shop;\nclass Mocks {\n  @MockBean Ledger ledger;\n}\n',
    };
    const qualified = { members: `  @MockBean private shop.Ledger ledger;\n${TEST_METHOD}` };
    expect(
      reported(
        base,
        testClass('OrderTest'),
        testClass('InvoiceTest'),
        testClass('MailTest', mocking('MailClient')),
        testClass('LedgerTest', { parent: 'Mocks' }),
        testClass('PaymentTest', qualified),
      ),
    ).toEqual([
      `${SPRING_CONTEXT_RULE} src/test/java/shop/LedgerTest.java:3`,
      `${SPRING_CONTEXT_RULE} src/test/java/shop/MailTest.java:3`,
    ]);
  });

  it('counts the classes that share the reported mock set', () => {
    const [first] = found(
      testClass('OrderTest'),
      testClass('InvoiceTest'),
      testClass('StockTest'),
      testClass('MailTest', mocking('MailClient')),
      testClass('LetterTest', mocking('MailClient')),
      testClass('PaymentTest', mocking('PaymentClient')),
    );
    expect(first?.message).toBe(
      expectedMessage(
        'This test class and 1 more with the same mock beans start an application context of their own.',
        5,
        'LetterTest.java',
      ),
    );
  });

  it('compares inside one package when the main sources hold several applications', () => {
    const application = (name: string) => ({
      [`src/main/java/${name}/App.java`]: `package ${name};\n@SpringBootApplication\nclass App {}\n`,
    });
    expect(
      reported(
        application('mail'),
        application('pay'),
        testClass('OrderTest', { packageName: 'shop' }),
        testClass('MailTest', { ...mocking('MailClient'), packageName: 'mail' }),
        testClass('PaymentTest', { ...mocking('PaymentClient'), packageName: 'pay' }),
      ),
    ).toEqual([]);
  });

  it('reports nothing for two contexts', () => {
    expect(
      reported(
        testClass('OrderTest'),
        testClass('InvoiceTest'),
        testClass('PaymentTest', mocking('PaymentClient')),
      ),
    ).toEqual([]);
  });

  it('keeps classes with another configuration apart', () => {
    expect(
      reported(
        testClass('OrderTest'),
        testClass('PaymentTest', {
          ...mocking('PaymentClient'),
          annotations: '@SpringBootTest(properties = "feature.x=true")',
        }),
        testClass('MailTest', { ...mocking('MailClient'), annotations: '@WebMvcTest' }),
        testClass('StockTest', {
          ...mocking('StockClient'),
          annotations: '@SpringBootTest\n@ActiveProfiles("h2")',
        }),
      ),
    ).toEqual([]);
  });

  it('ignores annotations that do not change the context', () => {
    expect(
      reported(
        testClass('OrderTest', { annotations: '@Slf4j\n@SpringBootTest\n@DisplayName("orders")' }),
        testClass('PaymentTest', {
          ...mocking('PaymentClient'),
          annotations: '@SpringBootTest\n@ExtendWith(SpringExtension.class)',
        }),
        testClass('MailTest', {
          ...mocking('MailClient'),
          annotations: '@RunWith(SpringRunner.class)\n@SpringBootTest\n@Transactional',
        }),
      ),
    ).toHaveLength(2);
  });

  it.each([
    ['a context that is rebuilt', { annotations: '@SpringBootTest\n@DirtiesContext' }],
    ['a disabled class', { annotations: '@SpringBootTest\n@Disabled' }],
    ['a class outside the module', { annotations: '', parent: 'SharedBaseTest' }],
    ['a class without tests', { members: '' }],
    ['an abstract class', { modifiers: 'abstract ' }],
  ])('leaves out %s', (_, written) => {
    expect(
      reported(
        testClass('OrderTest'),
        testClass('PaymentTest', mocking('PaymentClient')),
        testClass('MailTest', { ...mocking('MailClient'), ...written }),
      ),
    ).toEqual([]);
  });

  it.each([
    ['a nested configuration', '  @TestConfiguration\n  static class Beans {}\n'],
    ['its own dynamic properties', '  @DynamicPropertySource\n  static void set(Object r) {}\n'],
    ['a service connection', '  @ServiceConnection static Object database;\n'],
  ])('leaves out a class with %s', (_, member) => {
    expect(
      reported(
        testClass('OrderTest'),
        testClass('PaymentTest', mocking('PaymentClient')),
        testClass('MailTest', { members: `${member}  @MockBean Mail mail;\n${TEST_METHOD}` }),
      ),
    ).toEqual([]);
  });

  it('does not read mock beans from comments, strings or nested classes', () => {
    const members = [
      '  // @MockBean private PaymentClient payments;',
      '  String text = "@MockBean MailClient mail;";',
      '  static class Helper { @MockBean Ledger ledger; }',
      TEST_METHOD,
    ].join('\n');
    expect(
      reported(
        testClass('OrderTest', { members }),
        testClass('PaymentTest', mocking('PaymentClient')),
        testClass('MailTest', mocking('MailClient')),
        testClass('InvoiceTest'),
      ),
    ).toEqual([
      `${SPRING_CONTEXT_RULE} src/test/java/shop/MailTest.java:3`,
      `${SPRING_CONTEXT_RULE} src/test/java/shop/PaymentTest.java:3`,
    ]);
  });

  it('groups by package when the tests declare an application class of their own', () => {
    const application = {
      'src/test/java/shop/admin/AdminApplication.java':
        'package shop.admin;\n@SpringBootApplication\nclass AdminApplication {}\n',
    };
    const classes = [
      testClass('OrderTest'),
      testClass('PaymentTest', { ...mocking('PaymentClient'), packageName: 'shop.admin' }),
      testClass('MailTest', { ...mocking('MailClient'), packageName: 'shop.admin' }),
    ];
    expect(reported(...classes)).toHaveLength(2);
    expect(reported(application, ...classes)).toEqual([]);
  });

  it('skips sources the policy excludes and projects without Spring Boot tests', () => {
    const classes = [
      testClass('OrderTest'),
      testClass('PaymentTest', mocking('PaymentClient')),
      testClass('MailTest', mocking('MailClient')),
    ];
    const root = temporaryRoot('nitpicker-spring-contexts-');
    writeFiles(root, Object.fromEntries(classes.flatMap((files) => Object.entries(files))));
    expect(
      readSpringContextFindings(root, {
        projects: [PROJECT],
        policy: { exclude: ['**/MailTest.java'] },
      }),
    ).toEqual([]);
    expect(reported(testClass('PlainTest', { annotations: '' }))).toEqual([]);
  });
});

import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../adapters/java-analyzer.mjs';
import {
  CATALOG_TOOLS,
  applyRuleMessages,
  checkstyleRuleName,
  readCatalog,
  withRuleMessage,
} from './rule-messages.mjs';

const FILE = 'src/main/java/demo/Cli.java';

const finding = (tool, rule, message, classification = 'enforceable') => ({
  tool,
  rule,
  path: FILE,
  identity: 'id',
  message,
  classification,
});

const hint = (rule) =>
  `If this is intended, add {"rule":"${rule}","paths":["${FILE}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;

const NOT_YOUR_FORMATTER =
  'Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.';

describe('checkstyleRuleName', () => {
  it('shortens check classes to the module name and keeps configured ids', () => {
    expect(
      [
        'com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck',
        'com.puppycrawl.tools.checkstyle.checks.UpperEllCheck',
        'RightCurlySame',
        'com.example.checks.HouseRuleCheck',
      ].map(checkstyleRuleName),
    ).toEqual(['Indentation', 'UpperEll', 'RightCurlySame', 'com.example.checks.HouseRuleCheck']);
  });
});

describe('withRuleMessage', () => {
  it('routes the Kotlin source rules by their bare IDs and test-only classes by their qualified ID', () => {
    const source = finding('detekt', 'catch-log-without-exception', 'Keep the stack trace.');
    const assertion = finding('detekt', 'test-without-assertion', 'Assert the result.');
    const testOnly = finding('coupling', 'test-only-export', 'Move the class to test sources.');
    expect(
      applyRuleMessages([source, assertion, testOnly], { preset: 'kotlin' }).map(
        ({ message }) => message,
      ),
    ).toEqual([
      `${source.message} ${hint(source.rule)}`,
      `${assertion.message} ${hint(assertion.rule)}`,
      `${testOnly.message} ${hint('coupling/test-only-export')}`,
    ]);
    expect(withRuleMessage(testOnly).message).toBe(
      `${testOnly.message} ${hint('coupling/test-only-export')}`,
    );
    expect(withRuleMessage(source).message).toBe(source.message);
  });

  it('adds the fix and the exception route to a rule that can hit intended code', () => {
    expect(withRuleMessage(finding('pmd', 'SystemPrintln', 'Usage of System.out/err'))).toEqual(
      finding(
        'pmd',
        'SystemPrintln',
        `Usage of System.out/err. ${readCatalog('pmd').SystemPrintln.fix} ${hint('pmd/SystemPrintln')}`,
      ),
    );
  });

  it('adds only the fix to a rule whose finding is always a defect', () => {
    const message = 'Possible null pointer dereference of value';

    expect(withRuleMessage(finding('spotbugs', 'NP_NULL_ON_SOME_PATH', message)).message).toBe(
      `${message}. ${readCatalog('spotbugs').NP_NULL_ON_SOME_PATH.fix}`,
    );
  });

  it('points layout findings at the formatter under the short Checkstyle name', () => {
    const source = 'com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck';
    const message = "'method def' has incorrect indentation level 4, expected level should be 2.";

    const fix = (options) =>
      withRuleMessage(finding('checkstyle', source, message), options).message;

    expect(fix({ javaStyle: 'google' })).toBe(
      `${message} Run google-java-format on the file; it fixes this layout. ${NOT_YOUR_FORMATTER}`,
    );
    expect(fix({ javaStyle: 'aosp' })).toBe(
      `${message} Run google-java-format --aosp on the file; it fixes this layout. ${NOT_YOUR_FORMATTER}`,
    );
    expect(fix({ javaStyle: 'palantir' })).toBe(
      `${message} Run palantir-java-format on the file; it fixes this layout. ${NOT_YOUR_FORMATTER}`,
    );
    expect(fix({ javaStyle: 'none' })).toBe(
      `${message} Fix this layout by hand; no Java formatter runs.`,
    );
    expect(fix({})).toBe(
      `${message} Run your Java formatter on the file; it fixes this layout. ${NOT_YOUR_FORMATTER}`,
    );
  });

  it('gives a rule the catalog does not know the exception route alone', () => {
    expect(withRuleMessage(finding('checkstyle', 'HouseRule', 'No.')).message).toBe(
      `No. ${hint('checkstyle/HouseRule')}`,
    );
  });

  it('offers the exception route for a Java source of a Kotlin project, as the Kotlin preset lifts Java rule ids there', () => {
    expect(
      withRuleMessage(finding('pmd', 'SystemPrintln', 'Usage of System.out/err'), {
        preset: 'kotlin',
      }).message,
    ).toBe(
      `Usage of System.out/err. ${readCatalog('pmd').SystemPrintln.fix} ${hint('pmd/SystemPrintln')}`,
    );
  });

  it('offers no exception for a finding in a Kotlin source', () => {
    expect(
      withRuleMessage(
        {
          ...finding('pmd', 'SystemPrintln', 'Usage of System.out/err'),
          path: 'src/main/kotlin/A.kt',
        },
        { preset: 'kotlin' },
      ).message,
    ).toBe(`Usage of System.out/err. ${readCatalog('pmd').SystemPrintln.fix}`);
  });

  it('offers no exception for a descriptive finding', () => {
    expect(
      withRuleMessage(finding('pmd', 'SystemPrintln', 'Usage of System.out/err', 'descriptive'))
        .message,
    ).toBe(`Usage of System.out/err. ${readCatalog('pmd').SystemPrintln.fix}`);
  });

  it('gives findings of the guard tools the same exception route, in a Kotlin project on Java sources only', () => {
    const lint = finding('javac', 'rawtypes', 'found raw type: List. Add the type arguments.');
    const kotlinLint = { ...lint, path: 'src/main/kotlin/A.kt' };
    const cycle = finding(
      'coupling',
      'package-cycle',
      'Package a is in a dependency cycle with b.',
    );
    const stability = finding('coupling', 'stability-direction', 'a depends on less stable b');

    expect(
      [
        applyRuleMessages([lint, cycle, stability]),
        applyRuleMessages([lint, kotlinLint], { preset: 'kotlin' }),
      ].map((findings) => findings.map(({ message }) => message)),
    ).toEqual([
      [
        `${lint.message} ${hint('javac/rawtypes')}`,
        `${cycle.message} ${hint('coupling/package-cycle')}`,
        stability.message,
      ],
      [`${lint.message} ${hint('javac/rawtypes')}`, lint.message],
    ]);
  });

  it('keeps messages that already end with the route or the exclude route, and findings of other tools', () => {
    const spring = finding(
      'pmd',
      'SpringConstructorInjection',
      `Inject through the constructor. ${hint('pmd/SpringConstructorInjection')}`,
    );
    const clone = finding(
      'duplicates',
      'duplicate-clone',
      'This code repeats B.java:3. Keep one copy and call it from both places. If the repetition is intended, add A.java or B.java to "exclude" in nitpicker.config.json.',
    );
    const archunit = finding('archunit', 'layers', 'Layer violated');

    expect(applyRuleMessages([spring, clone, archunit])).toEqual([spring, clone, archunit]);
  });
});

describe('rule catalogs', () => {
  it('hold one short fix sentence or null and an intent flag per rule', () => {
    const malformed = CATALOG_TOOLS.flatMap((tool) =>
      Object.entries(readCatalog(tool))
        .filter(
          ([, entry]) =>
            typeof entry.mayBeIntended !== 'boolean' ||
            (entry.fix !== null && (typeof entry.fix !== 'string' || entry.fix.length > 160)) ||
            (entry.layout !== undefined && (tool !== 'checkstyle' || entry.fix !== null)),
        )
        .map(([rule]) => `${tool}/${rule}`),
    );

    expect(malformed).toEqual([]);
  });

  it('are part of the configuration hash, with the code that applies them', () => {
    const files = readdirSync(import.meta.dirname)
      .filter((name) => !name.includes('.test.'))
      .map((name) => `languages/java/messages/${name}`)
      .sort();

    expect(configurationFiles().filter((file) => files.includes(file))).toEqual(files);
  });
});
